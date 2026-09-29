import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import bs58 from 'bs58';
import {snapshot,captured,tokenInfo} from './cpmm-envelope-fixture.mjs';
import {fixtureMarket,fixtureProvenance} from './market-provenance-fixture.mjs';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {ENGINE_ACCEPTANCE} from '../server/dex/autonomous-acceptance.js';
import {installControlledDex} from '../server/dex/routes.js';
import {createAutonomousClaim} from '../server/dex/autonomous-claim.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {createAutonomousExecutionPort} from '../server/dex/autonomous-execution-port.js';
import {createAutonomousAcceptanceWorker} from '../server/dex/autonomous-acceptance-worker.js';

test('production owner route to worker, port, custody claims, chain receipts, position and auto-disarm',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1)),wallet=signer.publicKey.toBase58();
 const C={...ENGINE_ACCEPTANCE,agentId:'fixture-agent',owner:'fixture-owner',agentWallet:wallet,tokenMint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL};
 const S={time:1_800_000_000_000,sol:6995000,token:'0',signs:0,sends:0,sent:new Map()};
 const accounts=new Map(snapshot.accounts.map(a=>[a.address,a]));
 const info=a=>a?{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),lamports:a.lamports,executable:a.executable}:null;
 const ata=getAssociatedTokenAddressSync(new PublicKey(C.tokenMint),signer.publicKey).toBase58();
 db.exec('CREATE TABLE agents(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL)');
 db.prepare('INSERT INTO agents VALUES(?,?,?)').run(C.agentId,C.owner,JSON.stringify({id:C.agentId,name:'Fixture',tradingWallet:wallet,strategy:'momentum'}));
 db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(C.agentId,wallet,'sealed-fixture');
 const connection={
  getGenesisHash:async()=>snapshot.genesis,getBalance:async()=>S.sol,
  getAccountInfoAndContext:async()=>({context:{slot:100},value:info(accounts.get(C.pool))}),
  getMultipleAccountsInfoAndContext:async keys=>({context:{slot:101},value:keys.map(k=>{const a=k.toBase58();return a===wallet?{owner:PublicKey.default,data:Buffer.alloc(0),lamports:S.sol,executable:false}:a===ata&&S.token!=='0'?info(tokenInfo(C.tokenMint,wallet,S.token)):info(accounts.get(a));})}),
  getMinimumBalanceForRentExemption:async()=>captured.ataRentLamports,
  getLatestBlockhashAndContext:async()=>({context:{slot:102},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}}),
  getBlockHeight:async()=>100,getFeeForMessage:async()=>({value:5000}),
  simulateTransaction:async()=>({context:{slot:103},value:{err:null,unitsConsumed:64027}}),
  sendRawTransaction:async bytes=>{S.sends++;const tx=VersionedTransaction.deserialize(bytes),sig=bs58.encode(tx.signatures[0]);S.sent.set(sig,Buffer.from(bytes).toString('base64'));return sig;},
  getSignatureStatuses:async()=>({value:[{confirmationStatus:'finalized',slot:104}]}),
  getTransaction:async sig=>{
   const encoded=S.sent.get(sig),r=installed.ledger.list(C.agentId).find(x=>x.signature===sig);assert.ok(encoded&&r);
   const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),keys=tx.message.getAccountKeys(),addresses=Array.from({length:keys.length},(_,i)=>keys.get(i).toBase58());
   const before=addresses.map(()=>0),after=[...before],target=addresses.indexOf(ata);assert.ok(target>0);
   before[0]=S.sol;const input=BigInt(r.intent.inputAmount),output=BigInt(r.quote.estimatedOutput),rent=r.intent.direction==='BUY'&&S.token==='0'?BigInt(captured.ataRentLamports):0n;
   after[0]=Number(BigInt(before[0])+(r.intent.direction==='BUY'?-input-5000n-rent:output-5000n-rent));before[target]=r.intent.direction==='BUY'?0:captured.ataRentLamports;after[target]=captured.ataRentLamports;
   const token=n=>({accountIndex:target,mint:C.tokenMint,owner:wallet,programId:TOKEN_PROGRAM_ID.toBase58(),uiTokenAmount:{amount:String(n)}});
   return {slot:104,transaction:{message:tx.message,signatures:[sig]},meta:{err:null,fee:5000,preBalances:before,postBalances:after,preTokenBalances:r.intent.direction==='BUY'?[]:[token(input)],postTokenBalances:[token(r.intent.direction==='BUY'?output:0n)]}};
  }
 };
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(req.headers['x-owner']!==C.owner)return res.sendStatus(401);req.session={address:C.owner};next();};
 const installed=installControlledDex(app,{db,auth,sessionValid:req=>req.headers['x-owner']===C.owner,owned:req=>({agent:{id:req.params.id,tradingWallet:wallet}}),store:{unseal:()=>Uint8Array.from(signer.secretKey)},realMoney:{connection,productionRpcConfigured:true,verify:async()=>({networkConsistent:true})},acceptanceCandidate:C,now:()=>S.time});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const url=`http://127.0.0.1:${server.address().port}/api/agents/${C.agentId}/autonomous-acceptance`;
 const start=await fetch(url+'/start',{method:'POST',headers:{'x-owner':C.owner,'Content-Type':'application/json'},body:'{}'});assert.equal(start.status,200);const cycle=await start.json();assert.equal(cycle.status,'ARMED');
 const network={verify:async()=>({network:'solana:mainnet',verified:true})};
 const claim=createAutonomousClaim({db,ledger:installed.ledger,flags:()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true}),acceptance:installed.acceptance});
 const adapter=createCpmmProductionAdapter({connection,db,store:{unseal:()=>{S.signs++;return Uint8Array.from(signer.secretKey);}},autonomousClaim:claim,assertNetwork:async()=>assert.equal(await connection.getGenesisHash(),snapshot.genesis),now:()=>S.time});
 const agent={agentId:C.agentId,owner:C.owner,agentWallet:wallet,vaultVerified:true,strategy:'momentum',strategyConfigVersion:0};
 const port=createAutonomousExecutionPort({ledger:installed.ledger,adapter,flags:()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true}),network,currentAgent:async()=>agent,acceptance:installed.acceptance,now:()=>S.time});
 const worker=createAutonomousAcceptanceWorker({acceptance:installed.acceptance,ledger:installed.ledger,port,adapter,agentContext:async()=>agent,network,marketRead:async()=>({...fixtureMarket(S.time),volume5m:0,change5m:null,buys5m:0,sells5m:0}),resolveProvenance:args=>fixtureProvenance(args.snapshot,args.agentWallet,S.time),actualTokenBalance:async()=>S.token,now:()=>S.time});
 const buy=await worker.tick();assert.equal(buy.status,'CONFIRMED');assert.equal(installed.acceptance.read().status,'POSITION_OPEN');assert.equal(installed.acceptance.read().strategyResult.side,'HOLD');
 const entry=installed.ledger.activePosition(C.agentId);assert.equal(entry.acceptanceCycleId,cycle.cycleId);S.token=entry.quantity;S.sol+=Number(BigInt(installed.ledger.get(buy.executionId).confirmedEffects.agentSolDelta));
 S.time+=180000;const sell=await worker.tick();assert.equal(sell.status,'CONFIRMED');assert.equal(installed.acceptance.read().status,'COMPLETED');assert.equal(installed.acceptance.read().emergencyPermission,false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dex_autonomous_sign_claim').get().n,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM dex_autonomous_broadcast_claim').get().n,2);assert.equal(S.sends,2);assert.equal(installed.ledger.position(C.agentId,C.tokenMint).quantity,'0');assert.ok(installed.ledger.position(C.agentId,C.tokenMint).lastRealizedPnlLamports);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal((await worker.tick()).reason,'ACCEPTANCE_DISARMED');
});
