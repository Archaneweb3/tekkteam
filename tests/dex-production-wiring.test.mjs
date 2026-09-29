import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,VersionedTransaction,TransactionMessage,TransactionInstruction,ComputeBudgetProgram,PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {installControlledDex} from '../server/dex/routes.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {GENESIS} from '../src/pump-readiness.js';

const kp=n=>Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>(i+n)%256));
const owner=kp(20),wallet=kp(21),mint=kp(22).publicKey.toBase58(),program=kp(23).publicKey,input=kp(24).publicKey,output=kp(25).publicKey,blockhash=kp(26).publicKey.toBase58();

function fixture(t,{enabled=true,emergency=false,prepareOnly=false,realMoney}={}){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT)');db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('agent',wallet.publicKey.toBase58(),'fixture-secret-not-used');
 const state={now:1000,height:100,signs:0,sends:0,finalized:false,signed:null};
 const provider={quote:async i=>({provider:'FIXTURE_ONLY',network:'solana:mainnet',inputMint:i.inputMint,outputMint:i.outputMint,inputAmount:i.inputAmount,slippageBps:i.slippageBps,estimatedOutput:'100',minimumOutput:'99',reference:'fixture-quote',createdAt:state.now,expiresAt:state.now+15000})};
 const policy=r=>({intent:r.intent,quote:r.quote,genesisHash:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',blockhash,computeBudget:{units:10000,microLamports:0},inputTokenAccount:input.toBase58(),outputTokenAccount:output.toBase58(),allowedWritableAccounts:[wallet.publicKey.toBase58(),input.toBase58(),output.toBase58()],routeDecoders:new Map([[program.toBase58(),ix=>{assert.equal(ix.keys[0].pubkey.toBase58(),wallet.publicKey.toBase58());return {authority:wallet.publicKey.toBase58(),inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputTokenAccount:input.toBase58(),outputTokenAccount:output.toBase58(),inputAmount:String(ix.data.readBigUInt64LE()),minimumOutput:String(ix.data.readBigUInt64LE(8))};}]])});
 const adapter={enabled:!prepareOnly,prepareEnabled:prepareOnly,validationPolicy:async r=>policy(r),build:async r=>{const data=Buffer.alloc(16);data.writeBigUInt64LE(BigInt(r.intent.inputAmount));data.writeBigUInt64LE(BigInt(r.quote.minimumOutput),8);const ix=[ComputeBudgetProgram.setComputeUnitPrice({microLamports:0}),ComputeBudgetProgram.setComputeUnitLimit({units:10000}),new TransactionInstruction({programId:program,data,keys:[new PublicKey(r.intent.agentWallet),new PublicKey(r.intent.inputMint),new PublicKey(r.intent.outputMint),input,output].map((pubkey,i)=>({pubkey,isSigner:i===0,isWritable:i===0||i>2}))})];const tx=new VersionedTransaction(new TransactionMessage({payerKey:wallet.publicKey,recentBlockhash:blockhash,instructions:ix}).compileToV0Message());return {transaction:Buffer.from(tx.serialize()).toString('base64'),blockhash,lastValidBlockHeight:200,pool:program.toBase58(),routePolicyVersion:'fixture-direct-v1'};},snapshot:async r=>({network:'solana:mainnet',agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:'10000000',networkFeeLamports:'5000',ataRentLamports:'0',ataExists:true,inputTokenBalance:'0',observedAt:state.now}),blockHeight:async()=>state.height,assertCustody:async()=>true,signExactMessage:async(_r,d)=>{state.signs++;d.transaction.sign([wallet]);state.signed=Buffer.from(d.transaction.serialize()).toString('base64');return state.signed;},broadcastOnce:async encoded=>{state.sends++;return bs58.encode(VersionedTransaction.deserialize(Buffer.from(encoded,'base64')).signatures[0]);},readFinalized:async signature=>state.finalized?{signature,finalized:true,slot:123,error:null,transaction:state.signed,networkFeeLamports:'5000'}:null,verifiedEffects:async()=>({actualInput:'100000',actualOutput:'100',networkFeeLamports:'5000',rentLamports:'0',agentSolDelta:'-105000',agentTokenDelta:'100'})};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(req.headers['x-owner']!==owner.publicKey.toBase58())return res.sendStatus(401);req.session={address:req.headers['x-owner']};next();};
 const installed=installControlledDex(app,{db,auth,owned:req=>{if(req.params.id!=='agent')throw Object.assign(Error('missing'),{status:404});return {agent:{id:'agent',tradingWallet:wallet.publicKey.toBase58()}};},sessionValid:req=>!!req.session,now:()=>state.now,productionAdapter:adapter,productionProvider:provider,productionFlags:()=>({controlledEnabled:enabled,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:emergency}),realMoney});
 const server=app.listen(0,'127.0.0.1');t.after(()=>{server.close();db.close();});
 const ready=new Promise(resolve=>server.once('listening',resolve));
 const call=async(path,method='GET',body,asOwner=owner.publicKey.toBase58())=>{await ready;const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/agents/agent/controlled-execution'+path,{method,headers:{'content-type':'application/json','x-owner':asOwner},...(body?{body:JSON.stringify(body)}:{})});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}return {status:response.status,data};};
 return {db,state,adapter,installed,call};
}
const intent={direction:'BUY',inputMint:SOL_MINT,outputMint:mint,inputAmount:'100000',slippageBps:100,requestKey:'fixture-controlled-operation-1'};

test('production handler path: prepare review, owner capability, one fixture sign/send, reconcile',async t=>{
 const f=fixture(t);const p=await f.call('/prepare','POST',intent);assert.equal(p.status,200);assert.equal(p.data.status,'PREPARED');assert.ok(p.data.confirmationToken);assert.equal(p.data.messageHash.length,64);assert.equal(JSON.stringify(p.data).includes('fixture-secret-not-used'),false);assert.equal(Object.hasOwn(p.data,'transaction'),false);assert.equal(Object.hasOwn(p.data,'validationPolicy'),false);assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM dex_controlled_audit WHERE event='CONTROLLED_PREPARED'").get().n,1);
 const id=p.data.id;const approval={confirm:true,confirmationToken:p.data.confirmationToken,messageHash:p.data.messageHash,quoteReference:'fixture-quote'};
 const list=await f.call('');assert.equal(list.data.records[0].id,id);assert.equal(list.data.records[0].confirmationToken,undefined);assert.equal(list.data.signingArmed,true);
 const rejected=await f.call('/'+id+'/confirm','POST',{...approval,confirmationToken:'wrong'});assert.equal(rejected.status,409);assert.equal(f.state.signs,0);
 const c=await f.call('/'+id+'/confirm','POST',approval);assert.equal(c.data.status,'SUBMITTED');assert.equal(f.state.signs,1);assert.equal(f.state.sends,1);
 await f.call('/'+id+'/confirm','POST',approval);assert.equal(f.state.sends,1);
 f.state.finalized=true;const settled=await f.call('/'+id);assert.equal(settled.data.status,'CONFIRMED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_receipts').get().n,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM dex_controlled_audit WHERE event='CONTROLLED_CONFIRMED'").get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
});
test('real runtime flags reject prepare before fixture signer/broadcaster or reservation',async t=>{
 for(const options of [{enabled:false},{enabled:true,emergency:true}]){const f=fixture(t,options),r=await f.call('/prepare','POST',intent);assert.equal(r.status,409);assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,0);}
});
test('production preparation is idempotent; changed intent conflicts; cancellation releases reservation',async t=>{const f=fixture(t),first=await f.call('/prepare','POST',intent);assert.equal(first.status,200);const again=await f.call('/prepare','POST',intent);assert.equal(again.data.id,first.data.id);assert.equal(again.data.confirmationToken,undefined);const changed=await f.call('/prepare','POST',{...intent,inputAmount:'200000'});assert.equal(changed.status,409);assert.match(changed.data.error,/IDEMPOTENCY_CONFLICT/);const cancel=await f.call('/'+first.data.id+'/cancel','POST',{});assert.equal(cancel.data.status,'FAILED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);const blocked=await f.call('/'+first.data.id+'/confirm','POST',{confirm:true,confirmationToken:first.data.confirmationToken,messageHash:first.data.messageHash,quoteReference:'fixture-quote'});assert.equal(blocked.data.status,'FAILED');assert.equal(f.state.signs,0);});
test('production confirmation rejects unauthenticated, arbitrary transaction, expired capability and releases reserve',async t=>{const f=fixture(t),p=await f.call('/prepare','POST',intent),id=p.data.id;assert.equal((await f.call('/'+id+'/confirm','POST',{confirm:true,confirmationToken:p.data.confirmationToken,messageHash:p.data.messageHash,quoteReference:'fixture-quote'},'wrong')).status,401);assert.equal((await f.call('/'+id+'/confirm','POST',{confirm:true,confirmationToken:p.data.confirmationToken,messageHash:p.data.messageHash,quoteReference:'fixture-quote',transaction:'forged'})).status,409);f.state.now+=16000;const expired=await f.call('/'+id);assert.equal(expired.data.status,'EXPIRED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);});
test('prepare/review-only adapter cannot reach signer or broadcaster even with owner capability',async t=>{const f=fixture(t,{prepareOnly:true}),p=await f.call('/prepare','POST',intent);assert.equal(p.status,200);assert.equal(p.data.status,'PREPARED');const status=await f.call('');assert.equal(status.data.prepareEnabled,true);assert.equal(status.data.signingArmed,false);const confirmed=await f.call('/'+p.data.id+'/confirm','POST',{confirm:true,confirmationToken:p.data.confirmationToken,messageHash:p.data.messageHash,quoteReference:'fixture-quote'});assert.equal(confirmed.status,409);assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);});
test('GET status repeatedly formats persisted CPMM PREPARED shape without rebuilding or mutating it',async t=>{
 const f=fixture(t,{prepareOnly:true}),p=await f.call('/prepare','POST',intent);assert.equal(p.status,200);
 const row=f.db.prepare('SELECT data FROM dex_executions WHERE id=?').get(p.data.id),r=JSON.parse(row.data),mintBytes=Buffer.alloc(82);mintBytes[44]=6;
 r.validationPolicy={envelope:'CPMM_NATIVE',intent:r.intent,agentBalanceLamports:'6995000',networkFeeCapLamports:'10000',snapshot:{accounts:[{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',data:mintBytes.toString('base64')}]}};
 r.quote.estimatedOutput='12342';r.quote.minimumOutput='12218';r.review.ataRentLamports='2976880';
 f.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 const saved=f.db.prepare('SELECT data FROM dex_executions WHERE id=?').get(r.id).data;
 for(let i=0;i<3;i++){
  const result=await f.call('');assert.equal(result.status,200);const view=result.data.records.find(x=>x.id===r.id);
  assert.equal(view.status,'PREPARED');assert.equal(view.review.inputAmount,'100000');assert.equal(view.review.estimatedOutput,'12342');assert.equal(view.usdcDecimals,6);
  assert.equal(view.review.peakAvailableAfterLamports,'3908120');assert.equal(view.messageHash,r.messageHash);
  assert.equal(f.db.prepare('SELECT data FROM dex_executions WHERE id=?').get(r.id).data,saved);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
 }
 assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);
});
test('status selects one execution, expires unsigned review, releases hold, and preserves history for a new key',async t=>{
 const f=fixture(t,{prepareOnly:true}),first=await f.call('/prepare','POST',intent);
 assert.equal(first.status,200);
 let status=await f.call('');assert.equal(status.data.currentExecutionId,first.data.id);assert.equal(status.data.records[0].status,'PREPARED');
 assert.equal(status.data.armEligibility.executionId,first.data.id);
 assert.equal(status.data.armEligibility.eligible,false); // fixture production adapter has no one-shot signer
 f.state.now+=16000;
 status=await f.call('');
 assert.equal(status.data.currentExecutionId,first.data.id);assert.equal(status.data.records[0].status,'EXPIRED');assert.equal(status.data.armEligibility.eligible,false);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 assert.equal(f.db.prepare('SELECT status FROM real_balance_reservations WHERE operation_id=?').get('dex:'+first.data.id).status,'EXPIRED');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,1);
 const second=await f.call('/prepare','POST',{...intent,requestKey:'new-intent-after-expiry'});
 assert.equal(second.status,200);assert.notEqual(second.data.id,first.data.id);
 status=await f.call('');assert.equal(status.data.currentExecutionId,second.data.id);
 assert.equal(status.data.records.find(r=>r.id===first.data.id).status,'EXPIRED');
 assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);
});
test('status expiry also applies to capability and blockhash, but never releases possibly signed holds',async t=>{
 for(const cause of ['capability','blockhash']){
  const f=fixture(t,{prepareOnly:true}),p=await f.call('/prepare','POST',intent);
  assert.equal(p.status,200);
  if(cause==='capability'){
   const r=f.installed.ledger.get(p.data.id);
   f.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify({...r,capabilityExpiresAt:f.state.now-1}),r.id);
  }else f.state.height=201;
  const status=await f.call('');assert.equal(status.data.records[0].status,'EXPIRED',cause);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0,cause);
 }
 for(const state of ['UNKNOWN','SIGNED','SUBMITTED']){
  const f=fixture(t,{prepareOnly:true}),p=await f.call('/prepare','POST',intent);
  const ledger=f.installed.ledger;
  ledger.transition(p.data.id,['PREPARED'],'UNKNOWN',{signature:'fixture-signature'});
  if(state==='SIGNED'||state==='SUBMITTED')ledger.transition(p.data.id,['UNKNOWN'],'SIGNED');
  if(state==='SUBMITTED')ledger.transition(p.data.id,['SIGNED'],'SUBMITTED');
  f.state.now+=16000;f.state.height=201;
  const status=await f.call('');assert.equal(status.data.records[0].status,state);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1,state);
 }
});
test('mixed-network topology rejects Controlled Real before ledger or reservation',async t=>{
 const base={getGenesisHash:async()=>GENESIS},wrong={getGenesisHash:async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
 for(const role of ['broadcaster','simulation','blockhash','reconciliation']){
  const realMoney=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET'},connection:base,components:{[role]:wrong}});
  const f=fixture(t,{prepareOnly:true,realMoney});const r=await f.call('/prepare','POST',intent);
  assert.equal(r.status,409);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal(f.state.signs,0);assert.equal(f.state.sends,0);
 }
});
test('status waits for Mainnet verification instead of reading a transient unverified state',async t=>{
 let resolveGenesis;
 const genesis=new Promise(resolve=>{resolveGenesis=resolve;});
 const realMoney=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET'},connection:{getGenesisHash:()=>genesis}});
 const f=fixture(t,{prepareOnly:true,realMoney});
 const status=f.call('');
 resolveGenesis(GENESIS);
 const result=await status;
 assert.equal(result.status,200);
 assert.equal(result.data.enabled,true);
 assert.equal(result.data.prepareEnabled,true);
 assert.equal(result.data.signingArmed,false);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 assert.equal(f.state.signs,0);
 assert.equal(f.state.sends,0);
});
test('status fails closed when Mainnet verification fails',async t=>{
 const realMoney=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET'},connection:{getGenesisHash:async()=> 'wrong-genesis'}});
 const f=fixture(t,{prepareOnly:true,realMoney});
 const result=await f.call('');
 assert.equal(result.status,409);
 assert.equal(result.data.error,'REAL_MONEY_GENESIS_MISMATCH');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,0);
 assert.equal(f.state.signs,0);
 assert.equal(f.state.sends,0);
});
