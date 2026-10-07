import {strategyIntent} from '../paper-engine.js';
import {personalitySizeLamports, PERSONALITY_VERSION} from '../../public/app/agent-personalities.js';
import {validateStrategyConfig} from '../../public/app/strategy-config.js';
import {markRealPosition,decideRealExit,AUTONOMOUS_V1} from './autonomous-v1.js';
import {digest,integer,SOL_MINT,DEFAULT_RISK_POLICY} from './intent.js';
import {GENESIS} from '../../src/pump-readiness.js';
import {pumpSdk} from './pump-sdk-boundary.js';
import {pumpEntryPolicyFromAuthority} from './pump-entry-policy.js';

const wait=reason=>({state:'WAIT',reason,executionAllowed:false});
const fresh=(record,now,age)=>Number.isSafeInteger(record?.observedAt)&&record.observedAt<=now&&now-record.observedAt<=age;
const amount=x=>integer(x,{zero:true});
const min=(...values)=>values.reduce((a,b)=>a<b?a:b);
const validDigest=value=>{if(!value)return false;const {digest:hash,...body}=value;return digest(body)===hash;};
const requiredReserve=BigInt(DEFAULT_RISK_POLICY.minReserveLamports)+BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports)+BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports);

// Pure server-input decision only. Reuses the shared signal and Real exit
// functions, never Paper accounting/fills or the CPMM universe scanner.
export function readBoundPumpDecision(input,{source='BACKEND_RPC_READ',now=Date.now()}={}) {
  try {
    if(!['BACKEND_RPC_READ','LOCAL_FIXTURE'].includes(source)||!Number.isSafeInteger(now)||now<0)return wait('DECISION_CONTEXT_INVALID');
    const {binding,authorization:a,market,capital,budget,venue,position,exitQuote,pending,lastTradeAt}=structuredClone(input);
    if(!Array.isArray(pending)||pending.length)return wait('PENDING_EXECUTION');
    if(!binding||!validDigest(a)||a.status!=='ACTIVE'||a.authorizationGranted!==true||a.withdrawalEnabled!==false||a.revoked!==false||a.network!=='solana:101'||a.launchBindingDigest!==digest(binding)||['owner','agentId','wallet','mint','network'].some(k=>a[k]!==binding[k]))return wait('OWNER_CONSENT_UNAVAILABLE');
    if(!Number.isSafeInteger(a.startsAt)||!Number.isSafeInteger(a.expiresAt)||a.startsAt>now||a.expiresAt<=now||a.personalityVersion!==PERSONALITY_VERSION)return wait('OWNER_CONSENT_EXPIRED');
    const config=validateStrategyConfig(a.strategyConfig);
    if(config.strategy!==a.personality)return wait('STRATEGY_REVISION_MISMATCH');
    if(a.venue!=='PUMP_BONDING_CURVE_V1'||a.program!==pumpSdk.PUMP_PROGRAM_ID.toBase58()||digest(a.actions)!==digest(['BUY','SELL'])||venue?.qualified!==true||venue.kind!=='PUMP_BONDING_CURVE'||venue.program!==a.program||venue.mint!==binding.mint||venue.source!==source||typeof venue.address!=='string'||!venue.address||!fresh(venue,now,10000))return wait('VENUE_UNQUALIFIED');
    if(market?.mint!==binding.mint||market.network!=='solana:101'||market.source!==source||!fresh(market,now,10000)||typeof market.snapshotId!=='string'||!market.snapshotId||!Number.isSafeInteger(market.slot)||market.slot<0)return wait('MARKET_UNAVAILABLE');
    if(!['liquidityUsd','volume5m','change5m','buys5m','sells5m'].every(k=>Number.isFinite(market[k]))||market.liquidityUsd<=0||market.volume5m<0||![market.buys5m,market.sells5m].every(n=>Number.isSafeInteger(n)&&n>=0))return wait('MARKET_METRICS_UNAVAILABLE');
    if(capital?.mode!=='REAL'||capital.source!==source||capital.wallet!==binding.wallet||capital.mint!==binding.mint||capital.network!=='solana:101'||capital.genesis!==GENESIS||capital.costsQualified!==true||!fresh(capital,now,5000)||!Number.isSafeInteger(capital.slot)||capital.slot<0)return wait('REAL_CAPITAL_UNAVAILABLE');
    if(budget?.source!=='RESERVATION_BUDGET'||budget.authorizationDigest!==a.digest||!fresh(budget,now,5000)||!Number.isSafeInteger(budget.remainingTransactions)||budget.remainingTransactions<1||!Number.isSafeInteger(budget.remainingDailyTransactions)||budget.remainingDailyTransactions<1)return wait('BUDGET_UNAVAILABLE');
    const balance=amount(capital.balanceLamports),held=amount(capital.heldLamports),reserve=amount(a.protectedReserveLamports),fee=amount(capital.feeCapLamports),rent=amount(capital.rentCapLamports),cost=fee+rent;
    const dailyLimit=amount(a.dailyDebitLamports),dailyLeft=amount(budget.remainingDailyLamports),dailyUsed=dailyLimit>dailyLeft?dailyLimit-dailyLeft:0n,configDaily=BigInt(Math.floor(config.risk.maxDailySpendSol*1e9));
    const remaining=min(amount(budget.remainingSessionLamports),dailyLeft,amount(a.sessionDebitLamports),dailyLimit,configDaily>dailyUsed?configDaily-dailyUsed:0n);
    if(reserve<requiredReserve||fee>amount(a.networkFeeCapLamports)||fee>BigInt(DEFAULT_RISK_POLICY.maxNetworkFeeLamports)||a.slippageBps>100||!Number.isSafeInteger(a.slippageBps)||a.slippageBps<0)return wait('POLICY_LIMIT');
    if(balance<held+reserve+cost||remaining<cost)return wait('CAPITAL_OR_ALL_IN_BUDGET_EXHAUSTED');
    if(position===undefined||position!==null&&amount(position.quantity)>0n&&position.mode!=='REAL')return wait('POSITION_UNVERIFIED');
    let side,inputAmount,reason,identity,entryPolicy;
    if(position!==null&&amount(position.quantity)>0n){
      const p=position,entry=p.entryPolicy;
      if(p.recoveryRequired===true||p.source!==(source==='LOCAL_FIXTURE'?'LOCAL_FIXTURE':'ON_CHAIN')||p.mint!==binding.mint||p.agentId!==binding.agentId||p.pool!==venue.address||!Number.isSafeInteger(p.openedAt)||p.openedAt>now||!p.openingReceipt?.signature||p.openingReceipt.actualChainVerified!==(source==='BACKEND_RPC_READ')||!entry||entry.digest!==digest(Object.fromEntries(Object.entries(entry).filter(([k])=>k!=='digest')))||entry.launchBindingDigest!==digest(binding)||amount(capital.tokenBalance)!==amount(p.quantity))return wait('POSITION_ENTRY_PROOF_REQUIRED');
      const entryConfig=validateStrategyConfig(entry.strategyConfig);
      if(entry.personalityVersion!==PERSONALITY_VERSION||entryConfig.strategy!==entry.personality)return wait('ENTRY_POLICY_UNAVAILABLE');
      if(exitQuote?.source!==source)return wait('EXIT_QUOTE_SOURCE');
      const valuation=markRealPosition({position:p,quote:exitQuote,now});
      const decision=decideRealExit({position:p,valuation,config:{stopLossBps:Math.round(entryConfig.position.stopLossPercent*100),takeProfitBps:Math.round(entryConfig.position.takeProfitPercent*100),maxHoldMs:900000},now});
      if(decision.action!=='SELL')return wait(decision.reason);
      side='SELL';inputAmount=p.quantity;reason=decision.reason;identity={openingReceipt:p.openingReceipt,quantity:p.quantity,entryDigest:entry.digest};
    }else{
      if(amount(capital.tokenBalance)!==0n)return wait('UNTRACKED_TOKEN_BALANCE');
      if(!Number.isSafeInteger(lastTradeAt)||lastTradeAt<0||lastTradeAt>now)return wait('COOLDOWN_UNAVAILABLE');
      if(lastTradeAt>0&&now-lastTradeAt<config.execution.cooldownSeconds*1000)return wait('TRADE_COOLDOWN');
      const signal=strategyIntent({agentId:binding.agentId,mint:binding.mint,position:null,signalOnly:true,strategyConfig:config},market,now);
      if(signal.action!=='BUY')return wait('ENTRY_THRESHOLDS_NOT_MET');
      const exposure=amount(capital.initialCapitalLamports)*BigInt(Math.floor(config.risk.maxPositionPercent*100))/10000n;
      const ceiling=min(amount(a.perTradeLamports),BigInt(AUTONOMOUS_V1.maxBuyLamports),remaining-cost,exposure,BigInt(Math.floor(config.risk.maxSolPerTrade*1e9)));
      const size=personalitySizeLamports({id:a.personality,balanceLamports:balance.toString(),reserveLamports:(held+reserve+cost).toString(),ceilingLamports:ceiling.toString()});
      if(amount(size.effectiveLamports)===0n)return wait('ZERO_TRADE_HEADROOM');
      side='BUY';inputAmount=size.effectiveLamports;reason=signal.reason;identity={snapshotId:market.snapshotId,slot:market.slot};
      entryPolicy=pumpEntryPolicyFromAuthority(a);
    }
    const expiresAt=Math.min(market.observedAt+10000,capital.observedAt+5000,budget.observedAt+5000,venue.observedAt+10000,a.expiresAt,side==='SELL'?exitQuote.observedAt+10000:Infinity);
    if(expiresAt<=now)return wait('DECISION_EXPIRED');
    const intent={agentId:binding.agentId,owner:binding.owner,agentWallet:binding.wallet,network:'solana:101',genesis:GENESIS,side,inputMint:side==='BUY'?SOL_MINT:binding.mint,outputMint:side==='BUY'?binding.mint:SOL_MINT,inputAmount,slippageBps:Math.min(a.slippageBps,config.execution.maxSlippageBps),expiresAt};
    intent.requestKey='pump-decision-'+digest({authorizationId:a.id,revision:a.revision,binding:digest(binding),identity,intent});
    return {state:'PREPARE',reason,intent,...(entryPolicy?{entryPolicy}:{}),executionAllowed:false};
  }catch{return wait('DECISION_EVIDENCE_INVALID');}
}
