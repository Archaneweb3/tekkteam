import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';
// LOCAL_FIXTURE only: wallet-provider stub, synthetic signatures, no RPC/broadcast.
let serial=0;
async function fixture(t){
 const saved={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent},originalNow=Date.now;
 t.after(()=>{Object.assign(globalThis,saved);Date.now=originalNow;});
 let clock=100000,calls=0,statusReads=0,onStatus=()=>{},resolveStatus;
 const owner=Keypair.generate(),mint=Keypair.generate(),address=owner.publicKey.toBase58(),account={address,chains:['solana:mainnet']};
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)}));
 const unsigned=tx.serialize({requireAllSignatures:false}).toString('base64');tx.partialSign(mint);const partial=tx.serialize({requireAllSignatures:false}).toString('base64');
 const result={launch:{owner:address,agentId:'fixture',initialBuyLamports:0},transactionBase64:unsigned,executionReview:{startedAt:100000,expiresAt:130000,ceilingLamports:10000000,digest:'fixture'}},review={status:'AWAITING_WALLET_APPROVAL',executionId:'fixture',result,walletTransactionBase64:partial};
 const wallet={name:'Phantom',chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'standard:events':{on:()=>()=>{}},'solana:signMessage':{signMessage:async()=>[{signature:new Uint8Array(64)}]},'solana:signTransaction':{signTransaction:async input=>{calls++;const signed=Transaction.from(input.transaction);signed.partialSign(owner);return [{signedTransaction:Uint8Array.from(signed.serialize())}];}}}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.window={TekkworkSDK:{Buffer,bs58,Transaction},addEventListener(){},dispatchEvent(e){if(e.type==='wallet-standard:app-ready')e.detail.register(wallet);}};
 globalThis.fetch=async url=>{if(url.endsWith('/execution/status')){statusReads++;await onStatus();return {ok:true,json:async()=>({status:'AWAITING_WALLET_APPROVAL',executionId:'fixture',result,approvalCapability:{mode:'M4_CONTROLLED_SINGLE_LAUNCH',controlledOwnerApproval:true,m4Target:{owner:address,agentId:'fixture'}}})};}return {ok:true,json:async()=>url.endsWith('/auth/challenge')?{id:'fixture',message:'Fixture authentication only'}:{}};};
 Date.now=()=>clock;const backend=await import('../public/app/backend.js?m4-boundary-'+(++serial));await backend.connect(backend.wallets().find(w=>w.name==='Phantom').id);
 return {review,partial,signer:backend.m4LaunchWallet(address),calls:()=>calls,statusReads:()=>statusReads,setClock:n=>clock=n,onStatus:fn=>onStatus=fn,waitStatus:()=>{onStatus=()=>new Promise(r=>resolveStatus=r);return ()=>resolveStatus();}};
}
for(const clock of [116000,131000])test('final status latency '+clock+' blocks short/expired review before any provider request',async t=>{const f=await fixture(t);f.onStatus(()=>f.setClock(clock));await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),e=>e.code==='M4_REVIEW_LIFETIME_TOO_SHORT'&&e.walletRequestOpened===false);assert.equal(f.calls(),0);assert.equal(f.statusReads(),1);});
test('dialog closed during final status read cannot open wallet',async t=>{const f=await fixture(t),release=f.waitStatus();let alive=true;const pending=f.signer.signTransaction(f.partial,f.review,()=>{if(!alive)throw Error('Dialog changed');});await new Promise(r=>setImmediate(r));alive=false;release();await assert.rejects(pending,/Dialog changed/);assert.equal(f.calls(),0);});
test('one fresh exact-byte request signs once; replay cannot request another wallet popup',async t=>{const f=await fixture(t);const signed=await f.signer.signTransaction(f.partial,f.review,()=>{});assert.equal(Transaction.from(Buffer.from(signed,'base64')).verifySignatures(true),true);assert.equal(f.calls(),1);await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/Single reviewed/);assert.equal(f.calls(),1);});
