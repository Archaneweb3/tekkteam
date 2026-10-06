// LOCAL_FIXTURE: synthetic owner, disposable DB, stub RPC; no external wallet or send.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {Keypair} from '@solana/web3.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
import {createM4Execution} from '../server/pump-m4.js';
import {sha} from '../server/pump-m4-guard.js';
import {createPolicy101Authority,POLICY101_ID,POLICY101_LIGHTHOUSE_ID,POLICY101_REPLACEMENT_ID,POLICY101_FAILED_PREPARATION_ID} from '../server/policy101-isolation.js';
import {createLegacyQuarantine,writeLegacyQuarantine} from '../server/legacy-launch-quarantine.js';
import {GENESIS} from '../src/pump-readiness.js';
import {readLaunchEvidence} from '../server/launchpad-contracts.js';
import {readFirstTokenReceiptAuthority} from '../server/launchpad-token-store.js';
import {launchReceipt} from '../server/agent-trading.js';
const record=f=>JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);
async function setup(){
 const f=m4Fixture({freshBlockhash:true});let latest,expired=null,builds=0;
 const transport={...f.deps.transport,rpc:async(m,p)=>{if(m==='getGenesisHash')return GENESIS;if(m==='isBlockhashValid')return {context:{slot:104},value:p[0]!==expired};if(m==='getBlockHeight')return latest.lastValidBlockHeight+(latest.recentBlockhash===expired?1:-100);if(m==='getMultipleAccounts')return {context:{slot:105},value:[null]};throw Error('Unexpected RPC '+m);}};
 const prepareFactory=opts=>async(...args)=>{builds++;latest=await f.deps.prepareFactory(opts)(...args);return latest;};
 const deps={...f.deps,transport,prepareFactory,actionTimeEnabled:true};
 const old=createM4Execution(deps),prior=await old.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});expired=prior.result.recentBlockhash;await old.run('wallet-status',f.identity);
 const oldPayload=f.db.prepare('SELECT payload FROM m4_execution').get().payload;
 const id=crypto.randomUUID(),legacy={agentId:id,owner:Keypair.generate().publicKey.toBase58(),id:crypto.randomUUID(),status:'Failed',signature:'retained-unknown',mint:Keypair.generate().publicKey.toBase58(),network:'solana:101',broadcastAttempted:true,confirmed:false,blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:10};
 const raw=JSON.stringify({version:2,receipts:{[id]:legacy}});writeFileSync(f.journalPath,raw);
 const evidencePath=join(f.root,'evidence.json'),retiredEntrypoint=join(f.root,'retired.mjs');writeFileSync(evidencePath,'{}');writeFileSync(retiredEntrypoint,'process.exitCode=78;');
 writeLegacyQuarantine(f.journalPath,createLegacyQuarantine(Buffer.from(raw),id,{sha256:sha('{}'),height:11,blockhashValid:false,observedAt:new Date().toISOString()}));
 f.db.exec('CREATE TABLE launchpad_first_tokens(agent_id TEXT PRIMARY KEY,owner TEXT,version INTEGER,token_json TEXT)');const token=JSON.stringify({name:'ret',ticker:'3ED',mint:null});f.db.prepare('INSERT INTO launchpad_first_tokens VALUES(?,?,?,?)').run(f.target.agentId,f.target.owner,1,token);
 const approval={id:POLICY101_ID,policy:101,classification:'LEGACY_UNKNOWN_QUARANTINED',origin:'https://tekkteam.tech',network:'solana:101',maximumAttempts:1,target:f.target,journalSha256:sha(raw),quarantineSha256:sha(readFileSync(f.journalPath+'.quarantine.json')),evidencePath,evidenceSha256:sha('{}'),retiredEntrypoint,retiredEntrypointSha256:sha(readFileSync(retiredEntrypoint)),prior:{id:prior.executionId,sha256:sha(oldPayload)},history:[],tokenSha256:sha(token)};
 const authority=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval,now:f.clock});deps.receiptAuthority=authority;
 const controller=createM4Execution(deps),request=()=>({initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:prior.executionId});
 return {...f,deps,authority,approval,controller,prior,request,reviewRequest:f.request,raw,builds:()=>builds,expire:()=>expired=record(f).result.recentBlockhash};
}
test('one durable claim across controllers; restart replays exact bytes only before delivery; retry permanently denied',async()=>{
 const f=await setup();try{
  const req=f.request(),second=createM4Execution(f.deps),out=await Promise.allSettled([f.controller.run('wallet-prepare',f.identity,req),second.run('wallet-prepare',f.identity,f.request())]);assert.equal(out.filter(r=>r.status==='fulfilled').length,1);const p=out.find(r=>r.status==='fulfilled').value;
  assert.equal(f.builds(),2);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launch_isolation_claims').get().n,1);assert.notEqual(p.result.mint,f.prior.result.mint);assert.notEqual(p.result.recentBlockhash,f.prior.result.recentBlockhash);
  const replay=await second.run('wallet-prepare',f.identity,req);assert.equal(replay.walletTransactionBase64,p.walletTransactionBase64);assert.equal(f.builds(),2);
  await second.run('wallet-claim',f.identity,f.reviewRequest(p));assert.equal((await second.run('wallet-prepare',f.identity,req)).walletTransactionBase64,undefined);
  await second.run('reject',f.identity,{requestId:p.executionId});await assert.rejects(second.run('wallet-prepare',f.identity,{...f.request(),previousExecutionId:p.executionId}),{code:'POLICY101_ATTEMPT_CONSUMED'});
  assert.equal(readFileSync(f.journalPath,'utf8'),f.raw);assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('failed build consumes approval across restart without inventing or rebuilding a candidate',async()=>{
 const f=await setup();try{const broken=createM4Execution({...f.deps,prepareFactory:()=>async()=>{throw Error('RPC unavailable');}}),req=f.request();await assert.rejects(broken.run('wallet-prepare',f.identity,req),/RPC unavailable/);const resumed=createM4Execution(f.deps);await assert.rejects(resumed.run('wallet-prepare',f.identity,req),{code:'POLICY101_ATTEMPT_CONSUMED'});assert.equal(f.builds(),1);assert.equal(record(f).executionId,f.prior.executionId);assert.equal(f.sends(),0);}finally{f.db.close();}
});
for(const part of ['journal','quarantine','evidence','retired'])test(part+' change prevents wallet delivery and submission',async()=>{
 const f=await setup();try{const p=await f.controller.run('wallet-prepare',f.identity,f.request());const path={journal:f.journalPath,quarantine:f.journalPath+'.quarantine.json',evidence:f.approval.evidencePath,retired:f.approval.retiredEntrypoint}[part];writeFileSync(path,readFileSync(path,'utf8')+' ');await assert.rejects(f.controller.run('wallet-claim',f.identity,f.reviewRequest(p)));await assert.rejects(f.controller.run('submit',f.identity,{...f.reviewRequest(p),signedTransactionBase64:f.signed()}));assert.equal(f.sends(),0);}finally{f.db.close();}
});
test('grant/claim/receipt partitions reject update/delete/replace and prior history changes fail closed',async()=>{
 const f=await setup();try{await f.controller.run('wallet-prepare',f.identity,f.request());for(const t of ['launch_isolation_grants','launch_isolation_claims']){assert.throws(()=>f.db.exec('DELETE FROM '+t),/Immutable/);const row=f.db.prepare('SELECT * FROM '+t).get(),values=Object.values(row);assert.throws(()=>f.db.prepare('INSERT OR REPLACE INTO '+t+' VALUES('+values.map(()=>'?').join(',')+')').run(...values),/Immutable/);}f.db.prepare('INSERT INTO m4_execution_history VALUES(?,?)').run(crypto.randomUUID(),'{}');await assert.rejects(f.controller.run('wallet-claim',f.identity,f.reviewRequest(f.controller.status())),{code:'POLICY101_ARCHIVE_CHANGED'});assert.equal(f.sends(),0);}finally{f.db.close();}
});
test('confirmed receipt is appended atomically; read authorities persist with authorization OFF; no legacy write',async()=>{
 const f=await setup();try{
  const p=await f.controller.run('wallet-prepare',f.identity,f.request());await f.controller.run('wallet-claim',f.identity,f.reviewRequest(p));await f.controller.run('submit',f.identity,{...f.reviewRequest(p),signedTransactionBase64:f.signed()});
  let provisionCalls=0;const confirm=async()=>({status:'LAUNCHED',confirmedSlot:110,blockTime:100,confirmedAt:f.clock(),pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR',observedSpendLamports:p.result.policy.estimatedPayerDebitLamports,networkFeeLamports:10000});
  const resumed=createM4Execution({...f.deps,confirm,provisionAgent:()=>{provisionCalls++;return {status:'READY'};}});const final=await resumed.run('status',f.identity);assert.equal(final.status,'LAUNCHED');assert.equal(final.provisioning.status,'READY');await resumed.run('status',f.identity);assert.equal(provisionCalls,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM canonical_launch_receipts').get().n,1);
  const off=createPolicy101Authority({db:f.db,journalPath:f.journalPath}),agent={id:f.target.agentId,creator:f.target.owner};assert.equal(off.policyPresent,true);assert.throws(()=>off.isolation.assertExecution(p.executionId),{code:'POLICY101_NOT_ARMED'});for(const r of [readLaunchEvidence(agent,f.journalPath,off.read).receipt,readFirstTokenReceiptAuthority(agent,f.journalPath,off.read).receipt,launchReceipt(agent,f.journalPath,off.read)])assert.equal(r.mint,p.result.mint);
  assert.equal(readFileSync(f.journalPath,'utf8'),f.raw);assert.equal(f.sends(),1);assert.throws(()=>f.db.exec('DELETE FROM canonical_launch_receipts'),/Immutable/);const row=f.db.prepare('SELECT * FROM canonical_launch_receipts').get();for(const key of ['execution_id','signature','mint']){const mutated={...row,agent_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),signature:'different',mint:Keypair.generate().publicKey.toBase58()};mutated[key]=row[key];assert.throws(()=>f.db.prepare('INSERT OR REPLACE INTO canonical_launch_receipts VALUES(?,?,?,?,?)').run(...Object.values(mutated)),/Immutable/);}const disarmed=createM4Execution({...f.deps,receiptAuthority:off});await assert.rejects(disarmed.run('status',f.identity),{code:'POLICY101_NOT_ARMED'});
 }finally{f.db.close();}
});

test('removing runtime approval cannot bypass persisted grant at wallet delivery or Submit',async()=>{const f=await setup();try{const p=await f.controller.run('wallet-prepare',f.identity,f.request()),off=createPolicy101Authority({db:f.db,journalPath:f.journalPath}),resumed=createM4Execution({...f.deps,receiptAuthority:off});await assert.rejects(resumed.run('wallet-claim',f.identity,f.reviewRequest(p)),{code:'POLICY101_NOT_ARMED'});await assert.rejects(resumed.run('submit',f.identity,{...f.reviewRequest(p),signedTransactionBase64:f.signed()}),{code:'POLICY101_NOT_ARMED'});assert.equal(readFileSync(f.journalPath,'utf8'),f.raw);assert.equal(f.sends(),0);}finally{f.db.close();}});
test('a pin changed during native validity is refused before payload delivery',async()=>{const f=await setup();try{const rpc=f.deps.transport.rpc;let nativeChecks=0;f.deps.transport.rpc=async(m,p)=>{const r=await rpc(m,p);if(m==='isBlockhashValid'&&++nativeChecks===2)writeFileSync(f.approval.evidencePath,'changed');return r;};await assert.rejects(f.controller.run('wallet-prepare',f.identity,f.request()),{code:'POLICY101_HISTORY_CHANGED'});assert.equal(record(f).executionId,f.prior.executionId);assert.equal(f.sends(),0);}finally{f.db.close();}});

async function successorFixture(){
 const f=await setup(),p=await f.controller.run('wallet-prepare',f.identity,f.request());await f.controller.run('wallet-claim',f.identity,f.reviewRequest(p));
 const failing=createM4Execution({...f.deps,revalidate:async()=>{throw Object.assign(Error('fixture'),{code:'M4_LIGHTHOUSE_PROGRAM_OR_STATE_CHANGED'});}});
 await failing.run('submit',f.identity,{...f.reviewRequest(p),signedTransactionBase64:f.signed()});
 const payload=f.db.prepare('SELECT payload FROM m4_execution').get().payload,parent=f.db.prepare('SELECT payload FROM launch_isolation_grants').get().payload,claim=f.db.prepare('SELECT * FROM launch_isolation_claims').get();
 const approval={...f.approval,id:POLICY101_LIGHTHOUSE_ID,predecessor:{id:POLICY101_ID,sha256:sha(parent),claimSha256:sha(JSON.stringify(claim))},prior:{id:p.executionId,sha256:sha(payload)},history:f.db.prepare('SELECT execution_id,payload FROM m4_execution_history ORDER BY execution_id').all().map(r=>({id:r.execution_id,sha256:sha(r.payload)}))};
 return {...f,p,approval,parent,claim,payload};
}
test('one explicit successor preserves old grant and signed history, and never rearms old operation',async()=>{
 const f=await successorFixture();try{
  const authority=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval});assert.equal(authority.isolation.available(),true);
  assert.throws(()=>f.authority.isolation.assertExecution(f.p.executionId),{code:'POLICY101_NOT_ARMED'});
  const oldApproval=JSON.parse(f.parent),stale=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:oldApproval});assert.throws(()=>stale.isolation.available(),{code:'POLICY101_NOT_ARMED'});
  f.expire();const rpc=f.deps.transport.rpc,transport={...f.deps.transport,rpc:async(m,p)=>m==='getSignatureStatuses'?{context:{slot:105},value:[null]}:m==='getTransaction'?null:rpc(m,p)};
  const c=createM4Execution({...f.deps,transport,receiptAuthority:authority}),req={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:f.p.executionId},fresh=await c.run('wallet-prepare',f.identity,req);
  assert.notEqual(fresh.executionId,f.p.executionId);assert.notEqual(fresh.result.mint,f.p.result.mint);assert.notEqual(fresh.result.recentBlockhash,f.p.result.recentBlockhash);assert.equal(f.db.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(f.p.executionId).payload,f.payload);
  assert.equal(f.db.prepare('SELECT payload FROM launch_isolation_grants WHERE id=?').get(POLICY101_ID).payload,f.parent);assert.deepEqual(f.db.prepare('SELECT * FROM launch_isolation_claims WHERE grant_id=?').get(POLICY101_ID),f.claim);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launch_isolation_claims').get().n,2);assert.equal((await c.run('wallet-prepare',f.identity,req)).executionId,fresh.executionId);
  await assert.rejects(c.run('wallet-prepare',f.identity,{...req,requestId:crypto.randomUUID(),previousExecutionId:fresh.executionId}),{code:'POLICY101_ATTEMPT_CONSUMED'});
  await assert.rejects(c.run('submit',f.identity,{...f.reviewRequest(f.p),signedTransactionBase64:f.signed()}),{code:'M4_EXECUTION_MISMATCH'});assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
for(const field of ['lineage','claim','prior','target','limit','third','broadcast'])test('successor refuses '+field+' and rolls back grant insertion',async()=>{const f=await successorFixture();try{
 const a=structuredClone(f.approval);if(field==='lineage')a.predecessor.sha256='0';if(field==='claim')a.predecessor.claimSha256='0';if(field==='prior')a.prior.sha256='0';if(field==='target')a.target.owner='wrong';if(field==='limit')a.maximumAttempts=2;if(field==='third')a.id+='-2';if(field==='broadcast'){const s=record(f);s.broadcastAttempted=true;f.db.prepare('UPDATE m4_execution SET payload=?').run(JSON.stringify(s));a.prior.sha256=sha(JSON.stringify(s));}
 assert.throws(()=>createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:a}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launch_isolation_grants').get().n,1);assert.equal(f.sends(),0);
 }finally{f.db.close();}});

async function replacementFixture(){
 const f=await successorFixture(),diagnostic=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval});
 // LOCAL_FIXTURE: durable pre-recovery claim, no candidate was produced.
 diagnostic.isolation.beforePrepare(POLICY101_FAILED_PREPARATION_ID,f.p.executionId);
 const parent=f.db.prepare('SELECT payload FROM launch_isolation_grants WHERE id=?').get(POLICY101_LIGHTHOUSE_ID).payload,claim=f.db.prepare('SELECT * FROM launch_isolation_claims WHERE grant_id=?').get(POLICY101_LIGHTHOUSE_ID);
 const evidence={freshRequestId:POLICY101_FAILED_PREPARATION_ID,stage:'RECOVERY_BEFORE_FRESH_PREPARATION',error:'PREPARATION_RPC_ERROR',rpcMethod:'getBlockHeight',rpcCode:-32016,oldActiveOperation:f.p.executionId,oldPayloadSha256:sha(f.payload),freshOperationPersisted:false,freshArchived:false,freshDiagnostics:0,freshPhantomOpened:false,freshOwnerSigned:false,freshBroadcast:false,oldBroadcast:false,secondAttempt:false,receipts:0,solSpentThisAttempt:0};
 const path=join(f.root,'failed-preparation.json');writeFileSync(path,JSON.stringify(evidence));
 const approval={...f.approval,id:POLICY101_REPLACEMENT_ID,predecessor:{id:POLICY101_LIGHTHOUSE_ID,sha256:sha(parent),claimSha256:sha(JSON.stringify(claim))},failedPreparation:{path,sha256:sha(readFileSync(path))}};
 return {...f,diagnostic,approval,diagnosticParent:parent,diagnosticClaim:claim,evidence};
}
test('one replacement preserves both claims and failed claim-only state; concurrent/restart duplicate fenced',async()=>{
 const f=await replacementFixture();try{
  const before=f.db.prepare('SELECT * FROM launch_isolation_claims ORDER BY grant_id').all(),authority=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval});
  assert.equal(authority.isolation.available(),true);for(const old of [f.authority,f.diagnostic])assert.throws(()=>old.isolation.assertExecution(f.p.executionId),{code:'POLICY101_NOT_ARMED'});
  f.expire();const rpc=f.deps.transport.rpc,transport={...f.deps.transport,rpc:async(m,p)=>m==='getSignatureStatuses'?{context:{slot:105},value:[null]}:m==='getTransaction'?null:rpc(m,p)};
  const deps={...f.deps,transport,receiptAuthority:authority},c=createM4Execution(deps),req={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:f.p.executionId};
  const results=await Promise.allSettled([c.run('wallet-prepare',f.identity,req),createM4Execution(deps).run('wallet-prepare',f.identity,{...req,requestId:crypto.randomUUID()})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const fresh=results.find(x=>x.status==='fulfilled').value;assert.equal(fresh.executionId,req.requestId);assert.notEqual(fresh.result.mint,f.p.result.mint);assert.notEqual(fresh.result.recentBlockhash,f.p.result.recentBlockhash);
  assert.equal(f.db.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(f.p.executionId).payload,f.payload);
  assert.equal(f.db.prepare('SELECT payload FROM launch_isolation_grants WHERE id=?').get(POLICY101_LIGHTHOUSE_ID).payload,f.diagnosticParent);
  assert.deepEqual(f.db.prepare('SELECT * FROM launch_isolation_claims ORDER BY grant_id').all().filter(r=>r.grant_id!==POLICY101_REPLACEMENT_ID),before);
  assert.equal(f.db.prepare('SELECT 1 FROM m4_execution_history WHERE execution_id=?').get(POLICY101_FAILED_PREPARATION_ID),undefined);
  const restarted=createM4Execution({...deps,receiptAuthority:createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval})});
  assert.equal((await restarted.run('wallet-prepare',f.identity,req)).walletTransactionBase64,fresh.walletTransactionBase64);
  await restarted.run('wallet-claim',f.identity,f.reviewRequest(fresh));assert.equal((await restarted.run('wallet-prepare',f.identity,req)).walletTransactionBase64,undefined);
  await assert.rejects(restarted.run('wallet-prepare',f.identity,{...req,requestId:crypto.randomUUID(),previousExecutionId:fresh.executionId}),{code:'POLICY101_ATTEMPT_CONSUMED'});assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
for(const kind of ['lineage','claim','prior','target','limit','fourth','evidence-hash','wrong-method','signed','diagnostic','signer','archived'])test('replacement rejects '+kind+' before installation',async()=>{
 const f=await replacementFixture();try{const a=structuredClone(f.approval);
  if(kind==='lineage')a.predecessor.sha256='0';if(kind==='claim')a.predecessor.claimSha256='0';if(kind==='prior')a.prior.sha256='0';if(kind==='target')a.target.owner='wrong';if(kind==='limit')a.maximumAttempts=2;if(kind==='fourth')a.id+='-2';if(kind==='evidence-hash')a.failedPreparation.sha256='0';
  if(['wrong-method','signed'].includes(kind)){const e={...f.evidence,...(kind==='signed'?{freshOwnerSigned:true}:{rpcMethod:'sendTransaction'})};writeFileSync(a.failedPreparation.path,JSON.stringify(e));a.failedPreparation.sha256=sha(readFileSync(a.failedPreparation.path));}
  if(kind==='diagnostic')f.db.prepare('INSERT INTO m4_wallet_diagnostics VALUES(?,?,?,?)').run('fixture',POLICY101_FAILED_PREPARATION_ID,'fixture','{}');
  if(kind==='signer'){f.db.exec('CREATE TABLE IF NOT EXISTS m4_ephemeral_mint_signers(execution_id TEXT PRIMARY KEY,binding TEXT,ciphertext TEXT)');f.db.prepare('INSERT INTO m4_ephemeral_mint_signers VALUES(?,?,?)').run(POLICY101_FAILED_PREPARATION_ID,'fixture','fixture');}
  if(kind==='archived')f.db.prepare('INSERT INTO m4_execution_history VALUES(?,?)').run(POLICY101_FAILED_PREPARATION_ID,'{}');
  assert.throws(()=>createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:a}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM launch_isolation_grants').get().n,2);assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('replacement failed build stays consumed and cannot reuse failed request or change evidence',async()=>{
 const f=await replacementFixture();try{const authority=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval});
  assert.throws(()=>authority.isolation.beforePrepare(POLICY101_FAILED_PREPARATION_ID,f.p.executionId));assert.equal(authority.isolation.available(),true);
  f.expire();const rpc=f.deps.transport.rpc,transport={...f.deps.transport,rpc:async(m,p)=>m==='getSignatureStatuses'?{context:{slot:105},value:[null]}:m==='getTransaction'?null:rpc(m,p)};
  const c=createM4Execution({...f.deps,transport,receiptAuthority:authority,prepareFactory:()=>async()=>{throw Error('fixture build failure');}}),req={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:f.p.executionId};
  await assert.rejects(c.run('wallet-prepare',f.identity,req),/fixture build failure/);const restart=createPolicy101Authority({db:f.db,journalPath:f.journalPath,approval:f.approval});assert.equal(restart.isolation.available(),false);assert.throws(()=>restart.isolation.beforePrepare(crypto.randomUUID(),f.p.executionId),{code:'POLICY101_ATTEMPT_CONSUMED'});
  assert.equal(f.db.prepare('SELECT payload FROM m4_execution').get().payload,f.payload);writeFileSync(f.approval.failedPreparation.path,'{}');assert.throws(()=>restart.isolation.available(),{code:'POLICY101_REPLACEMENT_EVIDENCE'});assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
