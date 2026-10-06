// Disposable LOCAL_FIXTURE. No human wallet, RPC or production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Keypair,Transaction} from '@solana/web3.js';
import {buildCreation,GENESIS} from '../src/pump-readiness.js';
import {classifyLegacyEvidence,recoverLegacyTransaction,reviewFreshIsolation,legacyHash} from '../server/legacy-launch-reconciliation.js';
import {createLegacyQuarantine,writeLegacyQuarantine,loadLegacyQuarantine} from '../server/legacy-launch-quarantine.js';
import {createPumpLaunch} from '../server/pump-launch.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
import {createM4Execution} from '../server/pump-m4.js';
function request(url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request(url,{method,headers},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(text)}));});req.on('error',reject);req.end(body);});}

function fixture(){
 const owner=Keypair.generate(),mint=Keypair.generate();
 const record={id:'legacy-operation',agentId:'legacy-agent',owner:owner.publicKey.toBase58(),name:'Legacy',symbol:'OLD',description:'fixture',character:'frank',metadataUri:'https://example.test/metadata',image:'https://example.test/image',network:'solana:101',mint:mint.publicKey.toBase58(),blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100,createdAt:1000,initialBuyLamports:0,status:'Failed',confirmed:false,broadcastAttempted:true};
 const tx=buildCreation(mint.publicKey,record.blockhash,record);tx.sign(owner,mint);
 const bytes=tx.serialize().toString('base64');record.signature=recoverLegacyTransaction(bytes,record).signature;
 const raw=Buffer.from(JSON.stringify({version:2,receipts:{[record.agentId]:record}}));
 const journal=join(mkdtempSync(join(tmpdir(),'tekkteam-legacy-')),'receipts.json');writeFileSync(journal,raw);
 const evidence={sha256:'a'.repeat(64),observedAt:'2026-10-06T17:00:00.000Z',height:200,blockhashValid:false};
 const q=createLegacyQuarantine(raw,record.agentId,evidence);
 return {record,raw,journal,q,bytes,owner};
}
test('retired production entrypoint exits before opening any service or importing custody',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../deploy/retired-launch-entrypoint.mjs',import.meta.url))],{encoding:'utf8'});
 assert.equal(result.status,78);assert.match(result.stderr,/TEKKTEAM_LEGACY_LAUNCH_RETIRED/);assert.equal(result.stdout,'');
});
test('fully signed bytes recover missing first signature and deterministic fingerprints',()=>{
 const f=fixture(),proof=recoverLegacyTransaction(f.bytes,{...f.record,signature:null});assert.equal(proof.signature,f.record.signature);assert.match(proof.messageSha256,/^[a-f0-9]{64}$/);
 assert.throws(()=>recoverLegacyTransaction(f.bytes,{...f.record,owner:Keypair.generate().publicKey.toBase58()}),/BINDING/);
 assert.throws(()=>recoverLegacyTransaction(f.bytes,{...f.record,signature:'wrong'}),/SIGNATURE_MISMATCH/);
});
test('exact finalized Pump success and on-chain failure classify; mismatches stay unknown',()=>{
 const f=fixture();for(const err of [null,{InstructionError:[0,'Custom']}]){
  const input={record:f.record,genesis:GENESIS,status:{confirmationStatus:'finalized',slot:10,err},transaction:{slot:10,transaction:[f.bytes,'base64'],meta:{err,fee:10000}}};
  assert.equal(classifyLegacyEvidence(input).classification,err?'FAILED_ONCHAIN':'CONFIRMED_ONCHAIN');
  assert.equal(classifyLegacyEvidence({...input,status:{...input.status,slot:11}}).classification,'LEGACY_UNKNOWN_QUARANTINED');
  assert.equal(classifyLegacyEvidence({...input,record:{...f.record,metadataUri:'https://wrong.test'}}).classification,'LEGACY_UNKNOWN_QUARANTINED');
  assert.equal(classifyLegacyEvidence({...input,transaction:{...input.transaction,meta:{err}}}).classification,'LEGACY_UNKNOWN_QUARANTINED');
  assert.equal(classifyLegacyEvidence({...input,status:{...input.status,slot:undefined},transaction:{...input.transaction,slot:undefined}}).classification,'LEGACY_UNKNOWN_QUARANTINED');
 }
});
test('RPC null, timeout-after-send, and expiry alone never mean failed or never broadcast',()=>{
 const f=fixture();for(const extra of [{status:null,transaction:null},{rpcError:'TIMEOUT',sendTransactionCalled:true},{blockhashValid:false,height:99999}])assert.equal(classifyLegacyEvidence({record:f.record,genesis:GENESIS,...extra}).classification,'LEGACY_UNKNOWN_QUARANTINED');
});
test('exact durable pre-send terminal proof distinguishes rejected from expired',()=>{
 const f=fixture(),record={...f.record,signature:null,broadcastAttempted:false};
 const unsigned=Transaction.from(Buffer.from(f.bytes,'base64'));for(const s of unsigned.signatures)s.signature=null;const bytes=unsigned.serialize({requireAllSignatures:false});
 const p={executionId:record.id,target:{agentId:record.agentId,owner:record.owner},result:{mint:record.mint,recentBlockhash:record.blockhash,lastValidBlockHeight:record.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),transactionSha256:legacyHash(bytes)},broadcastAttempted:false,signature:null,submittedAt:null,status:'USER_REJECTED'};
 const input={record,genesis:GENESIS,preSendTerminal:p};assert.equal(classifyLegacyEvidence(input).classification,'DEFINITIVELY_NOT_BROADCAST');
 for(const delta of [{signedTransactionBase64:f.bytes},{ownerApprovedTransactionBase64:f.bytes},{signedDigest:'a'.repeat(64)},{confirmation:{}},{signature:undefined},{submittedAt:undefined}])assert.equal(classifyLegacyEvidence({...input,preSendTerminal:{...p,...delta}}).classification,'LEGACY_UNKNOWN_QUARANTINED');
 p.status='TRANSACTION_EXPIRED';assert.equal(classifyLegacyEvidence(input).classification,'LEGACY_UNKNOWN_QUARANTINED');
 assert.equal(classifyLegacyEvidence({...input,blockhashValid:false,height:200}).classification,'EXPIRED_BEFORE_BROADCAST');
 p.broadcastAttempted=true;assert.equal(classifyLegacyEvidence({...input,blockhashValid:false,height:200}).classification,'LEGACY_UNKNOWN_QUARANTINED');
});
test('quarantine is append-only/idempotent and raw journal survives restart byte-for-byte',()=>{
 const f=fixture();writeLegacyQuarantine(f.journal,f.q);writeLegacyQuarantine(f.journal,f.q);
 assert.deepEqual(readFileSync(f.journal),f.raw);assert.deepEqual(loadLegacyQuarantine(f.journal,{required:true}).read(),f.q);
 assert.throws(()=>writeLegacyQuarantine(f.journal,{...f.q,chainOutcome:'FAILED'}),/CONFLICT/);
 const guard=loadLegacyQuarantine(f.journal);assert.throws(()=>guard.assertMutation(f.record.agentId),/QUARANTINED/);
 assert.throws(()=>guard.assertMutation('another-agent'),/JOURNAL_FROZEN/);
 writeFileSync(f.journal,JSON.stringify({version:2,receipts:{}}));assert.throws(()=>guard.read(),/INVALID/);
});
test('required missing, corrupt, removed and replaced manifests fail closed',()=>{
 const f=fixture();assert.throws(()=>loadLegacyQuarantine(f.journal,{required:true}),/ENOENT/);
 assert.throws(()=>createPumpLaunch({journal:f.journal,quarantineRequired:true}),/ENOENT/);
 writeLegacyQuarantine(f.journal,f.q);const g=loadLegacyQuarantine(f.journal);unlinkSync(f.journal+'.quarantine.json');assert.throws(()=>g.read(),/ENOENT/);
 writeFileSync(f.journal+'.quarantine.json','{}');assert.throws(()=>loadLegacyQuarantine(f.journal),/INVALID/);
});
test('policy proposal refuses reused identifiers and cannot activate a fresh launch',()=>{
 const f=fixture();const candidate={operationId:f.record.id,agentId:f.record.agentId,mint:f.record.mint,recentBlockhash:f.record.blockhash,idempotencyKey:f.record.id};
 assert.equal(reviewFreshIsolation(candidate,f.q).collisions.length,6);
 const fresh={operationId:'new',agentId:'new-agent',mint:Keypair.generate().publicKey.toBase58(),recentBlockhash:Keypair.generate().publicKey.toBase58(),idempotencyKey:'new-key',messageSha256:'b'.repeat(64)};
 assert.deepEqual(reviewFreshIsolation(fresh,f.q),{allowed:false,ownerPolicyApprovalRequired:true,collisions:['messageProofPending'],requiresOldOperationResumeFence:true});
});
test('missing or malformed historical validity cannot claim recorded blockhash expiry',()=>{
 const f=fixture();for(const change of [{blockhash:undefined},{blockhash:'bad'},{lastValidBlockHeight:undefined},{lastValidBlockHeight:-1},{lastValidBlockHeight:1.5}]){
  const raw=Buffer.from(JSON.stringify({version:2,receipts:{[f.record.agentId]:{...f.record,...change}}}));
  assert.throws(()=>createLegacyQuarantine(raw,f.record.agentId,f.q.evidence),/VALIDITY_REQUIRED/);
 }
});
test('quarantine never opens existing M4 journal guard or creates a preparation',async t=>{
 const f=m4Fixture({dependencies:{actionTimeEnabled:true}});t.after(()=>f.db.close());const old=fixture();writeFileSync(f.journalPath,old.raw);writeLegacyQuarantine(f.journalPath,old.q);
 await assert.rejects(createM4Execution(f.deps).run('estimate',f.identity,{initialBuy:'0',requestId:'00000000-0000-4000-8000-000000000001'}),/PRIOR_EXECUTION_REQUIRES_RECONCILIATION/);
 assert.equal(f.sends(),0);assert.equal(f.db.prepare('SELECT count(*) n FROM m4_execution').get().n,0);
});
test('legacy status overlays quarantine; every mutation rejects; no RPC or send',async t=>{
 const f=fixture();writeLegacyQuarantine(f.journal,f.q);let rpc=0,send=0;
 const app=createPumpLaunch({journal:f.journal,connection:{getGenesisHash:async()=>{rpc++;return GENESIS;}},send:async()=>{send++;},getAgent:async()=>({id:f.record.agentId,creator:f.record.owner,name:'Legacy',character:'frank',coin:null})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port+'/pump-launch/';const headers={host:'127.0.0.1:4193',origin:'http://127.0.0.1:5188','Content-Type':'application/json'};
 const response=await request(base+'status?agentId='+f.record.agentId,{headers});assert.equal(response.status,200);const body=await response.json();assert.equal(body.reconciliation.classification,'LEGACY_UNKNOWN_QUARANTINED');assert.equal(body.canStartFreshPreparation,false);
 for(const action of ['prepare','review','submit','delete-draft']){const res=await request(base+action,{method:'POST',headers,body:JSON.stringify({agentId:f.record.agentId,id:f.record.id,replacePreparationId:f.record.id})});assert.equal(res.status,503);}
 assert.equal((await request(base+'prepare',{method:'POST',headers,body:JSON.stringify({agentId:'another-agent'})})).status,503);
 assert.equal(rpc,0);assert.equal(send,0);assert.equal(legacyHash(readFileSync(f.journal)),legacyHash(f.raw));
});
test('an in-flight legacy status cannot overwrite a newly quarantined receipt',async t=>{
 const f=fixture();let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const app=createPumpLaunch({journal:f.journal,connection:{getGenesisHash:async()=>GENESIS,getSignatureStatuses:async()=>{entered();await gate;return{value:[{err:{InstructionError:[0,'Custom']}}]};}},getAgent:async()=>({id:f.record.agentId,creator:f.record.owner,name:'Legacy',character:'frank',coin:{name:f.record.name,ticker:f.record.symbol}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const pending=request('http://127.0.0.1:'+server.address().port+'/pump-launch/status?agentId='+f.record.agentId,{headers:{host:'127.0.0.1:4193'}});
 await waiting;writeLegacyQuarantine(f.journal,f.q);release();assert.equal((await pending).status,503);assert.deepEqual(readFileSync(f.journal),f.raw);
});
