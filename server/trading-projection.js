import {createHash} from 'node:crypto';
const number=v=>Number.isFinite(v)?v:null;
const stamp=v=>{const n=typeof v==='string'?Date.parse(v):v;return Number.isFinite(n)?n:null;};
const sum=values=>values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
const symbol=(agent,state={})=>{const token=agent.token??agent.coin;return state.tokenSymbol??state.market?.tokenSymbol??(!state.mint||state.mint===token?.mint?token?.symbol??token?.ticker??null:null);};
const tokenName=(agent,state={})=>{const token=agent.token??agent.coin;return state.tokenName??state.market?.tokenName??(!state.mint||state.mint===token?.mint?token?.name??null:null);};
const assetSymbol=(agent,state,mint)=>symbol(agent,mint&&mint!==state.mint?{mint}:state);
const TYPES=new Set(['SIGNAL_DETECTED','BUY','SELL','POSITION_OPENED','POSITION_CLOSED','RISK_REJECTED','SIGNAL_SKIPPED','PAUSED','RESUMED','TRADING_STARTED','TRADING_STOPPED']);
const LEGACY={HOLD:'SIGNAL_SKIPPED',REJECTED:'RISK_REJECTED',STARTED:'TRADING_STARTED',CONFIGURED:'SIGNAL_SKIPPED',ERROR:'SIGNAL_SKIPPED'};
/** Whitelist output: never spread stored records (which can contain custody data). */
export function canonicalEvent(agent,state,event,id){
 const e=event??{},s=state??{},raw=e.type??e.side,type=TYPES.has(raw)?raw:LEGACY[raw]??'SIGNAL_SKIPPED';
 const timestamp=stamp(e.timestamp??e.createdAt);
 const eventId=String(e.eventId??id??createHash('sha256').update(JSON.stringify([agent.id,timestamp,type,e.positionId??null,e.reason??null,e.quantity??null])).digest('hex').slice(0,24));
 return {eventId,agentId:agent.id,timestamp,mode:'paper',type,tokenMint:e.tokenMint??e.mint??s.mint??null,tokenSymbol:e.tokenSymbol??assetSymbol(agent,s,e.tokenMint??e.mint),strategy:e.strategy??s.strategy??agent.strategy??null,requestedSizeSol:number(e.requestedSizeSol),executedSizeSol:number(e.executedSizeSol??e.solNotional),entryPrice:number(e.entryPrice??(type==='BUY'?e.priceUsd:null)),exitPrice:number(e.exitPrice??(type==='SELL'?e.priceUsd:null)),pnlSol:number(e.pnlSol??(type==='POSITION_CLOSED'?e.closedPositionPnlSol:e.realizedSol)),pnlPercent:number(e.pnlPercent),positionId:e.positionId??null,confidence:number(e.confidence),reason:typeof e.reason==='string'?e.reason:null,marketSnapshotId:e.marketSnapshotId??null};
}
export function projectTrading(agent,state,history=[],now=Date.now()){
 const s=state?.mode==='live'?{}:state??{};
 // Stable timestamp sort retains SQL id DESC ordering for same-tick events.
 const activity=history.filter(e=>e.mode!=='live').map(e=>canonicalEvent(agent,s,e,e.id)).sort((a,b)=>(b.timestamp??0)-(a.timestamp??0));
 const configured=typeof s.mint==='string'&&s.mint.length>0&&['selective','balanced','momentum'].includes(s.strategy);
 const started=!!(s.startedAt||s.everStarted||Number.isFinite(s.initialSol)||Number.isFinite(s.initialUsd)||activity.some(e=>['TRADING_STARTED','RESUMED','BUY','SELL'].includes(e.type)));
 const status=!configured?'DRAFT':s.enabled?'WORKING':started?'PAUSED':'READY';
 const initial=number(s.initialSol)??(Number.isFinite(s.initialUsd)&&s.initialSolUsd>0?s.initialUsd/s.initialSolUsd:null);
 const cash=number(s.cashSol),realized=number(s.realizedSol),market=s.market??{};
 const positions=(s.positions??(s.position?[s.position]:[])).map(p=>{
  const price=number(market.priceUsd),value=price!==null&&market.solUsd>0&&Number.isFinite(p.quantity)?p.quantity*price/market.solUsd:null,cost=number(p.costSol);
  const pnl=value!==null&&cost!==null?value-cost:null;
  return {positionId:p.positionId??null,tokenMint:p.mint??s.mint??null,tokenSymbol:p.tokenSymbol??assetSymbol(agent,s,p.mint),quantity:number(p.quantity),entryPriceUsd:number(p.entryPriceUsd),currentPriceUsd:price,sizeSol:cost,marketValueSol:value,pnlSol:pnl,pnlPercent:pnl!==null&&cost>0?pnl/cost*100:null,openedAt:stamp(p.openedAt)};
 });
 const portfolio=sum([cash,...positions.map(p=>p.marketValueSol)]),unrealized=sum(positions.map(p=>p.pnlSol));
 const total=portfolio!==null&&initial!==null?portfolio-initial:null;
 const closed=[...new Map(activity.filter(e=>e.type==='POSITION_CLOSED').map(e=>[e.positionId??e.eventId,e])).values()];
 const wins=closed.filter(e=>e.pnlSol>0).length,losses=closed.filter(e=>e.pnlSol!==null&&e.pnlSol<0).length;
 const knownClosed=closed.filter(e=>e.pnlSol!==null).length;
 return {agentId:agent.id,name:agent.name??'',character:agent.characterId??agent.character??agent.skin??null,tokenName:tokenName(agent,s),tokenSymbol:symbol(agent,s),tokenMint:s.mint??null,mode:'paper',status,strategy:s.strategy??agent.strategy??null,paperStartingCapitalSol:initial,paperCashSol:cash,portfolioValueSol:portfolio,realizedPnlSol:realized,unrealizedPnlSol:unrealized,totalPnlSol:total,roiPercent:total!==null&&initial>0?total/initial*100:null,tradeCount:activity.filter(e=>['BUY','SELL'].includes(e.type)).length,wins,losses,closedPositionCount:closed.length,winRate:knownClosed&&knownClosed===closed.length?wins/knownClosed*100:null,openPositions:positions,lastAction:activity[0]??null,lastUpdated:stamp(s.updatedAt??s.market?.observedAt??activity[0]?.timestamp),activity};
}
export function aggregateTrading(projections,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10),activity=projections.flatMap(p=>p.activity).sort((a,b)=>(b.timestamp??0)-(a.timestamp??0));
 const participating=projections.filter(p=>!['DRAFT','READY'].includes(p.status)||p.paperStartingCapitalSol!==null||p.tradeCount>0);
 return {overview:{activeTraders:projections.filter(p=>p.status==='WORKING').length,openPositions:projections.reduce((n,p)=>n+p.openPositions.length,0),tradesToday:activity.filter(e=>['BUY','SELL'].includes(e.type)&&e.timestamp!==null&&new Date(e.timestamp).toISOString().slice(0,10)===day).length,totalPaperPnlSol:sum(participating.map(p=>p.totalPnlSol))},activity};
}
export function rankTraders(projections,sort='pnl'){
 const field=({pnl:'totalPnlSol',roi:'roiPercent',winRate:'winRate',trades:'tradeCount'})[sort]??'totalPnlSol';
 return [...projections].sort((a,b)=>{const av=number(a[field]),bv=number(b[field]);return av===null&&bv!==null?1:bv===null&&av!==null?-1:(bv??0)-(av??0)||String(a.agentId).localeCompare(String(b.agentId));}).map((p,i)=>({...p,rank:i+1}));
}
