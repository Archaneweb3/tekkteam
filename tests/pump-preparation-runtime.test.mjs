import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,VersionedTransaction} from '@solana/web3.js';
import {AccountLayout} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {createPumpPreparationRuntime} from '../server/dex/pump-preparation-runtime.js';
import {createPumpRuntimeAdapter} from '../server/dex/pump-runtime-adapter.js';
import {createPumpRuntimeLedger} from '../server/dex/pump-runtime-ledger.js';
import {createActivationPlans,DEFAULT_ACTIVATION_PLAN} from '../server/dex/activation-plan.js';
import {createOwnerTradingConsents} from '../server/dex/owner-trading-consent.js';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {pumpSdk,curveProgram} from '../server/dex/pump-sdk-boundary.js';
import {pumpAccountFixture,pumpWalletFixture,fixtureBlockhash,encoded} from './pump-account-fixture.mjs';
import {GENESIS} from '../src/pump-readiness.js';
import {digest} from '../server/dex/intent.js';
import {createServer} from '../server/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const start=1800000000000,origin='https://fixture.tekkteam.invalid';
const latch=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
// Disposable account bytes, fixture keys and signed consent only. No RPC, real
// funds, production consent, actual on-chain simulation or financial send.
async function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());let at=start,reads=0,finalityReads=[],hook=async()=>{},contextHook=async()=>{};
 const owner=Keypair.generate(),wallet=Keypair.generate(),bundle=await pumpAccountFixture();
 bundle.agent.creator=owner.publicKey.toBase58();bundle.agent.strategy='operator';bundle.receipt.owner=bundle.agent.creator;bundle.context.observedAt=start;
 const curve=curveProgram.coder.accounts.decode('bondingCurve',bundle.accounts.curve.data);
 bundle.accounts.curve.data=await encoded(curveProgram,'bondingCurve',{...curve,creator:owner.publicKey},151);
 const venue=decodePumpVenueBundle(bundle),agent=bundle.agent,ctx={authenticated:true,owner:agent.creator,agentId:agent.id};
 const binding={owner:ctx.owner,agentId:agent.id,wallet:wallet.publicKey.toBase58(),mint:venue.mint,network:'solana:101',executionId:'fixture-launch',signature:bs58.encode(new Uint8Array(64).fill(9)),confirmedSlot:100,provenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 const plans=createActivationPlans(db,{readAuthority:()=>({kind:'LAUNCHPAD',...binding}),now:()=>at});
 const p=plans.save(agent,{revision:0,policy:DEFAULT_ACTIVATION_PLAN}).plan;
 const consentOptions={readPlan:()=>plans.read(agent).plan,readAuthority:()=>binding,origin,now:()=>at};
 const consents=createOwnerTradingConsents(db,consentOptions),review=consents.prepareReview(ctx,{planRevision:p.revision,planDigest:p.planDigest});
 consents.approve(ctx,{reviewId:review.terms.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(review.message),owner.secretKey))});
 const context={...ctx,agentWallet:binding.wallet,associatedMint:venue.mint,network:'solana:101',genesis:GENESIS,authorityVerified:true,revision:1,paused:false,enabled:true,killSwitch:false,emergencyStop:false,liveEnabled:false,broadcastEnabled:false};
 const accounts=pumpWalletFixture(venue,binding.wallet);accounts.wallet.lamports=3000000;
 const base=AccountLayout.decode(accounts.base.data);AccountLayout.encode({...base,amount:0n},accounts.base.data);
 const inputs={binding,market:{mint:venue.mint,network:'solana:101',source:'LOCAL_FIXTURE',snapshotId:'fixture-snapshot',slot:100,observedAt:start,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:10},capital:{mode:'REAL',source:'LOCAL_FIXTURE',wallet:binding.wallet,mint:venue.mint,network:'solana:101',genesis:GENESIS,costsQualified:true,observedAt:start,slot:100,balanceLamports:'3000000',initialCapitalLamports:'3000000',tokenBalance:'0',heldLamports:'0',feeCapLamports:'10000',rentCapLamports:'0'},venue:{qualified:true,kind:'PUMP_BONDING_CURVE',program:pumpSdk.PUMP_PROGRAM_ID.toBase58(),mint:venue.mint,source:'LOCAL_FIXTURE',address:venue.venue,observedAt:start},position:null,pending:[],lastTradeAt:0};
 const adapter=createPumpRuntimeAdapter({source:'LOCAL_FIXTURE',now:()=>at,
  readSnapshot:async()=>{reads++;await hook();return {venue,accounts,blockhash:fixtureBlockhash,networkFeeLamports:'5000'};},
  simulateUnsigned:async r=>({source:'LOCAL_FIXTURE',messageHash:r.messageHash,success:true,err:null}),
  readFinalized:async signature=>{finalityReads.push(signature);return null;},verifyFinalizedEffects:async()=>{throw Error('Unexpected finality');}});
 const options={enabled:true,db,origin,source:'LOCAL_FIXTURE',now:()=>at,ttl:1000,...consentOptions,adapter,
  readOwnerContext:async()=>ctx,readContext:async()=>{await contextHook();return context;},readInputs:async()=>inputs};
 const ledger=()=>createPumpRuntimeLedger(db,{source:'LOCAL_FIXTURE',now:()=>at});
 const claim=id=>{
  // Fixture-only pre-existing claim, outside the preparation-only facade.
  const l=createPumpRuntimeLedger(db,{source:'LOCAL_FIXTURE',now:()=>at,readBudgetAuthority:r=>consents.resolveBudgetAuthority(r),executionFencing:{holder:'fixture-existing-claim',ttl:1000},readCanonicalBinding:()=>binding,readExecutionSafety:()=>({executionEnabled:true,signingEnabled:true,killSwitch:false,emergencyStop:false,agentId:agent.id,controlRevision:0}),assertExecutionReady:()=>true});
  const record=l.get(id),leaderToken=l.fences.acquireLeader(),agentToken=l.fences.acquireAgent(leaderToken,agent.id);
  try{return l.claimSigning(id,{leaderToken,agentToken,expectedPlanDigest:record.planDigest,expectedMessageHash:record.plan.messageHash,expectedControlRevision:0,expectedBindingDigest:digest(binding)});}
  finally{l.fences.release(agentToken);l.fences.release(leaderToken);}
 };
 return {db,ctx,binding,context,consents,options,adapter,inputs,wallet,ledger,claim,
  get reads(){return reads;},get finalityReads(){return finalityReads;},set time(v){at=v;},set hook(v){hook=v;},set contextHook(v){contextHook=v;}};
}

test('default-OFF never reads dependencies, creates tables, timers or ports',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const options={db};
 for(const name of ['adapter','readPlan','readAuthority','now','origin'])Object.defineProperty(options,name,{get(){throw Error('MUST NOT READ');}});
 const runtime=createPumpPreparationRuntime(options);
 assert.deepEqual(Object.keys(runtime).sort(),['status','stop','tick']);
 assert.equal(runtime.status().state,'DISABLED');assert.equal((await runtime.tick({},'agent')).state,'DISABLED');
 assert.equal(db.prepare('SELECT count(*) n FROM sqlite_master').get().n,0);
 runtime.stop();assert.equal((await runtime.tick()).state,'STOPPED');
});
test('actual product constructor always registers disabled facade without new consent/Pump tables',async()=>{
 const prefix=join(tmpdir(),'tekkteam-prep-root-'),dir=mkdtempSync(prefix);let app;
 try{
  app=createServer({dbPath:join(dir,'product-fixture.sqlite'),vaultKey:Buffer.alloc(32,17).toString('base64'),production:true,network:'mainnet',mainnetSafetyMode:true,rpc:'https://fixture.invalid',origins:['https://tekkteam.tech']});
  assert.equal(app.pumpPreparationRuntime.status().state,'DISABLED');
  assert.equal((await app.pumpPreparationRuntime.tick({},'never-read')).state,'DISABLED');
  assert.equal(app.store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE 'pump_runtime_%' OR name LIKE 'dex_owner_consent_%'").get().n,0);
 }finally{app?.close();assert.ok(resolve(dir).startsWith(resolve(prefix)));rmSync(dir,{recursive:true,force:true});}
 assert.equal(app.pumpPreparationRuntime.status().state,'STOPPED');
});
test('actual fixture adapter composes one bounded unsigned preparation and restart does not duplicate it',async t=>{
 const f=await fixture(t),runtime=createPumpPreparationRuntime(f.options),out=await runtime.tick({},f.ctx.agentId);
 assert.equal(out.state,'PREPARED_UNSIGNED');assert.equal(out.executionAllowed,false);assert.equal(out.readiness.executionAllowed,false);
 const record=f.ledger().get(out.executionId),tx=VersionedTransaction.deserialize(Buffer.from(record.plan.unsignedTransaction,'base64'));
 assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));assert.equal(record.plan.entryPolicy.personality,'operator');assert.ok(record.plan.preparationEvidence);
 runtime.stop();const restored=createPumpPreparationRuntime({...f.options,holder:'fixture-restart'});
 assert.equal((await restored.tick({},f.ctx.agentId)).state,'PREPARATION_ALREADY_EXISTS');assert.equal(f.reads,1);
 assert.equal(f.ledger().list(f.ctx.agentId).length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
 assert.equal(f.ledger().reservation(out.executionId).budget.claimedAt,null);
 assert.deepEqual(Object.keys(restored).sort(),['status','stop','tick']);
});
test('same-process duplicate is BUSY, another leader is STANDBY, stop during await prevents late preparation',async t=>{
 const f=await fixture(t),entered=latch(),release=latch();f.hook=async()=>{entered.resolve();await release.promise;};
 const a=createPumpPreparationRuntime({...f.options,holder:'a'}),b=createPumpPreparationRuntime({...f.options,holder:'b'});
 const pending=a.tick({},f.ctx.agentId);await entered.promise;
 assert.equal((await a.tick({},f.ctx.agentId)).state,'BUSY');assert.equal((await b.tick({},f.ctx.agentId)).state,'STANDBY');
 a.stop();const rejected=assert.rejects(pending,/STOPPED/);release.resolve();await rejected;
 assert.equal(f.ledger().list(f.ctx.agentId).length,0);f.hook=async()=>{};
 assert.equal((await b.tick({},f.ctx.agentId)).state,'PREPARED_UNSIGNED');
});
test('expired leader takeover fences the earlier in-flight worker before persistence',async t=>{
 const f=await fixture(t),entered=latch(),release=latch();let first=true;f.hook=async()=>{if(first){first=false;entered.resolve();await release.promise;}};
 const a=createPumpPreparationRuntime({...f.options,holder:'a'}),b=createPumpPreparationRuntime({...f.options,holder:'b'});
 const pending=a.tick({},f.ctx.agentId);await entered.promise;f.time=start+1001;
 const out=await b.tick({},f.ctx.agentId);assert.equal(out.state,'PREPARED_UNSIGNED');
 const rejected=assert.rejects(pending,/FENCE_STALE/);release.resolve();await rejected;
 assert.equal(f.ledger().list(f.ctx.agentId).length,1);assert.equal(f.ledger().get(out.executionId).status,'PREPARED');
});
for(const change of ['revoke','pause','owner'])test(`late ${change} prevents persistence`,async t=>{
 const f=await fixture(t),entered=latch(),release=latch();f.hook=async()=>{entered.resolve();await release.promise;};
 const r=createPumpPreparationRuntime(f.options),pending=r.tick({},f.ctx.agentId);await entered.promise;
 if(change==='revoke')f.consents.revoke(f.ctx);else if(change==='pause')f.ledger().pause(f.ctx.agentId);else f.context.owner=Keypair.generate().publicKey.toBase58();
 const rejected=assert.rejects(pending);release.resolve();await rejected;
 assert.equal(f.ledger().list(f.ctx.agentId).length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM real_reserved_accounts').get().n,0);
});
test('synchronous Pause at final native guard cannot persist a new preparation',async t=>{
 const f=await fixture(t),native=f.adapter.assertPreparedCurrent;let count=0;
 f.adapter.assertPreparedCurrent=record=>{native(record);if(++count===2)f.ledger().pause(f.ctx.agentId);};
 const runtime=createPumpPreparationRuntime(f.options);
 await assert.rejects(runtime.tick({},f.ctx.agentId),/CONTROL_CHANGED/);
 assert.equal(f.ledger().list(f.ctx.agentId).length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM real_reserved_accounts').get().n,0);
});
test('restart after revoked consent and Pause reconciles only existing UNKNOWN signature',async t=>{
 const f=await fixture(t),r=createPumpPreparationRuntime(f.options),out=await r.tick({},f.ctx.agentId),ledger=f.ledger();
 // Persist an existing fixture signature; this is not a production signing port.
 const tx=VersionedTransaction.deserialize(Buffer.from(ledger.get(out.executionId).plan.unsignedTransaction,'base64'));tx.sign([f.wallet]);
 f.claim(out.executionId);
 const signature=bs58.encode(tx.signatures[0]);ledger.trackPending(out.executionId,{signature,messageHash:ledger.get(out.executionId).plan.messageHash});
 f.consents.revoke(f.ctx);ledger.pause(f.ctx.agentId);r.stop();f.time=start+10000;
 const restarted=createPumpPreparationRuntime({...f.options,holder:'restart'}),result=await restarted.tick({},f.ctx.agentId);
 assert.equal(result.state,'RECONCILIATION_REQUIRED');assert.deepEqual(f.finalityReads,[signature]);assert.equal(f.reads,1);
 assert.equal(ledger.get(out.executionId).signature,signature);assert.equal(ledger.reservation(out.executionId).status,'UNKNOWN');
});
test('unsigned UNKNOWN from interrupted claim is never replaced or canceled',async t=>{
 const f=await fixture(t),r=createPumpPreparationRuntime(f.options),out=await r.tick({},f.ctx.agentId),ledger=f.ledger();
 const old=f.claim(out.executionId);
 f.consents.revoke(f.ctx);r.stop();f.time=start+10000;
 const restarted=createPumpPreparationRuntime({...f.options,holder:'restart'});
 assert.equal((await restarted.tick({},f.ctx.agentId)).state,'RECONCILIATION_REQUIRED');
 assert.equal(ledger.list(f.ctx.agentId).length,1);assert.equal(ledger.get(old.id).signature,null);assert.deepEqual(f.finalityReads,[]);assert.equal(f.reads,1);
});
test('ON_CHAIN cannot relabel fixture preparation, and signer/sender dependencies are rejected',async t=>{
 const f=await fixture(t);
 for(const key of ['sign','broadcast','execute'])assert.throws(()=>createPumpPreparationRuntime({...f.options,[key]:()=>{}}),/DEPENDENCY/);
 assert.throws(()=>createPumpPreparationRuntime({...f.options,adapter:{...f.adapter,sign:()=>{}}}),/DEPENDENCY/);
 const runtime=createPumpPreparationRuntime({...f.options,source:'ON_CHAIN'});
 assert.equal((await runtime.tick({},f.ctx.agentId)).state,'WAIT');assert.equal(f.reads,0);
});
