import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOwnerTradingConsents} from '../server/dex/owner-trading-consent.js';
import {createActivationPlans,DEFAULT_ACTIVATION_PLAN} from '../server/dex/activation-plan.js';
import {createRealBalanceReservations} from '../server/real-balance-reservations.js';
const start = Date.UTC(2026,9,7,3);
function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'tekk-consent-')),path=join(dir,'fixture.sqlite');
  let db=new DatabaseSync(path),at=start;
  const key=Keypair.generate(),agent={id:'fixture-agent',creator:key.publicKey.toBase58(),strategy:'operator'};
  const ctx={authenticated:true,owner:agent.creator,agentId:agent.id};
  const binding={owner:agent.creator,agentId:agent.id,wallet:Keypair.generate().publicKey.toBase58(),mint:Keypair.generate().publicKey.toBase58(),network:'solana:101',executionId:'fixture-launch',signature:bs58.encode(new Uint8Array(64).fill(7)),confirmedSlot:100,provenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
  let plans=createActivationPlans(db,{readAuthority:()=>({kind:'LAUNCHPAD',...binding}),now:()=>at});
  plans.save(agent,{revision:0,policy:DEFAULT_ACTIVATION_PLAN});
  const options={origin:'https://tekkteam.tech',now:()=>at,readPlan:()=>plans.read(agent).plan,readAuthority:()=>binding};
  const open=()=>createOwnerTradingConsents(db,options);let store=open();
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  const sign=r=>bs58.encode(nacl.sign.detached(Buffer.from(r.message),key.secretKey));
  return {ctx,binding,options,agent,path,key,sign,get db(){return db;},get store(){return store;},get plans(){return plans;},time:v=>at=v,
    review(){const p=plans.read(agent).plan;return store.prepareReview(ctx,{planRevision:p.revision,planDigest:p.planDigest});},
    approve(r){return store.approve(ctx,{reviewId:r.terms.id,signature:sign(r)});},
    restart(){db.close();db=new DatabaseSync(path);plans=createActivationPlans(db,{readAuthority:()=>({kind:'LAUNCHPAD',...binding}),now:()=>at});store=open();}
  };
}
const request=(a,hash='a'.repeat(64),max='105000')=>({authorizationId:a.id,authorizationRevision:a.revision,authorizationDigest:a.digest,owner:a.owner,agentId:a.agentId,wallet:a.wallet,mint:a.mint,network:a.network,messageHash:hash,maxDebitLamports:max,tradeInputLamports:'100000'});

test('separate exact owner consent is durable, fixed expiry and idempotent; no execution ports',t=>{
  const f=fixture(t),r=f.review(),a=f.approve(r);
  assert.match(r.message,/trading consent, not wallet sign-in/);assert.equal(r.terms.policy.sessionDebitLamports,'500000');
  assert.equal(r.terms.protectedReserveLamports,'2020000');assert.equal(a.launchBindingDigest,r.terms.launchBindingDigest);
  f.time(start+1000);f.restart();assert.deepEqual(f.approve(r),a);assert.equal(f.store.read(f.ctx).executionEnabled,false);
  assert.equal(f.store.resolveBudgetAuthority(request(a)).expiresAt,start+3600000);
  assert.equal(f.db.prepare('SELECT count(*) n FROM dex_owner_consent_proofs').get().n,1);
  for(const port of ['sign','send','broadcast','activate'])assert.equal(port in f.store,false);
  assert.throws(()=>f.review(),/REVOKE_BEFORE_REPLACEMENT/);
});
test('Sign In proof, foreign wallet, client message substitution and unauthenticated approval reject',t=>{
  const f=fixture(t),r=f.review();
  const auth=bs58.encode(nacl.sign.detached(Buffer.from('TEKKTEAM wallet sign-in'),f.key.secretKey));
  assert.throws(()=>f.store.approve(f.ctx,{reviewId:r.terms.id,signature:auth}),/SIGNATURE/);
  assert.throws(()=>f.store.approve({...f.ctx,owner:Keypair.generate().publicKey.toBase58()},{reviewId:r.terms.id,signature:f.sign(r)}),/OWNER_MISMATCH/);
  assert.throws(()=>f.store.approve(f.ctx,{reviewId:r.terms.id,signature:f.sign(r),message:r.message}),/APPROVAL_FIELDS/);
  assert.throws(()=>f.store.approve({...f.ctx,authenticated:false},{reviewId:r.terms.id,signature:f.sign(r)}),/OWNER_AUTH/);
});
test('revoke invalidates both an active grant and pending signatures without RPC or plan readiness',t=>{
  const f=fixture(t),r=f.review();f.store.revoke(f.ctx);assert.throws(()=>f.approve(r),/REVOKED/);
  const next=f.review(),a=f.approve(next);f.binding.network='broken';assert.equal(f.store.revoke(f.ctx).authorizationGranted,false);
  f.binding.network='solana:101';assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/INACTIVE/);assert.throws(()=>f.approve(next),/REVOKED/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM dex_owner_consent_proofs').get().n,1);
});
for(const change of ['mint','wallet','network','signature','confirmedSlot'])test('current canonical '+change+' mutation denies consent use',t=>{
  const f=fixture(t),r=f.review(),a=f.approve(r);
  f.binding[change]=change==='confirmedSlot'?101:change==='network'?'solana:devnet':change==='signature'?bs58.encode(new Uint8Array(64).fill(8)):Keypair.generate().publicKey.toBase58();
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)));
});
test('plan cancellation or revision changes deny existing proof; another origin cannot replay it',t=>{
  const f=fixture(t),r=f.review(),a=f.approve(r),p=f.plans.read(f.agent).plan;
  const foreign=createOwnerTradingConsents(f.db,{...f.options,origin:'https://staging.tekkteam.tech'});
  assert.throws(()=>foreign.resolveBudgetAuthority(request(a)),/INTEGRITY/);
  f.plans.save(f.agent,{revision:p.revision,policy:{...DEFAULT_ACTIVATION_PLAN,maxTransactions:3}});
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/TERMS_CHANGED/);
  const current=f.plans.read(f.agent).plan;f.plans.cancel(f.agent,{revision:current.revision});
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/PLAN/);
});
test('review expiration, authorization expiry, rollback and elapsed dependency validation fail closed',t=>{
  const f=fixture(t),r=f.review();f.time(start+120000);assert.throws(()=>f.approve(r),/REVIEW_EXPIRED/);
  const r2=f.review(),a=f.approve(r2);f.time(r2.terms.expiresAt);f.store.checkpointClock(f.ctx);assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/EXPIRED/);
  f.time(start-1);assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/CLOCK_ROLLBACK/);
});
test('stored terms or proof cannot be silently edited; re-hashing is not owner proof',t=>{
  const f=fixture(t),r=f.review(),a=f.approve(r);
  assert.throws(()=>f.db.prepare('UPDATE dex_owner_consent_reviews SET data=?').run('{}'),/Immutable/);
  assert.throws(()=>f.db.prepare('UPDATE dex_owner_consent_proofs SET signature=?').run('bad'),/Immutable/);
  // Deliberately bypass immutability only in this disposable corruption test.
  f.db.exec('DROP TRIGGER owner_consent_proof_no_update');f.db.prepare('UPDATE dex_owner_consent_proofs SET signature=?').run(bs58.encode(new Uint8Array(64)));
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/SIGNATURE/);
});
test('consent integrates with original all-in budget; renewals do not reset daily debit; settle after revoke',t=>{
  const f=fixture(t);let a=f.approve(f.review());
  const holds=createRealBalanceReservations(f.db,{readBudgetAuthority:r=>f.store.resolveBudgetAuthority(r),now:()=>start});
  f.db.exec('CREATE TABLE dex_autonomous_sign_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL)');
  const spec=(id,grant,max='300000')=>({operationId:id,intentHash:id,status:'PREPARED',resources:[{wallet:grant.wallet,lamports:max,balanceLamports:'9999999',protectedLamports:'2020000'}],budget:request(grant,'a'.repeat(64),max)});
  assert.equal(holds.budgetAvailability(request(a)).remainingDailyLamports,'500000');
  holds.reserve(spec('pump-runtime:one',a));holds.reserve({...spec('pump-runtime:one',a),status:'UNKNOWN'});holds.claimBudget('pump-runtime:one','a'.repeat(64),'one');
  const pending=holds.budgetAvailability(request(a));assert.equal(pending.remainingDailyLamports,'200000');assert.equal(pending.remainingTransactions,3);
  f.store.revoke(f.ctx);assert.throws(()=>holds.assertBudgetBroadcast('pump-runtime:one','a'.repeat(64)),/INACTIVE/);
  holds.finish('pump-runtime:one','CONFIRMED',{provenTerminal:true,budgetMessageHash:'a'.repeat(64),budgetDebitLamports:'300000'});
  a=f.approve(f.review());const renewed=holds.budgetAvailability(request(a));assert.equal(renewed.remainingSessionLamports,'500000');assert.equal(renewed.remainingDailyLamports,'200000');assert.equal(renewed.remainingDailyTransactions,3);assert.throws(()=>holds.reserve(spec('two',a)),/DEBIT_EXHAUSTED/);
  assert.throws(()=>holds.reserve(spec('first-buy-rent',a,'2965040')),/AUTHORITY_LIMIT/);
});
test('two SQLite connections cannot resurrect revoked review and duplicate approvals create one proof',t=>{
  const f=fixture(t),r=f.review(),otherDb=new DatabaseSync(f.path);
  try {
  const other=createOwnerTradingConsents(otherDb,f.options);const a=f.approve(r);
  assert.deepEqual(other.approve(f.ctx,{reviewId:r.terms.id,signature:f.sign(r)}),a);
  other.revoke(f.ctx);assert.throws(()=>f.approve(r),/REVOKED/);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_owner_consent_proofs').get().n,1);
  } finally { otherDb.close(); }
});
test('production does not mount consent or change existing Sign In into authorization',()=>{
  for(const path of ['server/app.js','server/start.js','server/product-launch-start.js']){
    let source;try{source=readFileSync(path,'utf8');}catch{continue;}assert.doesNotMatch(source,/owner-trading-consent/);
  }
});
test('observed expired owner read cannot resurrect after rollback and restart',t=>{
  const f=fixture(t),r=f.review();f.approve(r);f.time(r.terms.expiresAt);
  assert.throws(()=>f.store.read(f.ctx),/EXPIRED/);f.time(start+1000);f.restart();
  assert.throws(()=>f.store.read(f.ctx),/CLOCK_ROLLBACK/);
});
test('budget lookup needs a committed fresh clock checkpoint; malformed approval time is rejected',t=>{
  const f=fixture(t),a=f.approve(f.review());f.time(start+6000);
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/CLOCK_CHECKPOINT_REQUIRED/);
  f.store.checkpointClock(f.ctx);assert.equal(f.store.resolveBudgetAuthority(request(a)).id,a.id);
  f.db.exec('DROP TRIGGER owner_consent_proof_no_update');f.db.prepare('UPDATE dex_owner_consent_proofs SET approved_at=?').run('not-a-timestamp');
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/PROOF_TIME/);
});
test('clock rollback does not prevent revocation; corrupt state time is never accepted',t=>{
  const f=fixture(t),r=f.review(),a=f.approve(r);f.time(start-1000);
  assert.equal(f.store.revoke(f.ctx).authorizationGranted,false);f.time(start);
  assert.throws(()=>f.store.resolveBudgetAuthority(request(a)),/INACTIVE/);
  f.db.prepare('UPDATE dex_owner_consent_state SET observed_at=?').run('not-time');
  assert.throws(()=>f.store.read(f.ctx),/STATE_INTEGRITY/);
});
test('expiry crossed during owner-read validation commits the final high water',t=>{
  const f=fixture(t),r=f.review();f.approve(r);f.time(r.terms.expiresAt-1);
  f.options.readAuthority=()=>{f.time(r.terms.expiresAt);return f.binding;};f.restart();
  assert.throws(()=>f.store.read(f.ctx),/EXPIRED/);f.time(r.terms.expiresAt-1);f.restart();
  assert.throws(()=>f.store.read(f.ctx),/CLOCK_ROLLBACK/);
});
test('revoking nonexistent consent cannot reserve another Agent ownership',t=>{
  const f=fixture(t);const other={...f.ctx,agentId:'unused-foreign-agent'};
  assert.equal(f.store.revoke(other).revision,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM dex_owner_consent_state WHERE agent_id=?').get(other.agentId).n,0);
});
