import test from 'node:test';import assert from 'node:assert/strict';
import {PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,TransactionInstruction,Keypair} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,createTransferInstruction,createCloseAccountInstruction,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {buildCpmmEnvelope,cpmmEnvelopeContext} from '../server/dex/cpmm-envelope.js';
import {decodeDexTransaction,validateDexTransaction} from '../server/dex/transaction-validator.js';
import {fixture,tokenInfo,captured} from './cpmm-envelope-fixture.mjs';
const other=PublicKey.default;
function mutated(p,fn){const d=decodeDexTransaction(buildCpmmEnvelope(p));fn(d.instructions,d);return Buffer.from(new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(d.feePayer),recentBlockhash:d.blockhash,instructions:d.instructions}).compileToLegacyMessage()).serialize()).toString('base64');}
for(const direction of ['BUY','SELL']){
 test(direction+' full canonical envelope supported; historical bytes reproduced without signing',()=>{const p=fixture(direction),encoded=buildCpmmEnvelope(p),r=validateDexTransaction(encoded,p);assert.equal(encoded,captured.messages.find(f=>f.direction===direction).encoded);assert.equal(r.status,'SUPPORTED_BY_VALIDATOR');assert.equal(r.unexplainedWritableAccounts,0);assert.equal(r.executable,false);assert.ok(r.transaction.signatures[0].every(b=>b===0));});
 test(direction+' existing ATAs validated from raw classic token state; no duplicate creation',()=>{const p=fixture(direction),c=cpmmEnvelopeContext(p);p.agentAccounts[0].info=tokenInfo('So11111111111111111111111111111111111111112',p.intent.agentWallet,0,{native:true});if(direction==='BUY')p.agentAccounts[1].info=tokenInfo(p.intent.outputMint,p.intent.agentWallet,0);const r=validateDexTransaction(buildCpmmEnvelope(p),p);assert.equal(r.rentCostLamports,'0');assert.equal(r.status,'SUPPORTED_BY_VALIDATOR');});
 const mutations={
  'Compute Budget':ix=>{ix[1].data[1]^=1;},
  'extra System transfer':(ix,d)=>ix.splice(2,0,SystemProgram.transfer({fromPubkey:new PublicKey(d.feePayer),toPubkey:other,lamports:1})),
  'extra SPL transfer':ix=>ix.splice(ix.length-1,0,createTransferInstruction(ix.at(-1).keys[0].pubkey,other,ix.at(-1).keys[2].pubkey,1)),
  'close destination':ix=>{ix.at(-1).keys[1].pubkey=other;},
  'close authority':ix=>{ix.at(-1).keys[2].pubkey=other;},
  'WSOL account':ix=>{ix.at(-1).keys[0].pubkey=other;},
  'cleanup before swap':ix=>{[ix[ix.length-1],ix[ix.length-2]]=[ix[ix.length-2],ix[ix.length-1]];},
  'missing cleanup':ix=>ix.pop(),
  'extra cleanup':ix=>ix.push(ix.at(-1)),
  'ATA owner':ix=>{ix[2].keys[2].pubkey=other;},
  'ATA mint':ix=>{ix[2].keys[3].pubkey=other;},
  'ATA token program':ix=>{ix[2].keys[5].pubkey=other;},
  'ATA destination':ix=>{ix[2].keys[1].pubkey=other;},
  'ATA payer':ix=>{ix[2].keys[0].pubkey=other;},
  'ATA duplicate':ix=>ix.splice(3,0,ix[2]),
 };
 for(const [name,fn]of Object.entries(mutations))test(direction+' rejects '+name,()=>{const p=fixture(direction);assert.throws(()=>validateDexTransaction(mutated(p,fn),p));});
 for(const [name,index]of Object.entries({signer:0,authority:1,config:2,pool:3,source:4,destination:5,inputVault:6,outputVault:7,tokenProgram:8,targetMint:11,observation:12}))test(direction+' rejects swap '+name,()=>{const p=fixture(direction);assert.throws(()=>validateDexTransaction(mutated(p,ix=>{ix.at(-2).keys[index].pubkey=other;}),p));});
 for(const offset of [8,16])for(const delta of [-1n,1n])test(direction+' rejects amount/minimum '+offset+' '+delta,()=>{const p=fixture(direction);assert.throws(()=>validateDexTransaction(mutated(p,ix=>{const b=ix.at(-2).data;b.writeBigUInt64LE(b.readBigUInt64LE(offset)+delta,offset);}),p));});
 test(direction+' rejects wrong blockhash and signed input',()=>{const p=fixture(direction),encoded=buildCpmmEnvelope(p);assert.throws(()=>validateDexTransaction(encoded,{...p,blockhash:other.toBase58()}));const t=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));t.signatures[0][0]=1;assert.throws(()=>validateDexTransaction(Buffer.from(t.serialize()).toString('base64'),p));});
}
test('BUY rejects mutated lamports, missing sync, extra sync and ordering',()=>{for(const fn of [ix=>{ix[4].data[4]^=1;},ix=>ix.splice(5,1),ix=>ix.splice(6,0,ix[5]),ix=>{[ix[4],ix[5]]=[ix[5],ix[4]];}]){const p=fixture();assert.throws(()=>validateDexTransaction(mutated(p,fn),p));}});
test('SELL pre-state rejects missing, insufficient, wrong owner, frozen and delegated source',()=>{for(const change of [p=>p.agentAccounts[1].info=null,p=>p.agentAccounts[1].info=tokenInfo(p.intent.inputMint,p.intent.agentWallet,9999),p=>p.agentAccounts[1].info.owner=other.toBase58(),p=>{const b=Buffer.from(p.agentAccounts[1].info.data,'base64');b[108]=2;p.agentAccounts[1].info.data=b.toString('base64');},p=>{const b=Buffer.from(p.agentAccounts[1].info.data,'base64');b.writeUInt32LE(1,72);p.agentAccounts[1].info.data=b.toString('base64');}]){const p=fixture('SELL');change(p);assert.throws(()=>buildCpmmEnvelope(p));}});
test('existing WSOL cannot contain residual lamports, tokens or alternate close authority',()=>{const p=fixture();p.agentAccounts[0].info=tokenInfo(p.intent.inputMint,p.intent.agentWallet,1,{native:true});assert.throws(()=>buildCpmmEnvelope(p),/WSOL_RESIDUAL/);});
test('signed narrow CPMM message requires exact Agent signature; unsigned proof remains unsigned-only',()=>{const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1)),p=fixture();p.intent.agentWallet=signer.publicKey.toBase58();p.agentAccounts=[p.intent.inputMint,p.intent.outputMint].map(mint=>({address:getAssociatedTokenAddressSync(new PublicKey(mint),signer.publicKey).toBase58(),info:null}));const unsigned=buildCpmmEnvelope(p),tx=VersionedTransaction.deserialize(Buffer.from(unsigned,'base64'));tx.sign([signer]);const signed=Buffer.from(tx.serialize()).toString('base64');assert.equal(validateDexTransaction(signed,{...p,requireSignature:true}).status,'SUPPORTED_BY_VALIDATOR');assert.throws(()=>validateDexTransaction(signed,p),/UNSIGNED_SIGNER/);tx.signatures[0][0]^=1;assert.throws(()=>validateDexTransaction(Buffer.from(tx.serialize()).toString('base64'),{...p,requireSignature:true}),/INVALID_SIGNATURE/);});
