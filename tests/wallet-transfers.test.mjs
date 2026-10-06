import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';
import {openStore} from '../server/store.js';
import {installWalletTransfers} from '../server/wallet-transfers.js';
import {inspectTransfer,inspectFundingReview} from '../src/wallet-transfer.js';
import {GENESIS} from '../src/pump-readiness.js';
import {runtime} from '../server/runtime.js';
import {executeLive} from '../server/live-execution.js';
import {randomUUID} from 'node:crypto';

async function fixture(t,{authority=false}={}){
 const path=join(mkdtempSync(join(tmpdir(),'tekk-wallet-')),'db'),owner=Keypair.generate(),wallet=Keypair.generate(),other=Keypair.generate();
 let store=openStore(path),db=store.db;
 db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT)');
 db.exec('CREATE TABLE dex_positions(agent_id TEXT NOT NULL,mint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(agent_id,mint)); CREATE TABLE dex_executions(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT);');
 const agent={id:'agent-one',creator:owner.publicKey.toBase58(),tradingWallet:wallet.publicKey.toBase58()};
 db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(agent.id,agent.tradingWallet,store.seal(wallet.secretKey,'trading:'+agent.id));
 const control={fundingProof:{kind:"GENERAL"},fund:true,withdraw:true,paused:false,genesis:GENESIS,balance:1000000000,fee:5000,height:1,now:Date.now(),sends:0,outcome:'confirmed',sendError:false,mutate:null,tx:null,session:true,tokenAccounts:[],tokenError:false,tokenReads:0};
 const c={getGenesisHash:async()=>control.genesis,getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),getBlockHeight:async()=>control.height,getFeeForMessage:async()=>({value:control.fee}),getBalance:async()=>{if(control.balance===null)throw Error('private RPC credentials');return control.balance;},getParsedTokenAccountsByOwner:async()=>{control.tokenReads++;if(control.tokenError)throw Error('private RPC credentials');return {value:control.tokenReads%2?control.tokenAccounts:[]};},sendRawTransaction:async bytes=>{control.sends++;control.tx=Transaction.from(bytes);if(control.sendError)throw Error('timeout');return bs58.encode(control.tx.signature);},getTransaction:async()=>{
  if(control.outcome==='unknown')return null;if(control.outcome==='error')throw Error('private RPC credentials');
  const tx=Transaction.from(control.tx.serialize()),message=tx.compileMessage(),transfer=tx.instructions.at(-1),source=transfer.keys[0].pubkey,dest=transfer.keys[1].pubkey,amount=Number(transfer.data.readBigUInt64LE(4));
  const preBalances=message.accountKeys.map(()=>1000000000),postBalances=[...preBalances],si=message.accountKeys.findIndex(k=>k.equals(source)),di=message.accountKeys.findIndex(k=>k.equals(dest));
  postBalances[si]-=amount+5000;postBalances[di]+=amount;
  const value={slot:23,blockTime:1750000000,transaction:{message,signatures:[bs58.encode(tx.signature)]},meta:{err:control.outcome==='failed'?{InstructionError:[0,'failure']}:null,fee:5000,preBalances,postBalances}};
  control.mutate?.(value);return value;
 }};
 let server;
 const boot=async()=>{
  const app=express();app.use(express.json());
  const auth=(q,s,n)=>{if(!q.headers['x-owner'])return s.status(401).json({error:'Authentication required'});q.session={address:q.headers['x-owner']};n();};
  const owned=req=>{if(req.session.address!==agent.creator||req.params.id!==agent.id)throw Object.assign(Error('Agent not found'),{status:404});return {agent};};
  const service=installWalletTransfers(app,{db,store,auth,owned,connection:c,now:()=>control.now,enabled:()=>control.fund,withdrawalEnabled:()=>control.withdraw,paused:()=>control.paused,sessionValid:()=>control.session,readFundingAuthority:authority?()=>control.fundingProof:undefined});
  app.use((e,q,s,n)=>s.status(e.status||500).json({error:e.status?e.message:'Service unavailable'}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return service;
 };
 let service=await boot();t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const call=async(path,body,as=agent.creator)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/${agent.id}/trading/`+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(as?{'x-owner':as}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
 const prepare=(kind='funding',lamports=50000000,key=randomUUID())=>call(kind+'/prepare',{lamports,requestKey:key});
 const submit=async r=>{if(r.kind==='WITHDRAW')return call('withdrawal/confirm',{id:r.id,confirm:true});const tx=Transaction.from(Buffer.from(r.transaction,'base64'));tx.sign(owner);return call('funding/submit',{id:r.id,signedTransaction:tx.serialize().toString('base64')});};
 return {agent,owner,wallet,other,control,c,call,prepare,submit,get db(){return db;},get store(){return store;},reconcile:()=>service.reconcilePending(),restart:async()=>{await new Promise(r=>server.close(r));store.close();store=openStore(path);db=store.db;service=await boot();}};
}
for(const phase of ['prepare','review','submit'])test(`launch funding receipt binding mutation during ${phase} stops before send`,async t=>{
 const f=await fixture(t,{authority:true});f.control.fundingProof={kind:'LAUNCHPAD',signature:'first-receipt'};
 const prepared=phase==='prepare'?null:(await f.prepare()).data;
 const original=f.c.getBalance;f.c.getBalance=async()=>{f.control.fundingProof={kind:'LAUNCHPAD',signature:'changed-receipt'};return original();};
 const result=phase==='prepare'?await f.prepare():phase==='review'?await f.call('funding/'+prepared.id+'/review',{}):await f.submit(prepared);
 assert.equal(result.status,409);assert.match(result.data.error,/authority changed/);assert.equal(f.control.sends,0);
 if(prepared)assert.equal(JSON.parse(f.db.prepare('SELECT data FROM agent_funding WHERE id=?').get(prepared.id).data).signature,undefined);
});
test('launch-bound Agent without canonical authority reader cannot prepare funding',async t=>{const f=await fixture(t);f.agent.launchWalletBinding={signature:'not-authority'};assert.equal((await f.prepare()).status,409);assert.equal(f.control.sends,0);assert.equal(f.db.prepare('SELECT count(*) n FROM agent_funding').get().n,0);});

test('new funding stores final budget, hash, quote; RPC fee failures fail closed',async t=>{
 const f=await fixture(t),r=(await f.prepare()).data;
 assert.equal(r.fundingMessageVersion,1);assert.equal(r.computeUnitLimit,10000);assert.equal(r.computeUnitPrice,0);
 assert.equal(r.baseFeeLamports,5000);assert.equal(r.priorityFeeLamports,0);assert.equal(r.maxNetworkFeeLamports,5000);
 assert.match(r.messageHash,/^[0-9a-f]{64}$/);
 assert.equal(Transaction.from(Buffer.from(r.transaction,'base64')).instructions.length,3);
 await f.call('funding/'+r.id+'/cancel',{});
 for(const fee of [null,10001,-1]){f.control.fee=fee;assert.equal((await f.prepare()).status,409);}
 assert.equal(f.control.sends,0);
});
test('pre-broadcast diagnostic leaves request unchanged and sends nothing',async t=>{
 const f=await fixture(t),r=(await f.prepare()).data;
 const before=f.db.prepare('SELECT data FROM agent_funding WHERE id=?').get(r.id).data;
 const result=await f.call('funding/submit',{id:r.id,signedTransaction:'INVALID_PAYLOAD_CANARY'});
 assert.equal(result.status,409);assert.equal(result.data.submissionState,'REJECTED_BEFORE_BROADCAST');
 assert.equal(result.data.diagnostic.code,'DECODE_FAILURE');assert.equal(f.control.sends,0);
 assert.equal(f.db.prepare('SELECT data FROM agent_funding WHERE id=?').get(r.id).data,before);
 assert.ok(!JSON.stringify(result.data).includes('INVALID_PAYLOAD_CANARY'));
});
test('authentication, ownership, destination and amount rejection',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('wallet',undefined,null)).status,401);
 assert.equal((await f.call('wallet',undefined,f.other.publicKey.toBase58())).status,404);
 for(const kind of ['funding','withdrawal']){
  assert.equal((await f.call(kind+'/prepare',{lamports:1,requestKey:randomUUID()},null)).status,401);
  assert.equal((await f.call(kind+'/prepare',{lamports:1,requestKey:randomUUID()},f.other.publicKey.toBase58())).status,404);
  for(const n of [0,-1,null,NaN,Infinity,1.5,'1',Number.MAX_SAFE_INTEGER+1])assert.equal((await f.prepare(kind,n)).status,409);
  assert.equal((await f.call(kind+'/prepare',{lamports:1,requestKey:randomUUID(),destination:f.other.publicKey.toBase58()})).status,409);
 }
 assert.equal(f.control.sends,0);
});
test('wallet read returns fresh aggregated SPL holdings without turning RPC failure into zero',async t=>{
 const f=await fixture(t),mint=Keypair.generate().publicKey.toBase58();
 f.control.tokenAccounts=[{account:{data:{parsed:{info:{mint,tokenAmount:{amount:'45962',decimals:6}}}}}}];
 const first=(await f.call('wallet')).data;
 assert.equal(first.assetStatus,'AVAILABLE');assert.equal(first.assetCount,1);
 assert.deepEqual(first.assets,[{mint,amount:'45962',decimals:6}]);
 assert.equal(f.control.tokenReads,2);
 f.control.tokenError=true;
 const unavailable=(await f.call('wallet')).data;
 assert.equal(unavailable.assetStatus,'UNAVAILABLE');assert.equal(unavailable.assetCount,null);
 assert.deepEqual(unavailable.assets,[]);assert.equal(f.control.sends,0);
});
test('server-derived wallet capability blocks real position and pending execution, not Paper pause',async t=>{
 const f=await fixture(t);
 let state=(await f.call('wallet')).data;
 assert.equal(state.depositCapability.available,true);
 assert.equal(state.withdrawCapability.available,true);
 f.db.prepare('INSERT INTO dex_positions VALUES(?,?,?)').run(f.agent.id,'mint',JSON.stringify({mode:'REAL',quantity:'45962'}));
 state=(await f.call('wallet')).data;
 assert.equal(state.withdrawCapability.code,'REAL_POSITION_OPEN');
 assert.equal(state.depositCapability.available,true);
 assert.equal((await f.call('withdrawal/max')).status,409);
 assert.equal((await f.prepare('withdrawal')).status,409);
 f.db.prepare('DELETE FROM dex_positions').run();
 f.db.prepare('INSERT INTO dex_executions VALUES(?,?,?,?)').run('pending',f.agent.id,'UNKNOWN',JSON.stringify({id:'pending',intent:{agentWallet:f.agent.tradingWallet}}));
 state=(await f.call('wallet')).data;
 assert.equal(state.withdrawCapability.code,'PENDING_EXECUTION');
 assert.equal((await f.prepare('withdrawal')).status,409);
 f.db.prepare('DELETE FROM dex_executions').run();
 f.control.balance=0;
 state=(await f.call('wallet')).data;
 assert.equal(state.withdrawCapability.code,'INSUFFICIENT_WITHDRAWABLE_SOL');
 f.control.session=false;
 assert.equal((await f.call('wallet')).status,401);
 assert.equal(f.control.sends,0);
});
test('read-only withdrawal MAX reserves approved fee ceiling and never prepares or signs',async t=>{
 const f=await fixture(t),before=f.db.prepare('SELECT COUNT(*) AS n FROM agent_funding').get().n;
 const result=await f.call('withdrawal/max');
 assert.equal(result.status,200);assert.equal(result.data.agentId,f.agent.id);
 assert.equal(result.data.source,f.agent.tradingWallet);assert.equal(result.data.destination,f.agent.creator);
 assert.equal(result.data.network,'solana:mainnet');assert.equal(result.data.balanceLamports,1000000000);
 assert.equal(result.data.feeCapLamports,10000);assert.equal(result.data.requiredRentLamports,0);
 assert.equal(result.data.maxLamports,999990000);
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM agent_funding').get().n,before);assert.equal(f.control.sends,0);
 f.control.withdraw=false;assert.equal((await f.call('withdrawal/max')).status,409);
});
test('funding construction, owner signature, exact confirmed receipt and balance',async t=>{
 const f=await fixture(t),p=await f.prepare();assert.equal(p.status,200);const r=p.data;
 assert.equal(r.source,f.agent.creator);assert.equal(r.destination,f.agent.tradingWallet);assert.equal(r.remainingLamports,949995000);assert.equal(r.status,'PREPARED');
 assert.doesNotThrow(()=>inspectFundingReview(r,f.agent.creator,f.agent.tradingWallet,f.agent.id));
 assert.equal((await f.call('funding/'+r.id+'/review',{})).status,200);
 f.control.height=101;assert.equal((await f.call('funding/'+r.id+'/review',{})).status,409);assert.equal(f.control.sends,0);f.control.height=1;
 assert.equal((await f.submit(r)).data.status,'SUBMITTED');assert.equal(f.control.sends,1);
 const result=(await f.call('funding/'+r.id)).data;assert.equal(result.status,'CONFIRMED');assert.equal(result.slot,23);assert.ok(result.timestamp);assert.equal(result.amountLamports,50000000);
 assert.equal(result.ownerWallet,f.agent.creator);assert.equal(result.agentWallet,f.agent.tradingWallet);
 assert.equal((await f.call('wallet')).data.balanceLamports,1000000000);
 assert.equal((await f.submit(r)).data.status,'CONFIRMED');assert.equal(f.control.sends,1);
});
test('idempotency rejects different intent without rotating or overwriting original',async t=>{
 const f=await fixture(t),key='intent-regression-key-0001';
 const r=(await f.prepare('withdrawal',5000000,key)).data;
 assert.equal((await f.prepare('withdrawal',5000000,key)).data.id,r.id);
 assert.equal((await f.prepare('withdrawal',50000000,key)).status,409);
 assert.equal((await f.prepare('funding',5000000,key)).status,409);
 assert.equal((await f.call('withdrawal/prepare',{lamports:5000000,requestKey:key,destination:f.other.publicKey.toBase58()})).status,409);
 assert.equal(f.control.sends,0);
 const row=JSON.parse(f.db.prepare('SELECT data FROM agent_funding WHERE id=?').get(r.id).data);
 assert.equal(row.amountLamports,5000000);assert.equal(row.destination,f.agent.creator);assert.equal(row.status,'PREPARED');
});
test('funding key cannot be reused for withdrawal even after terminal result',async t=>{
 const f=await fixture(t),key='funding-regression-key-0001',r=(await f.prepare('funding',5000000,key)).data;
 await f.call('funding/'+r.id+'/cancel',{});
 assert.equal((await f.prepare('withdrawal',5000000,key)).status,409);
 assert.equal((await f.prepare('withdrawal',5000000,'new-withdrawal-key-0001')).status,200);
 assert.equal(f.control.sends,0);
});
test('withdrawal has no signature before explicit confirm and destination is locked',async t=>{
 const f=await fixture(t),r=(await f.prepare('withdrawal',20000000)).data;
 assert.equal(r.computeUnitLimit,10000);assert.equal(r.computeUnitPrice,0);
 assert.equal(r.baseFeeLamports,5000);assert.equal(r.priorityFeeLamports,0);
 assert.equal(r.destinationBalanceLamports,1000000000);assert.equal(r.expectedDestinationBalanceLamports,1020000000);
 const stored=JSON.parse(f.db.prepare('SELECT data FROM agent_funding WHERE id=?').get(r.id).data);
 assert.equal(Transaction.from(Buffer.from(stored.transaction,'base64')).instructions.length,3);
 assert.equal(r.source,f.agent.tradingWallet);assert.equal(r.destination,f.agent.creator);assert.equal(r.signature,undefined);assert.equal(r.transaction,undefined);assert.equal(f.control.sends,0);
 assert.equal((await f.call('withdrawal/confirm',{id:r.id})).status,409);
 assert.equal((await f.call('withdrawal/confirm',{id:r.id,confirm:true,destination:f.other.publicKey.toBase58()})).status,409);
 assert.equal(f.control.sends,0);assert.equal((await f.submit(r)).data.status,'SUBMITTED');assert.equal(f.control.sends,1);
 assert.equal(f.control.tx.signatures[0].publicKey.toBase58(),f.agent.tradingWallet);
 assert.equal(f.control.tx.serializeMessage().toString('base64'),stored.message);
 assert.equal(f.control.tx.verifySignatures(),true);
 assert.equal((await f.call('withdrawal/'+r.id)).data.status,'CONFIRMED');
 const text=JSON.stringify((await f.call('wallet')).data);for(const forbidden of ['secret','vault','message','transaction','blockhash'])assert.equal(text.includes('"'+forbidden+'"'),false);
});
test('withdrawal owner balance unavailable prevents preparation without signing',async t=>{
 const f=await fixture(t);f.c.getBalance=async key=>key.toBase58()===f.agent.creator?null:1000000000;
 assert.equal((await f.prepare('withdrawal',5000000)).status,409);assert.equal(f.control.sends,0);
});
test('duplicate preparations and concurrent confirmations persist across restart',async t=>{
 const f=await fixture(t),key=randomUUID(),[a,b]=await Promise.all([f.prepare('withdrawal',20,key),f.prepare('withdrawal',20,key)]);assert.equal(a.data.id,b.data.id);
 assert.equal((await f.prepare('withdrawal',21,key)).status,409);assert.equal((await f.prepare('funding')).status,409);
 const r=(await f.prepare('withdrawal',20,key)).data;await Promise.all([f.submit(r),f.submit(r)]);assert.equal(f.control.sends,1);
 await f.restart();await f.submit(r);assert.equal(f.control.sends,1);assert.equal((await f.call('withdrawal/'+r.id)).data.status,'CONFIRMED');
});
test('timeout becomes UNKNOWN, restart only reconciles existing signature; no new transfer',async t=>{
 const f=await fixture(t),r=(await f.prepare('withdrawal')).data;f.control.sendError=true;f.control.outcome='unknown';
 assert.equal((await f.submit(r)).data.status,'UNKNOWN');assert.equal(f.control.sends,1);await f.restart();
 assert.equal((await f.submit(r)).data.status,'UNKNOWN');assert.equal((await f.prepare('withdrawal')).status,409);await f.reconcile();assert.equal(f.control.sends,1);
 f.control.outcome='confirmed';await f.reconcile();assert.equal((await f.call('withdrawal/'+r.id)).data.status,'CONFIRMED');assert.equal(f.control.sends,1);
});
test('confirmation rejects wrong signature, effect, fee, message and unavailable RPC',async t=>{
 const f=await fixture(t),r=(await f.prepare()).data;await f.submit(r);
 for(const mutation of [x=>x.transaction.signatures[0]=bs58.encode(new Uint8Array(64)),x=>x.meta.postBalances[1]++,x=>x.meta.fee++,x=>x.transaction.message.recentBlockhash=f.other.publicKey.toBase58(),x=>x.meta=null]){
  f.control.mutate=mutation;assert.equal((await f.call('funding/'+r.id)).data.status,'UNKNOWN');
 }
 f.control.mutate=null;f.control.outcome='error';assert.equal((await f.call('funding/'+r.id)).data.status,'UNKNOWN');f.control.outcome='confirmed';assert.equal((await f.call('funding/'+r.id)).data.status,'CONFIRMED');assert.equal(f.control.sends,1);
});
test('on-chain failure is FAILED, not funded',async t=>{const f=await fixture(t),r=(await f.prepare()).data;await f.submit(r);f.control.outcome='failed';assert.equal((await f.call('funding/'+r.id)).data.status,'FAILED');assert.equal(f.control.sends,1);});
test('Mainnet, fee, balance and expiry revalidated before withdrawal signing',async t=>{
 for(const change of [f=>f.control.genesis='devnet',f=>f.control.balance=10,f=>f.control.fee=6000,f=>f.control.height=101,f=>f.control.now+=120001,f=>f.control.withdraw=false,f=>f.control.paused=true,f=>f.control.session=false,f=>f.agent.creator=f.other.publicKey.toBase58(),f=>f.agent.tradingWallet=f.other.publicKey.toBase58()]){
  await t.test(change.toString(),async sub=>{const f=await fixture(sub),r=(await f.prepare('withdrawal')).data;change(f);assert.ok((await f.submit(r)).status>=400);assert.equal(f.control.sends,0);});
 }
});
test('vault unavailable, corrupt ciphertext and inconsistent decrypted key fail closed',async t=>{
 for(const change of [f=>f.store.unseal=undefined,f=>f.db.prepare('UPDATE agent_wallets SET secret=?').run('broken secret'),f=>f.db.prepare('UPDATE agent_wallets SET secret=?').run(f.store.seal(f.other.secretKey,'trading:'+f.agent.id))]){
  await t.test(change.toString(),async sub=>{const f=await fixture(sub);change(f);const result=await f.prepare('withdrawal');assert.equal(result.status,409);assert.match(result.data.error,/custody/);assert.equal(f.control.sends,0);});
 }
});
test('custody failure after review never broadcasts or leaks key errors',async t=>{const f=await fixture(t),r=(await f.prepare('withdrawal')).data;f.store.unseal=()=>{throw Error('PRIVATE SECRET DATA');};const result=await f.submit(r);assert.equal(result.data.status,'FAILED');assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(f.control.sends,0);});
test('mutated signed funding and extra instructions are rejected',async t=>{
 const f=await fixture(t),r=(await f.prepare()).data;
 for(const mutate of [tx=>tx.instructions.at(-1).data.writeBigUInt64LE(1n,4),tx=>tx.instructions.at(-1).keys[1].pubkey=f.other.publicKey,tx=>tx.add(SystemProgram.transfer({fromPubkey:f.owner.publicKey,toPubkey:f.other.publicKey,lamports:1}))]){
  const tx=Transaction.from(Buffer.from(r.transaction,'base64'));mutate(tx);tx.sign(f.owner);assert.throws(()=>inspectTransfer(tx,r.source,r.destination,r.amountLamports));assert.equal((await f.call('funding/submit',{id:r.id,signedTransaction:tx.serialize().toString('base64')})).status,409);
 }assert.equal(f.control.sends,0);
});
test('balance RPC failure is unavailable not zero; flags and Live locked',async t=>{
 const f=await fixture(t);f.control.balance=null;let state=(await f.call('wallet')).data;assert.equal(state.balanceLamports,null);assert.equal(state.balanceStatus,'UNAVAILABLE');
 f.control.balance=0;state=(await f.call('wallet')).data;assert.equal(state.balanceLamports,0);assert.equal(state.balanceStatus,'AVAILABLE');
 f.control.fund=false;f.control.withdraw=false;assert.equal((await f.prepare()).status,409);assert.equal((await f.prepare('withdrawal')).status,409);
 assert.equal(runtime({}).fundingEnabled,false);assert.equal(runtime({}).withdrawalEnabled,false);assert.equal(runtime({}).liveEnabled,false);assert.equal(runtime({}).killSwitch,true);assert.throws(()=>runtime({LIVE_TRADING_ENABLED:'true'}));await assert.rejects(executeLive(),/LOCKED/);
});
test('unsigned cancellation and expiry release only unsigned reservations',async t=>{
 const f=await fixture(t),r=(await f.prepare('withdrawal')).data;assert.equal((await f.call('withdrawal/'+r.id+'/cancel',{})).data.status,'FAILED');assert.equal((await f.submit(r)).data.status,'FAILED');assert.equal(f.control.sends,0);
 const second=(await f.prepare('withdrawal')).data;f.control.now+=120001;assert.equal((await f.prepare('withdrawal')).status,200);assert.equal((await f.call('withdrawal/'+second.id)).data.status,'FAILED');
});
