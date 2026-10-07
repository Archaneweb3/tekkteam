import test from 'node:test';import assert from 'node:assert/strict';
import {readBoundPumpDecision} from '../server/dex/pump-bound-decision.js';
import {pumpEntryPolicyFromAuthority} from '../server/dex/pump-entry-policy.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {digest,SOL_MINT} from '../server/dex/intent.js';
import {GENESIS} from '../src/pump-readiness.js';
import {pumpSdk} from '../server/dex/pump-sdk-boundary.js';
const at=1800000000000;
function fixture(personality='operator'){
 const binding={owner:'fixture-owner',agentId:'fixture-agent',wallet:'fixture-wallet',mint:'fixture-mint',network:'solana:101'};
 const body={id:'consent-one',revision:1,sessionId:'consent-one',...binding,launchBindingDigest:digest(binding),status:'ACTIVE',authorizationGranted:true,withdrawalEnabled:false,revoked:false,startsAt:at-1000,expiresAt:at+3600000,personality,personalityVersion:1,strategyConfig:defaultStrategyConfig(personality),venue:'PUMP_BONDING_CURVE_V1',program:pumpSdk.PUMP_PROGRAM_ID.toBase58(),actions:['BUY','SELL'],perTradeLamports:'100000',sessionDebitLamports:'500000',dailyDebitLamports:'500000',protectedReserveLamports:'2020000',networkFeeCapLamports:'10000',slippageBps:100};
 const authorization={...body,digest:digest(body)};
 return {binding,authorization,market:{mint:binding.mint,network:binding.network,source:'LOCAL_FIXTURE',snapshotId:'snapshot-one',observedAt:at,slot:100,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:10},capital:{mode:'REAL',source:'LOCAL_FIXTURE',wallet:binding.wallet,mint:binding.mint,network:binding.network,genesis:GENESIS,costsQualified:true,observedAt:at,slot:100,balanceLamports:'3000000',tokenBalance:'0',heldLamports:'0',feeCapLamports:'10000',rentCapLamports:'0',initialCapitalLamports:'3000000'},budget:{source:'RESERVATION_BUDGET',authorizationDigest:authorization.digest,observedAt:at,remainingSessionLamports:'500000',remainingDailyLamports:'500000',remainingTransactions:4,remainingDailyTransactions:4},venue:{qualified:true,kind:'PUMP_BONDING_CURVE',program:authorization.program,mint:binding.mint,source:'LOCAL_FIXTURE',address:'fixture-curve',observedAt:at},position:null,pending:[],lastTradeAt:0};
}
const read=f=>readBoundPumpDecision(f,{source:'LOCAL_FIXTURE',now:at});
test('bound signal uses actual SOL capital and exact stable preparation intent without execution',()=>{
 const f=fixture(),r=read(f);assert.equal(r.state,'PREPARE');assert.equal(r.intent.side,'BUY');assert.equal(r.intent.outputMint,f.binding.mint);assert.equal(r.intent.inputAmount,'97000');assert.equal(r.executionAllowed,false);
 assert.deepEqual(read(f),r);assert.equal(r.entryPolicy.personality,'operator');assert.equal(r.intent.expiresAt,at+5000);
 assert.equal(readBoundPumpDecision(f,{now:at}).state,'WAIT');
});
test('same valid weaker signal makes personalities differ through existing engine thresholds',()=>{
 const result={};for(const id of ['guardian','scout','operator','hunter','berserker']){const f=fixture(id);f.market.change5m=.6;f.market.volume5m=650;f.market.liquidityUsd=14000;f.market.buys5m=12;result[id]=read(f).state;}
 assert.deepEqual(result,{guardian:'WAIT',scout:'WAIT',operator:'WAIT',hunter:'PREPARE',berserker:'PREPARE'});
});
for(const key of ['foreignMint','pending','Paper','stale','missingMetric','zeroReserve','unknownCosts','rentBudget','tokenBalance','position','cooldown','revoked','count','venue','budget'])test('decision waits for '+key,()=>{
 const f=fixture();
 if(key==='foreignMint')f.market.mint='another';if(key==='pending')f.pending=[{status:'UNKNOWN'}];if(key==='Paper')f.capital.mode='paper';if(key==='stale')f.market.observedAt=at-11000;if(key==='missingMetric')delete f.market.volume5m;
 if(key==='zeroReserve')f.capital.balanceLamports='2020000';if(key==='unknownCosts')f.capital.costsQualified=false;if(key==='rentBudget')f.capital.rentCapLamports='2860040';if(key==='tokenBalance')f.capital.tokenBalance='1';if(key==='position')delete f.position;if(key==='cooldown')f.lastTradeAt=at-1;
 if(key==='revoked')f.authorization.revoked=true;if(key==='count')f.budget.remainingTransactions=0;if(key==='venue')f.venue.qualified=false;if(key==='budget')f.budget.authorizationDigest='changed';
 assert.equal(read(f).state,'WAIT');
});
test('remaining all-in budget and protected reserve bound integer BUY sizing',()=>{
 const f=fixture();f.budget.remainingDailyLamports='30000';assert.equal(read(f).intent.inputAmount,'20000');
 f.capital.heldLamports='980000';assert.equal(read(f).state,'WAIT');
});
test('SELL uses immutable entry policy and verified full-position quote; unknown entry stays WAIT',()=>{
 const f=fixture();f.capital.tokenBalance='100';f.position={agentId:f.binding.agentId,mint:f.binding.mint,source:'LOCAL_FIXTURE',mode:'REAL',quantity:'100',costBasisLamports:'100000',pool:f.venue.address,openedAt:at-1000,openingReceipt:{signature:'fixture-existing-receipt',actualChainVerified:false},entryPolicy:pumpEntryPolicyFromAuthority(f.authorization)};
 f.exitQuote={verified:true,source:'LOCAL_FIXTURE',network:'solana:mainnet',direction:'SELL',inputMint:f.binding.mint,outputMint:SOL_MINT,pool:f.venue.address,inputAmount:'100',estimatedOutput:'107000',observedAt:at};
 const r=read(f);assert.equal(r.state,'PREPARE');assert.equal(r.intent.side,'SELL');assert.equal(r.reason,'TAKE_PROFIT');assert.equal(r.intent.inputAmount,'100');
 f.exitQuote.source='BACKEND_RPC_READ';assert.equal(read(f).reason,'EXIT_QUOTE_SOURCE');f.exitQuote.source='LOCAL_FIXTURE';f.exitQuote.observedAt=at-9999;assert.equal(read(f).intent.expiresAt,at+1);
 f.position.entryPolicy.strategyConfig.position.takeProfitPercent=99;assert.equal(read(f).state,'WAIT');
 f.position.entryPolicy=null;assert.equal(read(f).reason,'POSITION_ENTRY_PROOF_REQUIRED');
});
test('frozen custom caps remain stricter than personality and grant ceilings',()=>{
 const f=fixture();const {digest:old,...a}=f.authorization;a.strategyConfig.risk.maxSolPerTrade=.00001;a.strategyConfig.execution.maxSlippageBps=25;
 f.authorization={...a,digest:digest(a)};f.budget.authorizationDigest=f.authorization.digest;
 const r=read(f);assert.equal(r.intent.inputAmount,'10000');assert.equal(r.intent.slippageBps,25);
});
