import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Transaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {M4_FEE_POLICY,selectFeePolicy,priorityLamports,feeComponents,COMPUTE_BUDGET} from '../src/pump-fee-policy.js';
import {inspectCreation,GENESIS} from '../src/pump-readiness.js';
import {completeM4OwnerApproval} from '../server/pump-m4-guard.js';
import {assertExecutionReview} from '../server/pump-execution-review.js';
import {createM4Execution} from '../server/pump-m4.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
// LOCAL_FIXTURE: synthetic keys, disposable DB, no real RPC/wallet/broadcast.
const feePolicy={...M4_FEE_POLICY,computeUnitPriceMicroLamports:125001,quoteSlot:100};
const record=f=>JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);
const ready=f=>f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});
const review=async f=>{const r=await ready(f);return f.controller.run('review',f.identity,f.request(r));};

test('current quote selects bounded fresh p75, checked ceiling arithmetic; no old popup value',()=>{
 const p=selectFeePolicy([0,10000,50000,125001].map((prioritizationFee,i)=>({slot:100+i,prioritizationFee})),100);
 assert.equal(p.computeUnitPriceMicroLamports,50000);assert.equal(p.quoteSlot,103);
 assert.equal(priorityLamports(200000,125001),25001);
 assert.deepEqual(feeComponents({feePolicy:p,priorityFeeLamports:10000},20000),{networkFeeLamports:20000,baseFeeLamports:10000,priorityFeeLamports:10000});
 for(const samples of [[],[{slot:99,prioritizationFee:0}],[{slot:100,prioritizationFee:500001}],[{slot:100,prioritizationFee:-1}],[{slot:100,prioritizationFee:0},{slot:100,prioritizationFee:0}]])assert.throws(()=>selectFeePolicy(samples,100));
 assert.throws(()=>priorityLamports(1400000,Number.MAX_SAFE_INTEGER));
 assert.throws(()=>feeComponents({feePolicy:p,priorityFeeLamports:10000},20001),/M4_RPC_FEE_COMPONENT_MISMATCH/);
});
test('explicit fee is simulated and reviewed before mint signing; complete coverage includes readonly CB',async()=>{
 const f=m4Fixture({feePolicy});try{const s=await ready(f),r=s.result,tx=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
  assert.equal(r.instructionCount,3);assert.equal(r.structure.requiredSigners,2);assert.equal(r.structure.accounts.length,17);assert.equal(r.structure.accounts[5].name,'user');assert.equal(r.structure.accounts[14].name,'event_authority');assert.equal(r.structure.accounts[16].address,COMPUTE_BUDGET);
  assert.equal(tx.instructions[0].data.readUInt32LE(1),200000);assert.equal(tx.instructions[1].data.readBigUInt64LE(1),125001n);
  assert.equal(r.executionReview.baseFeeLamports,10000);assert.equal(r.executionReview.priorityFeeLamports,25001);assert.equal(r.executionReview.networkFeeLamports,35001);
  assert.equal(r.executionReview.networkFeeLamports+r.executionReview.otherRequiredDebitLamports,r.executionReview.reviewedDebitLamports);
  assert.equal(r.executionReview.atomicBalanceEvidence.accounts.at(-1).deltaLamports,0);assert.equal(r.executionReview.atomicBalanceEvidence.accounts.length,17);
  assert.equal(assertExecutionReview(r,f.identity,{now:f.clock()}).ceilingLamports,10000000);assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('exact fee message owner-first merge proceeds under ceiling once; separate prepared/returned/final hashes',async()=>{
 const f=m4Fixture({feePolicy});try{const s=await review(f),signed=f.signed(),merged=completeM4OwnerApproval(signed,record(f));
  assert.equal(merged.integrity.allowedWalletMutation,'SIGNATURES_ONLY');assert.equal(merged.integrity.preparedMessageSha256,merged.integrity.deliveredMessageSha256);assert.equal(merged.integrity.returnedMessageSha256,merged.integrity.preparedMessageSha256);assert.notEqual(merged.integrity.returnedOwnerPayloadSha256,merged.integrity.finalSignedPayloadSha256);
  await f.controller.run('submit',f.identity,{...f.request(s),signedTransactionBase64:signed});assert.equal(f.sends(),1);
  const restarted=createM4Execution(f.deps);await assert.rejects(restarted.run('submit',f.identity,{...f.request(s),signedTransactionBase64:signed}));assert.equal(f.sends(),1);assert.equal(record(f).integrity.finalSignedPayloadSha256,merged.signedDigest);
  assert.deepEqual(JSON.parse(readFileSync(f.journalPath)).receipts,{});assert.equal(record(f).provisioning,undefined);
 }finally{f.db.close();}
});
test('wallet managed priority injection is safely refused; no retained mint key and no broadcast',async()=>{
 const f=m4Fixture();try{const s=await review(f),tx=Transaction.from(Buffer.from(s.result.transactionBase64,'base64'));tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:400000}));tx.partialSign(f.owner);
  await assert.rejects(f.controller.run('submit',f.identity,{...f.request(s),signedTransactionBase64:tx.serialize({requireAllSignatures:false}).toString('base64')}),/M4_OWNER_APPROVAL_INVALID/);assert.equal(f.sends(),0);assert.equal(record(f).signature,undefined);
 }finally{f.db.close();}
});
test('changed fee/limit, duplicated CB, unknown opcode and non-fee changes reject before signing merge/send',async()=>{
 for(const kind of ['price','limit','duplicate','opcode','pump','privilege','transfer']){const f=m4Fixture({feePolicy});try{const s=await review(f),tx=Transaction.from(Buffer.from(s.result.transactionBase64,'base64'));
  if(kind==='price')tx.instructions[1]=ComputeBudgetProgram.setComputeUnitPrice({microLamports:125002});
  if(kind==='limit')tx.instructions[0]=ComputeBudgetProgram.setComputeUnitLimit({units:200001});
  if(kind==='duplicate')tx.instructions.unshift(tx.instructions[0]);
  if(kind==='opcode')tx.instructions[0]=ComputeBudgetProgram.requestHeapFrame({bytes:32768});
  if(kind==='pump')tx.instructions[2].data[10]^=1;
  if(kind==='privilege')tx.instructions[2].keys[1].isWritable=true;
  if(kind==='transfer')tx.add(SystemProgram.transfer({fromPubkey:f.owner.publicKey,toPubkey:tx.instructions[2].keys[0].pubkey,lamports:1}));
  tx.partialSign(f.owner);await assert.rejects(f.controller.run('submit',f.identity,{...f.request(s),signedTransactionBase64:tx.serialize({requireAllSignatures:false}).toString('base64')}));assert.equal(f.sends(),0);
 }finally{f.db.close();}}
});
test('valid priority cannot authorize aggregate above ceiling or an expired owner response',async()=>{
 const over=m4Fixture({feePolicy,extraNonFeeDebit:5000000});try{await assert.rejects(ready(over),/EXECUTION_SIMULATION_REJECTED/);assert.equal(over.sends(),0);assert.deepEqual(JSON.parse(readFileSync(over.journalPath)).receipts,{});}finally{over.db.close();}
 const f=m4Fixture({feePolicy});try{const s=await review(f),changed=structuredClone(s.result);changed.executionReview.reviewedDebitLamports=10000001;assert.throws(()=>assertExecutionReview(changed,f.identity,{now:f.clock()}));
  f.advance(30000);const result=await f.controller.run('submit',f.identity,{...f.request(s),signedTransactionBase64:f.signed()});assert.equal(result.status,'SIGNED_NOT_BROADCAST');assert.equal(result.error,'EXECUTION_REVIEW_EXPIRED');assert.equal(f.sends(),0);await assert.rejects(ready(f));assert.deepEqual(JSON.parse(readFileSync(f.journalPath)).receipts,{});
 }finally{f.db.close();}
});
