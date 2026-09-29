import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import BN from 'bn.js';
import {transformSync} from 'esbuild';
import {PublicKey,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,createTransferInstruction,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {buildCpmmEnvelope,cpmmEnvelopeContext,CPMM_ENVELOPE} from '../server/dex/cpmm-envelope.js';
import {inspectCpmmSnapshot,quoteCpmm} from '../server/dex/concrete-cpmm-proof.js';
import {decodeDexTransaction,validateDexTransaction} from '../server/dex/transaction-validator.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {captured} from './cpmm-envelope-fixture.mjs';

const snapshot=JSON.parse(readFileSync(new URL('./fixtures/useless-cpmm-mainnet.json',import.meta.url)));
const reverseSnapshot=JSON.parse(readFileSync(new URL('./fixtures/reverse-wsol-cpmm-mainnet.json',import.meta.url)));
const sdk=JSON.parse(readFileSync(new URL('./fixtures/concrete-cpmm-sdk-source.json',import.meta.url)));
const MINT='Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
const POOL='Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp';
const WALLET='7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe';
const ata=mint=>getAssociatedTokenAddressSync(new PublicKey(mint),new PublicKey(WALLET)).toBase58();
function tokenAccount(amount,mint=MINT){const b=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(b,0);new PublicKey(WALLET).toBuffer().copy(b,32);b.writeBigUInt64LE(amount,64);b[108]=1;return {owner:TOKEN_PROGRAM_ID.toBase58(),executable:false,lamports:captured.ataRentLamports,data:b.toString('base64')};}
function fixture(direction='BUY'){
 const p={envelope:CPMM_ENVELOPE,intent:{network:'solana:mainnet',mode:'LIVE_AUTONOMOUS',agentWallet:WALLET,direction,inputMint:direction==='BUY'?SOL_MINT:MINT,outputMint:direction==='BUY'?MINT:SOL_MINT,inputAmount:'100000',slippageBps:100,pool:POOL},snapshot:structuredClone(snapshot),agentAccounts:[{address:ata(SOL_MINT),info:null},{address:ata(MINT),info:null}],rentLamports:String(captured.ataRentLamports),networkFeeCapLamports:'10000',agentBalanceLamports:'6995000',computeBudget:{units:200000,microLamports:0},blockhash:captured.block.blockhash};
 if(direction==='SELL'){p.intent.inputAmount=cpmmEnvelopeContext(fixture()).q.output.toString();p.agentAccounts[1].info=tokenAccount(BigInt(p.intent.inputAmount));p.agentBalanceLamports='3908120';}
 return p;
}
function mutate(p,change){const d=decodeDexTransaction(buildCpmmEnvelope(p));change(d.instructions,d);return Buffer.from(new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(d.feePayer),recentBlockhash:d.blockhash,instructions:d.instructions}).compileToLegacyMessage()).serialize()).toString('base64');}

test('captured Mainnet pool proves reverse-independent classic WSOL/token roles',()=>{
 const s=inspectCpmmSnapshot(snapshot,POOL);assert.equal(s.pool,POOL);assert.equal(s.mint0,SOL_MINT);assert.equal(s.mint1,MINT);assert.equal(s.program0,TOKEN_PROGRAM_ID.toBase58());assert.equal(s.program1,TOKEN_PROGRAM_ID.toBase58());
 assert.throws(()=>inspectCpmmSnapshot(snapshot,'11111111111111111111111111111111'));
});
test('candidate local quote matches pinned official Raydium CPMM curve in both directions',()=>{
 const official=(file,extra={})=>{const f=sdk.files['src/raydium/cpmm/curve/'+file+'.ts'];assert.equal(createHash('sha256').update(f.source).digest('hex'),f.sha256);const context={module:{exports:{}},BN,...extra};vm.runInNewContext(transformSync(f.source.replace(/^import .*;\r?$/gm,''),{loader:'ts',format:'cjs'}).code,context,{timeout:1000});return context.module.exports;};
 const Fee=official('fee',{FEE_RATE_DENOMINATOR_VALUE:new BN(1000000),ceilDiv:(a,b,c)=>a.mul(b).add(c).subn(1).div(c),floorDiv:(a,b,c)=>a.mul(b).div(c)}).CpmmFee;
 const CurveCalculator=official('calculator',{Fee,ConstantProductCurve:official('constantProduct').ConstantProductCurve}).CurveCalculator;
 for(const s of [inspectCpmmSnapshot(snapshot,POOL),inspectCpmmSnapshot(reverseSnapshot,'3BjqisWKPfR13cBivREfEsuwe5cKwXe95q4GZhGtq7gt')])for(const direction of [0,1])for(const amount of [1000000000n,10000000000n]){
  const local=quoteCpmm(s,direction,amount),q=CurveCalculator.swapBaseInput(...[amount,s.reserves[direction],s.reserves[1-direction],s.tradeFeeRate,0n,s.protocolFeeRate,s.fundFeeRate].map(x=>new BN(x.toString())),true);
  assert.equal(local.output.toString(),q.outputAmount.toString());assert.equal(local.tradeFee.toString(),q.tradeFee.toString());assert.equal(local.minimumOutput,local.output*9900n/10000n);
 }
});
test('reverse on-chain orientation maps BUY to side 1 and SELL to side 0',()=>{
 const pool='3BjqisWKPfR13cBivREfEsuwe5cKwXe95q4GZhGtq7gt',mint='QdyjMr627PR7NtWdcEcgFmDm5haBVUWEcj4jdM4boop';
 const verified=inspectCpmmSnapshot(reverseSnapshot,pool);assert.equal(verified.mint0,mint);assert.equal(verified.mint1,SOL_MINT);
 const buy=fixture();buy.snapshot=structuredClone(reverseSnapshot);buy.intent.pool=pool;buy.intent.outputMint=mint;buy.agentAccounts[1].address=ata(mint);
 const bc=cpmmEnvelopeContext(buy);assert.equal(bc.direction,1);assert.equal(validateDexTransaction(buildCpmmEnvelope(buy),buy).status,'SUPPORTED_BY_VALIDATOR');
 const sell=structuredClone(buy);sell.intent.direction='SELL';sell.intent.inputMint=mint;sell.intent.outputMint=SOL_MINT;sell.intent.inputAmount=bc.q.output.toString();sell.agentAccounts[1].info=tokenAccount(bc.q.output,mint);
 const sc=cpmmEnvelopeContext(sell);assert.equal(sc.direction,0);assert.equal(validateDexTransaction(buildCpmmEnvelope(sell),sell).status,'SUPPORTED_BY_VALIDATOR');
});
for(const direction of ['BUY','SELL'])test(direction+' USELESS full unsigned envelope is supported by exact validator',()=>{
 const p=fixture(direction),encoded=buildCpmmEnvelope(p),v=validateDexTransaction(encoded,p);
 assert.equal(v.status,'SUPPORTED_BY_VALIDATOR');assert.equal(v.unexplainedWritableAccounts,0);assert.ok(v.transaction.signatures[0].every(x=>x===0));
 const c=cpmmEnvelopeContext(p);assert.equal(c.s.pool,POOL);assert.equal(c.tokenMint,MINT);assert.equal(c.direction,direction==='BUY'?0:1);
});
test('candidate rejects mismatched token, pool, config, authority, observation and vault snapshot',()=>{
 const changes=[
  p=>{p.intent.outputMint=SOL_MINT;},p=>{p.intent.pool='11111111111111111111111111111111';},
  p=>{const x=p.snapshot.accounts.find(a=>a.address===POOL),b=Buffer.from(x.data,'base64');Buffer.alloc(32).copy(b,8);x.data=b.toString('base64');},
  p=>{const x=p.snapshot.accounts.find(a=>a.address===POOL),b=Buffer.from(x.data,'base64');b[328]^=1;x.data=b.toString('base64');},
  p=>{const s=inspectCpmmSnapshot(p.snapshot,POOL),x=p.snapshot.accounts.find(a=>a.address===s.observation),b=Buffer.from(x.data,'base64');b[11]^=1;x.data=b.toString('base64');},
  p=>{const s=inspectCpmmSnapshot(p.snapshot,POOL),x=p.snapshot.accounts.find(a=>a.address===s.vault0),b=Buffer.from(x.data,'base64');b[32]^=1;x.data=b.toString('base64');},
  p=>{const s=inspectCpmmSnapshot(p.snapshot,POOL),x=p.snapshot.accounts.find(a=>a.address===s.mint1);x.owner='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';},
 ];
 for(const change of changes){const p=fixture();change(p);assert.throws(()=>buildCpmmEnvelope(p));}
});
test('candidate rejects all swap role and amount mutations',()=>{
 for(const role of [0,1,2,3,4,5,6,7,8,9,10,11,12]){const p=fixture();assert.throws(()=>validateDexTransaction(mutate(p,ix=>{ix.at(-2).keys[role].pubkey=PublicKey.default;}),p),`role ${role}`);}
 for(const offset of [8,16]){const p=fixture();assert.throws(()=>validateDexTransaction(mutate(p,ix=>{ix.at(-2).data[offset]^=1;}),p));}
});
test('candidate rejects Compute Budget changes and extra value-moving instructions',()=>{
 const p=fixture();assert.throws(()=>validateDexTransaction(mutate(p,ix=>{ix[0].data[1]^=1;}),p));
 assert.throws(()=>validateDexTransaction(mutate(p,(ix,d)=>ix.splice(2,0,SystemProgram.transfer({fromPubkey:new PublicKey(d.feePayer),toPubkey:PublicKey.default,lamports:1}))),p));
 assert.throws(()=>validateDexTransaction(mutate(p,ix=>ix.splice(ix.length-1,0,createTransferInstruction(ix.at(-1).keys[0].pubkey,PublicKey.default,ix.at(-1).keys[2].pubkey,1))),p));
});
