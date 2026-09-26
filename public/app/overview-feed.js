const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={BUY:'BUY',SELL:'SELL',POSITION_OPENED:'POSITION OPENED',POSITION_CLOSED:'POSITION CLOSED',SIGNAL_DETECTED:'SIGNAL',SIGNAL_SKIPPED:'SKIPPED',RISK_REJECTED:'RISK REJECTED',PAUSED:'PAUSED',RESUMED:'RESUMED',TRADING_STARTED:'STARTED',TRADING_STOPPED:'STOPPED'};
const number=value=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:6}):null;
function relative(timestamp){
 const stamp=typeof timestamp==='number'?timestamp:Date.parse(timestamp);
 if(!Number.isFinite(stamp))return 'Time unavailable';
 const seconds=Math.max(0,Math.floor((Date.now()-stamp)/1000));
 if(seconds<60)return seconds+' sec ago';
 if(seconds<3600)return Math.floor(seconds/60)+'m ago';
 if(seconds<86400)return Math.floor(seconds/3600)+'h ago';
 return Math.floor(seconds/86400)+'d ago';
}
/** Presentation only: use the same canonical events returned by the trading API. */
export function renderOverviewFeed(events,agents=[],filter='all'){
 const selected=['all','buys','sells','decisions'].includes(filter)?filter:'all';
 const names=new Map(agents.map(agent=>[agent.agentId??agent.id,agent]));
 const available=Array.isArray(events);
 const shown=(available?events:[]).filter(event=>selected==='all'||(selected==='buys'?event.type==='BUY':selected==='sells'?event.type==='SELL':!['BUY','SELL'].includes(event.type))).slice(0,8);
 return `<section class="tw-overview-feed" aria-labelledby="trading-desk-title"><header class="tw-feed-heading"><div><h2 id="trading-desk-title">Trading Desk</h2><p class="tw-feed-mode"><span aria-hidden="true"></span>PAPER LIVE FEED</p></div><a class="tw-feed-expanded" href="#/traders">View all activity</a></header><div class="tw-feed-filters" role="group" aria-label="Filter trading activity">${[['all','All'],['buys','Buys'],['sells','Sells'],['decisions','Decisions']].map(([key,label])=>`<button type="button" data-feed-filter="${key}" aria-pressed="${selected===key}">${label}</button>`).join('')}</div>${!available?'<p class="tw-feed-empty" role="status">Trading activity is unavailable.</p>':!shown.length?`<p class="tw-feed-empty">${selected==='all'?'No paper activity yet. Agent decisions and trades will appear here.':'No '+selected+' in the current activity feed.'}</p>`:`<ol class="tw-feed-list">${shown.map(event=>{
  const agent=names.get(event.agentId),character=agent?.character??agent?.characterId??agent?.skin;
  const tone=event.type==='BUY'?'buy':event.type==='SELL'?'sell':event.type==='RISK_REJECTED'?'risk':'decision';
  const size=number(event.executedSizeSol),pnl=number(event.pnlSol),percent=number(event.pnlPercent);
  const hasPnl=pnl!==null||percent!==null;
  const stamp=typeof event.timestamp==='number'?event.timestamp:Date.parse(event.timestamp);
  return `<li class="tw-feed-row"><a class="tw-feed-agent" href="#/trader/${encodeURIComponent(event.agentId)}">${character?`<img data-character="${esc(character)}" alt="${esc(agent?.name||'Agent')} character">`:''}<strong>${esc(agent?.name||event.agentId)}</strong></a><div class="tw-feed-action"><div class="tw-feed-action-title"><span class="tw-feed-event tw-feed-event--${tone}">${esc(labels[event.type]||event.type)}</span>${event.tokenSymbol?`<strong>$${esc(event.tokenSymbol)}</strong>`:''}</div>${event.reason?`<p>${esc(event.reason)}</p>`:''}</div><div class="tw-feed-values">${size!==null?`<strong>${size} <span>SOL</span></strong>`:''}${hasPnl?`<span class="tw-feed-pnl ${((event.pnlSol??event.pnlPercent)>=0)?'is-positive':'is-negative'}">${pnl!==null?(event.pnlSol>0?'+':'')+pnl+' SOL':(event.pnlPercent>0?'+':'')+percent+'%'} <span>P&amp;L</span></span>`:''}</div><time ${Number.isFinite(stamp)?`datetime="${new Date(stamp).toISOString()}" title="${esc(new Date(stamp).toLocaleString())}"`:''}>${relative(event.timestamp)}</time></li>`;
 }).join('')}</ol>`}</section>`;
}
