import {strategyIntent,executePaper} from '../server/paper-engine.js';
import {decisionSnapshot} from '../server/market-radar.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {buildAnalytics,portfolioMetrics} from '../server/paper-analytics.js';
export function analyticsFixture(){
 const agent={id:'analytics-fixture',name:'Nora Signal',characterId:'cupsey',strategy:'momentum'};
 const s={agentId:agent.id,mode:'paper',mint:'fixture-token-A',enabled:true,everStarted:true,startedAt:1790481600000,strategy:'momentum',strategyConfig:defaultStrategyConfig('momentum'),strategyConfigVersion:0,initialSol:.1,cashSol:.1,realizedSol:0,initialUsd:15,cashUsd:15,realizedUsd:0,dailySpentSol:0};
 let time=s.startedAt;const ledger=[],decisions=[],history=[];
 function sample(){const p=portfolioMetrics(s);history.push({timestamp:time,portfolioValueSol:p.portfolioValueSol});}
 function step(price,more={}){time+=300000;const q={mint:s.mint,tokenSymbol:s.mint.endsWith('A')?'ALPHA':'BETA',network:'solana:101',priceUsd:price,solUsd:150,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:5,observedAt:time,...more};s.market=q;
  const intent=strategyIntent(s,q,time),result=intent.side==='HOLD'?null:executePaper(s,intent,q,time);decisions.push(decisionSnapshot(s,intent,result,time));
  if(result?.receipt){const r=result.receipt,e={...r,timestamp:time,tokenSymbol:q.tokenSymbol,strategy:intent.strategy,strategyConfig:intent.strategyConfig,strategyConfigVersion:intent.strategyConfigVersion,eventId:'fixture-'+ledger.length};ledger.push({...e,type:r.side});if(r.positionClosed)ledger.push({...e,eventId:e.eventId+'-close',type:'POSITION_CLOSED',pnlSol:r.closedPositionPnlSol});}sample();
 }
 sample();step(1);step(1.1);if(s.position)step(1.1);
 s.strategyConfigVersion=1;s.strategyConfig=defaultStrategyConfig('balanced');s.strategy='balanced';s.mint='fixture-token-B';step(1);step(.9);
 s.strategyConfigVersion=2;s.strategyConfig=defaultStrategyConfig('momentum');s.strategy='momentum';s.mint='fixture-token-A';step(1);step(1.03);
 const populated=buildAnalytics(agent,s,ledger,decisions,history,time);
 const emptyState={...s,position:null,cashSol:.1,realizedSol:0,market:null};
 return {agent,state:s,ledger,decisions,history,time,populated,empty:buildAnalytics(agent,emptyState,[],[],[],time)};
}
