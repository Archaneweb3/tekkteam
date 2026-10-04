import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {PublicKey,Transaction} from '@solana/web3.js';
import {buildCreation,inspectCreation,PAYER,GENESIS,PUMP} from '../src/pump-readiness.js';
import {createExecutionReview,assertExecutionReview,assertReviewedExecutionRequest,contextSlot,EXECUTION_POLICY,revalidateExecutionReview} from '../server/pump-execution-review.js';
import {createPreparationEvidenceWriter} from '../server/preparation-evidence.js';
import {createPumpLaunchPreparation} from '../server/pump-launch-preparation.js';
import {createHash} from 'node:crypto';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {fixtureAtomicBalances} from './pump-atomic-fixture.mjs';
const sample=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url)));
const identity={agentId:'FIXTURE_M31',agentName:'Fixture',name:'Fixture',symbol:'FIX',description:'',image:'https://fixture.example/image.png',character:'frank',owner:PAYER,tokenDraftRevision:1,tokenDescriptionPresent:true};
function fixture(){
 const launch={...identity,metadataUri:'https://fixture.example/'+'a'.repeat(43),initialBuyLamports:0},mint=new PublicKey(sample.mint),tx=buildCreation(mint,sample.recentBlockhash,launch),bytes=tx.serialize({requireAllSignatures:false,verifySignatures:false}),startedAt=100000;
 const result={mode:'M3_UNSIGNED_PREPARATION',id:crypto.randomUUID(),createdAt:new Date(startedAt).toISOString(),expiresAt:startedAt+30000,network:'solana:101',genesis:GENESIS,programId:PUMP,launch,metadataUri:launch.metadataUri,feePayer:PAYER,recentBlockhash:sample.recentBlockhash,lastValidBlockHeight:sample.lastValidBlockHeight,mint:mint.toBase58(),transactionBase64:bytes.toString('base64'),transactionSha256:createHash('sha256').update(bytes).digest('hex'),transactionSize:bytes.length,structure:inspectCreation(bytes,{mint,blockhash:sample.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch}),signingEnabled:false,broadcastEnabled:false,absoluteDebitBoundVerified:false,simulation:{status:'PASS',slot:102},policy:{allowed:true,initialBuyLamports:0,baseFeeLamports:10000,validatedOverheadLamports:5511640,estimatedPayerDebitLamports:5511640,minimumRentExemptionLamports:5547360,rentAccounts:[{name:'mint',minimumRentExemptionLamports:5547360,fundedLamports:5547360}],accountEffects:[{name:'user',writable:true,deltaLamports:-5511640},{name:'mint',writable:true,deltaLamports:5547360}]}};
 const raw=JSON.parse(JSON.stringify(sample),(k,v)=>k==='data'&&v&&typeof v.sha256==='string'?[Buffer.alloc(v.length).toString('base64'),'base64']:v);
 raw.before.context.slot=101;raw.afterRead.context.slot=103;raw.simulation.context.slot=102;
 const debit=raw.before.value[5].lamports-raw.simulation.value.accounts[5].lamports;
 raw.before.value[5].lamports=182999717;raw.afterRead.value[5].lamports=182999717;raw.simulation.value.accounts[5].lamports=182999717-debit;
 fixtureAtomicBalances(bytes,result.structure,raw.before,raw.simulation);
 const decoded=evaluateSimulation(bytes,{mint,blockhash:sample.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch},{before:raw.before,afterRead:raw.afterRead,simulation:raw.simulation,fee:10000});
 result.policy={allowed:decoded.allowed,initialBuyLamports:0,baseFeeLamports:10000,validatedOverheadLamports:decoded.validatedOverheadLamports,estimatedPayerDebitLamports:decoded.estimatedPayerDebitLamports,accountEffects:decoded.accountEffects.map(a=>({name:a.name,writable:a.writable,deltaLamports:a.deltaLamports})),minimumRentExemptionLamports:sample.rent.filter(a=>a.fundedLamports>0).reduce((n,a)=>n+a.minimumRentExemptionLamports,0),rentAccounts:structuredClone(sample.rent.filter(a=>a.fundedLamports>0))};
 const inputs={startedAt,now:startedAt+1000,latestResponse:{context:{slot:100},value:{blockhash:sample.recentBlockhash,lastValidBlockHeight:sample.lastValidBlockHeight}},feeResponse:{context:{slot:100},value:10000},before:raw.before,simulation:raw.simulation,afterRead:raw.afterRead,validity:{context:{slot:103},value:true}};
 return {result,inputs};
}
function bound(){const f=fixture();f.result.executionReview=createExecutionReview(f.result,f.inputs);return f;}
function rejects(change,code){const f=fixture();change(f);assert.throws(()=>createExecutionReview(f.result,f.inputs),e=>e.code===code);}
test('fresh review binds total budget/reserve/contexts and exact unsigned owner request without authority',()=>{
 const {result,inputs}=bound(),r=assertExecutionReview(result,identity,{now:inputs.now});assert.equal(r.guaranteeClass,'EXECUTION_GUARDED');assert.equal(r.ceilingLamports,10000000);assert.equal(r.minimumReserveLamports,1000000);assert.equal(r.requiredRemainingBalanceLamports,172999717);assert.equal(r.expectedRemainingBalanceLamports,177488077);assert.equal(r.absoluteOnchainMaximumLamports,null);
 assert.equal(assertReviewedExecutionRequest(result,identity,{now:inputs.now,requestId:result.id,reviewDigest:r.digest,transactionBase64:result.transactionBase64}).authorizationGranted,false);assert.ok(Transaction.from(Buffer.from(result.transactionBase64,'base64')).signatures.every(s=>s.signature===null));
});

test('atomic model tolerates external shared-vault drift but rejects real atomic debit and incomplete/mismatched evidence',()=>{
 const f=fixture(),vault=11,atomic=f.inputs.simulation.value,idx=Transaction.from(Buffer.from(f.result.transactionBase64,'base64')).compileMessage().accountKeys.findIndex(k=>k.toBase58()===f.result.structure.accounts[vault].address);
 f.inputs.before.value[vault].lamports+=1560979799;
 const review=createExecutionReview(f.result,f.inputs);assert.equal(review.atomicBalanceEvidence.accounts.find(a=>a.name==='sol_vault').deltaLamports,0);assert.equal(review.reviewedDebitLamports,5511640);
 atomic.postBalances[idx]--;atomic.accounts[vault].lamports--;
 assert.throws(()=>createExecutionReview(f.result,f.inputs),e=>e.code==='EXECUTION_UNEXPECTED_ACCOUNT_DEBIT');
 for(const mutate of [x=>delete x.preBalances,x=>x.preBalances.pop(),x=>x.preBalances[0]=NaN,x=>x.fee++,x=>x.loadedAddresses.writable.push(PAYER)]){const next=fixture();mutate(next.inputs.simulation.value);assert.throws(()=>createExecutionReview(next.result,next.inputs),e=>e.code==='EXECUTION_ATOMIC_BALANCES_UNPROVEN');}
 const next=fixture();next.inputs.simulation.value.postBalances[1]++;assert.throws(()=>createExecutionReview(next.result,next.inputs),e=>e.code==='EXECUTION_ATOMIC_BALANCES_MISMATCH');
 const mutated=bound();mutated.result.executionReview.atomicBalanceEvidence.accounts[0].preLamports++;assert.throws(()=>assertExecutionReview(mutated.result,identity,{now:mutated.inputs.now}),e=>e.code==='EXECUTION_REVIEW_MUTATED');
 const role=bound();role.result.structure.accounts[11].name='user';assert.throws(()=>assertExecutionReview(role.result,identity,{now:role.inputs.now}),e=>e.code==='EXECUTION_STRUCTURE_CHANGED');assert.throws(()=>createExecutionReview(role.result,role.inputs),e=>e.code==='EXECUTION_STRUCTURE_CHANGED');
});
test('fee/rent changes and unexpected payer/nonpayer debit fail closed',()=>{
 rejects(f=>{f.inputs.feeResponse.value++;},'EXECUTION_SIMULATION_REJECTED');
 rejects(f=>{f.result.policy.baseFeeLamports=5000000;f.inputs.feeResponse.value=5000000;f.result.policy.validatedOverheadLamports=11000000;f.result.policy.estimatedPayerDebitLamports=11000000;f.inputs.simulation.value.accounts[5].lamports=f.inputs.before.value[5].lamports-11000000;},'EXECUTION_SIMULATION_REJECTED');
 rejects(f=>{f.result.policy.rentAccounts[0].minimumRentExemptionLamports++;},'EXECUTION_RENT_UNPROVEN');
 rejects(f=>{f.inputs.simulation.value.accounts[5].lamports--;},'EXECUTION_SIMULATION_REJECTED');
 rejects(f=>{const a=f.inputs.simulation.value.accounts[11];a.lamports--;const index=Transaction.from(Buffer.from(f.result.transactionBase64,'base64')).compileMessage().accountKeys.findIndex(k=>k.toBase58()===f.result.structure.accounts[11].address);f.inputs.simulation.value.postBalances[index]--;f.result.policy=evaluateSimulation(Buffer.from(f.result.transactionBase64,'base64'),{mint:new PublicKey(f.result.mint),blockhash:f.result.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch:f.result.launch},{before:f.inputs.before,afterRead:f.inputs.afterRead,simulation:f.inputs.simulation,fee:10000});f.result.policy.minimumRentExemptionLamports=5501640;f.result.policy.rentAccounts=structuredClone(sample.rent.filter(a=>a.fundedLamports>0));},'EXECUTION_UNEXPECTED_ACCOUNT_DEBIT');
 rejects(f=>{f.inputs.afterRead.value[5].lamports++;},'EXECUTION_PAYER_CONTEXT_CHANGED');
});
test('balance floor retains Mainnet reserve and includes full ceiling rather than estimate',()=>{
 rejects(f=>{f.inputs.before.value[5].lamports=10999999;f.inputs.afterRead.value[5].lamports=10999999;f.inputs.simulation.value.accounts[5].lamports=10999999-5511640;fixtureAtomicBalances(Buffer.from(f.result.transactionBase64,'base64'),f.result.structure,f.inputs.before,f.inputs.simulation);},'EXECUTION_BALANCE_FLOOR_VIOLATION');
 assert.equal(EXECUTION_POLICY.minimumReserveLamports,1000000);
});
test('slow RPC, expiry, stale/invalid contexts and invalid blockhash are rejected',()=>{
 rejects(f=>{f.inputs.now+=30000;},'EXECUTION_REVIEW_EXPIRED');
 rejects(f=>{f.inputs.validity.value=false;},'EXECUTION_BLOCKHASH_EXPIRED');
 for(const value of [null,-1,NaN,Number.MAX_SAFE_INTEGER+1,100])rejects(f=>{f.inputs.simulation.context.slot=value;},'EXECUTION_CONTEXT_STALE');
 rejects(f=>{f.inputs.afterRead.context.slot=101;},'EXECUTION_CONTEXT_STALE');
 assert.throws(()=>contextSlot({context:{slot:1}},2));const f=bound();assert.throws(()=>assertExecutionReview(f.result,identity,{now:f.inputs.startedAt+30000}),e=>e.code==='EXECUTION_REVIEW_EXPIRED');
});
test('every material byte/metadata/identity/cost/context mutation invalidates accepted digest',()=>{
 const changes=[r=>r.transactionBase64=r.transactionBase64.slice(0,-4)+'AAAA',r=>r.launch.owner='11111111111111111111111111111111',r=>r.launch.agentId='CHANGED',r=>r.launch.tokenDraftRevision=2,r=>r.launch.initialBuyLamports=1,r=>r.mint=PAYER,r=>r.metadataUri+='x',r=>r.launch.metadataUri+='x',r=>r.policy.baseFeeLamports++,r=>r.executionReview.observedBalanceLamports++,r=>r.executionReview.simulationSlot++,r=>r.executionReview.ceilingLamports++,r=>r.network='solana:103'];
 for(const change of changes){const f=bound();change(f.result);assert.throws(()=>assertExecutionReview(f.result,identity,{now:f.inputs.now}));}
 const f=bound();for(const patch of [{requestId:crypto.randomUUID()},{reviewDigest:'a'.repeat(64)},{transactionBase64:f.result.transactionBase64+'AA'}])assert.throws(()=>assertReviewedExecutionRequest(f.result,identity,{now:f.inputs.now,requestId:f.result.id,reviewDigest:f.result.executionReview.digest,transactionBase64:f.result.transactionBase64,...patch}),e=>e.code==='EXECUTION_REQUEST_CHANGED_REPREPARE');
 const tx=Transaction.from(Buffer.from(f.result.transactionBase64,'base64'));tx.instructions[0].keys[2].isWritable=false;f.result.transactionBase64=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');assert.throws(()=>assertExecutionReview(f.result,identity,{now:f.inputs.now}));
});
test('durable review survives restart but corrupted digest and old requests are never upgraded',async()=>{
 const f=bound(),root=mkdtempSync(join(tmpdir(),'tekkteam-m31-')),writer=createPreparationEvidenceWriter(root,{now:()=>f.inputs.now});await writer(f.result);
 assert.deepEqual(createPreparationEvidenceWriter(root,{now:()=>f.inputs.now}).read(identity,0,f.result.id),f.result);
 const path=join(root,'preparation-evidence',readdirSync(join(root,'preparation-evidence'))[0]),record=JSON.parse(readFileSync(path));record.result.executionReview.digest='a'.repeat(64);writeFileSync(path,JSON.stringify(record));assert.throws(()=>writer.read(identity,0,f.result.id),e=>e.code==='EXECUTION_REVIEW_MUTATED');
 const historical=structuredClone(f.result);delete historical.executionReview;
 const prepare=createPumpLaunchPreparation({transport:{rpc:async()=>assert.fail('RPC must not run'),publicRequest:async()=>{}},publishMetadata:async()=>{},readPreparation:async()=>historical,executionReview:true,now:()=>f.inputs.now});await assert.rejects(prepare(identity,'0',historical.id),e=>e.code==='EXECUTION_REVIEW_INVALID');await assert.rejects(prepare(identity,'0.001',crypto.randomUUID()),e=>e.code==='EXECUTION_ZERO_BUY_REQUIRED');
});
function freshTransport(f,{feeChange=false,rentChange=false,stale=false,wrongGenesis=false,blockhashChange=false,onFinish=()=>{}}={}){
 const calls=[];return {calls,rpc:async(method,params)=>{
 calls.push(method);if(method==='getGenesisHash')return wrongGenesis?'WRONG':GENESIS;
 if(method==='getLatestBlockhash')return {context:{slot:104},value:{blockhash:blockhashChange?PAYER:f.result.recentBlockhash,lastValidBlockHeight:f.result.lastValidBlockHeight}};
 if(method==='getFeeForMessage')return {context:{slot:104},value:feeChange?10001:10000};
 if(method==='getMultipleAccounts'){const x=structuredClone(calls.filter(m=>m==='getMultipleAccounts').length===1?f.inputs.before:f.inputs.afterRead);x.context.slot=calls.filter(m=>m==='getMultipleAccounts').length===1?105:107;return x;}
 if(method==='simulateTransaction'){assert.equal(params[0],f.result.transactionBase64);assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);const x=structuredClone(f.inputs.simulation);x.context.slot=stale?100:106;return x;}
 if(method==='getMinimumBalanceForRentExemption')return f.result.policy.rentAccounts.find(a=>a.dataLength===params[0]).minimumRentExemptionLamports+(rentChange?1:0);
 if(method==='isBlockhashValid'){onFinish();return {context:{slot:107},value:true};}
 assert.fail('Forbidden RPC '+method);
 }};
}
test('immediate wallet-review boundary requires fresh same-byte simulation and rejects changed costs/context',async()=>{
 for(const [options,code]of [[{feeChange:true},'EXECUTION_COST_CHANGED_REPREPARE'],[{rentChange:true},'EXECUTION_RENT_CHANGED_REPREPARE'],[{stale:true},'EXECUTION_CONTEXT_STALE'],[{wrongGenesis:true},'EXECUTION_WRONG_MAINNET'],[{blockhashChange:true},'EXECUTION_BLOCKHASH_CONTEXT_CHANGED']]){
 const f=bound(),request={requestId:f.result.id,reviewDigest:f.result.executionReview.digest,transactionBase64:f.result.transactionBase64};await assert.rejects(revalidateExecutionReview(f.result,identity,request,{transport:freshTransport(f,options),now:()=>f.inputs.now}),e=>e.code===code);
 }
 const f=bound(),t=freshTransport(f),request={requestId:f.result.id,reviewDigest:f.result.executionReview.digest,transactionBase64:f.result.transactionBase64};const checked=await revalidateExecutionReview(f.result,identity,request,{transport:t,now:()=>f.inputs.now});assert.equal(checked.authorizationGranted,false);assert.equal(checked.freshSimulationSlot,106);assert.ok(t.calls.includes('simulateTransaction'));assert.ok(t.calls.includes('isBlockhashValid'));assert.ok(t.calls.every(m=>!m.includes('send')&&!m.includes('sign')));
});
test('accepted review expiring during fresh RPC cannot be renewed silently',async()=>{
 const f=bound();let clock=f.inputs.startedAt+29000;const request={requestId:f.result.id,reviewDigest:f.result.executionReview.digest,transactionBase64:f.result.transactionBase64};await assert.rejects(revalidateExecutionReview(f.result,identity,request,{transport:freshTransport(f,{onFinish:()=>{clock+=2000;}}),now:()=>clock}),e=>e.code==='EXECUTION_REVIEW_EXPIRED');
});
