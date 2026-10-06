import {renderAgentSetup} from './agent-setup-ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const number=(value,places=6,signed=false)=>finite(value)?`${signed&&value>0?'+':''}${value.toLocaleString('en-US',{maximumFractionDigits:places})}`:'—';
const sol=(value,signed=false)=>finite(value)?number(value,Math.abs(value)<.0001&&value!==0?9:6,signed)+' SOL':'—';
const percent=value=>finite(value)?number(value,2,true)+'%':'—';
const tone=value=>finite(value)?value<0?'negative':value>0?'positive':'neutral':'neutral';
const clock=value=>{const stamp=typeof value==='number'?value:Date.parse(value);return Number.isFinite(stamp)?new Date(stamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';};
const link=(label,tab)=>`<button class="tw-overview-section-link" type="button" data-overview-action="${tab}">${label} <span aria-hidden="true">→</span></button>`;

function chart(history,start){
 const points=(Array.isArray(history)?history:[]).filter(point=>Number.isFinite(Number(point?.timestamp))).sort((a,b)=>a.timestamp-b.timestamp);
 const recorded=points.filter(point=>finite(point.portfolioValueSol));
 if(recorded.length<2)return '<div class="aw-chart-empty">Not enough recorded values yet.</div>';
 const first=points[0].timestamp,span=Math.max(1,points.at(-1).timestamp-first),values=recorded.map(point=>point.portfolioValueSol),low=Math.min(...values,finite(start)?start:Infinity),high=Math.max(...values,finite(start)?start:-Infinity),pad=Math.max((high-low)*.2,Math.abs(high)*.001,.000001),lo=low-pad,hi=high+pad;
 const width=360,left=53,right=344;
 const x=point=>left+(point.timestamp-first)/span*(right-left),y=value=>224-(value-lo)/(hi-lo)*185;
 const groups=[];let group=[],previous=null;
 for(const point of points){if(!finite(point.portfolioValueSol)||previous!==null&&point.timestamp-previous>600000){if(group.length)groups.push(group);group=[];}if(finite(point.portfolioValueSol))group.push(point);previous=finite(point.portfolioValueSol)?point.timestamp:null;}if(group.length)groups.push(group);
 const lines=groups.filter(series=>series.length>1).map(series=>`<polyline class="ao-line" points="${series.map(point=>`${x(point)},${y(point.portfolioValueSol)}`).join(' ')}"/>`).join('');
 const isolated=groups.filter(series=>series.length===1).map(series=>`<circle data-ao-isolated cx="${x(series[0])}" cy="${y(series[0].portfolioValueSol)}" r="3"/>`).join('');
 const grid=[0,1,2,3].map(index=>{const value=hi-(hi-lo)*index/3,yy=y(value);return `<path class="aw-grid" d="M${left} ${yy} H${right}"/><text class="aw-axis" x="${left-8}" y="${yy+4}" text-anchor="end">${esc(number(value,4))}</text>`;}).join('');
 const ticks=[0,1,2].map(index=>`<text class="ao-axis ao-axis-x" x="${left+(right-left)*index/2}" y="258" text-anchor="${index===0?'start':index===2?'end':'middle'}">${esc(clock(first+span*index/2))}</text>`).join('');
 const last=recorded.at(-1),samples=recorded.map(point=>`<circle data-ao-sample data-x="${x(point)}" data-y="${y(point.portfolioValueSol)}" data-time="${point.timestamp}" data-value="${point.portfolioValueSol}" cx="${x(point)}" cy="${y(point.portfolioValueSol)}" r="4"/>`).join('');
 return `<div class="ao-chart-stage"><svg class="ao-sparkline" viewBox="0 0 ${width} 280" preserveAspectRatio="xMidYMid meet" role="img" tabindex="0" aria-label="Recorded Paper portfolio values; missing intervals remain gaps">${grid}${finite(start)?`<path class="aw-start-line" d="M${left} ${y(start)} H${right}"/><text class="aw-start-label" x="${left+6}" y="${Math.max(24,y(start)-8)}">START ${esc(number(start,4))} SOL</text>`:''}${lines}${isolated}${samples}<line class="ao-crosshair" x1="0" x2="0" y1="39" y2="224" hidden/><circle class="ao-hover-dot" cx="0" cy="0" r="5" hidden/><circle class="aw-endpoint" cx="${x(last)}" cy="${y(last.portfolioValueSol)}" r="5"/><text class="aw-current-label" x="${right-4}" text-anchor="end" y="${Math.max(26,y(last.portfolioValueSol)-9)}">${esc(number(last.portfolioValueSol,6))} SOL</text>${ticks}</svg><div class="ao-chart-tooltip" role="status" hidden></div></div>`;
}

function tokenIdentity(position,trading){
 const symbol=typeof position.tokenSymbol==='string'?position.tokenSymbol.trim():'';
 const matchingName=position.tokenMint&&trading?.tokenMint===position.tokenMint?trading.tokenName:null;
 const name=typeof (position.tokenName||matchingName)==='string'?(position.tokenName||matchingName).trim():'';
 const validSymbol=/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(symbol);
 if(name)return name+(validSymbol&&symbol.toLowerCase()!==name.toLowerCase()?' · $'+symbol:'');
 if(validSymbol)return '$'+symbol;
 return typeof position.tokenMint==='string'&&position.tokenMint.trim()?position.tokenMint.slice(0,5)+'…'+position.tokenMint.slice(-4):'Unknown token';
}

function positionView(position,trading){
 if(!position)return `<section class="aw-position tw-overview-panel" aria-labelledby="aw-position-title"><h2 id="aw-position-title">CURRENT POSITION</h2><div class="aw-position-absent"><h3>NO OPEN POSITION</h3><p>Paper positions appear here after an entry.</p></div>${link('VIEW TRADING','trading')}</section>`;
 const detail=(label,value)=>`<div><dt>${label}</dt><dd>${value}</dd></div>`;
 const held=position.openedAt?Math.max(0,Math.floor((Date.now()-new Date(position.openedAt).getTime())/60000))+'m':'—';
 return `<section class="aw-position tw-overview-panel" aria-labelledby="aw-position-title"><h2 id="aw-position-title">CURRENT POSITION</h2><h3>${esc(tokenIdentity(position,trading))}</h3><div class="aw-position-pnl"><strong class="${tone(position.pnlPercent)}">${percent(position.pnlPercent)}</strong><span class="${tone(position.pnlSol)}">${sol(position.pnlSol,true)}</span></div><div class="aw-position-value"><span>POSITION VALUE</span><strong>${sol(position.marketValueSol??position.currentValueSol)}</strong></div><dl class="aw-position-details">${detail('ENTRY',finite(position.entryPriceUsd)?'$'+number(position.entryPriceUsd,8):'—')}${detail('CURRENT',finite(position.currentPriceUsd)?'$'+number(position.currentPriceUsd,8):'—')}${detail('SIZE',sol(position.costSol??position.entrySizeSol??position.sizeSol))}${detail('HELD',held)}${detail('TP',finite(position.takeProfitPercent)?'+'+number(position.takeProfitPercent,2)+'%':'—')}${detail('SL',finite(position.stopLossPercent)?'−'+number(position.stopLossPercent,2)+'%':'—')}</dl>${link('VIEW POSITION','trading')}</section>`;
}

function humanReason(event){
 const raw=typeof event.reason==='string'?event.reason.trim():'';
 if(!raw)return 'See activity for details';
 if(/paused by owner/i.test(raw))return 'Paused by owner';
 if(/entry thresholds? met|entry conditions? passed/i.test(raw))return 'Entry conditions passed';
 if(/momentum.*(?:above|passed)/i.test(raw))return 'Momentum threshold passed';
 if(/momentum.*(?:below|not met)/i.test(raw))return 'Momentum below threshold';
 if(/liquidity.*(?:below|not met)/i.test(raw))return 'Liquidity threshold not met';
 if(/risk.*reject/i.test(raw))return 'Risk check rejected this entry';
 if(/^[A-Z0-9_]+$/.test(raw))return raw.replaceAll('_',' ').toLowerCase().replace(/^./,letter=>letter.toUpperCase());
 if(/\d/.test(raw)&&raw.length>50)return 'See detailed reasoning in Activity';
 return raw.length<=90?raw:'See detailed reasoning in Activity';
}

function activity(events){
 if(!events?.length)return '<p class="aw-empty">No recent activity recorded.</p>';
 const rows=events.slice(0,5).map(event=>{const action=String(event.type||'UPDATE').replaceAll('_',' '),negative=/SKIP|REJECT|FAIL/.test(action),positive=/BUY|SELL/.test(action),token=event.tokenSymbol||event.tokenName||(event.tokenMint?String(event.tokenMint).slice(0,5)+'…'+String(event.tokenMint).slice(-4):'AGENT');return `<li><time>${esc(clock(event.timestamp))}</time><span class="tw-feed-event tw-feed-event--${negative?'risk':positive?'buy':'decision'}">${esc(action)}</span><strong>${esc(token)}</strong><p>${esc(humanReason(event))}</p></li>`;}).join('');
 return `<div class="aw-activity-head" aria-hidden="true"><span>TIME</span><span>ACTION</span><span>TOKEN</span><span>REASON</span></div><ol class="aw-activity-list">${rows}</ol>`;
}

export function renderAssociatedCoin({agent,contract,t}={}){
 const bound=!!agent?.creator&&contract?.id===agent.id&&contract.owner===agent.creator&&contract.lifecycle?.agent?.id===agent.id;
 const lifecycle=bound?contract.lifecycle:null,launch=lifecycle?.launch,token=lifecycle?.token;
 const confirmed=launch?.state==='CONFIRMED'&&token?.state==='CONFIRMED'&&launch.network==='solana:101'&&typeof launch.signature==='string'&&launch.signature.trim()&&typeof token.mint==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.mint);
 const state=bound?launch?.state??'UNAVAILABLE':'UNAVAILABLE';
 const labels={NOT_CONFIGURED:'TOKEN NOT CONFIGURED',CONFIGURED_NOT_LAUNCHED:'TOKEN CONFIGURED · NOT LAUNCHED',PREPARED:'LAUNCH PREPARED',AWAITING_OWNER_APPROVAL:'AWAITING OWNER APPROVAL',RECONCILIATION_REQUIRED:'RECONCILIATION REQUIRED',FAILED:'LAUNCH FAILED',UNAVAILABLE:'RECEIPT STATUS UNAVAILABLE'};
 const label=confirmed?'LAUNCH CONFIRMED':labels[state]??'RECEIPT STATUS UNAVAILABLE';
 const known=Object.hasOwn(labels,state)&&state!=='UNAVAILABLE';
 const coherent=bound&&!!token&&!!launch&&(confirmed||known&&['CONFIGURED','NOT_CONFIGURED'].includes(token.state)&&(!launch.network||launch.network==='solana:101'));
 const provenance=coherent?'BACKEND VERIFIED':'UNAVAILABLE';
 const name=bound?contract.coin?.name??(confirmed?'Token metadata unavailable':'No token configured'):'Token information unavailable';
 const policy=t?.paperTargetPolicy;
 const policyCopy=policy?.kind==='ASSOCIATED_COIN'?(policy.available===true?'Associated coin only':`Associated coin unavailable: ${policy.reason??'receipt verification required'}`):policy?.kind==='GENERAL'?'General Paper market configuration':'Paper target policy unavailable';
 return `<section class="aw-position tw-overview-panel" aria-label="Associated coin"><h2>ASSOCIATED COIN</h2><h3>${esc(name)}</h3><p>${esc(label)}</p>${confirmed?`<details><summary>Launch receipt · Advanced</summary><p>${provenance} · Mainnet receipt projection</p><dl class="aw-position-details"><div><dt>MINT / CA</dt><dd style="overflow-wrap:anywhere">${esc(token.mint)}</dd></div><div><dt>RECEIPT SIGNATURE</dt><dd style="overflow-wrap:anywhere">${esc(launch.signature)}</dd></div></dl></details><a class="at-text-link" href="https://pump.fun/coin/${encodeURIComponent(token.mint)}" target="_blank" rel="noopener noreferrer">VIEW ASSOCIATED COIN</a>`:'<p>'+provenance+' · Mainnet receipt projection</p><p>A confirmed Mainnet receipt is required before showing a mint or market link.</p>'}<p>Paper · ${esc(t?.status??'STATUS UNAVAILABLE')} · ${esc(policyCopy)}</p><p>Launch confirmation does not authorize trading. Real trading remains separately gated.</p><a class="at-text-link" href="#/tokens/${encodeURIComponent(agent?.id??'')}">VIEW TOKEN LIFECYCLE</a></section>`;
}

export function renderAgentOverview({t,a,agent,contract,setup}){
 const summary=a?.summary??t??{},position=t?.openPositions?.[0],portfolio=summary.portfolioValueSol,roi=summary.roiPercent;
 const status=t?.status==='PAUSED'&&position?'PAUSED · POSITION OPEN':t?.status==='WORKING'&&position?'POSITION OPEN':t?.status==='WORKING'?'RUNNING':t?.status||'STATUS UNAVAILABLE';
 const description=!t?'Agent state unavailable':position&&t.status==='PAUSED'?'Scanner paused. Position monitoring continues.':position&&t.status==='WORKING'?'Position open. Scanner remains active.':position?'Position open.':t.status==='WORKING'?'Scanning markets for an entry.':'No active market scan.';
 return `<div class="ao-overview aw-overview">
 ${agent?renderAgentSetup(setup,agent)+renderAssociatedCoin({agent,contract,t}):''}
 <section class="aw-status" aria-label="Agent status"><div><span class="tw-world-eyebrow">PAPER SIMULATION STATUS</span><h2>${esc(status)}</h2><p>${esc(description)}</p></div><div class="aw-status-update"><span>LAST UPDATE</span><strong>${t?.lastUpdated?esc(clock(t.lastUpdated)):'—'}</strong></div></section>
 ${!t||!a?'<p class="aw-unavailable" role="status">Some Paper values are unavailable.</p>':''}
 <div class="aw-primary-grid">${positionView(position,t)}<section class="aw-performance tw-overview-panel" aria-labelledby="aw-performance-title"><h2 id="aw-performance-title">PERFORMANCE</h2><div class="aw-performance-value"><strong title="${esc(number(portfolio,9))} SOL">${finite(portfolio)?number(portfolio,6)+' SOL':'—'}</strong><span class="${tone(roi)}">${percent(roi)}</span></div><div class="aw-performance-pnl"><span>TOTAL PNL</span><strong class="${tone(summary.totalPnlSol)}">${sol(summary.totalPnlSol,true)}</strong></div><div class="aw-chart ao-chart" data-start-capital="${finite(summary.paperStartingCapitalSol)?summary.paperStartingCapitalSol:''}">${chart(a?.portfolioHistory??[],summary.paperStartingCapitalSol)}</div>${link('VIEW PERFORMANCE','performance')}</section></div>
 <section class="aw-activity" aria-labelledby="aw-activity-title"><header><h2 id="aw-activity-title">RECENT ACTIVITY</h2>${link('VIEW ALL','activity')}</header>${activity(t?.activity)}</section>
 </div>`;
}
