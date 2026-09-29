// Read-model only. Never invokes strategy, risk, execution, wallets or providers.
export const finite=v=>Number.isFinite(v)?v:null;
const stamp=v=>v==null?null:finite(typeof v==='string'?Date.parse(v):v);
const sum=xs=>xs.every(Number.isFinite)?xs.reduce((a,b)=>a+b,0):null;
const type=e=>e.type??e.side;
const at=e=>stamp(e.timestamp??e.createdAt);
const unique=rows=>[...new Map(rows.map((r,i)=>[r.eventId??r.id??i,r])).values()];

export function closedPaperTrades(ledger=[]){
 const rows=unique(ledger.filter(e=>e.mode!=='live')),groups=new Map();
 for(const e of rows){if(!['BUY','SELL','POSITION_CLOSED'].includes(type(e)))continue;const id=e.positionId??(type(e)==='POSITION_CLOSED'?e.eventId??e.id:null);if(!id)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(e);}
 const trades=[];
 for(const [positionId,group] of groups){
  const closes=group.filter(e=>type(e)==='POSITION_CLOSED'||type(e)==='SELL'&&e.positionClosed).sort((a,b)=>(at(b)??0)-(at(a)??0));if(!closes.length)continue;
  const close=closes.find(e=>type(e)==='POSITION_CLOSED')??closes[0],buys=group.filter(e=>type(e)==='BUY'),sells=group.filter(e=>type(e)==='SELL'),entry=buys.length===1?buys[0]:null;
  const pnl=finite(close.closedPositionPnlSol??close.pnlSol),size=entry?finite(entry.solNotional??entry.executedSizeSol):null;
  const cost=size!==null&&Number.isFinite(entry?.feeSol)?size+entry.feeSol:null;
  const openedAt=entry?at(entry):null,closedAt=at(close);
  const quantity=sum(sells.map(e=>finite(e.quantity))),gross=sum(sells.map(e=>Number.isFinite(e.quantity)&&Number.isFinite(e.priceUsd??e.exitPrice)?e.quantity*(e.priceUsd??e.exitPrice):null));
  const exit=quantity>0&&gross!==null?gross/quantity:sells.length===1?finite(sells[0].priceUsd??sells[0].exitPrice):null;
  // Never substitute today's config or symbol for an incomplete historical trade.
  const config=entry?.strategyConfig??close.strategyConfig;
  trades.push({positionId,tokenMint:entry?.tokenMint??entry?.mint??close.tokenMint??close.mint??null,tokenSymbol:entry?.tokenSymbol??close.tokenSymbol??null,entryPriceUsd:finite(entry?.priceUsd??entry?.entryPrice),exitPriceUsd:exit,sizeSol:size,costSol:cost,pnlSol:pnl,returnPercent:cost>0&&pnl!==null?pnl/cost*100:null,openedAt,closedAt,holdingMs:openedAt!==null&&closedAt!==null&&closedAt>=openedAt?closedAt-openedAt:null,strategy:config?.strategy??entry?.strategy??close.strategy??null,configVersion:Number.isSafeInteger(entry?.strategyConfigVersion??close.strategyConfigVersion)?(entry?.strategyConfigVersion??close.strategyConfigVersion):null});
 }
 return trades.sort((a,b)=>(b.closedAt??0)-(a.closedAt??0)||String(a.positionId).localeCompare(String(b.positionId)));
}

export function tradeStatistics(trades){
 const known=trades.filter(t=>Number.isFinite(t.pnlSol)),wins=known.filter(t=>t.pnlSol>0),losses=known.filter(t=>t.pnlSol<0);
 return {closedPositionCount:trades.length,wins:wins.length,losses:losses.length,breakevens:known.length-wins.length-losses.length,unknownOutcomes:trades.length-known.length,winRate:trades.length&&known.length===trades.length?wins.length/trades.length*100:null,averageWinSol:wins.length?sum(wins.map(t=>t.pnlSol))/wins.length:null,averageLossSol:losses.length?sum(losses.map(t=>t.pnlSol))/losses.length:null,largestWinSol:wins.length?Math.max(...wins.map(t=>t.pnlSol)):null,largestLossSol:losses.length?Math.min(...losses.map(t=>t.pnlSol)):null};
}

export function portfolioMetrics(state){
 const s=state?.mode==='live'?{}:state??{},market=s.market??{};
 const initial=finite(s.initialSol)??(Number.isFinite(s.initialUsd)&&s.initialSolUsd>0?s.initialUsd/s.initialSolUsd:null),cash=finite(s.cashSol);
 const positions=(s.positions??(s.position?[s.position]:[])).map(p=>{
  const price=finite(market.priceUsd),value=price!==null&&market.solUsd>0&&Number.isFinite(p.quantity)&&(!p.mint||!market.mint||p.mint===market.mint)?p.quantity*price/market.solUsd:null,cost=finite(p.costSol),pnl=value!==null&&cost!==null?value-cost:null;
  return {positionId:p.positionId??null,tokenMint:p.mint??s.mint??null,tokenSymbol:p.tokenSymbol??null,quantity:finite(p.quantity),entryPriceUsd:finite(p.entryPriceUsd),currentPriceUsd:price,sizeSol:cost,marketValueSol:value,pnlSol:pnl,pnlPercent:cost>0&&pnl!==null?pnl/cost*100:null,openedAt:stamp(p.openedAt)};
 });
 const portfolio=sum([cash,...positions.map(p=>p.marketValueSol)]),total=portfolio!==null&&initial!==null?portfolio-initial:null;
 return {paperStartingCapitalSol:initial,paperCashSol:cash,portfolioValueSol:portfolio,realizedPnlSol:finite(s.realizedSol),unrealizedPnlSol:sum(positions.map(p=>p.pnlSol)),totalPnlSol:total,roiPercent:initial>0&&total!==null?total/initial*100:null,openPositions:positions};
}

export function drawdown(history){
 const points=history.filter(p=>Number.isFinite(p.portfolioValueSol)&&p.portfolioValueSol>=0);
 if(points.length<2)return {currentDrawdownPercent:null,maxDrawdownPercent:null};
 let peak=0,max=0,current=null;
 for(const p of points){peak=Math.max(peak,p.portfolioValueSol);current=peak>0?(p.portfolioValueSol/peak-1)*100:null;if(current!==null)max=Math.min(max,current);}
 return {currentDrawdownPercent:Number.isFinite(history.at(-1)?.portfolioValueSol)?current:null,maxDrawdownPercent:peak>0?max:null};
}

function grouped(trades,key){
 const groups=new Map();for(const t of trades){const k=key(t);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);}
 return [...groups.entries()].map(([key,rows])=>({key,tokenMint:rows[0].tokenMint,tokenSymbol:rows[0].tokenSymbol,strategy:rows[0].strategy,configVersion:rows[0].configVersion,pnlSol:sum(rows.map(t=>t.pnlSol)),...tradeStatistics(rows)}));
}
export function buildAnalytics(agent,state,ledger=[],decisions=[],history=[],now=Date.now()){
 const trades=closedPaperTrades(ledger),metrics=portfolioMetrics(state),stats=tradeStatistics(trades),market=state?.market;
 const valuationStale=metrics.openPositions.length>0&&(!Number.isFinite(market?.observedAt)||now-market.observedAt>30000||market.observedAt>now+1000||market.stale===true);
 const evaluated=unique(decisions).filter(d=>d.mode==='paper'&&d.tradeIntent&&d.signalChecks?.length>0);
 const passed=evaluated.filter(d=>d.tradeIntent.action==='BUY'&&d.signalChecks.every(c=>c.passed===true));
 const tokens=grouped(trades,t=>t.tokenMint??'unknown'),strategyPerformance=grouped(trades,t=>JSON.stringify([t.strategy,t.configVersion]));
 return {agentId:agent.id,name:agent.name,mode:'paper',liveLocked:true,range:'ALL',strategy:state?.strategy??agent.strategy??null,configVersion:state?.strategyConfigVersion??null,summary:{...metrics,...stats,...drawdown(history),executionCount:unique(ledger.filter(e=>e.mode!=='live'&&['BUY','SELL'].includes(type(e)))).length},valuation:{asOf:metrics.openPositions.length?stamp(market?.observedAt):now,stale:valuationStale},portfolioHistory:history,historyCoverage:{from:history[0]?.timestamp??null,to:history.at(-1)?.timestamp??null,maximumPoints:8640,days:30,cadenceMs:300000,backfilled:false},decisionFunnel:{marketsEvaluated:evaluated.length,signalsPassed:passed.length,riskRejected:passed.filter(d=>d.risk?.allowed===false).length,paperEntries:evaluated.filter(d=>d.finalDecision==='BUY').length,closedTrades:trades.length,scope:'Retained meaningful decision snapshots only (up to 500 / 30 days); closed trades use the full ledger.',from:decisions.length?Math.min(...decisions.map(d=>d.timestamp).filter(Number.isFinite)):null},contributors:{top:tokens.filter(t=>t.pnlSol>0).sort((a,b)=>b.pnlSol-a.pnlSol),bottom:tokens.filter(t=>t.pnlSol<0).sort((a,b)=>a.pnlSol-b.pnlSol),unavailable:tokens.filter(t=>t.pnlSol===null)},strategyPerformance,tradeHistory:trades};
}
