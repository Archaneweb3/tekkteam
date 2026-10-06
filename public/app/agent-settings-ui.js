import {request as api} from './backend.js';
import {characterPortraitUrl} from './character-registry.js';
import {mountStrategyCenter} from './strategy-center.js';
import {openAgentWalletDrawer} from './agent-wallet-ui.js';
import {mountControlledSwap} from './controlled-swap-ui.js';
import {mountAutonomousAcceptance} from './autonomous-acceptance-ui.js';
import {PERSONALITIES} from './agent-personalities.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const short=value=>value?`${value.slice(0,6)}…${value.slice(-6)}`:'Not created';
const sol=value=>value==null||!Number.isFinite(Number(value))?'Unavailable':`${(Number(value)/1e9).toLocaleString('en-US',{maximumFractionDigits:9})} SOL`;
const section=(name,copy,body,extra='')=>`<section class="as-clean-section ${extra}"><header><h3>${name}</h3>${copy?`<p>${copy}</p>`:''}</header>${body}</section>`;
const row=(label,value,action='',extra='')=>`<div class="as-clean-row ${extra}"><div class="as-row-label">${label}</div><div class="as-row-value">${value}</div><div class="as-row-action">${action}</div></div>`;
const action=(label,key,disabled=false)=>`<button type="button" class="as-text-action" data-settings-action="${key}" ${disabled?'disabled':''}>${label}</button>`;

export function mountAgentSettings(host,agent,{request=api,isCurrent=()=>true,mountSafety=()=>({destroy(){}})}={}){
 const base='/agents/'+encodeURIComponent(agent.id),walletBase=base+'/trading/wallet';
 let dead=false,walletState=null,tokenState=null,strategyController=null,safetyController=null,controlledController=null,acceptanceController=null,copyTimer=null,editorDirty=false;
 const tokenName=agent.coin?.name||agent.token?.name||'Not configured',tokenTicker=agent.coin?.ticker||agent.token?.symbol;
 const general=section('GENERAL','Identity and appearance.',
  row('AGENT NAME',`<strong>${esc(agent.name)}</strong>`)+
  row('CHARACTER',`<span class="as-character-value"><img src="${characterPortraitUrl(agent)}" alt=""><strong>${esc(agent.characterName||agent.character||'Agent character')}</strong></span>`,`<a class="as-text-action" href="#/skins">CHANGE CHARACTER →</a>`)+
  row('DESCRIPTION',`<span>${esc(agent.description||'No description added.')}</span>`));
 const trading=section('TRADING','Strategy and trading behavior.',
  row('STRATEGY','<strong data-plan-strategy>Checking…</strong>')+
  row('RISK PROFILE','<span data-plan-risk>Checking…</span>')+
  row('TRADE SIZE','<span data-plan-size>Checking…</span>')+
  row('STOP LOSS','<span data-plan-stop>Checking…</span>')+
  row('TAKE PROFIT','<span data-plan-profit>Checking…</span>')+
  row('MAX HOLD','<span data-plan-hold>Checking…</span>')+
  `<div class="as-section-action"><span class="as-unsaved-indicator" data-settings-dirty hidden>UNSAVED CHANGES</span>${action('EDIT TRADING PLAN →','trading')}</div>`,'as-trading-section');
 const wallet=section('AGENT WALLET','',
  row('ADDRESS','<strong data-agent-short>Checking…</strong>')+
  row('BALANCE & ASSETS','<strong data-agent-balance>Checking…</strong><span class="as-wallet-asset-count" data-agent-asset-count> · Assets unavailable</span>')+
  `<div class="as-section-action"><button type="button" class="as-text-action" data-settings-action="wallet" data-settings-nav="wallet">MANAGE WALLET →</button></div>`);
 const token=section('TOKEN','',
  row('TOKEN',`<strong>${esc(tokenName)}${tokenTicker?' / $'+esc(tokenTicker):''}</strong>`)+
  row('STATUS','<strong data-token-status>Checking launch status…</strong>')+
  row('MINT','<span data-token-mint>—</span>','<button type="button" class="as-text-action" data-copy-address="mint" disabled>COPY</button>','as-mint-row')+
  `<div class="as-section-action">${action('CHECKING TOKEN STATUS…','launch',true)}</div>`);
 const danger=section('DANGER ZONE','',row('DELETE AGENT','<span>Permanently remove this Agent from your active workforce.</span>','<button type="button" class="as-danger-action" data-settings-action="delete">DELETE AGENT</button>'),'as-danger-zone');
 host.innerHTML=`<section class="as-settings as-clean"><header class="as-header"><div><h2>SETTINGS</h2><p>Manage your Agent.</p></div><span class="as-mode">PAPER · SIMULATED</span></header>${general}${trading}${wallet}${token}${danger}<details class="as-clean-advanced"><summary>ADVANCED SETTINGS →</summary><p>Developer and acceptance tools are available only for the supported agent.</p><div data-settings-safety></div><details data-dev-group="controlled"><summary>CONTROLLED REAL</summary><div data-controlled></div></details><details data-dev-group="acceptance"><summary>AUTONOMOUS ACCEPTANCE</summary><div data-acceptance></div></details></details><dialog class="as-flow-dialog" data-settings-dialog="trading" aria-label="Edit trading plan"><div class="as-dialog-head"><h2>EDIT TRADING PLAN</h2><button type="button" data-settings-close aria-label="Close trading plan">×</button></div><p class="as-dialog-state" data-settings-save-state>Loading saved strategy…</p><div id="tw-strategy-center"></div></dialog></section>`;
 const q=selector=>host.querySelector(selector),strategyDialog=q('[data-settings-dialog="trading"]');
 const show=dialog=>{if(!dialog.open)dialog.showModal();};
 function updatePlan(){if(dead)return;const center=q('#tw-strategy-center');if(!center?.querySelector('[data-plan-capital]'))return;
  const get=key=>Number(center.querySelector(`[data-config="${key}"]`)?.value),preset=center.querySelector('[data-preset][aria-pressed="true"]')?.dataset.preset;
  q('[data-plan-strategy]').textContent=(preset||agent.strategy||'Unavailable').toUpperCase();q('[data-plan-risk]').textContent=PERSONALITIES[preset]?.label||({selective:'Conservative',balanced:'Balanced',momentum:'Aggressive'})[preset]||'Custom';
  const size=get('risk.maxSolPerTrade'),stop=get('position.stopLossPercent'),profit=get('position.takeProfitPercent');
  q('[data-plan-size]').textContent=Number.isFinite(size)?size+' SOL':'Unavailable';q('[data-plan-stop]').textContent=Number.isFinite(stop)?'−'+stop+'%':'Unavailable';q('[data-plan-profit]').textContent=Number.isFinite(profit)?'+'+profit+'%':'Unavailable';q('[data-plan-hold]').textContent='15m';
  const status=center.querySelector('[data-save-status]')?.textContent||'';editorDirty=/UNSAVED/i.test(status);q('[data-settings-dirty]').hidden=!editorDirty;q('[data-settings-save-state]').textContent=editorDirty?'UNSAVED CHANGES':status||'Loading saved strategy…';
 }
 const strategyHost=q('#tw-strategy-center');strategyController=mountStrategyCenter(strategyHost,agent);const observer=new MutationObserver(updatePlan);observer.observe(strategyHost,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-pressed','disabled']});strategyHost.addEventListener('input',updatePlan);updatePlan();
 async function refreshWallet(){try{const state=await request(walletBase);if(dead||!isCurrent())return;walletState=state;q('[data-agent-short]').textContent=short(state.agentWallet);q('[data-agent-balance]').textContent=state.balanceStatus==='AVAILABLE'?sol(state.balanceLamports):state.agentWallet?'Balance unavailable':'No Agent Wallet yet';const count=state.balanceStatus==='AVAILABLE'&&state.assetStatus==='AVAILABLE'&&Number.isSafeInteger(state.assetCount)?(state.balanceLamports>0?1:0)+state.assetCount:null;q('[data-agent-asset-count]').textContent=count==null?' · Assets unavailable':` · ${count} ${count===1?'asset':'assets'}`;}catch{if(!dead){q('[data-agent-short]').textContent='Unavailable';q('[data-agent-balance]').textContent='Unavailable';q('[data-agent-asset-count]').textContent=' · Assets unavailable';}}}
 async function refreshToken(){try{const state=await request('/pump-launch/status?agentId='+encodeURIComponent(agent.id));if(dead||!isCurrent())return;tokenState=state;const launched=state.status==='Success'&&state.confirmed===true&&!!state.signature&&!!state.mint,idle=state.status==='Idle';q('[data-token-status]').textContent=launched?'Launched':idle?'Not launched':'Launch verification required';q('[data-token-mint]').textContent=launched?short(state.mint):'—';q('.as-mint-row').hidden=!launched;q('[data-copy-address="mint"]').disabled=!launched;const button=q('[data-settings-action="launch"]');button.disabled=false;button.textContent=launched?'VIEW TOKEN →':idle?'LAUNCH TOKEN →':'VIEW LAUNCH STATUS →';}catch{if(!dead){q('[data-token-status]').textContent='Launch status unavailable';q('[data-settings-action="launch"]').disabled=true;}}}
 const deleteSource=document.querySelector('#tw-delete-draft');
 async function copy(kind,button){const value=kind==='agent'?walletState?.agentWallet:kind==='mint'?tokenState?.mint:null;if(!value)return;try{await navigator.clipboard.writeText(value);button.textContent='COPIED ✓';clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(!dead)button.textContent='COPY';},1700);}catch{button.textContent='COPY FAILED';}}
 const click=event=>{const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-settings-close')){button.closest('dialog')?.close();return;}
  if(button.dataset.copyAddress){copy(button.dataset.copyAddress,button);return;}
  if(button.dataset.settingsAction==='trading'){show(strategyDialog);return;}
  if(button.dataset.settingsAction==='wallet'){openAgentWalletDrawer(agent);return;}
  if(button.dataset.settingsAction==='launch'){if(!button.disabled)host.dispatchEvent(new CustomEvent('tekkwork:open-agent-launch',{bubbles:true,detail:{agentId:agent.id}}));return;}
  if(button.dataset.settingsAction==='delete'){if(!button.disabled)deleteSource?.click();return;}
 };
 host.addEventListener('click',click);
 strategyDialog.addEventListener('click',event=>{if(event.target===strategyDialog)strategyDialog.close();});
 q('[data-dev-group="controlled"]').addEventListener('toggle',event=>{if(event.currentTarget.open&&!controlledController)controlledController=mountControlledSwap(q('[data-controlled]'),agent);});
 q('[data-dev-group="acceptance"]').addEventListener('toggle',event=>{if(event.currentTarget.open&&!acceptanceController)acceptanceController=mountAutonomousAcceptance(q('[data-acceptance]'),agent,{showStop:false});});
 q('.as-clean-advanced').addEventListener('toggle',event=>{if(!event.currentTarget.open||safetyController)return;if(agent.id==='0f406135-35ea-437d-a27c-29052d279c3b')safetyController=mountSafety(q('[data-settings-safety]'),base+'/autonomous-acceptance',isCurrent);else q('[data-settings-safety]').textContent='Real-money execution is unavailable for this agent.';});
 refreshWallet();refreshToken();const timer=setInterval(()=>{if(!strategyDialog.open){refreshWallet();refreshToken();}},20000);
 return {select(group){if(group==='trading'||group==='risk')show(strategyDialog);else if(group==='wallet'){q('[data-settings-action="wallet"]').click();}else if(group==='advanced')q('.as-clean-advanced').open=true;else q('.as-clean-section')?.scrollIntoView({block:'start'});},hasUnsaved:()=>editorDirty,destroy(){dead=true;clearInterval(timer);clearTimeout(copyTimer);observer.disconnect();host.removeEventListener('click',click);strategyHost.removeEventListener('input',updatePlan);strategyController?.destroy();safetyController?.destroy();controlledController?.destroy();acceptanceController?.destroy();}};
}
