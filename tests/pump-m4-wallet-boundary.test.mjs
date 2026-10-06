import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';
import {createHash} from 'node:crypto';
import {FINAL_MESSAGE_POLICY} from '../src/pump-wallet-final.js';
// LOCAL_FIXTURE only: wallet-provider stub, synthetic signatures, no RPC/broadcast.
let serial=0;
async function fixture(t,{ownerFirst=false,injected=false,missingOwner=false,liveOrderMismatch=false,badFingerprint=false,actionTime=false,remainingBlocks=100,lostClaim=false,mutateBlockhash=false,addLighthouse=false,lighthouse=false,policyMismatch=false}={}){
 const saved={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent},originalNow=Date.now;
 t.after(()=>{Object.assign(globalThis,saved);Date.now=originalNow;});
 let clock=100000,calls=0,statusReads=0,onStatus=()=>{},resolveStatus;
 const owner=Keypair.generate(),mint=Keypair.generate(),address=owner.publicKey.toBase58(),account={address,chains:['solana:mainnet']};
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)}));
 const unsigned=tx.serialize({requireAllSignatures:false}).toString('base64');tx.partialSign(mint);const partial=tx.serialize({requireAllSignatures:false}).toString('base64');
 const signingOrder=ownerFirst?'OWNER_FIRST_MINT_AFTER_APPROVAL':undefined;
 const result={launch:{owner:address,agentId:'fixture',initialBuyLamports:0},transactionBase64:unsigned,transactionSha256:badFingerprint?'0'.repeat(64):createHash('sha256').update(Buffer.from(unsigned,'base64')).digest('hex'),executionReview:{startedAt:100000,expiresAt:130000,ceilingLamports:10000000,digest:'fixture'}},review={status:'AWAITING_WALLET_APPROVAL',executionId:'fixture',signingOrder,result,walletTransactionBase64:ownerFirst?unsigned:partial};
 if(actionTime){result.recentBlockhash=tx.recentBlockhash;result.lastValidBlockHeight=500;result.expiresAt=null;Object.assign(result.executionReview,{version:2,status:'FINAL_WALLET_PREPARATION',freshness:'SOLANA_BLOCKHASH_V2',preparedAt:100000,expiresAt:null,recentBlockhash:tx.recentBlockhash,lastValidBlockHeight:500});}
 if(lighthouse){review.walletMessagePolicy=FINAL_MESSAGE_POLICY;result.mint=mint.publicKey.toBase58();Object.assign(result.executionReview,{minimumReserveLamports:1000000,expectedRemainingBalanceLamports:177000000});}
 const approve=tx=>{calls++;if(ownerFirst)assert.ok(tx.signatures.every(s=>s.signature===null));if(mutateBlockhash)tx.recentBlockhash=Keypair.generate().publicKey.toBase58();if(addLighthouse)tx.add(new TransactionInstruction({programId:new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'),keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true}],data:Buffer.from('BgQDAMtDPAoAAAAABAMAAAEAAAAAAAAAAAA=','base64')}));if(!missingOwner)tx.partialSign(owner);return tx;};
 const wallet={name:'Phantom',chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'standard:events':{on:()=>()=>{}},'solana:signMessage':{signMessage:async()=>[{signature:new Uint8Array(64)}]},'solana:signTransaction':{signTransaction:async input=>[{signedTransaction:Uint8Array.from(approve(Transaction.from(input.transaction)).serialize({requireAllSignatures:!ownerFirst}))}]}}};
 const provider={isPhantom:true,isConnected:false,publicKey:owner.publicKey,connect:async()=>{provider.isConnected=true;},on(){},removeListener(){},signMessage:async()=>({signature:new Uint8Array(64)}),signTransaction:async tx=>approve(tx)};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.window={TekkworkSDK:{Buffer,bs58,Transaction},...(injected?{phantom:{solana:provider}}:{}),addEventListener(){},dispatchEvent(e){if(!injected&&e.type==='wallet-standard:app-ready')e.detail.register(wallet);}};
 globalThis.fetch=async(url,options={})=>{if(url.endsWith('/execution/status')||url.endsWith('/execution/wallet-claim')){statusReads++;if(actionTime){assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).transactionBase64,unsigned);if(lostClaim)throw Error('Claim response lost');}await onStatus();return {ok:true,json:async()=>({status:'AWAITING_WALLET_APPROVAL',executionId:'fixture',walletMessagePolicy:lighthouse&&!policyMismatch?FINAL_MESSAGE_POLICY:undefined,signingOrder:liveOrderMismatch?undefined:signingOrder,result,...(actionTime?{walletValidity:{recentBlockhash:tx.recentBlockhash,lastValidBlockHeight:500,height:500-remainingBlocks,remainingBlocks,checkedAt:clock,commitment:'finalized',reviewDigest:'fixture'}}:{}),approvalCapability:{walletMessagePolicy:lighthouse?FINAL_MESSAGE_POLICY:undefined,mode:'M4_CONTROLLED_SINGLE_LAUNCH',controlledOwnerApproval:true,m4Target:{owner:address,agentId:'fixture'}}})};}return {ok:true,json:async()=>url.endsWith('/auth/challenge')?{id:'fixture',message:'Fixture authentication only'}:{}};};
 Date.now=()=>clock;const backend=await import('../public/app/backend.js?m4-boundary-'+(++serial));await backend.connect(backend.wallets().find(w=>w.name==='Phantom').id);
 return {review,partial:review.walletTransactionBase64,signer:backend.m4LaunchWallet(address),calls:()=>calls,statusReads:()=>statusReads,setClock:n=>clock=n,onStatus:fn=>onStatus=fn,waitStatus:()=>{onStatus=()=>new Promise(r=>resolveStatus=r);return ()=>resolveStatus();}};
}
for(const clock of [108001,110000,116000,131000])test('final status latency '+clock+' blocks short/expired review before any provider request',async t=>{const f=await fixture(t);f.onStatus(()=>f.setClock(clock));await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),e=>e.code==='M4_REVIEW_LIFETIME_TOO_SHORT'&&e.walletRequestOpened===false);assert.equal(f.calls(),0);assert.equal(f.statusReads(),1);});
test('dialog closed during final status read cannot open wallet',async t=>{const f=await fixture(t),release=f.waitStatus();let alive=true;const pending=f.signer.signTransaction(f.partial,f.review,()=>{if(!alive)throw Error('Dialog changed');});await new Promise(r=>setImmediate(r));alive=false;release();await assert.rejects(pending,/Dialog changed/);assert.equal(f.calls(),0);});
test('one fresh exact-byte request signs once; replay cannot request another wallet popup',async t=>{const f=await fixture(t);const signed=await f.signer.signTransaction(f.partial,f.review,()=>{});assert.equal(Transaction.from(Buffer.from(signed,'base64')).verifySignatures(true),true);assert.equal(f.calls(),1);await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/Single reviewed/);assert.equal(f.calls(),1);});
test('concurrent same-operation bridges request the wallet exactly once',async t=>{const f=await fixture(t);const results=await Promise.allSettled([f.signer.signTransaction(f.partial,f.review,()=>{}),f.signer.signTransaction(f.partial,f.review,()=>{})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls(),1);});
for(const injected of [false,true])test('owner-first '+(injected?'injected':'standard')+' wallet sees unsigned bytes and returns only owner signature',async t=>{const f=await fixture(t,{ownerFirst:true,injected}),signed=Transaction.from(Buffer.from(await f.signer.signTransaction(f.partial,f.review,()=>{}),'base64'));assert.ok(signed.signature);assert.equal(signed.signatures[1].signature,null);assert.equal(signed.verifySignatures(false),true);assert.equal(signed.verifySignatures(true),false);assert.equal(f.calls(),1);});
test('owner-first mode cannot be enabled by local review without live server agreement',async t=>{const f=await fixture(t,{ownerFirst:true,liveOrderMismatch:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/signing order changed/);assert.equal(f.calls(),0);});
test('owner-first wallet returning all-null signatures cannot be submitted',async t=>{const f=await fixture(t,{ownerFirst:true,missingOwner:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/owner approval changed or missing/);assert.equal(f.calls(),1);});
test('reviewed fingerprint mismatch blocks the provider before any wallet popup',async t=>{const f=await fixture(t,{ownerFirst:true,badFingerprint:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/fingerprint changed/);assert.equal(f.calls(),0);});

for(const injected of [false,true])test('native blockhash handoff after 30s uses durable claim and exact unsigned bytes '+injected,async t=>{const f=await fixture(t,{ownerFirst:true,injected,actionTime:true});f.setClock(135000);const signed=Transaction.from(Buffer.from(await f.signer.signTransaction(f.partial,f.review,()=>{}),'base64'));assert.ok(signed.signature);assert.equal(signed.signatures[1].signature,null);assert.equal(f.calls(),1);});
for(const options of [{remainingBlocks:49},{lostClaim:true}])test('native handoff failure never reaches provider '+JSON.stringify(options),async t=>{const f=await fixture(t,{ownerFirst:true,actionTime:true,...options});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}));assert.equal(f.calls(),0);});

test('wallet-mutated blockhash is diagnosed and never accepted as reviewed signature',async t=>{const savedWarn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);t.after(()=>console.warn=savedWarn);const f=await fixture(t,{ownerFirst:true,injected:true,actionTime:true,mutateBlockhash:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/owner approval changed/);assert.equal(f.calls(),1);const evidence=JSON.parse(logs.find(x=>x[0]==='M4 wallet message mismatch')[1]);assert.ok(evidence.differences.includes('blockhash'));assert.equal(evidence.providerMessageBase64,evidence.returned.wireMessageBase64);assert.equal(evidence.returned.ownerSignaturePresent,true);assert.equal(evidence.returned.signaturesValid,true);});

for(const injected of [false,true])test('Lighthouse augmentation is diagnosed and blocked at wallet return '+(injected?'injected':'standard'),async t=>{
 const savedWarn=console.warn,logs=[];console.warn=(...args)=>logs.push(args);t.after(()=>console.warn=savedWarn);
 const f=await fixture(t,{ownerFirst:true,injected,actionTime:true,addLighthouse:true});
 await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/owner approval changed/);
 const evidence=JSON.parse(logs.find(x=>x[0]==='M4 wallet message mismatch')[1]);
 assert.equal(evidence.returned.ownerSignaturePresent,true);assert.equal(evidence.returned.signaturesValid,true);
 assert.equal(evidence.returned.mintSignaturePresent,false);assert.equal(evidence.returned.blockhash,evidence.expected.blockhash);
 assert.deepEqual(evidence.returned.instructions.slice(0,-1),evidence.expected.instructions);
 assert.equal(evidence.returned.instructions.at(-1).program,'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
 assert.ok(evidence.differences.includes('instructions'));assert.equal(f.calls(),1);
 await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/Single reviewed/);assert.equal(f.calls(),1);
});

for(const injected of [false,true])test('explicit final-message policy accepts only the allowed wallet assertion '+injected,async t=>{
 const f=await fixture(t,{ownerFirst:true,injected,actionTime:true,addLighthouse:true,lighthouse:true});
 const signed=Transaction.from(Buffer.from(await f.signer.signTransaction(f.partial,f.review,()=>{}),'base64'));
 assert.equal(signed.verifySignatures(false),true);assert.equal(signed.signatures[1].signature,null);assert.equal(signed.instructions.length,2);assert.equal(f.calls(),1);
 await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}));assert.equal(f.calls(),1);
});
test('final-message capability disagreement blocks before provider; allowed policy never permits changed blockhash',async t=>{
 const f=await fixture(t,{ownerFirst:true,injected:true,actionTime:true,lighthouse:true,policyMismatch:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}),/policy changed/);assert.equal(f.calls(),0);
});
test('allowed Lighthouse policy still rejects wallet blockhash mutation',async t=>{
 const f=await fixture(t,{ownerFirst:true,injected:true,actionTime:true,lighthouse:true,addLighthouse:true,mutateBlockhash:true});await assert.rejects(f.signer.signTransaction(f.partial,f.review,()=>{}));assert.equal(f.calls(),1);
});
