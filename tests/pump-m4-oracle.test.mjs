import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PublicKey,Transaction} from '@solana/web3.js';
import {MintLayout,MetadataPointerLayout,ExtensionType,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {pack as packMetadata} from '@solana/spl-token-metadata';
import {curveProgram,BN,pumpSdk} from '../server/dex/pump-sdk-boundary.js';
import {encoded} from './pump-account-fixture.mjs';
import {m4Fixture} from './pump-m4-fixture.mjs';
import {confirmM4} from '../server/pump-m4-confirmation.js';
import {revalidateM4,completeM4OwnerApproval,sha} from '../server/pump-m4-guard.js';
import {decodeM4CreationAccounts,verifyM4CreateEvent} from '../server/pump-m4-provenance.js';
import {GENESIS,PUMP} from '../src/pump-readiness.js';
import {tokenMetadata} from '../src/agent-launch-data.js';
const publicEvent=JSON.parse(readFileSync(new URL('./fixtures/pump-create-event.json',import.meta.url)));
const eventTemplate=curveProgram.coder.events.decode(publicEvent.programData).data;
async function fixture(){
 const f=m4Fixture(),state=await f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()}),request=f.request(state);await f.controller.run('review',f.identity,request);
 const record=JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload),r=record.result;record.signedTransactionBase64=completeM4OwnerApproval(f.signed(),record).completeBase64;const tx=Transaction.from(Buffer.from(record.signedTransactionBase64,'base64'));record.signature=(await import('bs58')).default.encode(tx.signature);record.signedDigest=sha(Buffer.from(record.signedTransactionBase64,'base64'));
 const mint=new PublicKey(r.mint),mintBytes=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintBytes);
 const pointer=Buffer.alloc(MetadataPointerLayout.span);MetadataPointerLayout.encode({authority:PublicKey.default,metadataAddress:mint},pointer);const metadata=Buffer.from(packMetadata({mint,name:r.launch.name,symbol:r.launch.symbol,uri:r.metadataUri,additionalMetadata:[]}));
 const tlv=(type,bytes)=>{const h=Buffer.alloc(4);h.writeUInt16LE(type);h.writeUInt16LE(bytes.length,2);return Buffer.concat([h,bytes]);};const mintAccount={owner:TOKEN_2022_PROGRAM_ID.toBase58(),executable:false,lamports:5547360,data:[Buffer.concat([mintBytes,Buffer.alloc(83),Buffer.from([1]),tlv(ExtensionType.MetadataPointer,pointer),tlv(ExtensionType.TokenMetadata,metadata)]).toString('base64'),'base64']};
 const curveAccount={owner:PUMP,executable:false,lamports:1000000,data:[(await encoded(curveProgram,'bondingCurve',{creator:new PublicKey(r.launch.owner),tokenTotalSupply:new BN('1000000000000000')},151)).toString('base64'),'base64']};
 const event={...eventTemplate,name:r.launch.name,symbol:r.launch.symbol,uri:r.metadataUri,mint,bondingCurve:pumpSdk.bondingCurvePda(mint),user:new PublicKey(r.launch.owner),creator:new PublicKey(r.launch.owner)};
 const definition=curveProgram.idl.events.find(e=>e.name==='createEvent'),eventBytes=Buffer.concat([Buffer.from(definition.discriminator),curveProgram.coder.types.encode('createEvent',event)]),logs=[`Program ${PUMP} invoke [1]`,'Program log: Instruction: CreateV2','Program data: '+eventBytes.toString('base64'),`Program ${PUMP} success`];
 const keys=tx.compileMessage().accountKeys,pre=keys.map(()=>0),post=keys.map(()=>0);pre[0]=r.executionReview.observedBalanceLamports;post[0]=r.executionReview.expectedRemainingBalanceLamports;
 const landed={slot:110,blockTime:1000,transaction:[record.signedTransactionBase64,'base64'],meta:{err:null,fee:r.executionReview.networkFeeLamports,preBalances:pre,postBalances:post,logMessages:logs}},accountResponse={context:{slot:111},value:[mintAccount,curveAccount,{owner:'11111111111111111111111111111111',executable:false,lamports:post[0],data:['','base64']}]},signatureStatus={slot:110,err:null,confirmationStatus:'finalized'};
 const transport={rpc:async(method)=>{if(method==='getGenesisHash')return GENESIS;if(method==='getSignatureStatuses')return {value:[signatureStatus]};if(method==='getTransaction')return landed;if(method==='getMultipleAccounts')return accountResponse;assert.fail(method);}};
 return {...f,record,r,logs,mintAccount,curveAccount,landed,accountResponse,signatureStatus,transport};
}
test('actual decoder and finalized oracle prove exact mint/creator/metadata and full signed bytes',async()=>{
 const f=await fixture();try{assert.ok(decodeM4CreationAccounts(f.r,f.mintAccount,f.curveAccount));assert.equal(verifyM4CreateEvent(f.r,f.logs),true);const result=await confirmM4(f.record,{transport:f.transport});assert.equal(result.status,'LAUNCHED');assert.equal(result.confirmedSlot,110);assert.equal(result.observedSpendLamports,f.r.executionReview.reviewedDebitLamports);}finally{f.db.close();}
});
test('confirmation rejects corruption, missing context, wrong event/mint and incomplete accounting',async()=>{
 for(const mutation of [f=>f.record.signedDigest='a'.repeat(64),f=>delete f.accountResponse.context,f=>f.signatureStatus.slot++,f=>f.landed.meta.preBalances.pop(),f=>f.landed.meta.postBalances[2]=NaN,f=>f.accountResponse.value[2].lamports=null,f=>f.mintAccount.owner=PUMP,f=>f.landed.meta.logMessages=f.logs.filter(l=>!l.startsWith('Program data: ')),f=>f.r.launch.name='changed']){const f=await fixture();try{mutation(f);await assert.rejects(confirmM4(f.record,{transport:f.transport}));}finally{f.db.close();}}
});
test('actual M4 revalidation retains reviewed blockhash and rejects expired/cost/rent/context changes',async()=>{
 const f=await fixture();try{
  const proof=f.record.proof,simulation=structuredClone(proof.simulation);simulation.context.slot=106;simulation.value.accounts[0]=f.mintAccount;simulation.value.accounts[2]=f.curveAccount;simulation.value.logs=f.logs;
  // The synthetic created accounts preserve original funding/debits; only their
  // decoded data is replaced with complete valid Token2022/Pump fixture state.
  simulation.value.accounts[0].lamports=proof.simulation.value.accounts[0].lamports;simulation.value.accounts[2].lamports=proof.simulation.value.accounts[2].lamports;
  let balanceReads=0,feeChange=0,rentChange=0;
  const image=Buffer.from('fixture PNG'),imageHash=sha(image);f.identity.image='https://fixture.example/metadata/agents/'+f.identity.agentId+'/'+imageHash+'.png';f.r.launch.image=f.identity.image;
  // Rebind the complete review using the server digest helper's canonical bytes.
  const {executionReviewBinding}=await import('../src/pump-execution-binding.js');delete f.r.executionReview.digest;f.r.executionReview.digest=sha(executionReviewBinding(f.r));
  const transport={rpc:async(method)=>{
   if(method==='getGenesisHash')return GENESIS;if(method==='isBlockhashValid')return {context:{slot:104},value:true};if(method==='getBlockHeight')return f.r.lastValidBlockHeight-5;if(method==='getFeeForMessage')return {context:{slot:104},value:10000+feeChange};
   if(method==='getMultipleAccounts'){const data=structuredClone(++balanceReads%2?proof.before:proof.afterRead);data.context.slot=balanceReads%2?105:107;return data;}if(method==='simulateTransaction')return simulation;
   if(method==='getMinimumBalanceForRentExemption')return f.r.policy.rentAccounts.find(a=>a.dataLength===arguments[1]?.[0])?.minimumRentExemptionLamports;
   assert.fail(method);
  },publicRequest:async(uri)=>uri===f.r.metadataUri?Response.json(tokenMetadata(f.identity)):new Response(image,{headers:{'Content-Type':'image/png'}})};
  const baseRpc=transport.rpc;transport.rpc=async(method,params)=>method==='getMinimumBalanceForRentExemption'?f.r.policy.rentAccounts.find(a=>a.dataLength===params[0]).minimumRentExemptionLamports+rentChange:baseRpc(method,params);
  const request=f.request({executionId:f.record.executionId,result:f.r});assert.equal((await revalidateM4(f.record,f.identity,request,{transport,now:f.clock})).contextSlot,106);
  feeChange++;await assert.rejects(revalidateM4(f.record,f.identity,request,{transport,now:f.clock}));feeChange=0;rentChange++;await assert.rejects(revalidateM4(f.record,f.identity,request,{transport,now:f.clock}));rentChange=0;simulation.context.slot=1;await assert.rejects(revalidateM4(f.record,f.identity,request,{transport,now:f.clock}));simulation.context.slot=106;f.advance(30000);await assert.rejects(revalidateM4(f.record,f.identity,request,{transport,now:f.clock}),e=>e.code==='EXECUTION_REVIEW_EXPIRED');
 }finally{f.db.close();}
});
