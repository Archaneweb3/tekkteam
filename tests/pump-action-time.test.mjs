import test from 'node:test';
import assert from 'node:assert/strict';
import {Transaction,Keypair} from '@solana/web3.js';
import {createM4Execution} from '../server/pump-m4.js';
import {checkM4Blockhash,completeM4OwnerApproval} from '../server/pump-m4-guard.js';
import {assertExecutionReview} from '../server/pump-execution-review.js';
import {assertActionTimeHandoff} from '../src/pump-action-time.js';
import {GENESIS} from '../src/pump-readiness.js';
import {M4_FEE_POLICY} from '../src/pump-fee-policy.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
// LOCAL_FIXTURE: isolated SQLite, synthetic owner signatures and native RPC stubs.
const record=f=>{const r=f.db.prepare('SELECT payload FROM m4_execution').get();return r?JSON.parse(r.payload):null;};
function setup(options={}){
 const f=m4Fixture({freshBlockhash:true,feePolicy:{...M4_FEE_POLICY,computeUnitPriceMicroLamports:55602,quoteSlot:100},...options});
 const expired=new Set(),calls=[];let lastHash=null,heightOverride=null,onValidity=()=>{};
 const transport={...f.deps.transport,rpc:async(method,params)=>{
  calls.push(method);
  if(method==='getGenesisHash')return GENESIS;
  if(method==='isBlockhashValid'){lastHash=params[0];onValidity(lastHash);return {context:{slot:104},value:!expired.has(lastHash)};}
  if(method==='getBlockHeight')return heightOverride??(record(f)?.result.lastValidBlockHeight??453000000)+(expired.has(lastHash)?1:-100);
  if(method==='getMultipleAccounts')return {context:{slot:105},value:[null]};
  if(method==='getSignatureStatuses')return {context:{slot:105},value:[null]};
  if(method==='getTransaction')return null;
  throw Error('Unexpected RPC '+method);
 }};
 // Before the first durable record, obtain the exact fixture height from its
 // generated package instead of supplying an invented chain constant.
 const prepareFactory=opts=>async(...args)=>{const r=await f.deps.prepareFactory(opts)(...args);if(!record(f))heightOverride=r.lastValidBlockHeight-100;return r;};
 const deps={...f.deps,transport,prepareFactory,actionTimeEnabled:true,revalidate:async(s)=>({contextSlot:104,...await checkM4Blockhash(s.result,{transport,now:f.clock})})};
 return {...f,transport,deps,controller:createM4Execution(deps),expired,calls,setHeight:n=>heightOverride=n,onValidity:fn=>onValidity=fn};
}
const start=async(f,{claim=true}={})=>{const p=await f.controller.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID(),...(record(f)?{previousExecutionId:record(f).executionId}:{})});if(claim)await f.controller.run('wallet-claim',f.identity,f.request(p));return p;};
test('informational estimate creates no wallet attempt; aged estimate leads to fresh native package and approval beyond30s',async()=>{
 const f=setup();try{
  const info=await f.controller.run('estimate',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});assert.equal(info.status,'INFORMATIONAL_REVIEW');assert.equal(info.approvalCapability,null);assert.equal(record(f),null);
  f.advance(60000);const p=await start(f);assert.notEqual(p.result.transactionBase64,info.result.transactionBase64);assert.notEqual(p.result.mint,info.result.mint);assert.equal(p.result.executionReview.version,2);assert.equal(p.result.expiresAt,null);assert.equal(p.result.executionReview.preparedAt,f.clock());assert.equal(p.walletTransactionBase64,p.result.transactionBase64);assert.ok(Transaction.from(Buffer.from(p.walletTransactionBase64,'base64')).signatures.every(s=>s.signature===null));
  assert.equal(assertActionTimeHandoff(p.result,p.walletValidity,f.clock()),100);
  f.advance(35000);assert.doesNotThrow(()=>assertExecutionReview(p.result,f.identity,{now:f.clock()}));
  const result=await f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:f.signed()});assert.equal(result.status,'CONFIRMING');assert.equal(f.sends(),1);assert.equal(record(f).integrity.preparedMessageSha256,record(f).integrity.returnedMessageSha256);
 }finally{f.db.close();}
});
for(const reason of ['hash','height'])test('native '+reason+' expiry preserves late owner signature but never broadcasts',async()=>{
 const f=setup();try{const p=await start(f),signed=f.signed();f.advance(40000);if(reason==='hash')f.expired.add(p.result.recentBlockhash);else f.setHeight(p.result.lastValidBlockHeight+1);const result=await f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:signed});assert.equal(result.status,'SIGNED_NOT_BROADCAST');assert.equal(result.error,'M4_BLOCKHASH_EXPIRED');assert.ok(result.signature);assert.equal(result.broadcastAttempted,false);assert.equal(f.sends(),0);}finally{f.db.close();}
});
test('expiry at final transport authorization remains provably unsent with zero sends',async()=>{
 const f=setup();try{const p=await start(f);let checks=0;f.onValidity(hash=>{if(++checks===2)f.expired.add(hash);});const result=await f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:f.signed()});assert.equal(result.status,'SIGNED_NOT_BROADCAST');assert.equal(result.error,'M4_BLOCKHASH_EXPIRED');assert.equal(f.sends(),0);assert.equal(result.broadcastAttempted,false);assert.equal(result.submittedAt,null);}finally{f.db.close();}
});
test('lost preparation response can replay exact package before durable wallet claim, then claim only once',async()=>{const f=setup();try{const p=await start(f,{claim:false}),resumed=createM4Execution(f.deps),retry=await resumed.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:p.executionId});assert.equal(retry.walletTransactionBase64,p.walletTransactionBase64);assert.equal(retry.result.executionReview.digest,p.result.executionReview.digest);const claim=await resumed.run('wallet-claim',f.identity,f.request(retry));assert.equal(claim.status,'AWAITING_WALLET_APPROVAL');await assert.rejects(f.controller.run('wallet-claim',f.identity,f.request(p)),e=>e.code==='M4_APPROVAL_ALREADY_OPENED');assert.equal(f.sends(),0);}finally{f.db.close();}});
test('missing delivery claim cannot accept owner signature and ambiguous actual send cannot start another launch',async()=>{const f=setup({sendFails:true});try{const p=await start(f,{claim:false});await assert.rejects(f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:f.signed()}),e=>e.code==='M4_WALLET_DELIVERY_NOT_CLAIMED');await f.controller.run('wallet-claim',f.identity,f.request(p));const result=await f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:f.signed()});assert.equal(result.status,'CONFIRMATION_UNKNOWN');assert.equal(f.sends(),1);f.expired.add(p.result.recentBlockhash);f.setHeight(p.result.lastValidBlockHeight+1);await assert.rejects(start(f));assert.equal(f.sends(),1);}finally{f.db.close();}});
test('request replay/restart cannot expose wallet bytes again or open a second attempt while first hash is live',async()=>{
 const f=setup();try{const p=await start(f),resumed=createM4Execution(f.deps),again=await resumed.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:p.executionId});assert.equal(again.executionId,p.executionId);assert.equal(again.walletTransactionBase64,undefined);await assert.rejects(start(f),e=>e.code==='M4_RECOVERY_BLOCKHASH_STILL_VALID');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM m4_execution_history').get().n,0);}finally{f.db.close();}
});
test('explicit retry waits for old hash death, archives exact evidence, and rejects a delayed old owner response',async()=>{
 const f=setup();try{const p=await start(f),oldSigned=f.signed();await f.controller.run('reject',f.identity,{requestId:p.executionId});const old=record(f);await assert.rejects(start(f),e=>e.code==='M4_RECOVERY_BLOCKHASH_STILL_VALID');f.expired.add(p.result.recentBlockhash);f.setHeight(p.result.lastValidBlockHeight+1);
  // The fresh fixture gets a subsequent last-valid height by changing its clock-
  // independent RPC observation only after the old mint-absence proof completes.
  const rpc=f.transport.rpc;f.transport.rpc=async(m,args)=>{const r=await rpc(m,args);if(m==='getMultipleAccounts')f.setHeight(p.result.lastValidBlockHeight-100);return r;};
  const fresh=await start(f);assert.notEqual(fresh.executionId,p.executionId);assert.notEqual(fresh.result.mint,p.result.mint);assert.notEqual(fresh.result.recentBlockhash,p.result.recentBlockhash);assert.deepEqual(JSON.parse(f.db.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(p.executionId).payload),old);await assert.rejects(f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:oldSigned}),e=>e.code==='M4_EXECUTION_MISMATCH');assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('two independent controllers can return only one final wallet package',async()=>{
 const f=setup();try{const a=createM4Execution(f.deps),b=createM4Execution(f.deps),body=()=>({initialBuy:'0',requestId:crypto.randomUUID()}),out=await Promise.allSettled([a.run('wallet-prepare',f.identity,body()),b.run('wallet-prepare',f.identity,body())]);assert.equal(out.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM m4_execution').get().n,1);assert.equal(f.sends(),0);}finally{f.db.close();}
});

test('crash at durable SIGNED boundary recovers only with native expiry and absence proof',async()=>{
 const f=setup();try{const p=await start(f),s=record(f),signed=completeM4OwnerApproval(f.signed(),s);Object.assign(s,{status:'SIGNED',signature:signed.signature,signedDigest:signed.signedDigest,signedTransactionBase64:signed.completeBase64,signedAt:f.clock()});f.db.prepare('UPDATE m4_execution SET payload=?').run(JSON.stringify(s));
  const resumed=createM4Execution(f.deps),body={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:s.executionId};await assert.rejects(resumed.run('wallet-prepare',f.identity,body),e=>e.code==='M4_RECOVERY_BLOCKHASH_STILL_VALID');
  f.expired.add(p.result.recentBlockhash);f.setHeight(p.result.lastValidBlockHeight+1);const rpc=f.transport.rpc;f.transport.rpc=async(m,args)=>{const result=await rpc(m,args);if(m==='getMultipleAccounts')f.setHeight(p.result.lastValidBlockHeight-100);return result;};
  const fresh=await resumed.run('wallet-prepare',f.identity,body);assert.equal(fresh.status,'AWAITING_WALLET_APPROVAL');assert.equal(f.sends(),0);assert.ok(f.calls.includes('getSignatureStatuses'));assert.ok(f.calls.includes('getTransaction'));assert.deepEqual(JSON.parse(f.db.prepare('SELECT payload FROM m4_execution_history').get().payload),s);
 }finally{f.db.close();}
});
test('final package mutation is rejected and handoff needs fresh authoritative block observation',async()=>{
 const f=setup();try{const p=await start(f);for(const mutate of [r=>r.recentBlockhash=Keypair.generate().publicKey.toBase58(),r=>r.executionReview.lastValidBlockHeight++,r=>r.executionReview.messageSha256='0'.repeat(64),r=>r.executionReview.priorityFeeLamports++]){const r=structuredClone(p.result);mutate(r);assert.throws(()=>assertExecutionReview(r,f.identity,{now:f.clock()}));}
  for(const validity of [{...p.walletValidity,remainingBlocks:49},{...p.walletValidity,checkedAt:f.clock()-10001},{...p.walletValidity,reviewDigest:'different'}])assert.throws(()=>assertActionTimeHandoff(p.result,validity,f.clock()));
  const tx=Transaction.from(Buffer.from(p.result.transactionBase64,'base64'));tx.recentBlockhash=Keypair.generate().publicKey.toBase58();tx.partialSign(f.owner);await assert.rejects(f.controller.run('submit',f.identity,{...f.request(p),signedTransactionBase64:tx.serialize({requireAllSignatures:false}).toString('base64')}));assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('action-time endpoints remain unavailable without explicit capability',async()=>{const f=m4Fixture();try{await assert.rejects(f.controller.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()}),e=>e.code==='M4_ACTION_TIME_DISABLED');assert.equal(record(f),null);}finally{f.db.close();}});
