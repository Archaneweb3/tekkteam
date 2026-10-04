import {request} from './backend.js';
import {hydrateCharacters} from './character-thumbnail.js';
import {esc} from './trading-pages.js';
import {renderOverviewTop} from './overview-top.js';
import {renderOverviewFeed} from './overview-feed.js';

const amount=(value,suffix='')=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:5})+suffix:'—';
function payrollCard(a){
 const pnlClass=Number.isFinite(a.totalPnlSol)?a.totalPnlSol<0?'is-negative':'is-positive':'';
 return `<a class="tw-agent ov-payroll-card" data-status="${esc(a.status)}" href="#/agent/${encodeURIComponent(a.agentId)}"><div class="ov-payroll-card-head"><span class="ov-agent-id" title="${esc(a.agentId)}">ID ${esc(a.agentId)}</span><span class="tw-status" data-status="${esc(a.status)}">${esc(a.status)}</span></div><div class="tw-card-character"><img data-character="${esc(a.character)}" alt="${esc(a.name)}"></div><div class="ov-payroll-identity"><h3>${esc(a.name)}</h3><p>${esc(a.strategy)} <span>Paper</span></p></div><dl class="ov-payroll-capital"><div><dt>Paper portfolio</dt><dd>${amount(a.portfolioValueSol,' SOL')}</dd></div><div class="${pnlClass}"><dt>P&amp;L</dt><dd>${a.totalPnlSol>0?'+':''}${amount(a.totalPnlSol,' SOL')}</dd></div></dl><dl class="ov-payroll-stats"><div><dt>ROI</dt><dd>${a.roiPercent>0?'+':''}${amount(a.roiPercent,'%')}</dd></div><div><dt>Open positions</dt><dd>${a.openPositions.length}</dd></div><div><dt>Closed trades</dt><dd>${amount(a.closedPositionCount)}</dd></div></dl><span class="ov-payroll-view">View agent</span></a>`;
}
function payroll(data,connected,error){
 const agents=data?.agents??[];
 return `<section class="ov-payroll"><header><div><h2>On the Payroll</h2><p>${connected&&!error?agents.filter(a=>a.status==='WORKING').length:'—'} agents working now · Your workforce</p></div><a class="tw-button" href="#/agents">All agents</a></header>${error?`<p role="alert">${esc(error)}</p>`:!connected?'<p>Connect your owner wallet to view your working agents.</p>':!agents.length?'<p>No working agents yet. Start Paper Trading from an Agent Detail.</p>':`<div class="ov-payroll-grid">${agents.map(payrollCard).join('')}</div>`}<a class="ov-expanded" href="#/payroll">Expanded payroll view</a></section>`;
}
export function mountOverview(host,{getSession,onNetwork=()=>{}}){
 let dead=false,busy=false,sort='roi',filter='all',network=null,leaders=null,pay=null,payError=null,loadError=null;
 host.classList.add('ov-dashboard');
 const paint=()=>{if(dead)return;host.innerHTML=(loadError?`<p role="alert">${esc(loadError)}</p><button class="tw-button" data-retry>Retry</button>`:'')+renderOverviewTop(network,leaders,sort)+renderOverviewFeed(network?.activity,network?.agents,filter)+payroll(pay,!!getSession(),payError);hydrateCharacters(host);};
 async function load(){if(dead||busy||document.hidden)return;busy=true;try{
  const [n,l,p]=await Promise.all([request('/trading/network'),request('/trading/leaderboard?sort='+sort),getSession()?request('/trading/payroll').then(data=>({data}),e=>({error:e.message})):null]);
  if(dead)return;network=n;leaders=l.agents;pay=p?.data;payError=p?.error;loadError=null;paint();onNetwork(n);
 }catch(e){if(!dead){const denied=e.httpStatus===403;network=null;leaders=null;pay=null;payError='Payroll data is unavailable.';loadError=denied?'Workforce data is unavailable in this access context. This is not an empty workforce; no trading permission is granted.':`Unable to load network: ${e.message}`;paint();onNetwork(null);}}finally{busy=false;}}
 const click=e=>{const metric=e.target.closest('[data-sort]'),f=e.target.closest('[data-feed-filter]');if(metric){sort=metric.dataset.sort;load();}else if(f){filter=f.dataset.feedFilter;paint();}else if(e.target.closest('[data-retry]'))load();};
 host.innerHTML='<h1>Workforce Overview</h1><p role="status">Loading Paper network…</p>';host.addEventListener('click',click);const timer=setInterval(load,15000);document.addEventListener('visibilitychange',load);load();
 return {destroy(){dead=true;clearInterval(timer);host.removeEventListener('click',click);host.classList.remove('ov-dashboard');document.removeEventListener('visibilitychange',load);}};
}
