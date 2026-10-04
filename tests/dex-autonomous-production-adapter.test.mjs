import test from 'node:test';
import {fixtureGeneralTarget} from './dex-target-authority-fixture.mjs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import bs58 from 'bs58';
import {snapshot,captured,tokenInfo} from './cpmm-envelope-fixture.mjs';
import {createDexLedger} from '../server/dex/ledger.js';
import {createAutonomousClaim} from '../server/dex/autonomous-claim.js';
import {createAutonomousExecutionPort} from '../server/dex/autonomous-execution-port.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {fixtureMarket,fixtureProvenance} from './market-provenance-fixture.mjs';

const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1));
const wallet=signer.publicKey.toBase58(),fixed=1_800_000_000_000;
test('acceptance mode cannot inherit generic Controlled Real or Live custody authority',async()=>{
 const adapter=createCpmmProductionAdapter({connection:{},db:{},store:{},allowValueMovement:true,autonomousClaim:{assertSigningClaim(){throw Error('LIVE_CLAIM_REACHED');},assertBroadcastClaim(){throw Error('LIVE_CLAIM_REACHED');}}});
 const record={intent:{mode:'AUTONOMOUS_ACCEPTANCE_TEST'}};
 await assert.rejects(adapter.signExactMessage(record,{}),/CPMM_ACCEPTANCE_CLAIM_UNAVAILABLE/);
 await assert.rejects(adapter.broadcastOnce('',{maxRetries:0,skipPreflight:false},record),/CPMM_ACCEPTANCE_CLAIM_UNAVAILABLE/);
});
test('real CPMM production adapter accepts only durable autonomous claim; fixture RPC yields finalized BUY and SELL',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL)');db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('agent',wallet,'fixture-sealed');
 const ledger=createDexLedger(db),state={balance:6995000,tokenBalance:'0',sent:new Map(),sendCount:0,fee:5000};
 const accounts=new Map(snapshot.accounts.map(a=>[a.address,a]));
 const info=a=>a?{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),lamports:a.lamports,executable:a.executable}:null;
 const usdcAta=getAssociatedTokenAddressSync(new PublicKey(CONTROLLED_USDC_MINT),signer.publicKey).toBase58();
 const connection={
  getGenesisHash:async()=>snapshot.genesis,
  getAccountInfoAndContext:async()=>({context:{slot:100},value:info(accounts.get(CONTROLLED_CPMM_POOL))}),
  getMultipleAccountsInfoAndContext:async keys=>({context:{slot:101},value:keys.map(k=>{const a=k.toBase58();return a===wallet?{owner:PublicKey.default,data:Buffer.alloc(0),lamports:state.balance,executable:false}:a===usdcAta&&state.tokenBalance!=='0'?info(tokenInfo(CONTROLLED_USDC_MINT,wallet,state.tokenBalance)):info(accounts.get(a));})}),
  getMinimumBalanceForRentExemption:async()=>captured.ataRentLamports,
  getLatestBlockhashAndContext:async()=>({context:{slot:102},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}}),
  getBlockHeight:async()=>100,getFeeForMessage:async()=>({value:state.fee}),
  simulateTransaction:async()=>({context:{slot:103},value:{err:null,unitsConsumed:64027}}),
  sendRawTransaction:async bytes=>{state.sendCount++;const tx=VersionedTransaction.deserialize(bytes),sig=bs58.encode(tx.signatures[0]);state.sent.set(sig,Buffer.from(bytes).toString('base64'));return sig;},
  getSignatureStatuses:async()=>({value:[{confirmationStatus:'finalized',slot:104}]}),
  getTransaction:async sig=>{
   const encoded=state.sent.get(sig),r=ledger.list('agent').find(x=>x.signature===sig);assert.ok(encoded&&r);
   const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),keys=tx.message.getAccountKeys(),addresses=Array.from({length:keys.length},(_,i)=>keys.get(i).toBase58());
   const before=addresses.map(()=>0),after=[...before],target=addresses.indexOf(usdcAta),mint=CONTROLLED_USDC_MINT,programId=TOKEN_PROGRAM_ID.toBase58();assert.ok(target>0);
   before[0]=state.balance;const amount=BigInt(r.intent.inputAmount),output=BigInt(r.quote.estimatedOutput),fee=BigInt(state.fee),rent=r.intent.direction==='BUY'&&state.tokenBalance==='0'?BigInt(captured.ataRentLamports):0n;
   after[0]=Number(BigInt(before[0])+(r.intent.direction==='BUY'?-amount-fee-rent:output-fee));before[target]=r.intent.direction==='BUY'?0:captured.ataRentLamports;after[target]=captured.ataRentLamports;
   const token=(n)=>({accountIndex:target,mint,owner:wallet,programId,uiTokenAmount:{amount:String(n)}});
   const preTokenBalances=r.intent.direction==='BUY'?[]:[token(amount)],postTokenBalances=[token(r.intent.direction==='BUY'?output:0n)];
   return {slot:104,transaction:{message:tx.message,signatures:[sig]},meta:{err:null,fee:state.fee,preBalances:before,postBalances:after,preTokenBalances,postTokenBalances}};
  }
 };
 const flags=()=>({liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:false});
 const claim=createAutonomousClaim({db,ledger,flags});
 const adapter=createCpmmProductionAdapter({connection,db,store:{unseal:()=>Uint8Array.from(signer.secretKey)},autonomousClaim:claim,assertNetwork:async()=>assert.equal(await connection.getGenesisHash(),snapshot.genesis),now:()=>fixed});
 const port=createAutonomousExecutionPort({ledger,adapter,assertTarget:fixtureGeneralTarget({id:'agent',creator:'owner'}),flags,network:{verify:async()=>({network:'solana:mainnet',verified:true})},now:()=>fixed});
 const agent={agentId:'agent',owner:'owner',agentWallet:wallet,mode:'LIVE_AUTONOMOUS',enabled:true,paused:false,vaultVerified:true};
 const execute=async(direction,inputAmount,requestKey)=>{const marketQuote=fixtureMarket(fixed),provenance=direction==='BUY'?await fixtureProvenance(marketQuote,wallet,fixed):null;const intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:'agent',owner:'owner',agentWallet:wallet,direction,inputMint:direction==='BUY'?SOL_MINT:CONTROLLED_USDC_MINT,outputMint:direction==='BUY'?CONTROLLED_USDC_MINT:SOL_MINT,inputAmount,slippageBps:100,pool:CONTROLLED_CPMM_POOL,marketBinding:provenance?.binding,requestKey,strategyVersion:0};return port.execute({agent,intent,venue:{kind:'RAYDIUM_CPMM',pool:CONTROLLED_CPMM_POOL},risk:{allowed:true},marketQuote,ledgerState:{openPositions:direction==='BUY'?0:1,positionQuantity:inputAmount,unknown:false,unresolved:false,reservationConflict:false,consecutiveFailures:0,pausedByBreaker:false,cooldownUntil:0,dailyTurnoverLamports:'0'}});};
 const buy=await execute('BUY','100000','adapter-real-buy-fixture');assert.equal(buy.status,'CONFIRMED');assert.equal(state.sendCount,1);
 const held=ledger.position('agent',CONTROLLED_USDC_MINT);assert.equal(held.quantity,buy.receipt.actualOutput);state.tokenBalance=held.quantity;state.balance+=Number(BigInt(buy.receipt.agentSolDelta));
 const sell=await execute('SELL',held.quantity,'adapter-real-sell-fixture');assert.equal(sell.status,'CONFIRMED');assert.equal(state.sendCount,2);assert.equal(ledger.position('agent',CONTROLLED_USDC_MINT).quantity,'0');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dex_autonomous_sign_claim').get().n,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM dex_autonomous_broadcast_claim').get().n,2);
});
