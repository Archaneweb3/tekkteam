import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPumpRuntimeLedger} from '../server/dex/pump-runtime-ledger.js';import {digest} from '../server/dex/intent.js';
const start=Date.UTC(2026,9,7,0),messageHash='a'.repeat(64);
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'tekk-pump-fence-')),path=join(dir,'fixture.sqlite');let db=new DatabaseSync(path),clock=start;
 const binding={owner:'fixture-owner',agentId:'fixture-agent',wallet:'fixture-wallet',mint:'fixture-mint',network:'solana:101',executionId:'fixture-launch',signature:'fixture-receipt',confirmedSlot:100,provenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 const grantBody={id:'consent',revision:1,owner:binding.owner,agentId:binding.agentId,wallet:binding.wallet,mint:binding.mint,network:binding.network,sessionId:'session',startsAt:start-1000,expiresAt:start+3600000,status:'ACTIVE',authorizationGranted:true,withdrawalEnabled:false,revoked:false,perTradeLamports:'100',sessionDebitLamports:'500',dailyDebitLamports:'500',maxTransactions:4,maxDailyTransactions:4,launchBindingDigest:digest(binding)};
 let grant={...grantBody,digest:digest(grantBody)},safety={executionEnabled:true,signingEnabled:true,killSwitch:false,emergencyStop:false,agentId:binding.agentId,controlRevision:0};
 const open=(holder='worker-one',overrides={})=>createPumpRuntimeLedger(db,{now:()=>clock,readBudgetAuthority:()=>grant,executionFencing:{holder,ttl:10000},readCanonicalBinding:()=>binding,readExecutionSafety:()=>safety,assertExecutionReady:()=>true,...overrides});let ledger=open();
 const intent={owner:binding.owner,agentId:binding.agentId,agentWallet:binding.wallet,network:'solana:101',side:'BUY',inputMint:'SOL',outputMint:binding.mint,inputAmount:'100',slippageBps:100,expiresAt:start+20000};
 const plan={source:'LOCAL_FIXTURE',venueKind:'PUMP_BONDING_CURVE',snapshotSlot:100,messageHash,feeCapLamports:'10',rentCapLamports:'20',refundCapLamports:'0',balances:{native:'10000'},quote:{inputMint:'SOL',outputMint:binding.mint,inputAmount:'100',minimumOutput:'50',estimatedOutput:'50',expiresAt:start+20000},risk:{authorizationGranted:false,source:'LOCAL_FIXTURE',nativeDebit:'130',protectedLamports:'1000',expiresAt:start+15000}};
 const budget={authorizationId:grant.id,authorizationRevision:grant.revision,authorizationDigest:grant.digest,owner:binding.owner,agentId:binding.agentId,wallet:binding.wallet,mint:binding.mint,network:binding.network,messageHash,maxDebitLamports:'130',tradeInputLamports:'100'};
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 return {binding,safety,intent,plan,budget,open,get ledger(){return ledger;},get db(){return db;},path,get grant(){return grant;},time:v=>clock=v,setGrant:p=>{const body={...grantBody,...p};grant={...body,digest:digest(body)};},prepare(){return ledger.prepare({intent,plan,requestKey:'fixture-request-0001',budget});},args(r,l=ledger){const leaderToken=l.fences.acquireLeader(),agentToken=l.fences.acquireAgent(leaderToken,intent.agentId);return {leaderToken,agentToken,expectedPlanDigest:r.planDigest,expectedMessageHash:messageHash,expectedControlRevision:0,expectedBindingDigest:digest(binding)};},restart(holder='worker-two'){db.close();db=new DatabaseSync(path);ledger=open(holder);return ledger;}};
}
test('product fence and sign claim are atomic durable facts, not a signer; UNKNOWN survives takeover',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r);const claimed=f.ledger.claimSigning(r.id,args);assert.equal(claimed.status,'UNKNOWN');assert.equal(claimed.signature,null);assert.equal(claimed.notBroadcast,true);assert.equal(f.ledger.reservation(r.id).budget.claimedAt,start);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,1);
 assert.throws(()=>f.ledger.claimSigning(r.id,args),/CLAIM_STATE/);f.time(start+11000);f.restart();const next=f.args(r);assert.equal(next.leaderToken.generation,2);assert.throws(()=>f.ledger.claimSigning(r.id,next),/CLAIM_STATE/);assert.throws(()=>f.ledger.cancel(r.id),/CANNOT_CANCEL/);assert.equal(f.ledger.reservation(r.id).status,'UNKNOWN');
 const tracked=f.ledger.trackPending(r.id,{signature:'existing-fixture-signature',messageHash});assert.equal(tracked.signature,'existing-fixture-signature');assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,1);
});
test('failed final execution write rolls back sign claim, reservation and event together',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r),events=f.db.prepare('SELECT count(*) n FROM pump_runtime_events').get().n;
 f.db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON pump_runtime_executions BEGIN SELECT RAISE(ABORT,'injected final write failure'); END");
 assert.throws(()=>f.ledger.claimSigning(r.id,args),/injected/);assert.equal(f.ledger.get(r.id).status,'PREPARED');assert.equal(f.ledger.reservation(r.id).status,'PREPARED');assert.equal(f.ledger.reservation(r.id).budget.claimedAt,null);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM pump_runtime_events').get().n,events);
});
for(const kind of ['holder','generation','parent','expiry','rollback','pause','binding','revoked','plan','message','riskExpiry'])test('claim rejects '+kind+' without financial claim',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r);
 if(kind==='holder')args.agentToken.holder='another';if(kind==='generation')args.leaderToken.generation++;if(kind==='parent')args.agentToken.parent_generation++;
 if(kind==='expiry')f.time(start+10000);if(kind==='rollback')f.time(start-1);if(kind==='pause')f.ledger.pause(f.intent.agentId);if(kind==='binding')f.binding.mint='changed';if(kind==='revoked')f.setGrant({revoked:true});if(kind==='plan')args.expectedPlanDigest='b'.repeat(64);if(kind==='message')args.expectedMessageHash='b'.repeat(64);if(kind==='riskExpiry')f.time(start+15000);
 assert.throws(()=>f.ledger.claimSigning(r.id,args));assert.equal(f.ledger.get(r.id).status,'PREPARED');assert.equal(f.ledger.reservation(r.id).budget.claimedAt,null);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('missing default dependencies and asynchronous evidence deny before any claim',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r);
 const plain=createPumpRuntimeLedger(f.db,{now:()=>start});assert.equal(plain.fences,undefined);assert.throws(()=>plain.claimSigning(r.id,args),/UNMOUNTED/);
 const absent=f.open('worker-one',{assertExecutionReady:undefined});assert.throws(()=>absent.claimSigning(r.id,args),/DEPENDENCY_UNAVAILABLE/);
 const asyncPort=f.open('worker-one',{readCanonicalBinding:async()=>f.binding});assert.throws(()=>asyncPort.claimSigning(r.id,args),/DEPENDENCY_UNAVAILABLE/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('another worker cannot acquire active Agent lease; release and parent takeover fence old tokens',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r),other=f.open('worker-two');assert.equal(other.fences.acquireLeader(),null);
 f.ledger.fences.release(args.leaderToken);const leader=other.fences.acquireLeader();assert.equal(leader.generation,2);assert.throws(()=>f.ledger.fences.assertCurrent(args.leaderToken,args.agentToken,f.intent.agentId),/STALE/);
 assert.equal(other.fences.acquireAgent(leader,f.intent.agentId),null);f.time(start+10001);const renewed=other.fences.acquireLeader(),agent=other.fences.acquireAgent(renewed,f.intent.agentId);assert.equal(agent.generation,2);assert.equal(agent.parent_generation,renewed.generation);
});
test('final claim boundary rejects time elapsed in trusted verification and rolls back budget count',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r),late=f.open('worker-one',{assertExecutionReady:()=>{f.time(start+11000);return true;}});
 assert.throws(()=>late.claimSigning(r.id,args),/FENCE_STALE/);assert.equal(f.ledger.get(r.id).status,'PREPARED');assert.equal(f.ledger.reservation(r.id).budget.claimedAt,null);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('ON_CHAIN constructor cannot claim fixture-derived preparation',t=>{
 const f=fixture(t),r=f.prepare(),args=f.args(r),chain=f.open('worker-one',{source:'ON_CHAIN'});
 assert.throws(()=>chain.claimSigning(r.id,args),/CLAIM_SOURCE/);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('owner grant expiring after budget validation rolls the entire claim back',t=>{
 const f=fixture(t);f.setGrant({expiresAt:start+5000});f.budget.authorizationDigest=f.grant.digest;const r=f.prepare(),args=f.args(r);let reads=0;
 const edge=f.open('worker-one',{now:()=>++reads>=5?start+6000:start});
 assert.throws(()=>edge.claimSigning(r.id,args),/CLAIM_AUTHORITY_EXPIRED/);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);assert.equal(f.ledger.reservation(r.id).budget.claimedAt,null);assert.equal(f.ledger.get(r.id).status,'PREPARED');
});

test('two product DB connections racing the same exact claim commit once',async t=>{
 const {Worker}=await import('node:worker_threads'),f=fixture(t),r=f.prepare(),args=f.args(r),shared=new SharedArrayBuffer(8),barrier=new Int32Array(shared);
 const moduleUrl=new URL('../server/dex/pump-runtime-ledger.js',import.meta.url).href;
 const code=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {DatabaseSync}=await import('node:sqlite'),{createPumpRuntimeLedger}=await import(workerData.moduleUrl),db=new DatabaseSync(workerData.path);db.exec('PRAGMA busy_timeout=5000');const ledger=createPumpRuntimeLedger(db,{now:()=>workerData.start,readBudgetAuthority:()=>workerData.grant,executionFencing:{holder:'worker-one',ttl:10000},readCanonicalBinding:()=>workerData.binding,readExecutionSafety:()=>workerData.safety,assertExecutionReady:()=>true});const gate=new Int32Array(workerData.shared);Atomics.add(gate,0,1);Atomics.notify(gate,0);Atomics.wait(gate,1,0);try{ledger.claimSigning(workerData.id,workerData.args);parentPort.postMessage('CLAIMED');}catch(e){parentPort.postMessage(e.code??e.message);}finally{db.close();}})().catch(e=>{parentPort.postMessage('ERROR:'+e.message);});`;
 const workers=[0,1].map(()=>new Worker(code,{eval:true,workerData:{moduleUrl,path:f.path,start,grant:f.grant,binding:f.binding,safety:f.safety,args,id:r.id,shared}}));
 const outcomes=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
 const deadline=Date.now()+10000;while(Atomics.load(barrier,0)<2){if(Date.now()>deadline)throw Error('Worker barrier timeout');await new Promise(r=>setTimeout(r,10));}Atomics.store(barrier,1,1);Atomics.notify(barrier,1,2);
 const results=await Promise.all(outcomes);assert.deepEqual(results.sort(),['CLAIMED','PUMP_CLAIM_STATE']);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,1);assert.equal(f.ledger.reservation(r.id).budget.claimedAt,start);assert.equal(f.ledger.get(r.id).status,'UNKNOWN');await Promise.all(workers.map(w=>w.terminate()));
});
