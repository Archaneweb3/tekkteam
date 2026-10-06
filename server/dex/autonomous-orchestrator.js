import {createHash} from 'node:crypto';
import {candidateQueue} from '../market-discovery.js';
import {strategyIntent} from '../paper-engine.js';
import {strategyConfigFor} from '../../public/app/strategy-config.js';
import {PERSONALITIES,personalitySizeLamports} from '../../public/app/agent-personalities.js';
import {SOL_MINT,reject} from './intent.js';
import {AUTONOMOUS_V1,authorizeAutonomousV1,decideRealExit,markRealPosition,resolveAutonomousVenue} from './autonomous-v1.js';
import {assertMarketBinding} from './market-provenance.js';

const key=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const skip=(reason,extra={})=>({action:'SKIP',reason,...extra});
const REAL_ACTIVE=new Set(['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN']);

// A single production decision path. The execution port must itself own the
// atomic reservation, final message validator, simulation, signing and
// reconciliation. No browser capability or Paper execution enters this path.
export function createAutonomousOrchestrator({discovery,market,positions,executions,health,executionPort,network,agentContext,flags,risk,resolveProvenance,positionSizing,decision,now=Date.now}){
 if(!discovery?.scan||!market?.sellQuote||!positions?.read||!positions?.riskState||!positions?.actualTokenBalance||!executions?.list||!health?.read||!network?.verify||!agentContext||!flags||!risk?.evaluate||!resolveProvenance)throw Error('AUTONOMOUS_DEPENDENCY_MISSING');
 const record=(agentId,outcome)=>{decision?.(agentId,outcome);return outcome;};
 const pause=(agentId,reason)=>{health.pause(agentId,reason);return record(agentId,skip(reason));};
 const execute=async({agent,marketQuote,intent,ledgerState,reason,source})=>{
  const riskResult=await risk.evaluate({agent,intent,market:marketQuote,venue:resolveAutonomousVenue({mint:intent.direction==='BUY'?intent.outputMint:intent.inputMint,pool:intent.pool,direction:intent.direction}),ledgerState});
  const authority=authorizeAutonomousV1({flags:flags(),network:await network.verify(),agent,intent,market:marketQuote,ledger:{...ledgerState,riskPass:riskResult?.allowed===true},now:now()});
  if(executionPort?.provenProductionBoundary!==true||typeof executionPort.execute!=='function')reject('AUTONOMOUS_EXECUTION_PORT_UNAVAILABLE');
  let result;try{result=await executionPort.execute({agent,intent,venue:authority.venue,risk:riskResult,marketQuote,ledgerState,reason,source});}
  catch(e){health.failure(agent.agentId,e.code??'EXECUTION_REJECTED');throw e;}
  if(result?.status==='UNKNOWN'||result?.status==='SIGNED'||result?.status==='SUBMITTED')return pause(agent.agentId,'UNRESOLVED_EXECUTION');
  if(result?.status==='CONFIRMED'&&result?.finalized===true&&result?.receipt){health.confirmed(agent.agentId);return record(agent.agentId,{action:intent.direction,status:'CONFIRMED',reason,executionId:result.id,signature:result.receipt.signature});}
  if(result?.status==='REJECTED_BEFORE_SIGNING'||result?.status==='FAILED'){health.failure(agent.agentId,result.reason??result.status);return record(agent.agentId,{action:'SKIP',reason:result.reason??result.status});}
  return pause(agent.agentId,'EXECUTION_OUTCOME_UNVERIFIED');
 };
 return Object.freeze({async tick(agentId){
  const agent=await agentContext(agentId),runtime=flags();
  if(runtime?.liveAutonomousEnabled!==true||runtime?.autonomousKillSwitch!==false||runtime?.realMoneyEmergencyStop!==false)return record(agentId,skip('AUTONOMOUS_TRADING_STOP'));
  if(health.read(agentId).pausedByBreaker)return record(agentId,skip('AUTONOMOUS_CIRCUIT_OPEN'));
  const active=executions.list(agentId).filter(x=>REAL_ACTIVE.has(x.status));
  if(active.length){if(active.some(x=>['SIGNED','SUBMITTED','UNKNOWN'].includes(x.status)))return pause(agentId,'UNRESOLVED_EXECUTION');return record(agentId,skip('ACTIVE_EXECUTION_REQUIRES_RECONCILIATION'));}
  const position=positions.read(agentId);
  if(position&&BigInt(position.quantity)>0n){
   let venue;try{venue=resolveAutonomousVenue({mint:position.mint,pool:position.pool,direction:'SELL'});}catch{return record(agentId,skip('UNSUPPORTED_EXECUTION_VENUE'));}
   const quote=await market.sellQuote(position,venue);
   const valuation=markRealPosition({position,quote,now:now()});
   const config=strategyConfigFor(position.strategyConfig?{strategyConfig:position.strategyConfig}:agent);
   const exit=decideRealExit({position,valuation,config:{stopLossBps:Math.round(config.position.stopLossPercent*100),takeProfitBps:Math.round(config.position.takeProfitPercent*100),maxHoldMs:900000},now:now()});
   if(exit.action!=='SELL')return record(agentId,{action:'WAIT',reason:exit.reason,valuation});
   record(agentId,{action:'EXIT_TRIGGERED',reason:exit.reason});
   const actual=await positions.actualTokenBalance(agentId,position.mint);
   if(actual!==position.quantity)return pause(agentId,'REAL_POSITION_BALANCE_MISMATCH');
   const intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId,owner:agent.owner,agentWallet:agent.agentWallet,direction:'SELL',inputMint:position.mint,outputMint:SOL_MINT,inputAmount:actual,slippageBps:Math.min(config.execution.maxSlippageBps,AUTONOMOUS_V1.maxSlippageBps),pool:position.pool,requestKey:key(['SELL',agentId,position.buySignature,actual]),strategyVersion:position.strategyVersion??0,strategyConfig:config};
   try{return await execute({agent,marketQuote:{mint:position.mint,observedAt:quote.observedAt},intent,ledgerState:{...await positions.riskState(agentId),openPositions:1,positionQuantity:actual,consecutiveFailures:health.read(agentId).consecutiveFailures,pausedByBreaker:false},reason:exit.reason,source:{valuation}});}catch(e){return record(agentId,skip(e.code??'SELL_REJECTED'));}
  }
  const universe=await discovery.scan(),queue=candidateQueue(agent,universe,now());let unsupported=false;
  for(const candidate of queue.rows){
   if(!candidate.eligible)continue;
   record(agentId,{action:'CANDIDATE',mint:candidate.mint,marketIdentity:{mint:candidate.mint,pair:candidate.quote.pair??null,venue:candidate.quote.venue??null,quoteMint:candidate.quote.quoteMint??null,snapshotId:candidate.quote.snapshotId??null},executionSupport:'UNSUPPORTED'});
   // Signal evaluation must not invent a cash balance; Real size is proved below.
   const state={...agent,mint:candidate.mint,position:null,signalOnly:true},signal=strategyIntent(state,candidate.quote,now());
   if(signal.side!=='BUY')continue;
   const provenance=await resolveProvenance({snapshot:candidate.quote,mint:candidate.mint,agentWallet:agent.agentWallet});
   if(provenance.status!=='SUPPORTED_RAYDIUM_CPMM'){unsupported=true;record(agentId,skip('UNSUPPORTED_EXECUTION_VENUE',{mint:candidate.mint,marketIdentity:provenance.binding?.identity??null,provenanceReason:provenance.reason}));continue;}
   let venue;try{venue=resolveAutonomousVenue({mint:candidate.mint,pool:provenance.binding.pool,direction:'BUY'});}catch{unsupported=true;continue;}
   const config=strategyConfigFor(agent),inputLamports=Math.min(Math.floor(config.risk.maxSolPerTrade*1e9),Number(AUTONOMOUS_V1.maxBuyLamports));
   if(inputLamports<=0)return record(agentId,skip('TRADE_LIMIT'));
   const intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId,owner:agent.owner,agentWallet:agent.agentWallet,direction:'BUY',inputMint:SOL_MINT,outputMint:candidate.mint,inputAmount:String(inputLamports),slippageBps:Math.min(config.execution.maxSlippageBps,AUTONOMOUS_V1.maxSlippageBps),pool:venue.pool,marketBinding:provenance.binding,requestKey:key(['BUY',agentId,candidate.mint,candidate.quote.snapshotId??candidate.quote.observedAt]),strategyVersion:agent.strategyConfigVersion??0,strategyConfig:config};
   if(PERSONALITIES[config.strategy]){
    try{
     if(typeof positionSizing!=='function')throw Error('PERSONALITY_SIZING_UNAVAILABLE');
     const budget=await positionSizing({agent,intent});
     if(!Number.isSafeInteger(budget?.observedAt)||now()-budget.observedAt>10000||budget.observedAt>now())throw Error('PERSONALITY_SIZING_STALE');
     const sizing=personalitySizeLamports({id:config.strategy,...budget,ceilingLamports:String(inputLamports)});
     if(sizing.effectiveLamports==='0')return record(agentId,skip('PROTECTED_RESERVE'));
     intent.inputAmount=sizing.effectiveLamports;
     record(agentId,{action:'SIZING',...sizing});
    }catch(e){return record(agentId,skip(e.code??e.message??'PERSONALITY_SIZING_UNAVAILABLE'));}
   }
   try{assertMarketBinding(provenance.binding,candidate.quote,intent);}catch{return record(agentId,skip('MARKET_PROVENANCE_MISMATCH'));}
   record(agentId,{action:'BUY_INTENT',mint:candidate.mint,marketIdentity:provenance.binding.identity,verifiedVenue:venue.kind,verifiedPool:venue.pool,executionSupport:'SUPPORTED',marketBinding:provenance.binding});
   try{return await execute({agent,marketQuote:candidate.quote,intent,ledgerState:{...await positions.riskState(agentId),openPositions:0,consecutiveFailures:health.read(agentId).consecutiveFailures,pausedByBreaker:false},reason:signal.reason,source:{signal,marketBinding:provenance.binding}});}catch(e){return record(agentId,skip(e.code??'BUY_REJECTED'));}
  }
  return record(agentId,skip(unsupported?'UNSUPPORTED_EXECUTION_VENUE':'NO_ELIGIBLE_MARKET'));
 }});
}
