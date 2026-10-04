import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Transaction} from '@solana/web3.js';
import {createM4Execution} from '../server/pump-m4.js';
import {verifyM4Signed,revalidateM4} from '../server/pump-m4-guard.js';
import {walletTestConfig,walletTestRoute} from '../server/wallet-test-policy.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
const prepare=f=>f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});
test('exact target, zero buy, valid mint partial signature and no owner key persisted',async()=>{
 const f=m4Fixture();try{await assert.rejects(f.controller.run('prepare',{...f.identity,agentId:'wrong'},{initialBuy:'0',requestId:crypto.randomUUID()}));await assert.rejects(f.controller.run('prepare',f.identity,{initialBuy:'0.1',requestId:crypto.randomUUID()}));const s=await prepare(f),privateState=JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);assert.equal(s.status,'READY_FOR_REVIEW');assert.equal(verifyM4Signed(privateState.walletTransactionBase64,privateState,false).signature,null);assert.equal(f.sends(),0);assert.equal(JSON.stringify(privateState).includes(Buffer.from(f.owner.secretKey).toString('base64')),false);assert.equal(JSON.parse(readFileSync(f.journalPath)).receipts[f.identity.agentId],undefined);}finally{f.db.close();}
});
test('one approval and single send survive ambiguity and restart; duplicate submits cannot send',async()=>{
 const f=m4Fixture({sendFails:true});try{const s=await prepare(f),request=f.request(s);await assert.rejects(f.controller.run('review',f.identity,{...request,reviewDigest:'a'.repeat(64)}));await f.controller.run('review',f.identity,request);await assert.rejects(f.controller.run('review',f.identity,request));const signed=f.signed(),result=await f.controller.run('submit',f.identity,{...request,signedTransactionBase64:signed});assert.equal(result.status,'CONFIRMATION_UNKNOWN');assert.equal(f.sends(),1);assert.ok(result.signature);assert.ok(result.signedDigest);assert.equal(result.broadcastAttempted,true);const resumed=createM4Execution(f.deps);await assert.rejects(resumed.run('submit',f.identity,{...request,signedTransactionBase64:signed}));await assert.rejects(resumed.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()}));await resumed.run('status',f.identity);assert.equal(f.sends(),1);}finally{f.db.close();}
});
test('rejection consumes M4, expiry refuses prompt and changed transaction never broadcasts',async()=>{
 const f=m4Fixture();try{const s=await prepare(f),request=f.request(s);f.advance(30000);await assert.rejects(f.controller.run('review',f.identity,request),e=>e.code==='EXECUTION_REVIEW_EXPIRED');const refreshed=await prepare(f),fresh=f.request(refreshed);await f.controller.run('review',f.identity,fresh);const tx=Transaction.from(Buffer.from(f.signed(),'base64'));tx.instructions[0].data[10]^=1;await assert.rejects(f.controller.run('submit',f.identity,{...fresh,signedTransactionBase64:tx.serialize({verifySignatures:false}).toString('base64')}));assert.equal(f.sends(),0);assert.equal((await f.controller.run('reject',f.identity,{requestId:refreshed.executionId})).status,'USER_REJECTED');await assert.rejects(prepare(f));}finally{f.db.close();}
});
test('pre-send persistence failure cannot reach sender; signed expiry is permanently quarantined',async()=>{
 const f=m4Fixture({dependencies:{revalidate:async(record,identity,request,{now})=>{if(now()>=record.result.expiresAt)throw Object.assign(Error('expired'),{code:'EXECUTION_REVIEW_EXPIRED'});return {contextSlot:104};}}});try{const s=await prepare(f),request=f.request(s);await f.controller.run('review',f.identity,request);const signed=f.signed();f.advance(30000);const result=await f.controller.run('submit',f.identity,{...request,signedTransactionBase64:signed});assert.equal(result.status,'SIGNED_NOT_BROADCAST');assert.equal(result.broadcastAttempted,false);assert.equal(f.sends(),0);assert.ok(result.signature);await assert.rejects(prepare(f));}finally{f.db.close();}
 const b=m4Fixture();try{const s=await prepare(b),request=b.request(s);await b.controller.run('review',b.identity,request);b.db.exec("CREATE TRIGGER fail_m4 BEFORE UPDATE ON m4_execution BEGIN SELECT RAISE(ABORT,'disk refusal'); END");await assert.rejects(b.controller.run('submit',b.identity,{...request,signedTransactionBase64:b.signed()}));assert.equal(b.sends(),0);}finally{b.db.close();}
});
test('M4 allowlist remains exact-target only; broad operations and unconfigured runtime stay denied',()=>{
 const id='8fc6fe77-16a0-4fed-8ca0-ddd1f6ef9fa7';assert.equal(walletTestRoute('POST','/api/launchpad/agents/'+id+'/execution/submit',true,false),false);assert.equal(walletTestRoute('POST','/api/launchpad/agents/'+id+'/execution/submit',true,true),true);for(const path of ['/api/pump-launch/submit','/api/agents/'+id+'/trading/enable','/api/agents/'+id+'/trading/funding','/api/launchpad/agents/wrong/execution/submit'])assert.equal(walletTestRoute('POST',path,true,true),false);assert.throws(()=>walletTestConfig({origin:'https://staging.tekkteam.tech',port:4395,dataDir:'/var/lib/tekkteam-staging',rpcUrl:'https://fixture.example',launchPreparation:true,m4Launch:{owner:'wrong'}}));
});
test('two independent controller instances cannot both claim wallet approval',async()=>{
 const f=m4Fixture();try{
  const s=await prepare(f),request=f.request(s),waiters=[];const slow=()=>new Promise(resolve=>waiters.push(resolve));
  const a=createM4Execution({...f.deps,revalidate:slow}),b=createM4Execution({...f.deps,revalidate:slow});
  const first=a.run('review',f.identity,request),second=b.run('review',f.identity,request);
  assert.equal(waiters.length,2);waiters[0]({contextSlot:104});await first;waiters[1]({contextSlot:104});await assert.rejects(second,e=>e.code==='M4_STALE_EXECUTION_WRITER');
  assert.equal(JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload).status,'AWAITING_WALLET_APPROVAL');assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
