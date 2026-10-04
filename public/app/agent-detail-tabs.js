import {request} from './backend.js';
import {mountAgentPerformance} from './agent-performance-ui.js';
import {mountAgentSettings} from './agent-settings-ui.js';
import {renderAgentTrading,renderReasoning} from './agent-trading-ui.js';
import {renderAgentOverview} from './agent-overview-ui.js';
import {mountAgentActivity} from './agent-activity-ui.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const number=(value,digits=4)=>value==null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:digits});
const sol=value=>value==null?'Unavailable':`${number(Number(value)/1e9,9)} SOL`;
const time=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString():'Time unavailable';
const paperStatus=value=>({WORKING:'Scanning markets',PAUSED:'Paused',READY:'Ready to start',DRAFT:'Not configured'})[value]??'Status unavailable';
const TABS=[['overview','Overview'],['trading','Trading'],['performance','Performance'],['activity','Activity'],['settings','Settings']];
const matched=(result,id)=>result.status==='fulfilled'&&result.value!==null&&typeof result.value==='object'&&!Array.isArray(result.value)&&result.value.agentId===id?result.value:null;
const position=p=>p?`<dl class="ad-position"><div><dt>Token</dt><dd>${esc(p.tokenSymbol||p.tokenMint||'Unknown')}</dd></div><div><dt>Entry</dt><dd>${number(p.entryPriceUsd,8)} USD</dd></div><div><dt>Current price</dt><dd>${number(p.currentPriceUsd,8)} USD</dd></div><div><dt>Position value</dt><dd>${number(p.marketValueSol,9)} SOL</dd></div><div><dt>Floating PnL</dt><dd>${number(p.pnlSol,9)} SOL</dd></div><div><dt>Take profit</dt><dd>${p.takeProfitPercent==null?'Set in strategy':number(p.takeProfitPercent,2)+'%'}</dd></div><div><dt>Stop loss</dt><dd>${p.stopLossPercent==null?'Set in strategy':number(p.stopLossPercent,2)+'%'}</dd></div><div><dt>Holding time</dt><dd>${p.openedAt?Math.max(0,Math.floor((Date.now()-new Date(p.openedAt).getTime())/60000))+' min':'—'}</dd></div></dl>`:'<p class="ad-empty">No open position.<br>Your agent is scanning for opportunities.</p>';
const chart=points=>{
 const samples=(points??[]).filter(p=>Number.isFinite(p.portfolioValueSol)).slice(-24);
 if(samples.length<2)return '<p class="ad-empty">The equity curve will appear after more Paper snapshots are recorded.</p>';
 const values=samples.map(p=>p.portfolioValueSol),min=Math.min(...values),range=Math.max(...values)-min||0.000001;
 return `<svg class="ad-equity-chart" viewBox="0 0 360 120" preserveAspectRatio="none" role="img" aria-label="Recent recorded Paper portfolio value"><polyline points="${samples.map((p,i)=>`${8+i*344/(samples.length-1)},${110-(p.portfolioValueSol-min)/range*100}`).join(' ')}"/></svg><p class="ad-muted">Recorded Paper equity · ${samples.length} recent samples</p>`;
};
function heading(title,eyebrow='AGENT WORKSPACE'){return `<header class="ad-section-head"><div><p>${eyebrow}</p><h2>${title}</h2></div></header>`;}

export function mountAgentDetailTabs(host,agent,{isCurrent=()=>true,mountLaunch=()=>Promise.resolve(),onTradingState=()=>{},loadContract=id=>request('/agents/'+encodeURIComponent(id)+'/contract')}={}){
 let active='overview',controller=null,dead=false,version=0;
 host.className='tw-agent-tabs';
 host.innerHTML=`<nav class="ad-tablist" role="tablist" aria-label="Agent Detail sections">${TABS.map(([key,label])=>`<button type="button" role="tab" data-agent-tab="${key}" aria-selected="${key==='overview'}" tabindex="${key==='overview'?'0':'-1'}">${label}</button>`).join('')}</nav><div class="ad-tab-panel" role="tabpanel" id="tw-agent-tab-panel" aria-label="Overview"></div>`;
 const panel=host.querySelector('#tw-agent-tab-panel');
 function select(tab){
  if(dead||!TABS.some(([key])=>key===tab))return;
  if(active==='settings'&&controller?.hasUnsaved?.()&&!window.confirm('Your trading plan has unsaved changes. Leave Settings and discard them?'))return;
  controller?.destroy?.();controller=null;version++;active=tab;
  host.querySelectorAll('[data-agent-tab]').forEach(button=>{const selected=button.dataset.agentTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  panel.setAttribute('aria-label',TABS.find(([key])=>key===tab)[1]);panel.dataset.agentPanel=tab;
  panel.innerHTML='<p role="status" class="ad-loading">Loading '+esc(tab)+'…</p>';
  const current=version;
  const valid=()=>!dead&&isCurrent()&&version===current;
  controller=({overview:overviewTab,trading:tradingTab,performance:performanceTab,activity:activityTab,settings:settingsTab})[tab](panel,agent,valid,{select,mountLaunch,onTradingState,loadContract});
 }
 host.querySelector('.ad-tablist').addEventListener('click',event=>{const button=event.target.closest('[data-agent-tab]');if(button)select(button.dataset.agentTab);});
 host.querySelector('.ad-tablist').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=TABS.findIndex(([key])=>key===active);
  const next=event.key==='Home'?0:event.key==='End'?TABS.length-1:(index+(event.key==='ArrowRight'?1:-1)+TABS.length)%TABS.length;
  select(TABS[next][0]);host.querySelector('[data-agent-tab="'+TABS[next][0]+'"]').focus();
 });
 select('overview');
 return {select,destroy(){dead=true;version++;controller?.destroy?.();host.innerHTML='';}};
}

function overviewTab(host,agent,valid,{select,onTradingState,loadContract}){
 let busy=false,snapshot=null;const base='/agents/'+encodeURIComponent(agent.id);
 host.addEventListener('click',event=>{const action=event.target.closest('[data-overview-action]')?.dataset.overviewAction;if(action)select(action);});
 const chartPointer=event=>{const stage=event.target.closest?.('.ao-chart-stage');if(!stage)return;const svg=stage.querySelector('.ao-sparkline'),samples=[...stage.querySelectorAll('[data-ao-sample]')];if(!svg||!samples.length)return;const rect=svg.getBoundingClientRect(),chartWidth=svg.viewBox.baseVal.width,cursor=(event.clientX-rect.left)/rect.width*chartWidth,nearest=samples.reduce((best,node)=>Math.abs(Number(node.dataset.x)-cursor)<Math.abs(Number(best.dataset.x)-cursor)?node:best,samples[0]),x=Number(nearest.dataset.x),y=Number(nearest.dataset.y),value=Number(nearest.dataset.value),time=Number(nearest.dataset.time),rawStart=stage.closest('.ao-chart')?.dataset.startCapital,start=rawStart===''?NaN:Number(rawStart),pnl=Number.isFinite(start)?value-start:null,roi=Number.isFinite(start)&&start>0?pnl/start*100:null,tooltip=stage.querySelector('.ao-chart-tooltip'),cross=svg.querySelector('.ao-crosshair'),dot=svg.querySelector('.ao-hover-dot');if(Math.abs(x-cursor)>chartWidth*.045){tooltip.hidden=cross.hidden=dot.hidden=true;return;}const number=(n,d=6)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—';tooltip.replaceChildren();const stamp=document.createElement('time'),price=document.createElement('strong'),change=document.createElement('span');stamp.textContent=new Date(time).toLocaleString();price.textContent=number(value,9)+' SOL';change.textContent='PnL '+number(pnl,9)+(Number.isFinite(pnl)?' SOL':'')+' · ROI '+number(roi,2)+(Number.isFinite(roi)?'%':'');tooltip.append(stamp,price,change);tooltip.hidden=false;tooltip.style.left=Math.min(rect.width<500?38:75,Math.max(4,x/chartWidth*100))+'%';tooltip.style.top=Math.min(68,Math.max(5,y/2.8))+'%';cross.hidden=dot.hidden=false;cross.setAttribute('x1',x);cross.setAttribute('x2',x);dot.hidden=false;dot.setAttribute('cx',x);dot.setAttribute('cy',y);};
 const chartLeave=event=>{if(!event.target.classList?.contains('ao-chart-stage'))return;const stage=event.target;for(const selector of ['.ao-chart-tooltip','.ao-crosshair','.ao-hover-dot']){const item=stage.querySelector(selector);if(item)item.hidden=true;}};
 host.addEventListener('pointermove',chartPointer);host.addEventListener('pointerdown',chartPointer);host.addEventListener('pointerleave',chartLeave,true);
 async function load(){
  if(!valid()||busy)return;busy=true;
  const [trading,analytics,decisions,contract]=await Promise.allSettled([()=>request(base+'/trading'),()=>request(base+'/analytics'),()=>request(base+'/trading/decisions?filter=all'),()=>loadContract(agent.id)].map(read=>Promise.resolve().then(read)));
  busy=false;if(!valid())return;
  const t=matched(trading,agent.id),a=matched(analytics,agent.id),decisionData=matched(decisions,agent.id),d=Array.isArray(decisionData?.decisions)?decisionData.decisions[0]:null;
  onTradingState(t);
  snapshot={t,a,d,contract:contract.status==='fulfilled'?contract.value:null};paint();
 }
 function paint(){
  if(!snapshot||!valid())return;
  const {t,a,d,contract}=snapshot;
  host.innerHTML=renderAgentOverview({t,a,d,agent,contract});
 }
 load();const timer=setInterval(load,20000);return {destroy(){clearInterval(timer);host.removeEventListener('pointermove',chartPointer);host.removeEventListener('pointerdown',chartPointer);host.removeEventListener('pointerleave',chartLeave,true);}};
}

function tradingTab(host,agent,valid,{select,onTradingState}){
 const base='/agents/'+encodeURIComponent(agent.id)+'/trading';let busy=false;
 host.innerHTML='<div data-trading-content></div>';
 const content=host.querySelector('[data-trading-content]');
 async function load(){
  if(!valid()||busy||content.querySelector('.at-drawer')?.open)return;busy=true;
  const [tResult,rResult,dResult,cResult]=await Promise.allSettled([()=>request(base),()=>request(base+'/radar'),()=>request(base+'/decisions?filter=all'),()=>request(base+'/strategy-config')].map(read=>Promise.resolve().then(read)));
  busy=false;if(!valid())return;
  const t=matched(tResult,agent.id),r=matched(rResult,agent.id),decisionData=matched(dResult,agent.id),configData=matched(cResult,agent.id),d=Array.isArray(decisionData?.decisions)?decisionData.decisions[0]:null,config=configData?.config&&typeof configData.config==='object'&&!Array.isArray(configData.config)?configData.config:null;
  onTradingState(t);
  const working=t?.status==='WORKING';
  content.innerHTML=renderAgentTrading({agent,t,r,d,config});
  content.querySelectorAll('[data-edit-strategy]').forEach(button=>button.addEventListener('click',()=>select('settings')));
  content.querySelector('[data-view-position]')?.addEventListener('click',()=>select('overview'));
  const drawer=content.querySelector('.at-drawer');let opener=null;
  const openReason=item=>{if(!item)return;opener=document.activeElement;drawer.querySelector('[data-drawer-title]').textContent=(item.market?.symbol||'MARKET')+' · REASONING';drawer.querySelector('[data-reason-body]').innerHTML=renderReasoning(item);drawer.showModal();};
  content.querySelector('[data-reason-latest]')?.addEventListener('click',()=>openReason(d));
  content.querySelectorAll('[data-reason-index]').forEach(button=>button.addEventListener('click',()=>openReason(r?.opportunities?.[Number(button.dataset.reasonIndex)])));
  drawer.querySelector('[data-close-reason]').addEventListener('click',()=>drawer.close());
  drawer.addEventListener('click',event=>{if(event.target===drawer)drawer.close();});
  drawer.addEventListener('close',()=>opener?.focus());
  content.querySelectorAll('[data-tip]').forEach(button=>button.addEventListener('click',()=>{const was=button.getAttribute('aria-expanded')==='true';content.querySelectorAll('[data-tip]').forEach(b=>b.setAttribute('aria-expanded','false'));button.setAttribute('aria-expanded',String(!was));}));
  content.querySelector('[data-associated-configure]')?.addEventListener('click',async()=>{
   if(busy||!valid()||t?.paperTargetPolicy?.kind!=='ASSOCIATED_COIN'||t.paperTargetPolicy.available!==true)return;
   busy=true;const button=content.querySelector('[data-associated-configure]');button.disabled=true;
   try{const saved=await request(base+'/strategy-config');if(!valid())return;if(saved?.agentId!==agent.id||!saved.config?.strategy)throw Error('Paper strategy unavailable');await request(base+'/configure',{method:'POST',body:JSON.stringify({mode:'paper',strategy:saved.config.strategy,tokenMint:t.paperTargetPolicy.mint,targetPolicy:'ASSOCIATED_COIN'})});busy=false;await load();}
   catch(error){if(valid()){content.querySelector('[data-action-error]').textContent=error.message;button.disabled=false;}}
   finally{busy=false;}
  });
  content.querySelector('[data-paper-action]').onclick=async()=>{
   if(busy||!valid())return;busy=true;const button=content.querySelector('[data-paper-action]');button.disabled=true;
   try{if(working)await request(base+'/pause',{method:'POST',body:'{}'});else{const config=await request(base+'/strategy-config');if(!valid())return;if(config?.agentId!==agent.id||!config.config?.strategy)throw Error('Paper strategy unavailable');await request(base+'/enable',{method:'POST',body:JSON.stringify({mode:'paper',strategy:config.config.strategy,discovery:t.paperTargetPolicy?.kind==='ASSOCIATED_COIN'?false:t.discoveryMode||t.status==='DRAFT'})});}busy=false;await load();}
   catch(error){busy=false;if(valid()){content.querySelector('[data-action-error]').textContent=error.message;button.disabled=false;}}
   finally{busy=false;}
  };
 }
 load();const timer=setInterval(load,15000);return {destroy(){clearInterval(timer);}};
}

function performanceTab(host,agent,valid,{select}){
 const controller=mountAgentPerformance(host,agent,{isCurrent:valid,onActivity:()=>select('activity')});
 return {destroy(){controller.destroy();}};
}

function activityTab(host,agent,valid){
 return mountAgentActivity(host,agent,{isCurrent:valid});
}

function settingsTab(host,agent,valid,{mountLaunch}){
 return mountAgentSettings(host,agent,{isCurrent:valid,mountLaunch,mountSafety});
}

function mountSafety(host,base,valid){
 let dead=false,busy=false,stopped=false;
 host.innerHTML='<p role="status">Checking Real safety status…</p>';
 async function refresh(){
  if(dead||!valid())return;
  try{const state=await request(base);if(dead||!valid())return;stopped=state.emergencyStopped===true;host.innerHTML=`<p>${stopped?'Emergency Stop active — no new real-money execution.':'Real-money execution remains owner controlled.'}</p><button type="button" class="tw-button destructive" data-emergency ${stopped?'disabled':''}>${stopped?'EMERGENCY STOP ACTIVE':'EMERGENCY STOP'}</button><p role="alert" data-error></p>`;}
  catch{if(dead||!valid())return;host.innerHTML='<p>Safety status unavailable. The owner can still request Emergency Stop.</p><button type="button" class="tw-button destructive" data-emergency>EMERGENCY STOP</button><p role="alert" data-error></p>';}
  bind();
 }
 function bind(){host.querySelector('[data-emergency]')?.addEventListener('click',async()=>{
  if(busy||stopped||!window.confirm('Stop all new real-money execution?'))return;
  busy=true;const b=host.querySelector('[data-emergency]');b.disabled=true;
  try{await request(base+'/emergency-stop',{method:'POST',body:'{}'});stopped=true;host.innerHTML='<p role="status">EMERGENCY STOP ACTIVE. Existing uncertain transactions continue reconciliation.</p><button type="button" class="tw-button destructive" disabled>EMERGENCY STOP ACTIVE</button>';}
  catch(e){if(!dead){host.querySelector('[data-error]').textContent=e.message;b.disabled=false;}}
  finally{busy=false;}
 });}
 refresh();const timer=setInterval(()=>{if(!busy)refresh();},10000);return {destroy(){dead=true;clearInterval(timer);}};
}
