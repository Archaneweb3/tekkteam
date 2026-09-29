import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync} from '@solana/spl-token';
import bs58 from 'bs58';
import {fixture,tokenInfo,captured} from './cpmm-envelope-fixture.mjs';
import {buildCpmmEnvelope,cpmmEnvelopeContext,CPMM_ENVELOPE} from '../server/dex/cpmm-envelope.js';
import {createDexLedger} from '../server/dex/ledger.js';
import {createAutonomousClaim} from '../server/dex/autonomous-claim.js';
import {createAutonomousExecutionPort} from '../server/dex/autonomous-execution-port.js';
import {createAutonomousOrchestrator} from '../server/dex/autonomous-orchestrator.js';
import {createAutonomousScheduler} from '../server/dex/autonomous-scheduler.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {createRealBalanceReservations} from '../server/real-balance-reservations.js';
import {inspectCpmmSnapshot} from '../server/dex/concrete-cpmm-proof.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {fixtureMarket,fixtureProvenance} from './market-provenance-fixture.mjs';

const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1));
const fixed=1_800_000_000_000;
const address=signer.publicKey.toBase58();
test('production custody path cannot sign autonomous mode via controlled flag or owner latch',async()=>{
 let vault=0,broadcast=0;const adapter=createCpmmProductionAdapter({connection:{sendRawTransaction:async()=>{broadcast++;}},db:{prepare(){vault++;throw Error('vault reached');}},store:{unseal(){vault++;throw Error('secret reached');}},allowValueMovement:true});
 const r={intent:{mode:'LIVE_AUTONOMOUS'}};
 await assert.rejects(adapter.signExactMessage(r,{}),/CPMM_AUTONOMOUS_DISARMED/);
 await assert.rejects(adapter.broadcastOnce('',{maxRetries:0,skipPreflight:false},r),/CPMM_AUTONOMOUS_DISARMED/);
 assert.equal(vault,0);assert.equal(broadcast,0);
});
function harness(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const ledger=createDexLedger(db);
 const state={now:fixed,height:100,signs:0,sends:0,simulations:0,finalized:true,failBuild:false,failSimulation:false,failBroadcast:false,invalidSignature:false,onChainError:false,reconciliationMismatch:false,mutateTransaction:false,networkVerified:true,sent:new Map(),tokenBalance:'0',sellReserveFactor:1,flags:{liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:false}};
 const claim=createAutonomousClaim({db,ledger,flags:()=>state.flags});
 const policy=intent=>{const p=fixture(intent.direction);p.intent={...intent};p.agentBalanceLamports='6995000';p.agentAccounts=[SOL_MINT,CONTROLLED_USDC_MINT].map(mint=>({address:getAssociatedTokenAddressSync(new PublicKey(mint),signer.publicKey).toBase58(),info:mint===CONTROLLED_USDC_MINT&&state.tokenBalance!=='0'?tokenInfo(mint,address,state.tokenBalance):null}));if(intent.direction==='SELL'&&state.sellReserveFactor!==1){const pool=inspectCpmmSnapshot(p.snapshot),vault=p.snapshot.accounts.find(a=>a.address===pool.vault0),bytes=Buffer.from(vault.data,'base64');bytes.writeBigUInt64LE(BigInt(Math.floor(Number(bytes.readBigUInt64LE(64))*state.sellReserveFactor)),64);vault.data=bytes.toString('base64');}return p;};
 const snapshot=(intent,p,fee)=>{const c=cpmmEnvelopeContext(p);return {network:'solana:mainnet',agentWallet:address,inputMint:intent.inputMint,outputMint:intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.agentBalanceLamports,networkFeeLamports:String(fee),ataRentLamports:c.rentCost.toString(),netRentLamports:(c.buy&&state.tokenBalance==='0'?String(captured.ataRentLamports):'0'),ataExists:c.rentCost===0n,inputTokenBalance:state.tokenBalance,observedAt:state.now};};
 const adapter={kind:'CPMM_CLASSIC_WSOL_USDC_V1',autonomousCustodyBound:true,
  async assertCustody(i){assert.equal(i.agentWallet,address);},
  async quote(i){const p=policy(i),q=cpmmEnvelopeContext(p).q;return {provider:'LOCAL_RAYDIUM_CPMM',pool:CONTROLLED_CPMM_POOL,inputMint:i.inputMint,outputMint:i.outputMint,inputAmount:i.inputAmount,slippageBps:i.slippageBps,estimatedOutput:q.output.toString(),minimumOutput:q.minimumOutput.toString(),reference:'fixture-quote',createdAt:state.now,expiresAt:state.now+25000};},
  async reservePlan(r){const p=policy(r.intent);return {collected:{policy:p},snapshot:snapshot(r.intent,p,10000)};},
  async buildReserved(r,pre){if(state.failBuild)throw Object.assign(Error('BUILD_REJECTED'),{code:'BUILD_REJECTED'});const p=pre.collected.policy;return {transaction:buildCpmmEnvelope(state.mutateTransaction?{...p,blockhash:Keypair.generate().publicKey.toBase58()}:p),blockhash:p.blockhash,lastValidBlockHeight:200,validationPolicy:p,stateDigest:'fixture-state',snapshotSlot:101,pool:CONTROLLED_CPMM_POOL,routePolicyVersion:CPMM_ENVELOPE};},
  async snapshot(r){return snapshot(r.intent,r.validationPolicy,5000);},
  async validationPolicy(r){return r.validationPolicy;},
  async blockHeight(){return state.height;},
  async simulateUnsigned(_r,decoded){state.simulations++;return {success:!state.failSimulation,messageHash:decoded.messageHash,slot:103,unitsConsumed:64027};},
  async signExactMessage(r,decoded){claim.assertSigningClaim(r);state.signs++;const tx=decoded.transaction;tx.sign([signer]);if(state.invalidSignature)tx.signatures[0][0]^=1;return Buffer.from(tx.serialize()).toString('base64');},
  async broadcastOnce(encoded,options,r){claim.assertBroadcastClaim(r);assert.deepEqual(options,{maxRetries:0,skipPreflight:false});state.sends++;const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),signature=bs58.encode(tx.signatures[0]);state.sent.set(signature,encoded);if(state.failBroadcast)throw Error('transport uncertain');return signature;},
  async readFinalized(signature,r){if(!state.finalized)return null;return {signature:state.reconciliationMismatch?'wrong-signature':signature,finalized:true,slot:123,error:state.onChainError?{InstructionError:[2,'Custom']}:null,transaction:state.sent.get(signature),networkFeeLamports:'5000'};},
  async verifiedEffects(r){const p=r.validationPolicy,q=cpmmEnvelopeContext(p).q,input=BigInt(r.intent.inputAmount),output=q.output,fee=5000n,rent=r.intent.direction==='BUY'&&state.tokenBalance==='0'?BigInt(captured.ataRentLamports):0n;return {actualInput:input.toString(),actualOutput:output.toString(),networkFeeLamports:fee.toString(),rentLamports:rent.toString(),agentSolDelta:(r.intent.direction==='BUY'?-input-fee-rent:output-fee-rent).toString(),agentTokenDelta:(r.intent.direction==='BUY'?output:-input).toString()};}
 };
 const port=createAutonomousExecutionPort({ledger,adapter,flags:()=>state.flags,network:{verify:async()=>({network:'solana:mainnet',verified:state.networkVerified})},now:()=>state.now});
 const agent={agentId:'agent',owner:'owner',agentWallet:address,mode:'LIVE_AUTONOMOUS',enabled:true,paused:false,vaultVerified:true,strategy:'momentum'};
 const ledgerState=(direction,quantity='0')=>({openPositions:direction==='BUY'?0:1,positionQuantity:quantity,unknown:false,unresolved:false,reservationConflict:false,consecutiveFailures:0,pausedByBreaker:false,cooldownUntil:0,dailyTurnoverLamports:'0'});
 const run=async(direction,amount,key)=>{const marketQuote=fixtureMarket(state.now),provenance=direction==='BUY'?await fixtureProvenance(marketQuote,address,state.now):null;const intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:'agent',owner:'owner',agentWallet:address,direction,inputMint:direction==='BUY'?SOL_MINT:CONTROLLED_USDC_MINT,outputMint:direction==='BUY'?CONTROLLED_USDC_MINT:SOL_MINT,inputAmount:amount,slippageBps:100,pool:CONTROLLED_CPMM_POOL,marketBinding:provenance?.binding,requestKey:key,strategyVersion:0};return port.execute({agent,intent,venue:{kind:'RAYDIUM_CPMM',pool:CONTROLLED_CPMM_POOL,tokenMint:CONTROLLED_USDC_MINT},risk:{allowed:true},marketQuote,ledgerState:ledgerState(direction,amount)});};
 return {db,ledger,state,adapter,port,agent,run};
}

test('production port stages reserve/build/full CPMM validation/simulation before one fixture sign and send',async t=>{
 const f=harness(t),buy=await f.run('BUY','100000','autonomous-buy-key-000001');
 assert.equal(buy.status,'CONFIRMED');assert.equal(f.state.signs,1);assert.equal(f.state.sends,1);assert.equal(f.state.simulations,1);
 assert.equal(f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity,buy.quote.estimatedOutput);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 const again=await f.run('BUY','100000','autonomous-buy-key-000001');assert.equal(again.id,buy.id);assert.equal(f.state.signs,1);assert.equal(f.state.sends,1);
});
test('pre-sign build and simulation failures release reservation; kill switch prevents signing',async t=>{
 const f=harness(t);f.state.failBuild=true;await assert.rejects(f.run('BUY','100000','autonomous-buy-key-fail-build'),/BUILD_REJECTED/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal(f.state.signs,0);
 f.state.failBuild=false;f.state.failSimulation=true;await assert.rejects(f.run('BUY','100000','autonomous-buy-key-fail-simulation'),/UNSIGNED_SIMULATION_FAILED/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 f.state.failSimulation=false;f.state.flags.autonomousKillSwitch=true;await assert.rejects(f.run('BUY','100000','autonomous-buy-key-killed'),/AUTONOMOUS_TRADING_STOP/);assert.equal(f.state.signs,0);
});
test('same port confirms SELL from actual held quantity and closes real position with on-chain-derived PnL',async t=>{
 const f=harness(t),buy=await f.run('BUY','100000','autonomous-buy-key-roundtrip');
 const quantity=f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity;f.state.tokenBalance=quantity;
 const sell=await f.run('SELL',quantity,'autonomous-sell-key-roundtrip');
 assert.equal(sell.status,'CONFIRMED');assert.equal(f.state.signs,2);assert.equal(f.state.sends,2);
 const p=f.ledger.position('agent',CONTROLLED_USDC_MINT);
 assert.equal(p.quantity,'0');assert.equal(p.costBasisLamports,'0');assert.equal(p.realizedPnlLamports,(BigInt(sell.confirmedEffects.agentSolDelta)-105000n).toString());
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_receipts').get().n,2);
});
test('invalid signature fails before send; unknown broadcast holds the same execution and reservation',async t=>{
 const invalid=harness(t);invalid.state.invalidSignature=true;await assert.rejects(invalid.run('BUY','100000','autonomous-invalid-signature'),/INVALID_SIGNATURE/);assert.equal(invalid.state.signs,1);assert.equal(invalid.state.sends,0);assert.equal(invalid.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 const unknown=harness(t);unknown.state.failBroadcast=true;const first=await unknown.run('BUY','100000','autonomous-unknown-broadcast');assert.equal(first.status,'UNKNOWN');assert.equal(unknown.state.signs,1);assert.equal(unknown.state.sends,1);assert.equal(unknown.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
 const repeat=await unknown.run('BUY','100000','autonomous-unknown-broadcast');assert.equal(repeat.id,first.id);assert.equal(unknown.state.signs,1);assert.equal(unknown.state.sends,1);
});
test('disabled network, vault and on-chain failure remain fail-closed',async t=>{
 const f=harness(t);f.state.networkVerified=false;await assert.rejects(f.run('BUY','100000','autonomous-wrong-network'),/MAINNET_NOT_VERIFIED/);assert.equal(f.state.signs,0);
 f.state.networkVerified=true;f.agent.vaultVerified=false;await assert.rejects(f.run('BUY','100000','autonomous-wrong-vault'),/VAULT_OR_OWNERSHIP_UNVERIFIED/);f.agent.vaultVerified=true;
 f.state.onChainError=true;const failed=await f.run('BUY','100000','autonomous-onchain-fail');assert.equal(failed.status,'FAILED');assert.equal(f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity,'0');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
});
test('reservation conflict, validator mutation and reconciliation mismatch never produce a second spend',async t=>{
 const conflict=harness(t),reserved=createRealBalanceReservations(conflict.db);reserved.reserve({operationId:'other:hold',intentHash:'other-intent',status:'PREPARED',resources:[{wallet:address,lamports:'1'}]});
 await assert.rejects(conflict.run('BUY','100000','autonomous-reservation-conflict'),/REAL_BALANCE_RESERVED/);assert.equal(conflict.state.signs,0);assert.equal(conflict.ledger.list('agent')[0].status,'REJECTED_BEFORE_SIGNING');
 const mutation=harness(t);mutation.state.mutateTransaction=true;await assert.rejects(mutation.run('BUY','100000','autonomous-mutated-message'),/BLOCKHASH_MISMATCH/);assert.equal(mutation.state.signs,0);assert.equal(mutation.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 const mismatch=harness(t);mismatch.state.reconciliationMismatch=true;const r=await mismatch.run('BUY','100000','autonomous-rpc-mismatch');assert.equal(r.status,'UNKNOWN');assert.equal(mismatch.state.signs,1);assert.equal(mismatch.state.sends,1);assert.equal(mismatch.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
});
test('scheduler restart reconciles the same submitted production execution before any new decision',async t=>{
 const f=harness(t);f.state.finalized=false;
 let decisions=0;const dependencies={orchestrator:{async tick(){decisions++;return {action:'BUY'};}},executions:{list:id=>f.ledger.list(id)},executionPort:f.port,flags:()=>f.state.flags,network:{verify:async()=>({network:'solana:mainnet',verified:true})},vault:{verify:async()=>true},now:()=>f.state.now};
 const before=createAutonomousScheduler(f.db,dependencies);await before.ownerStart('agent');
 const pending=await f.run('BUY','100000','autonomous-restart-key-0001');assert.equal(pending.status,'SUBMITTED');
 const after=createAutonomousScheduler(f.db,dependencies);assert.equal(after.read('agent').paused,true);
 f.state.finalized=true;const reconciled=await after.tickOne('agent');
 assert.equal(reconciled.action,'RECONCILE');assert.equal(reconciled.executionId,pending.id);assert.equal(reconciled.status,'CONFIRMED');
 assert.equal(decisions,0);assert.equal(f.state.signs,1);assert.equal(f.state.sends,1);
 assert.equal((await after.tickOne('agent')).reason,'AGENT_NOT_LIVE');
});
test('production SELL pre-sign rejection, finalized failure and UNKNOWN preserve the held Real Position',async t=>{
 for(const outcome of ['PRE_SIGN','ON_CHAIN_FAILED','UNKNOWN']){
  const f=harness(t);await f.run('BUY','100000',`sell-matrix-buy-${outcome}`);
  const quantity=f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity;f.state.tokenBalance=quantity;
  if(outcome==='PRE_SIGN')f.state.failBuild=true;
  if(outcome==='ON_CHAIN_FAILED')f.state.onChainError=true;
  if(outcome==='UNKNOWN')f.state.failBroadcast=true;
  let result;
  if(outcome==='PRE_SIGN')await assert.rejects(f.run('SELL',quantity,'sell-matrix-pre-sign'),/BUILD_REJECTED/);
  else result=await f.run('SELL',quantity,`sell-matrix-${outcome}`);
  assert.equal(f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity,quantity);
  if(outcome==='PRE_SIGN')assert.equal(f.state.sends,1);
  if(outcome==='ON_CHAIN_FAILED')assert.equal(result.status,'FAILED');
  if(outcome==='UNKNOWN'){assert.equal(result.status,'UNKNOWN');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);}
 }
});

test('restart with an open Real Position monitors it and cannot open a second BUY',async t=>{
 const f=harness(t);await f.run('BUY','100000','restart-open-position-buy');
 const quantity=f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity;f.state.tokenBalance=quantity;
 const q=fixtureMarket(f.state.now,'after-restart');
 let discoveryCalls=0;const o=createAutonomousOrchestrator({discovery:{scan:async()=>{discoveryCalls++;return {status:'OK',candidates:[{mint:CONTROLLED_USDC_MINT,quote:q}]};}},market:{sellQuote:async p=>({verified:true,network:'solana:mainnet',direction:'SELL',inputMint:p.mint,outputMint:SOL_MINT,pool:p.pool,inputAmount:p.quantity,estimatedOutput:'101000',observedAt:f.state.now})},positions:{read:id=>f.ledger.position(id,CONTROLLED_USDC_MINT),actualTokenBalance:async()=>quantity,riskState:async()=>({unknown:false,unresolved:false,reservationConflict:false,cooldownUntil:0,dailyTurnoverLamports:'0'})},executions:{list:id=>f.ledger.list(id)},health:{read:()=>({consecutiveFailures:0,pausedByBreaker:false}),failure:()=>{},confirmed:()=>{},pause:()=>{}},executionPort:f.port,network:{verify:async()=>({network:'solana:mainnet',verified:true})},agentContext:async()=>f.agent,flags:()=>f.state.flags,risk:{evaluate:async()=>({allowed:true})},resolveProvenance:args=>fixtureProvenance(args.snapshot,args.agentWallet,f.state.now),now:()=>f.state.now});
 const deps={orchestrator:o,executions:{list:id=>f.ledger.list(id)},executionPort:f.port,flags:()=>f.state.flags,network:{verify:async()=>({network:'solana:mainnet',verified:true})},vault:{verify:async()=>true},now:()=>f.state.now};
 const before=createAutonomousScheduler(f.db,deps);await before.ownerStart('agent');const after=createAutonomousScheduler(f.db,deps);await after.ownerResume('agent');
 const result=await after.tickOne('agent');assert.equal(result.action,'WAIT');assert.equal(discoveryCalls,0);assert.equal(f.state.signs,1);assert.equal(f.state.sends,1);
});
for(const [name,factor,openedAtOffset] of [['TAKE_PROFIT',1.4,0],['STOP_LOSS',0.6,0],['MAX_HOLD',1,900001]])test(`discovery to confirmed BUY, ${name}, same production port SELL and realized result`,async t=>{
 const f=harness(t);const originalNow=f.state.now;
 const q=fixtureMarket(originalNow,'market-1');
 const o=createAutonomousOrchestrator({discovery:{scan:async()=>({status:'OK',candidates:[{mint:CONTROLLED_USDC_MINT,quote:q}]})},market:{sellQuote:async p=>{const i={network:'solana:mainnet',direction:'SELL',agentWallet:address,inputMint:p.mint,outputMint:SOL_MINT,inputAmount:p.quantity,slippageBps:100};const out=await f.adapter.quote(i);return {verified:true,network:'solana:mainnet',direction:'SELL',inputMint:p.mint,outputMint:SOL_MINT,pool:p.pool,inputAmount:p.quantity,estimatedOutput:out.estimatedOutput,observedAt:f.state.now};}},positions:{read:id=>{const p=f.ledger.position(id,CONTROLLED_USDC_MINT);return BigInt(p.quantity)>0n?p:null;},actualTokenBalance:async()=>f.state.tokenBalance,riskState:async()=>({unknown:false,unresolved:false,reservationConflict:false,cooldownUntil:0,dailyTurnoverLamports:'0'})},executions:{list:id=>f.ledger.list(id)},health:{read:()=>({consecutiveFailures:0,pausedByBreaker:false}),failure:()=>{},confirmed:()=>{},pause:()=>{}},executionPort:f.port,network:{verify:async()=>({network:'solana:mainnet',verified:true})},agentContext:async()=>f.agent,flags:()=>f.state.flags,risk:{evaluate:async()=>({allowed:true})},resolveProvenance:args=>fixtureProvenance(args.snapshot,args.agentWallet,f.state.now),now:()=>f.state.now});
 const scheduler=createAutonomousScheduler(f.db,{orchestrator:o,executions:{list:id=>f.ledger.list(id)},executionPort:f.port,flags:()=>f.state.flags,network:{verify:async()=>({network:'solana:mainnet',verified:true})},vault:{verify:async()=>true},now:()=>f.state.now});
 await scheduler.ownerStart('agent');
 const buy=await scheduler.tickOne('agent');assert.equal(buy.status,'CONFIRMED',JSON.stringify(buy));const held=f.ledger.position('agent',CONTROLLED_USDC_MINT);assert.ok(BigInt(held.quantity)>0n);f.state.tokenBalance=held.quantity;f.state.sellReserveFactor=factor;
 if(openedAtOffset){f.state.now+=openedAtOffset;q.observedAt=f.state.now-1000;}
 const sell=await scheduler.tickOne('agent');assert.equal(sell.status,'CONFIRMED');assert.equal(f.ledger.position('agent',CONTROLLED_USDC_MINT).quantity,'0');assert.equal(f.state.signs,2);assert.equal(f.state.sends,2);
 const pnl=BigInt(f.ledger.position('agent',CONTROLLED_USDC_MINT).realizedPnlLamports);if(name==='TAKE_PROFIT')assert.ok(pnl>0n);if(name==='STOP_LOSS')assert.ok(pnl<0n);
});
