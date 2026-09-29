import {createHash} from 'node:crypto';
import {strategyIntent} from '../paper-engine.js';
import {strategyConfigFor} from '../../public/app/strategy-config.js';
import {SOL_MINT,DEFAULT_RISK_POLICY,evaluateAcceptanceRisk,reject} from './intent.js';
import {markRealPosition,decideRealExit,resolveAutonomousVenue} from './autonomous-v1.js';
import {assertMarketBinding} from './market-provenance.js';

const active=new Set();
const key=(cycle,direction)=>createHash('sha256').update(`one-shot:${cycle}:${direction}`).digest('hex');
const unresolved=new Set(['SIGNED','SUBMITTED','UNKNOWN']);
const pending=new Set(['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN']);

// The owner activation persists the only acceptance permission. This worker
// never derives permission from normal Live flags, Paper, or a browser field.
export function createAutonomousAcceptanceWorker({acceptance,ledger,port,adapter,agentContext,network,marketRead,resolveProvenance,actualTokenBalance,now=Date.now}={}){
 if(!acceptance?.read||!ledger?.list||!port?.execute||!adapter?.quote||!agentContext||!network?.verify||!marketRead||!resolveProvenance||!actualTokenBalance)throw Error('ACCEPTANCE_WORKER_DEPENDENCY_MISSING');
 const C=acceptance.candidate;
 const context=async()=>{const a=await agentContext(C.agentId),n=await network.verify();return {agent:a,context:{ownerAuthenticated:true,ownershipVerified:a.owner===C.owner,vaultVerified:a.vaultVerified===true,networkVerified:n.network==='solana:mainnet'&&n.verified===true,owner:a.owner,agentId:a.agentId,agentWallet:a.agentWallet}};};
 const records=cycle=>ledger.list(C.agentId).filter(r=>r.intent?.mode===C.mode&&r.intent.acceptanceCycleId===cycle);
 const stateFor=async(intent)=>{const full={...intent,createdAt:now(),expiresAt:now()+30000},quote=await adapter.quote(full,{retryMinContextSlot:true});acceptance.recordStateAcquisition('PRE_RISK_QUOTE',quote.stateReadAttempts??[]);const pre=await adapter.reservePlan({intent:full,quote},{retryMinContextSlot:true});acceptance.recordStateAcquisition('PRE_RISK_CAPITAL',pre.collected?.retryDiagnostics??[]);return evaluateAcceptanceRisk(full,pre.snapshot,DEFAULT_RISK_POLICY,now());};
 const ledgerState=(position,quantity='0')=>({openPositions:position?1:0,positionQuantity:quantity,unknown:false,unresolved:false,reservationConflict:false,consecutiveFailures:0,pausedByBreaker:false,cooldownUntil:0,dailyTurnoverLamports:'0'});
 const expireUnsigned=async r=>{
  if(!r||!['QUOTED','PREPARING','PREPARED'].includes(r.status)||r.signature||r.broadcastAttemptedAt)return null;
  const timeExpired=now()>=Math.min(r.intent.expiresAt,r.quote?.expiresAt??r.intent.expiresAt),blockExpired=Number.isSafeInteger(r.lastValidBlockHeight)&&await adapter.blockHeight()>r.lastValidBlockHeight;
  if(!timeExpired&&!blockExpired)return null;
  const expired=ledger.transition(r.id,[r.status],'EXPIRED',{reason:'UNSIGNED_PREPARATION_EXPIRED'});
  if(acceptance.read()?.execution?.id===r.id)acceptance.terminalFailure(expired);else acceptance.failUnbound(expired);
  return expired;
 };
 async function valuation(position){try{const s=acceptance.read(),retryMinContextSlot=s?.status==='POSITION_OPEN'&&!s.execution;const quote=await adapter.quote({mode:C.mode,network:'solana:mainnet',agentId:C.agentId,owner:C.owner,agentWallet:C.agentWallet,direction:'SELL',inputMint:C.tokenMint,outputMint:SOL_MINT,inputAmount:position.quantity,slippageBps:C.maxSlippageBps,pool:C.pool,createdAt:now(),expiresAt:now()+30000},{retryMinContextSlot});return markRealPosition({position,quote:{...quote,verified:true,network:'solana:mainnet',direction:'SELL',observedAt:quote.createdAt},now:now()});}catch{return {available:false,reason:'PRICE_UNAVAILABLE'};}}
 async function buy(s){
  const {agent,context:c}=await context();if(!c.networkVerified||!c.vaultVerified||!c.ownershipVerified)reject('ACCEPTANCE_CONTEXT_UNVERIFIED');
  const market=await marketRead(C.tokenMint),signal=strategyIntent({...agent,mint:C.tokenMint,position:null},market,now());acceptance.recordStrategy(signal);
  const proof=await resolveProvenance({snapshot:market,mint:C.tokenMint,agentWallet:C.agentWallet});acceptance.recordStateAcquisition('POOL_PROVENANCE',proof.retryDiagnostics??[]);if(proof.status!=='SUPPORTED_RAYDIUM_CPMM'||proof.binding.pool!==C.pool){const code=proof.reason==='RPC_MIN_CONTEXT_SLOT_NOT_REACHED'?proof.reason:'ACCEPTANCE_PROVENANCE_INVALID';throw Object.assign(Error(code),{code,retryDiagnostics:proof.retryDiagnostics});}
  const intent={mode:C.mode,acceptanceCycleId:s.cycleId,network:'solana:mainnet',agentId:C.agentId,owner:C.owner,agentWallet:C.agentWallet,venue:C.venue,direction:'BUY',inputMint:SOL_MINT,outputMint:C.tokenMint,inputAmount:C.maxBuyLamports,slippageBps:C.maxSlippageBps,pool:C.pool,marketBinding:proof.binding,requestKey:key(s.cycleId,'BUY'),strategyResult:{side:signal.side,reason:signal.reason},strategyVersion:agent.strategyConfigVersion??0,strategyConfig:strategyConfigFor(agent)};
  assertMarketBinding(proof.binding,market,intent);
  const risk=await stateFor(intent);acceptance.assertBuy(intent,{context:c,flags:{},riskPass:risk.allowed,openPositions:0});
  return port.execute({agent,intent,venue:resolveAutonomousVenue({mint:C.tokenMint,direction:'BUY',pool:C.pool}),risk,marketQuote:market,ledgerState:ledgerState(null)});
 }
 async function sell(s,position,reason){
  const {agent,context:c}=await context();if(!c.networkVerified||!c.vaultVerified||!c.ownershipVerified)reject('ACCEPTANCE_CONTEXT_UNVERIFIED');
  const actual=await actualTokenBalance(C.agentId,C.tokenMint);if(actual!==position.quantity||BigInt(actual)<=0n)reject('ACCEPTANCE_POSITION_BALANCE_MISMATCH');
  const intent={mode:C.mode,acceptanceCycleId:s.cycleId,network:'solana:mainnet',agentId:C.agentId,owner:C.owner,agentWallet:C.agentWallet,venue:C.venue,direction:'SELL',inputMint:C.tokenMint,outputMint:SOL_MINT,inputAmount:actual,slippageBps:C.maxSlippageBps,pool:C.pool,exitReason:reason,requestKey:s.recoveryExit?key(`${s.cycleId}:recovery:${s.recoveryAuthorizedAt}`,'SELL'):key(s.cycleId,'SELL'),strategyVersion:position.strategyVersion??0,strategyConfig:position.strategyConfig??null};
  const risk=await stateFor(intent);acceptance.assertSell(intent,{context:c,flags:{},riskPass:risk.allowed,position,exitReason:reason});
  return port.execute({agent,intent,venue:resolveAutonomousVenue({mint:C.tokenMint,direction:'SELL',pool:C.pool}),risk,marketQuote:{mint:C.tokenMint,observedAt:now()},ledgerState:ledgerState(position,actual)});
 }
 async function tick(){
  const s=acceptance.read();if(!s||!['ARMED','BUYING','POSITION_OPEN','SELLING','UNKNOWN'].includes(s.status))return {action:'SKIP',reason:'ACCEPTANCE_DISARMED'};
  if(active.has(s.cycleId))return {action:'SKIP',reason:'ACCEPTANCE_TICK_RUNNING'};active.add(s.cycleId);
  try{
   const all=records(s.cycleId),bound=s.execution&&ledger.get(s.execution.id);
   if(bound){
    const expired=await expireUnsigned(bound);if(expired)return {action:'EXPIRE',executionId:expired.id,status:'FAILED'};
    if(unresolved.has(bound.status)&&bound.signature){const result=await port.reconcile(bound.id);return {action:'RECONCILE',executionId:bound.id,status:result.status};}
    if(bound.status==='CONFIRMED'||['FAILED','REJECTED_BEFORE_SIGNING','EXPIRED'].includes(bound.status)){await port.reconcile(bound.id);return {action:'RECONCILE',executionId:bound.id,status:acceptance.read().status};}
    if(bound.status==='UNKNOWN'&&!bound.signature){acceptance.markUnknown(bound);return {action:'BLOCKED',reason:'UNSIGNED_CLAIM_OUTCOME_UNKNOWN'};}
    return {action:'WAIT',reason:'EXECUTION_IN_PROGRESS',executionId:bound.id};
   }
   // An unbound historical attempt in this cycle must never trigger another BUY/SELL.
   const sameLeg=all.filter(r=>r.intent.direction===(s.status==='ARMED'?'BUY':'SELL')&&!(s.recoveryExit&&acceptance.safeHistoricalSell(r)));
   if(sameLeg.length){const last=sameLeg[0],expired=await expireUnsigned(last);if(expired)return {action:'EXPIRE',executionId:expired.id,status:'FAILED'};if(pending.has(last.status))return {action:'BLOCKED',reason:'UNBOUND_EXECUTION_REQUIRES_RECONCILIATION',executionId:last.id};if(['REJECTED_BEFORE_SIGNING','EXPIRED'].includes(last.status)){acceptance.failUnbound(last);return {action:'FAILED',reason:last.reason??last.status};}return {action:'BLOCKED',reason:'HISTORICAL_LEG_ALREADY_USED',executionId:last.id};}
   if(s.status==='ARMED'){
    try{const r=await buy(s);return {action:'BUY',status:r.status,executionId:r.id??null};}
    catch(e){if(acceptance.read()?.status==='ARMED'&&!records(s.cycleId).length)acceptance.terminalBeforeExecution(e.code??'ACCEPTANCE_BUY_REJECTED',e.retryDiagnostics);return {action:'FAILED',reason:e.code??'ACCEPTANCE_BUY_REJECTED'};}
   }
   if(s.status==='POSITION_OPEN'){
    const p=ledger.activePosition(C.agentId);if(!p||p.acceptanceCycleId!==s.cycleId||p.mint!==C.tokenMint||p.pool!==C.pool)return {action:'BLOCKED',reason:'ACCEPTANCE_POSITION_UNVERIFIED'};
    const mark=await valuation(p),config=strategyConfigFor(p.strategyConfig?{strategyConfig:p.strategyConfig}:await agentContext(C.agentId));
    const expired=now()-p.openedAt>=C.maxHoldMs;
    const exit=expired?{action:'SELL',reason:'MAX_HOLD'}:decideRealExit({position:p,valuation:mark,config:{stopLossBps:Math.round(config.position.stopLossPercent*100),takeProfitBps:Math.round(config.position.takeProfitPercent*100),maxHoldMs:C.maxHoldMs},now:now()});
    if(exit.action!=='SELL')return {action:'WAIT',reason:exit.reason,valuation:mark};
    try{const r=await sell(s,p,exit.reason);return {action:'SELL',status:r.status,executionId:r.id??null,exitReason:exit.reason};}
    catch(e){return {action:'BLOCKED',reason:e.code??'ACCEPTANCE_SELL_REJECTED'};}
   }
   return {action:'BLOCKED',reason:s.status};
  }finally{active.delete(s.cycleId);}
 }
 return Object.freeze({tick,valuation,records});
}
