import test from 'node:test';import assert from 'node:assert/strict';
import {Transaction,TransactionInstruction,PublicKey,Keypair,SystemProgram} from '@solana/web3.js';
import {createM4Execution} from '../server/pump-m4.js';
import {FINAL_MESSAGE_POLICY,LIGHTHOUSE_PROGRAM,validateFinalWalletMessage} from '../src/pump-wallet-final.js';
import {GENESIS} from '../src/pump-readiness.js';import {M4_FEE_POLICY} from '../src/pump-fee-policy.js';
import {m4Fixture} from './pump-m4-fixture.mjs';import {sha,verifyM4Signed} from '../server/pump-m4-guard.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';import {inspectFinalCreation} from '../src/pump-final-structure.js';
import {atomicExecutionEffects} from '../server/pump-atomic-effects.js';import {fixtureAtomicBalances} from './pump-atomic-fixture.mjs';
import {revalidateM4} from '../server/pump-m4-guard.js';import {confirmM4} from '../server/pump-m4-confirmation.js';
import {finalOracleAccounts} from './pump-lighthouse-oracle-fixture.mjs';import {tokenMetadata} from '../src/agent-launch-data.js';import {executionReviewBinding} from '../src/pump-execution-binding.js';
import bs58 from 'bs58';
// Synthetic owners, disposable encrypted store, controlled RPC stubs; no real send.
const record=f=>JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);
const remainingKeys=f=>f.db.prepare('SELECT count(*) n FROM m4_ephemeral_mint_signers').get().n;
const sdk={Transaction,Buffer};
function append(tx,owner){return tx.add(new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:owner,isSigner:true,isWritable:true}],data:Buffer.from('BgQDAMtDPAoAAAAABAMAAAEAAAAAAAAAAAA=','base64')}));}
async function setup(){
 const f=m4Fixture({useVault:true,freshBlockhash:true,feePolicy:{...M4_FEE_POLICY,computeUnitPriceMicroLamports:10000,quoteSlot:100}});
 let r,expired=false,simulationFails=false,proofMissing=false;
 const transport={...f.deps.transport,rpc:async(m,p)=>{if(m==='getGenesisHash')return GENESIS;if(m==='isBlockhashValid')return {context:{slot:104},value:!expired};if(m==='getBlockHeight')return r.lastValidBlockHeight+(expired?1:-100);if(m==='getMultipleAccounts')return {context:{slot:105},value:[null]};if(m==='getSignatureStatuses')return {context:{slot:105},value:[null]};if(m==='getTransaction')return null;throw Error('Unexpected RPC '+m);}};
 const prepareFactory=opts=>async(...args)=>{r=await f.deps.prepareFactory(opts)(...args);return r;};
 const revalidate=async s=>{if(simulationFails)throw Object.assign(Error('Final simulation failed'),{code:'FINAL_SIMULATION_FAILED'});const final=verifyM4Signed(s.signedTransactionBase64,s,true);return proofMissing?{}:{contextSlot:104,finalMessageProof:{messageSha256:sha(final.tx.serializeMessage()),signedPayloadSha256:final.signedDigest,simulationStatus:'PASS',signatureVerification:true}};};
 const deps={...f.deps,transport,prepareFactory,revalidate,actionTimeEnabled:true,lighthouseEnabled:true,signerStore:f.store},controller=createM4Execution(deps);
 const p=await controller.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});await controller.run('wallet-claim',f.identity,f.request(p));
 const signed=(mutation,add=true)=>{const tx=Transaction.from(Buffer.from(p.walletTransactionBase64,'base64'));if(add)append(tx,f.owner.publicKey);mutation?.(tx);tx.partialSign(f.owner);return tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64');};
 return {...f,deps,controller,p,signed,expire:()=>expired=true,live:()=>expired=false,failSimulation:()=>simulationFails=true,omitProof:()=>proofMissing=true};
}
test('limited assertion retains intent; encrypted mint signs final bytes once and key never enters public/history',async()=>{
 const f=await setup();try{
  assert.equal(f.p.walletMessagePolicy,FINAL_MESSAGE_POLICY);assert.equal(remainingKeys(f),1);
  const cipher=f.db.prepare('SELECT ciphertext FROM m4_ephemeral_mint_signers').get().ciphertext;
  assert.equal(JSON.stringify(f.p).includes(cipher),false);assert.equal(JSON.stringify(record(f)).includes(cipher),false);
  const ownerOnly=f.signed(),final=validateFinalWalletMessage(f.p.result.transactionBase64,ownerOnly,f.p.result,sdk);
  assert.equal(final.allowedDiff,'PHANTOM_LIGHTHOUSE_ADDED');assert.equal(final.assertion.minBalanceLamports,171721675);
  const out=await f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:ownerOnly});
  assert.equal(out.status,'CONFIRMING');assert.equal(f.sends(),1);assert.equal(remainingKeys(f),0);
  const s=record(f);assert.equal(verifyM4Signed(s.signedTransactionBase64,s,true).tx.verifySignatures(true),true);
  assert.notEqual(s.integrity.preparedIntentFingerprint,s.integrity.walletFinalMessageFingerprint);
  assert.equal(s.finalMessageProof.messageSha256,s.integrity.walletFinalMessageFingerprint);
  const resumed=createM4Execution(f.deps);await assert.rejects(resumed.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:ownerOnly}),{code:'M4_SUBMISSION_ALREADY_CONSUMED'});assert.equal(f.sends(),1);
 }finally{f.db.close();}
});
test('new policy also handles exact unchanged owner message without invented Lighthouse',async()=>{const f=await setup();try{const out=await f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed(null,false)});assert.equal(out.status,'CONFIRMING');assert.equal(out.integrity.allowedMessageDiff,'SIGNATURES_ONLY');assert.equal(out.integrity.preparedIntentFingerprint,out.integrity.walletFinalMessageFingerprint);}finally{f.db.close();}});
const mutations={
 'Pump data':tx=>tx.instructions[2].data[20]^=1,
 'priority price':tx=>tx.instructions[1].data[1]^=1,
 'blockhash':tx=>tx.recentBlockhash=Keypair.generate().publicKey.toBase58(),
 'extra transfer':tx=>tx.add(SystemProgram.transfer({fromPubkey:tx.feePayer,toPubkey:Keypair.generate().publicKey,lamports:1})),
 'extra signer':tx=>tx.instructions[2].keys[2].isSigner=true,
 'writable Lighthouse':tx=>tx.instructions.at(-1).keys.push({pubkey:new PublicKey(LIGHTHOUSE_PROGRAM),isSigner:false,isWritable:true}),
 'different target':tx=>tx.instructions.at(-1).keys[0].pubkey=tx.signatures[1].publicKey,
 'duplicate assertion':tx=>tx.add(tx.instructions.at(-1)),
 'unknown variant':tx=>tx.instructions.at(-1).data[0]=1,
 'different log level':tx=>tx.instructions.at(-1).data[1]=0,
 'different operator':tx=>tx.instructions.at(-1).data[12]=0,
 'trailing bytes':tx=>tx.instructions.at(-1).data=Buffer.concat([tx.instructions.at(-1).data,Buffer.from([0])]),
 'vacuous floor':tx=>tx.instructions.at(-1).data.writeBigUInt64LE(0n,4),
 'impossible floor':tx=>tx.instructions.at(-1).data.writeBigUInt64LE(2n**64n-1n,4),
 'wrong System owner':tx=>tx.instructions.at(-1).data[14]=1,
 'nonzero data length':tx=>tx.instructions.at(-1).data[17]=1
};
for(const[name,mutate]of Object.entries(mutations))test('reject '+name+' before mint signing or submission',async()=>{const f=await setup();try{const before=record(f);await assert.rejects(f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed(mutate)}));assert.deepEqual(record(f),before);assert.equal(f.sends(),0);assert.equal(remainingKeys(f),1);}finally{f.db.close();}});
for(const failure of ['simulation','proof','expired','cipher'])test('final '+failure+' failure consumes safely and cannot send',async()=>{const f=await setup();try{
 if(failure==='simulation')f.failSimulation();if(failure==='proof')f.omitProof();if(failure==='expired')f.expire();if(failure==='cipher')f.db.prepare("UPDATE m4_ephemeral_mint_signers SET binding='wrong'").run();
 const result=await f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed()});
 assert.ok(['SIGNED_NOT_BROADCAST','OWNER_APPROVED_NOT_BROADCAST'].includes(result.status));assert.equal(result.broadcastAttempted,false);assert.equal(f.sends(),0);assert.equal(remainingKeys(f),0);assert.ok(result.signature);
 await assert.rejects(f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed()}),{code:'M4_SUBMISSION_ALREADY_CONSUMED'});
 }finally{f.db.close();}});
test('owner rejection and native expiry logically remove retained encrypted signer',async()=>{for(const reason of ['reject','expiry']){const f=await setup();try{if(reason==='reject')await f.controller.run('reject',f.identity,{requestId:f.p.executionId});else{f.expire();await f.controller.run('wallet-status',f.identity);}assert.equal(remainingKeys(f),0);assert.equal(f.sends(),0);}finally{f.db.close();}}});

test('OWNER_APPROVED crash retains binding and requires expiry plus absence before replacing only the old signer',async()=>{
 const f=await setup();try{
  const s=record(f),ownerOnly=f.signed();Object.assign(s,{status:'OWNER_APPROVED',ownerApprovedTransactionBase64:ownerOnly,signature:bs58.encode(Transaction.from(Buffer.from(ownerOnly,'base64')).signature),ownerApprovedAt:f.clock()});f.db.prepare('UPDATE m4_execution SET payload=?').run(JSON.stringify(s));
  const resumed=createM4Execution(f.deps),body={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:s.executionId};assert.equal(remainingKeys(f),1);
  await assert.rejects(resumed.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:ownerOnly}),{code:'M4_SUBMISSION_ALREADY_CONSUMED'});
  await assert.rejects(resumed.run('wallet-prepare',f.identity,body),{code:'M4_RECOVERY_BLOCKHASH_STILL_VALID'});assert.equal(remainingKeys(f),1);
  f.expire();const rpc=f.deps.transport.rpc,reads=[];f.deps.transport.rpc=async(m,p)=>{reads.push(m);const out=await rpc(m,p);if(m==='getMultipleAccounts')f.live();return out;};
  const fresh=await resumed.run('wallet-prepare',f.identity,body);assert.notEqual(fresh.executionId,s.executionId);assert.notEqual(fresh.result.mint,s.result.mint);assert.notEqual(fresh.result.recentBlockhash,s.result.recentBlockhash);
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(s.executionId).payload),s);
  assert.equal(remainingKeys(f),1);assert.equal(f.db.prepare('SELECT execution_id FROM m4_ephemeral_mint_signers').get().execution_id,fresh.executionId);for(const m of ['getSignatureStatuses','getTransaction','getMultipleAccounts'])assert.ok(reads.includes(m));
  await assert.rejects(resumed.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:ownerOnly}),{code:'M4_EXECUTION_MISMATCH'});assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('seal failure rolls back replacement, immutable archive and encrypted signer writes together',async()=>{
 const f=await setup();try{
  const before=record(f),cipher=f.db.prepare('SELECT * FROM m4_ephemeral_mint_signers').get();f.expire();const rpc=f.deps.transport.rpc;f.deps.transport.rpc=async(m,p)=>{const out=await rpc(m,p);if(m==='getMultipleAccounts')f.live();return out;};
  const broken=createM4Execution({...f.deps,signerStore:{...f.store,seal(){throw Error('Fixture seal failure');}}});
  await assert.rejects(broken.run('wallet-prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:before.executionId}),/Fixture seal failure/);
  assert.deepEqual(record(f),before);assert.deepEqual(f.db.prepare('SELECT * FROM m4_ephemeral_mint_signers').get(),cipher);assert.equal(f.db.prepare('SELECT count(*) n FROM m4_execution_history').get().n,0);assert.equal(f.sends(),0);
  await assert.rejects(broken.run('wallet-status',f.identity),{code:'M4_WRITER_FENCED'});
 }finally{f.db.close();}
});
test('actual final simulation policy reconciles 18 compiled accounts and rejects final-only program/effect failures',async()=>{
 const f=await setup();try{
  await f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed()});const s=record(f),r=s.result,bytes=Buffer.from(s.signedTransactionBase64,'base64');
  const context={mint:new PublicKey(r.mint),blockhash:r.recentBlockhash,genesis:r.genesis,chainId:r.network,launch:r.launch,feePolicy:r.feePolicy,finalMessageResult:r,finalMessageRequiresAllSignatures:true},structure=inspectFinalCreation(bytes,context),proof=structuredClone(s.proof);
  const program={owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,lamports:1,data:['','base64']};proof.before.value.push(program);proof.afterRead.value.push(program);proof.simulation.value.accounts.push(program);proof.simulation.value.logs.push(`Program ${LIGHTHOUSE_PROGRAM} invoke [1]`,`Program ${LIGHTHOUSE_PROGRAM} consumed 100 of 100000 compute units`,`Program ${LIGHTHOUSE_PROGRAM} success`);
  fixtureAtomicBalances(bytes,structure,proof.before,proof.simulation,r.executionReview.networkFeeLamports);
  const evaluate=()=>evaluateSimulation(bytes,context,{...proof,fee:proof.feeResponse.value});let policy=evaluate();assert.equal(policy.allowed,true,policy.reasons.join(','));assert.equal(atomicExecutionEffects(r,proof,policy,s.signedTransactionBase64).length,18);
  proof.simulation.value.postBalances.pop();assert.throws(()=>atomicExecutionEffects(r,proof,policy,s.signedTransactionBase64));fixtureAtomicBalances(bytes,structure,proof.before,proof.simulation,r.executionReview.networkFeeLamports);
  proof.simulation.value.logs.splice(-1,0,'Program '+SystemProgram.programId.toBase58()+' invoke [2]');assert.ok(evaluate().reasons.includes('LIGHTHOUSE_EXECUTION_UNPROVEN'));proof.simulation.value.logs.splice(-2,1);
  const pos=proof.simulation.value.logs.indexOf(`Program ${LIGHTHOUSE_PROGRAM} invoke [1]`)-1;proof.simulation.value.logs.splice(pos,0,`Program ${LIGHTHOUSE_PROGRAM} invoke [2]`,`Program ${LIGHTHOUSE_PROGRAM} success`);assert.ok(evaluate().reasons.includes('LIGHTHOUSE_EXECUTION_UNPROVEN'));proof.simulation.value.logs.splice(pos,2);
  const index=proof.simulation.value.innerInstructions[0].index;for(const invalid of [undefined,'2',-1,3]){proof.simulation.value.innerInstructions[0].index=invalid;assert.ok(evaluate().reasons.includes('FINAL_INNER_INSTRUCTION_ATTRIBUTION_INVALID'));}proof.simulation.value.innerInstructions[0].index=index;
  proof.simulation.value.accounts[5].lamports--;fixtureAtomicBalances(bytes,structure,proof.before,proof.simulation,r.executionReview.networkFeeLamports);policy=evaluate();assert.equal(policy.allowed,false);assert.throws(()=>atomicExecutionEffects(r,proof,policy,s.signedTransactionBase64));
 }finally{f.db.close();}
});

test('real final revalidation and finalized oracle use actual signed bytes, 18 accounts and non-Mayhem absence',async()=>{
 const f=await setup();try{
  await f.controller.run('submit',f.identity,{...f.request(f.p),signedTransactionBase64:f.signed()});const s=record(f),r=s.result,bytes=Buffer.from(s.signedTransactionBase64,'base64');
  const image=Buffer.from('fixture PNG'),imageHash=sha(image);f.identity.image='https://fixture.example/metadata/agents/'+f.identity.agentId+'/'+imageHash+'.png';r.launch.image=f.identity.image;delete r.executionReview.digest;r.executionReview.digest=sha(executionReviewBinding(r));
  const proof=structuredClone(s.proof),valid=await finalOracleAccounts(r,proof),simulation=proof.simulation;
  simulation.value.accounts[0]=valid.mintAccount;simulation.value.accounts[2]=valid.curveAccount;simulation.value.accounts[3]=valid.ata;simulation.value.logs=valid.logs;
  const programDataKey=Keypair.generate().publicKey,programBytes=Buffer.alloc(36);programBytes.writeUInt32LE(2);programDataKey.toBuffer().copy(programBytes,4);
  const program={owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,lamports:1,data:[programBytes.toString('base64'),'base64']},code=Buffer.alloc(50);code.writeUInt32LE(3);code.writeBigUInt64LE(100n,4);code[45]=7;
  proof.before.value.push(structuredClone(program));proof.afterRead.value.push(structuredClone(program));simulation.value.accounts.push(structuredClone(program));
  const structure=inspectFinalCreation(bytes,{mint:new PublicKey(r.mint),blockhash:r.recentBlockhash,genesis:r.genesis,chainId:r.network,launch:r.launch,feePolicy:r.feePolicy,finalMessageResult:r,finalMessageRequiresAllSignatures:true});fixtureAtomicBalances(bytes,structure,proof.before,simulation,r.executionReview.networkFeeLamports);
  let slot=104,reads=0,programReads=0,upgrade=false,wrongPointer=false,expired=false;
  const ctx=()=>({slot:++slot}),transport={rpc:async(m,p)=>{
   if(m==='getGenesisHash')return GENESIS;if(m==='isBlockhashValid')return {context:ctx(),value:!expired};if(m==='getBlockHeight')return r.lastValidBlockHeight-50;
   if(m==='getFeeForMessage'){assert.equal(p[0],Transaction.from(bytes).serializeMessage().toString('base64'));assert.notEqual(p[0],Transaction.from(Buffer.from(r.transactionBase64,'base64')).serializeMessage().toString('base64'));return {context:ctx(),value:r.executionReview.networkFeeLamports};}
   if(m==='getMultipleAccounts'){
    if(p[0].length===18){assert.deepEqual(p[0],structure.accounts.map(a=>a.address));return {context:ctx(),value:structuredClone(++reads%2?proof.before.value:proof.afterRead.value)};}
    if(p[0][0]===LIGHTHOUSE_PROGRAM)return {context:ctx(),value:[structuredClone(program)]};
    assert.equal(p[0][0],programDataKey.toBase58());const b=Buffer.from(code);if(upgrade&&++programReads%2===0)b[45]=8;return {context:ctx(),value:[{owner:program.owner,executable:false,lamports:1,data:[b.toString('base64'),'base64']}]};
   }
   if(m==='simulateTransaction'){assert.equal(p[0],s.signedTransactionBase64);assert.equal(p[1].sigVerify,true);assert.equal(p[1].replaceRecentBlockhash,false);assert.equal(p[1].accounts.addresses.length,18);const out=structuredClone(simulation);out.context=ctx();if(wrongPointer){const b=Buffer.from(out.value.accounts[0].data[0],'base64');Keypair.generate().publicKey.toBuffer().copy(b,170);out.value.accounts[0].data[0]=b.toString('base64');}return out;}
   if(m==='getMinimumBalanceForRentExemption')return r.policy.rentAccounts.find(a=>a.dataLength===p[0]).minimumRentExemptionLamports;
   throw Error('Unexpected RPC '+m);
  },publicRequest:async uri=>uri===r.metadataUri?Response.json(tokenMetadata(f.identity)):new Response(image,{headers:{'Content-Type':'image/png'}})};
  const request=f.request({executionId:s.executionId,result:r}),final=await revalidateM4(s,f.identity,request,{transport,now:f.clock});assert.equal(final.finalMessageProof.atomicEffects.length,18);assert.equal(final.finalMessageProof.signatureVerification,true);assert.equal(final.finalMessageProof.lighthouseDeployment.codeSha256,sha(code.subarray(45)));
  s.finalMessageProof=final.finalMessageProof;s.finalMessageEvidence=final.finalMessageEvidence;
  wrongPointer=true;await assert.rejects(revalidateM4(s,f.identity,request,{transport,now:f.clock}),{code:'M4_MINT_STATE_MISMATCH'});wrongPointer=false;reads=0;
  upgrade=true;await assert.rejects(revalidateM4(s,f.identity,request,{transport,now:f.clock}),{code:'M4_LIGHTHOUSE_DEPLOYMENT_CHANGED'});upgrade=false;reads=0;
  expired=true;await assert.rejects(revalidateM4(s,f.identity,request,{transport,now:f.clock}),{code:'M4_BLOCKHASH_EXPIRED'});expired=false;
  const landed={slot:1000,blockTime:1000,transaction:[s.signedTransactionBase64,'base64'],meta:{err:null,fee:r.executionReview.networkFeeLamports,preBalances:simulation.value.preBalances,postBalances:simulation.value.postBalances,logMessages:valid.logs}};
  const confirmation={rpc:async(m,p)=>{if(m==='getGenesisHash')return GENESIS;if(m==='getSignatureStatuses')return {value:[{slot:1000,err:null,confirmationStatus:'finalized'}]};if(m==='getTransaction')return landed;if(m==='getMultipleAccounts'){assert.equal(p[0].length,5);return {context:{slot:1001},value:[valid.mintAccount,valid.curveAccount,simulation.value.accounts[5],valid.ata,null]};}throw Error(m);}};
  assert.equal((await confirmM4(s,{transport:confirmation})).status,'LAUNCHED');
  s.finalMessageProof.messageSha256='0'.repeat(64);await assert.rejects(confirmM4(s,{transport:confirmation}),{code:'M4_FINAL_MESSAGE_PROOF_REQUIRED'});
 }finally{f.db.close();}
});
