import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import BN from 'bn.js';
import {transformSync} from 'esbuild';
import {inspectCpmmSnapshot,quoteCpmm,buildCpmmSwap,cpmmProofDecoder} from '../server/dex/concrete-cpmm-proof.js';
import {PublicKey,TransactionInstruction} from '@solana/web3.js';
import {decodeDexTransaction,validateDexTransaction} from '../server/dex/transaction-validator.js';
import {validateNativeLifecycle} from '../server/dex/native-lifecycle.js';
const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-mainnet.json',import.meta.url)));
const sdk=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-sdk-source.json',import.meta.url)));
const state=inspectCpmmSnapshot(snapshot);
function official(file,extra={}) {
 const f=sdk.files['src/raydium/cpmm/curve/'+file+'.ts'];
 assert.equal(createHash('sha256').update(f.source).digest('hex'),f.sha256);
 const source=f.source.replace(/^import .*;\r?$/gm,'');
 const context={module:{exports:{}},BN,...extra};
 vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,context,{timeout:1000});
 return context.module.exports;
}
const Fee=official('fee',{FEE_RATE_DENOMINATOR_VALUE:new BN(1000000),ceilDiv:(a,b,c)=>a.mul(b).add(c).subn(1).div(c),floorDiv:(a,b,c)=>a.mul(b).div(c)}).CpmmFee;
const ConstantProductCurve=official('constantProduct').ConstantProductCurve;
const SDK=official('calculator',{Fee,ConstantProductCurve}).CurveCalculator;
test('CPMM real snapshot independently binds pool/config/vault/observation classic-token provenance',()=>{
 assert.equal(state.pool,'7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny');
 assert.deepEqual(state.reserves,[383694367n,47746977n]);
 assert.notDeepEqual(state.reserves,state.vaultBalances);
 assert.equal(state.creatorFeeRate,0n);
});
test('CPMM local quote matches pinned official SDK for both directions and fee/amount boundaries',()=>{
 for(const direction of [0,1]) for(const amount of [399n,400n,401n,9999n,10000n,10001n,99999n,100000n,100001n,499999n,500000n,500001n]) {
  const local=quoteCpmm(state,direction,amount);
  const q=SDK.swapBaseInput(...[amount,state.reserves[direction],state.reserves[1-direction],state.tradeFeeRate,0n,state.protocolFeeRate,state.fundFeeRate].map(x=>new BN(x.toString())),true);
  for(const [localKey,sdkKey] of [['output','outputAmount'],['tradeFee','tradeFee'],['protocolFee','protocolFee'],['fundFee','fundFee'],['creatorFee','creatorFee']]) assert.equal(local[localKey].toString(),q[sdkKey].toString());
  assert.equal(local.minimumOutput,local.output*9900n/10000n);
  assert.ok((local.minimumOutput+1n)*10000n>local.output*9900n);
 }
});
test('CPMM both local swap directions have exact schema and six explained writable roles',()=>{
 for(const direction of [0,1]) {
  const q=quoteCpmm(state,direction,100000n);
  const {instruction:ix,roles}=buildCpmmSwap(state,'7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe',direction,q.amount,q.minimumOutput);
  assert.equal(ix.keys.length,13); assert.equal(ix.data.length,24);
  assert.equal(ix.data.readBigUInt64LE(8),q.amount); assert.equal(ix.data.readBigUInt64LE(16),q.minimumOutput);
  assert.equal(ix.keys[6].pubkey.toBase58(),state['vault'+direction]);
  assert.equal(ix.keys[7].pubkey.toBase58(),state['vault'+(1-direction)]);
  assert.deepEqual(ix.keys.flatMap((k,i)=>k.isWritable?[roles[i]]:[]),['pool','userInput','userOutput','inputVault','outputVault','observation']);
 }
});
test('CPMM observer rejects nonclassic/mutated provenance and unsupported creator mode',()=>{
 for(const [address,offset] of [[state.pool,389],[state.pool,8],[state.vault0,32],[state.observation,11],[state.config,0]]) {
  const s=structuredClone(snapshot),a=s.accounts.find(x=>x.address===address),b=Buffer.from(a.data,'base64');b[offset]^=1;a.data=b.toString('base64');
  assert.throws(()=>inspectCpmmSnapshot(s));
 }
 const s=structuredClone(snapshot);s.accounts.find(x=>x.address===state.mint1).owner='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';assert.throws(()=>inspectCpmmSnapshot(s),/MINT_PROGRAM/);
});
test('CPMM fixture-scoped decoder accepts exact swap and rejects every account or data mutation',()=>{
 const agent='7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe';
 for(const direction of [0,1]) {
  const q=quoteCpmm(state,direction,100000n),canonical=buildCpmmSwap(state,agent,direction,q.amount,q.minimumOutput).instruction;
  const decode=cpmmProofDecoder(state,agent,direction,q.amount,q.minimumOutput);
  assert.equal(decode(canonical).inputAmount,'100000');
  for(let i=0;i<13;i++) {const ix=new TransactionInstruction({programId:canonical.programId,keys:canonical.keys.map(x=>({...x})),data:Buffer.from(canonical.data)});ix.keys[i].pubkey=PublicKey.default;assert.throws(()=>decode(ix),/CPMM_ACCOUNT/);}
  for(const offset of [0,8,16]) for(const delta of [-1,1]) {const ix=new TransactionInstruction({programId:canonical.programId,keys:canonical.keys,data:Buffer.from(canonical.data)});ix.data[offset]+=delta;assert.throws(()=>decode(ix),/CPMM_INSTRUCTION/);}
  const extra=new TransactionInstruction({programId:canonical.programId,keys:[...canonical.keys,canonical.keys[0]],data:canonical.data});assert.throws(()=>decode(extra),/CPMM_INSTRUCTION/);
 }
});
test('CPMM unsigned envelopes reproduce full-validator rejection while limited native proof passes',()=>{
 const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-messages.json',import.meta.url)));
 for(const f of captured.messages) {
  const d=decodeDexTransaction(f.encoded),direction=f.direction==='BUY'?0:1;
  assert.equal(d.messageHash,f.messageHash);assert.equal(d.transaction.signatures.length,1);assert.ok(d.transaction.signatures[0].every(x=>x===0));
  const decode=cpmmProofDecoder(state,f.intent.agentWallet,direction,BigInt(f.quote.amount),BigInt(f.quote.minimumOutput));
  const swapIndex=d.instructions.findIndex(x=>x.programId.toBase58()==='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
  const route=decode(d.instructions[swapIndex]);
  assert.equal(route.inputAmount,f.intent.inputAmount);
  const policy={genesisHash:snapshot.genesis,intent:f.intent,quote:{...f.intent,minimumOutput:f.quote.minimumOutput},computeBudget:{units:200000,microLamports:0},blockhash:captured.block.blockhash,inputTokenAccount:route.inputTokenAccount,outputTokenAccount:route.outputTokenAccount,allowedWritableAccounts:d.accounts.filter(x=>x.writable).map(x=>x.address),createOutputAta:true,routeDecoders:new Map([['CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',decode]])};
  assert.throws(()=>validateDexTransaction(f.encoded,policy),e=>e.code===(direction===0?'ATA_MISMATCH':'UNSUPPORTED_ROUTE_OR_PROGRAM'));
  const accounts=direction===0?captured.accountProofs:captured.accountProofs.filter(x=>x.address==='HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR');
  const native=validateNativeLifecycle({intent:f.intent,setup:d.instructions.slice(2,swapIndex),cleanup:d.instructions.slice(swapIndex+1),accounts});
  assert.equal(native.setupVerified,true);assert.equal(native.routeVerified,false);
  if(direction===1)assert.equal(f.sellSourceBalanceSufficient,false);
 }
});
