import {request} from './backend.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Number.isFinite(value)?Number(value).toLocaleString('en-US',{maximumFractionDigits:6}):'—';
const usd=value=>Number.isFinite(value)?'$'+Number(value).toLocaleString('en-US',{maximumFractionDigits:value<1?8:2}):'—';
const signed=value=>Number.isFinite(value)?`${value>0?'+':''}${number(value)}%`:'—';
const stamp=value=>Number.isFinite(value)?new Date(value).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—';
const decision=value=>value==='REJECTED'?'RISK REJECTED':['BUY','WATCH','SKIPPED','SELL'].includes(value)?value==='SKIPPED'?'SKIP':value:'NOT EVALUATED';
const tone=value=>value==='BUY'?'positive':value==='REJECTED'?'negative':'neutral';
const badge=value=>`<span class="tw-feed-event tw-feed-event--${value==='BUY'?'buy':value==='SELL'?'sell':value==='REJECTED'?'risk':'decision'} ${tone(value)}">${esc(decision(value))}</span>`;
const fact=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;

export function marketRowsFromRadars(agents,radars){
 const grouped=new Map();
 for(const {agent,radar} of radars){
  if(radar.agentId!==agent.id)continue;
  for(const item of radar.opportunities??[]){
   const market=item.market,mint=market?.mint;
   if(typeof mint!=='string'||!mint)continue;
   const key=mint.toLowerCase(),prior=grouped.get(key),observedAt=Number.isFinite(market.observedAt)?market.observedAt:0;
   if(!prior){grouped.set(key,{mint,market,item,agentNames:new Set([agent.name]),observedAt,agentId:agent.id,scanStatus:radar.status,freshnessMs:radar.freshnessMs??30000});continue;}
   prior.agentNames.add(agent.name);
   if(observedAt>prior.observedAt){Object.assign(prior,{market,item,observedAt,agentId:agent.id,scanStatus:radar.status,freshnessMs:radar.freshnessMs??30000});}
  }
 }
 return [...grouped.values()].sort((a,b)=>b.observedAt-a.observedAt);
}

function marketRow(row){
 const m=row.market,d=row.item,change=m.change5m,positive=Number.isFinite(change)?change>=0:null;
 return `<button type="button" class="market-feed-row" data-market-mint="${esc(row.mint)}" aria-label="View ${esc(m.tokenName||m.symbol||row.mint)} market details"><span class="market-token"><strong>${esc(m.symbol||'TOKEN')}</strong><small>${esc(m.tokenName||row.mint.slice(0,5)+'…'+row.mint.slice(-4))}</small>${row.agentNames.size?`<em>${d.finalDecision==='WATCH'?'WATCHED':'EVALUATED'} BY ${row.agentNames.size===1?esc([...row.agentNames][0]):row.agentNames.size+' AGENTS'}</em>`:''}</span><span class="market-price">${usd(m.priceUsd)}</span><span class="market-change ${positive===null?'':positive?'positive':'negative'}">${signed(change)}</span><span>${usd(m.liquidityUsd)}</span><span>${usd(m.volume5m)}</span><span>${Number.isFinite(m.buys5m)&&Number.isFinite(m.sells5m)?`${number(m.buys5m)} / ${number(m.sells5m)}`:'—'}</span><span>${badge(d.finalDecision)}</span></button>`;
}

function marketDetail(row){
 const m=row.market,d=row.item,why=d.reason?.summary||d.risk?.reason||'No recorded explanation.';
 return `<div class="market-detail-head"><span class="tw-overview-eyebrow">MARKET DETAIL</span><button type="button" class="market-detail-close" aria-label="Close market detail">×</button></div><h2>${esc(m.symbol||m.tokenName||'TOKEN')}</h2><p>${esc(m.tokenName||'Market snapshot')} · ${esc(m.venue||'Venue unavailable')}</p><div class="market-detail-price"><strong>${usd(m.priceUsd)}</strong><span class="${Number.isFinite(m.change5m)?m.change5m>=0?'positive':'negative':''}">${signed(m.change5m)} / 5M</span></div><dl class="market-detail-facts">${fact('LIQUIDITY',usd(m.liquidityUsd))}${fact('5M VOLUME',usd(m.volume5m))}${fact('BUYS / SELLS',Number.isFinite(m.buys5m)&&Number.isFinite(m.sells5m)?`${number(m.buys5m)} / ${number(m.sells5m)}`:'—')}${fact('LAST OBSERVED',esc(stamp(m.observedAt)))}</dl><section class="market-detail-decision"><span class="tw-overview-eyebrow">LATEST AGENT DECISION · PAPER</span><div>${badge(d.finalDecision)}</div><p>${esc(why)}</p><small>${row.agentNames.size===1?'Evaluated by '+esc([...row.agentNames][0]):row.agentNames.size+' agents evaluated'}</small></section><details class="market-technical"><summary>TECHNICAL DETAILS</summary><dl>${fact('MINT',esc(m.mint||'—'))}${fact('PAIR',esc(m.pair||'—'))}${fact('POOL',esc(m.verifiedPool||'—'))}${fact('EXECUTION VENUE',esc(m.executionSupport||'Unavailable'))}${fact('SOURCE',esc(m.source||'Unavailable'))}</dl></details>`;
}

async function loadRadars(agents,read){
 const results=[],failures=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,agents.length)},async()=>{
  while(cursor<agents.length){const agent=agents[cursor++];try{results.push({agent,radar:await read('/agents/'+encodeURIComponent(agent.id)+'/trading/radar')});}catch{failures.push(agent.id);}}
 }));
 return {results,failures};
}

export function mountMarketPage(host,{agents=[],owner=null,read=request}={}){
 const owned=owner?agents.filter(agent=>agent.creator===owner):[];
 let dead=false,busy=false,rows=[],radars=[],failures=[],filter='all',query='',loadVersion=0,opener=null;
 host.className='tw-world ov-dashboard tw-world-market';
 host.innerHTML=`<header class="market-heading tw-overview-heading"><div><p class="tw-overview-eyebrow">MARKET INTELLIGENCE</p><h1>MARKET</h1><p>Find what your Agents are watching.</p></div><span class="market-freshness" role="status">LATEST SNAPSHOTS</span></header><div class="market-toolbar"><label class="market-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search token or mint" aria-label="Search token or mint"></label><div class="market-filters" role="group" aria-label="Market filter"><button type="button" data-market-filter="all" aria-pressed="true">ALL</button><button type="button" data-market-filter="signals" aria-pressed="false">AGENT SIGNALS</button></div><button type="button" class="tw-button market-refresh" data-market-refresh>REFRESH</button></div><dl class="market-metrics tw-network-strip" aria-label="Market snapshot"></dl><div class="market-layout"><section class="market-feed tw-overview-panel"><header class="tw-overview-panel-head"><div><p class="tw-overview-eyebrow">AGENT MARKET SNAPSHOTS</p><h2>MARKET FEED</h2></div><span class="market-feed-count"></span></header><p class="market-source-note">Latest saved Agent scans · Rules-based momentum/activity checks using Dexscreener discovery. This is not the entire market.</p><div class="market-feed-table"><div class="market-feed-columns" aria-hidden="true"><span>TOKEN</span><span>PRICE</span><span>5M</span><span>LIQUIDITY</span><span>5M VOLUME</span><span>BUYS / SELLS</span><span>AGENT DECISION</span></div><div class="market-feed-list" aria-live="polite"></div></div></section><aside class="market-side"><section class="tw-overview-panel market-opportunities"><div class="tw-overview-panel-head"><div><p class="tw-overview-eyebrow">LATEST EVALUATIONS</p><h2>AGENT EVALUATIONS</h2></div></div><div class="market-opportunity-list"></div></section><section class="tw-overview-panel market-pulse"><div class="tw-overview-panel-head"><div><p class="tw-overview-eyebrow">FROM SAVED SCANS</p><h2>MARKET PULSE</h2></div></div><dl></dl></section></aside></div><dialog class="market-detail-dialog" aria-label="Market detail"></dialog>`;
 const $=selector=>host.querySelector(selector),dialog=$('.market-detail-dialog');
 const draw=()=>{
  if(dead)return;
  const now=Date.now(),fresh=rows.some(row=>row.observedAt>0&&now-row.observedAt<=row.freshnessMs&&!['STALE_DATA','ERROR','PROVIDER_UNAVAILABLE','RATE_LIMITED'].includes(row.scanStatus));
  const unavailable=!owner||busy&&!radars.length||failures.length&&!radars.length;
  const count=value=>unavailable?'—':value;
  $('.market-freshness').textContent=unavailable?'SNAPSHOTS UNAVAILABLE':fresh?'FRESH SNAPSHOTS':'LAST KNOWN SNAPSHOTS';
  const last=radars.reduce((max,{radar})=>Math.max(max,Number.isFinite(radar.lastChecked)?radar.lastChecked:0),0),buys=rows.filter(row=>row.item.finalDecision==='BUY').length,watching=rows.filter(row=>row.item.finalDecision==='WATCH').length;
  $('.market-metrics').innerHTML=[['MARKETS SHOWN',count(rows.length)],['BUY DECISIONS',count(buys)],['WATCHING',count(watching)],['LAST SCAN',last?stamp(last):'—']].map(([name,value])=>fact(name,esc(value))).join('');
  const shown=rows.filter(row=>`${row.market.symbol||''} ${row.market.tokenName||''} ${row.mint}`.toLowerCase().includes(query)&&(filter==='all'||['BUY','WATCH','REJECTED'].includes(row.item.finalDecision)));
  $('.market-feed-count').textContent=unavailable?'MARKETS UNAVAILABLE':shown.length+' MARKETS';
  $('.market-feed-list').innerHTML=busy&&!radars.length?Array.from({length:5},()=>'<div class="market-skeleton" aria-hidden="true"></div>').join(''):shown.length?shown.map(marketRow).join(''):failures.length&&!radars.length?'<div class="market-empty"><h3>MARKET DATA TEMPORARILY UNAVAILABLE</h3><p>Existing Agents continue according to their own lifecycle.</p><button type="button" class="tw-button" data-market-refresh>TRY AGAIN</button></div>':!owner?'<div class="market-empty"><h3>CONNECT YOUR WALLET</h3><p>Agent market snapshots are available to their owner.</p></div>':'<div class="market-empty"><h3>NO MARKETS YET</h3><p>Waiting for the next Agent discovery scan.</p><button type="button" class="tw-button" data-market-refresh>REFRESH</button></div>';
  const opportunities=rows.filter(row=>['BUY','WATCH','REJECTED','SKIPPED'].includes(row.item.finalDecision)).slice(0,4);
  $('.market-opportunity-list').innerHTML=opportunities.length?opportunities.map(row=>`<button type="button" class="market-opportunity" data-market-mint="${esc(row.mint)}"><span><strong>${esc(row.market.symbol||row.market.tokenName||'TOKEN')}</strong>${badge(row.item.finalDecision)}</span><small>${esc(row.item.reason?.summary||'Latest Agent evaluation')}</small><em>VIEW MARKET →</em></button>`).join(''):'<p class="market-side-empty">No saved Agent evaluations yet.</p>';
  if(unavailable)$('.market-opportunity-list').innerHTML='<p class="market-side-empty">Agent evaluations unavailable in this access context.</p>';
  $('.market-pulse dl').innerHTML=fact('Markets shown',esc(count(rows.length)))+fact('Buy decisions',esc(count(buys)))+fact('Watching',esc(count(watching)));
 };
 async function load(){if(dead||busy||!owner||document.hidden)return;busy=true;const version=++loadVersion;draw();try{const next=await loadRadars(owned,read);if(dead||version!==loadVersion)return;radars=next.results;failures=next.failures;rows=marketRowsFromRadars(owned,radars);}finally{busy=false;draw();}}
 const click=event=>{
  const target=event.target.closest('[data-market-filter],[data-market-refresh],[data-market-mint],.market-detail-close');if(!target)return;
  if(target.matches('[data-market-refresh]')){load();return;}
  if(target.matches('[data-market-filter]')){filter=target.dataset.marketFilter;host.querySelectorAll('[data-market-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button===target)));draw();return;}
  if(target.matches('.market-detail-close')){dialog.close();return;}
  const row=rows.find(item=>item.mint===target.dataset.marketMint);if(!row)return;opener=target;dialog.innerHTML=marketDetail(row);dialog.showModal();dialog.querySelector('.market-detail-close').focus();
 };
 host.addEventListener('click',click);$('.market-search input').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();draw();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{opener?.focus();opener=null;});
 draw();load();
 return {destroy(){dead=true;loadVersion++;if(dialog.open)dialog.close();host.removeEventListener('click',click);}};
}
