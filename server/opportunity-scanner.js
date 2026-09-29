import {SCANNER_LIMITS,candidateQueue,providerCode} from './market-discovery.js';
import {strategyIntent,executePaper} from './paper-engine.js';
import {decisionSnapshot,unavailableSnapshot,quoteProblem,entryChecks} from './market-radar.js';
import {strategyConfigFor} from '../public/app/strategy-config.js';
import {discoveryHealth} from './market-health.js';
// Build candidate facts without creating an intent. Ineligible/capacity-blocked
// candidates never enter the execution engine; only actual evaluations persist.
function card(s,c,time){
 const d=unavailableSnapshot({...s,position:null},c.quote??{mint:c.mint},c.reason??'DISCOVERED',time);
 d.config=strategyConfigFor(s);d.configVersion=s.strategyConfigVersion??0;d.strategy=d.config.strategy;
 d.reason={code:c.reason??'DISCOVERED',summary:c.reason?'Not eligible: '+c.reason.replaceAll('_',' '):'Queued for bounded evaluation',failedSignals:[]};
 d.opportunityState=c.eligible?'DISCOVERED':'SKIPPED';d.eligible=c.eligible;
 if(c.signals){d.signalChecks=entryChecks(c.quote,d.config,c.signals);d.signalContext='Entry filters for queue ordering; no TradeIntent or risk evaluation yet';}
 return d;
}
export async function scanAgent(s,{discovery,market}){
 const universe=await discovery.scan();
 // Caller rechecks pause/revision after all I/O before invoking evaluateScan.
 let held=null;
 if(s.position){try{held={mint:s.position.mint,quote:await market(s.position.mint)};}catch(e){held={mint:s.position.mint,error:providerCode(e)};}}
 return {universe,held};
}
export function evaluateScan(s,{universe,held},time,{capture,event}){
 const queue=candidateQueue(s,universe,time),cards=[];let evaluated=0;
 const evaluate=candidate=>{
  const q=candidate.quote;
  // Never change the held token's valuation/accounting to another candidate.
  s.mint=candidate.mint;s.market=q;s.tokenSymbol=q.tokenSymbol??q.symbol??null;
  const intent=strategyIntent(s,q,time),result=intent.side==='HOLD'?null:executePaper(s,intent,q,time);
  const d=decisionSnapshot(s,intent,result,time);d.eligible=true;
  d.opportunityState=d.finalDecision==='REJECTED'?'RISK_REJECTED':s.position?'POSITION_OPEN':d.finalDecision==='SKIPPED'?'WATCHING':'SIGNAL_PASSED';
  const changed=capture(s,d);evaluated++;
  if(result?.receipt){const r=result.receipt,details={...r,strategy:intent.strategy,strategyConfig:intent.strategyConfig,strategyConfigVersion:intent.strategyConfigVersion,signals:intent.signals,riskResult:result.risk};
   if(r.side==='BUY')event(s,{...details,type:'POSITION_OPENED'});
   if(r.positionClosed)event(s,{...details,type:'POSITION_CLOSED',pnlSol:r.closedPositionPnlSol});
   event(s,{...details,type:r.side});
  }else if(changed)event(s,{...intent,type:result?'RISK_REJECTED':'SIGNAL_SKIPPED',riskResult:result?.risk,reason:d.reason.summary});
  return d;
 };
 if(held){const problem=held.error??quoteProblem(held.quote,held.mint,time);if(problem){cards.push(card(s,{...held,eligible:false,reason:problem},time));s.market=null;}else cards.push(evaluate(held,true));}
 for(const c of queue.rows){
  if(c.mint===held?.mint)continue;
  if(cards.length>=SCANNER_LIMITS.maxRadarCandidates)break;
  let d;
  if(c.eligible&&!s.position&&evaluated<SCANNER_LIMITS.maxActiveEvaluations)d=evaluate(c);
  else{d=card(s,c,time);if(c.eligible&&s.position){d.opportunityState='WAITING_FOR_CAPACITY';d.reason={code:'WAITING_FOR_CAPACITY',summary:'One position is already open. Entry evaluation waits for capacity.',failedSignals:[]};}}
  cards.push(d);
 }
 const health=discoveryHealth(universe,held,time);
 const status=health.marketHealth==='HEALTHY'?(queue.eligible?'SCANNING':'NO_ELIGIBLE_MARKETS'):health.marketHealth==='STALE'?'STALE_DATA':health.marketHealth;
 s.scan={status,lastChecked:time,lastEvaluated:evaluated?time:null,scanned:queue.scanned,eligible:queue.eligible,watching:cards.filter(c=>['WATCHING','DISCOVERED','WAITING_FOR_CAPACITY'].includes(c.opportunityState)).length,evaluated,discoveredAt:universe.discoveredAt,opportunities:cards,rejections:queue.rejections};
 Object.assign(s.scan,health);
 s.health=health.marketHealth;s.decision=status;
 // Bound dedup state independently of immutable decision history.
 const retained=new Set(cards.map(c=>c.market?.mint));s.radarFingerprints=Object.fromEntries(Object.entries(s.radarFingerprints??{}).filter(([mint])=>retained.has(mint)));
 return s.scan;
}
