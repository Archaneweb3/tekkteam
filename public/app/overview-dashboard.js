import {request} from './backend.js';
import {hydrateCharacters} from './character-thumbnail.js';
import {esc,renderPerformance} from './trading-pages.js';
import {renderOverviewTop} from './overview-top.js';
import {renderOverviewFeed} from './overview-feed.js';

function payroll(data,connected,error){
 const agents=data?.agents??[];
 return `<section class="ov-payroll"><header><div><h2>On the Payroll</h2><p>${connected&&!error?agents.filter(a=>a.status==='WORKING').length:'—'} agents working now · Your workforce</p></div><a class="tw-button" href="#/agents">All agents</a></header>${error?`<p role="alert">${esc(error)}</p>`:!connected?'<p>Connect your owner wallet to view your working agents.</p>':!agents.length?'<p>No working agents yet. Start Paper Trading from an Agent Detail.</p>':`<div class="ov-payroll-grid">${agents.map(a=>`<a class="tw-agent" href="#/agent/${encodeURIComponent(a.agentId)}"><div class="tw-card-character"><img data-character="${esc(a.character)}" alt="${esc(a.name)}"></div><div class="tw-card-title"><h3>${esc(a.name)}</h3><span class="tw-status">${esc(a.status)}</span></div><p>${esc(a.strategy)} · Paper</p>${renderPerformance(a,true)}<p>${a.openPositions.length} open positions</p><span>View agent</span></a>`).join('')}</div>`}<a class="ov-expanded" href="#/payroll">Expanded payroll view</a></section>`;
}
export function mountOverview(host,{getSession}){
 let dead=false,busy=false,sort='roi',filter='all',network=null,leaders=null,pay=null,payError=null;
 host.classList.add('ov-dashboard');
 const paint=()=>{if(dead)return;host.innerHTML=renderOverviewTop(network,leaders,sort)+renderOverviewFeed(network.activity,network.agents,filter)+payroll(pay,!!getSession(),payError);hydrateCharacters(host);};
 async function load(){if(dead||busy||document.hidden)return;busy=true;try{
  const [n,l,p]=await Promise.all([request('/trading/network'),request('/trading/leaderboard?sort='+sort),getSession()?request('/trading/payroll').then(data=>({data}),e=>({error:e.message})):null]);
  if(dead)return;network=n;leaders=l.agents;pay=p?.data;payError=p?.error;paint();
 }catch(e){if(!dead)host.innerHTML=`<h1>Workforce Overview</h1><p role="alert">Unable to load network: ${esc(e.message)}</p><button class="tw-button" data-retry>Retry</button>`;}finally{busy=false;}}
 const click=e=>{const metric=e.target.closest('[data-sort]'),f=e.target.closest('[data-feed-filter]');if(metric){sort=metric.dataset.sort;load();}else if(f){filter=f.dataset.feedFilter;paint();}else if(e.target.closest('[data-retry]'))load();};
 host.innerHTML='<h1>Workforce Overview</h1><p role="status">Loading Paper network…</p>';host.addEventListener('click',click);const timer=setInterval(load,15000);document.addEventListener('visibilitychange',load);load();
 return {destroy(){dead=true;clearInterval(timer);host.removeEventListener('click',click);host.classList.remove('ov-dashboard');document.removeEventListener('visibilitychange',load);}};
}
