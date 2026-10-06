import {request} from './backend.js';
import {esc} from './trading-pages.js';
import {openAgentWalletDrawer} from './agent-wallet-ui.js';
import {walletProviderDisplay} from './wallet-balance.js';

const short=value=>value?`${value.slice(0,6)}…${value.slice(-6)}`:'—';
const sol=value=>Number.isSafeInteger(value)&&value>=0?`${(value/1e9).toLocaleString('en-US',{maximumFractionDigits:9})} SOL`:'—';
const time=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n).toLocaleString('en-US',{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'}):'—';};
const transferStatus=value=>({PREPARED:'AWAITING APPROVAL',SUBMITTED:'SUBMITTED',UNKNOWN:'VERIFYING',CONFIRMED:'CONFIRMED',FAILED:'FAILED'})[value]||'VERIFYING';
const agentWalletPath=id=>`/agents/${encodeURIComponent(id)}/trading/wallet`;

export function mountWalletWorkspace(host,{agents=[],owner=null,provider=null,onConnect=()=>{},getConnection=()=>null,onAuthenticate=onConnect,api=request,openDrawer=openAgentWalletDrawer}={}){
 let dead=false,ownerState=null,ownerError=false,search='',showAll=false,refreshing=false,copyFeedback='',detailRefresh=null;
 const agentInflight=new Map();
 const rows=new Map(agents.map(agent=>[agent.id,{agent,state:null,status:'LOADING'}]));
 host.className='tw-world tw-wallet-workspace';
 const alive=()=>!dead&&host.isConnected;
 const entries=()=>[...rows.values()];
 const transfers=()=>entries().flatMap(({agent,state})=>(state?.activity??[]).map(record=>({...record,agent}))).sort((a,b)=>(b.timestamp??b.createdAt??0)-(a.timestamp??a.createdAt??0));
 const total=()=>{
  if(!owner||ownerError||!Number.isSafeInteger(ownerState?.lamports)||ownerState.network!=='solana:101')return null;
  let sum=BigInt(ownerState.lamports);
  for(const {state,status} of rows.values()){
   if(status!=='VERIFIED'||!state)return null;
   if(!state.agentWallet)continue;
   if(state.balanceStatus!=='AVAILABLE'||!Number.isSafeInteger(state.balanceLamports))return null;
   sum+=BigInt(state.balanceLamports);
  }
  return sum<=BigInt(Number.MAX_SAFE_INTEGER)?Number(sum):null;
 };
 function paint(){
  if(!alive())return;
  const all=entries(),selected=all.filter(({agent,state})=>`${agent.name} ${state?.agentWallet??''}`.toLowerCase().includes(search.toLowerCase()));
  const connected=getConnection(),address=owner||connected?.address;
  const providerName=walletProviderDisplay(address,provider||connected)?.name||'Connected wallet';
  const recent=transfers(),shown=showAll?recent:recent.slice(0,6),sum=total();
  host.innerHTML=`<header class="tw-wallet-page-head"><span class="tw-world-eyebrow">TREASURY</span><h1>WALLET COMMAND CENTER</h1><p>Manage funds across your workforce.</p></header>
   <section class="tw-wallet-treasury" aria-label="Total treasury"><div><span class="tw-world-eyebrow">${sum==null?'PARTIAL BALANCE':'TOTAL REAL BALANCE'}</span><strong>${sum==null?'—':sol(sum)}</strong><small>${!owner?(address?'Sign in to load your wallet balances.':'Connect and sign in to load your wallet balances.'):sum==null?'One or more Mainnet balances are still loading or unavailable.':'Across Owner + Agent Wallets'}</small></div><span class="tw-wallet-treasury-mark">SOLANA MAINNET</span></section>
   <section class="tw-wallet-section"><div class="tw-wallet-section-head"><div><span class="tw-world-eyebrow">01 / MAIN WALLET</span><h2>OWNER WALLET</h2></div></div>
    <div class="tw-wallet-owner"><div class="tw-wallet-owner-identity"><span class="tw-wallet-owner-provider">${address?esc(providerName):'Not connected'}</span><strong>${address?esc(short(address)):'OWNER WALLET NOT CONNECTED'}</strong><span>SOLANA MAINNET</span></div><div class="tw-wallet-owner-value"><span>AVAILABLE SOL</span><strong>${!owner?'—':ownerError?'—':ownerState?sol(ownerState.lamports):'Loading…'}</strong><small>${!owner?(address?'CONNECTED · SIGN IN REQUIRED':'Connect your wallet to continue'):ownerError?'BALANCE UNAVAILABLE':ownerState?.checkedAt?`Updated ${time(ownerState.checkedAt)}`:'Fresh Mainnet read pending'}</small></div><div class="tw-wallet-owner-actions">${owner?'<button type="button" class="tw-button secondary" data-wallet-copy>COPY ADDRESS</button><button type="button" class="tw-button secondary" data-wallet-refresh '+(refreshing?'disabled':'')+'>'+(refreshing?'REFRESHING…':'REFRESH BALANCE')+'</button>':address?'<button type="button" class="tw-button primary" data-wallet-authenticate>SIGN IN →</button>':'<button type="button" class="tw-button primary" data-wallet-connect>CONNECT WALLET →</button>'}<span role="status">${esc(copyFeedback)}</span></div></div></section>
    <section class="tw-wallet-section"><div class="tw-wallet-section-head"><div><span class="tw-world-eyebrow">02 / WORKFORCE TREASURY</span><h2>AGENT WALLETS</h2></div><strong>${owner?`${all.length} AGENTS`:'AGENTS UNAVAILABLE'}</strong></div>${owner?`<label class="tw-wallet-search">Search Agent<input type="search" data-wallet-search value="${esc(search)}" placeholder="Search Agent" autocomplete="off"></label><div class="tw-wallet-table-wrap"><table class="tw-wallet-table"><thead><tr><th>AGENT</th><th>WALLET</th><th>SOL BALANCE</th><th>ASSETS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>${selected.map(({agent,state,status})=>`<tr><td data-label="AGENT"><strong>${esc(agent.name)}</strong></td><td data-label="WALLET">${state?.agentWallet?`<span title="${esc(state.agentWallet)}">${esc(short(state.agentWallet))}</span>`:status==='LOADING'?'Loading…':'Not created'}</td><td data-label="SOL BALANCE"><strong>${status==='LOADING'?'Loading…':state?.balanceStatus==='AVAILABLE'?sol(state.balanceLamports):'—'}</strong></td><td data-label="ASSETS">${status==='LOADING'?'Loading…':state?.assetStatus==='AVAILABLE'?(state.balanceStatus==='AVAILABLE'?`${(state.balanceLamports>0?1:0)+state.assetCount} assets`:`${state.assetCount} SPL · SOL unknown`):'—'}</td><td data-label="STATUS"><span class="tw-wallet-row-status" data-state="${status}">${status==='LOADING'?'LOADING':status==='UNAVAILABLE'?'BALANCE UNAVAILABLE':!state?.agentWallet?'NO WALLET':state.balanceStatus!=='AVAILABLE'?'BALANCE UNAVAILABLE':state.assetStatus!=='AVAILABLE'?'ASSETS UNAVAILABLE':'VERIFIED'}</span></td><td data-label="ACTION"><button type="button" data-wallet-manage="${esc(agent.id)}">MANAGE →</button></td></tr>`).join('')}</tbody></table>${selected.length?'':'<p class="tw-wallet-empty">No matching Agents.</p>'}</div>`:'<p class="tw-wallet-empty">Connect your Owner Wallet to view Agent Wallet balances.</p>'}</section>
   <section class="tw-wallet-section"><div class="tw-wallet-section-head"><div><span class="tw-world-eyebrow">03 / REAL MOVEMENTS</span><h2>RECENT TRANSFERS</h2></div>${recent.length>6?`<button type="button" class="tw-wallet-view-all" data-wallet-all>${showAll?'SHOW LESS':'VIEW ALL →'}</button>`:''}</div>${!owner?'<p class="tw-wallet-empty">Connect your Owner Wallet to view transfer history.</p>':shown.length?`<div class="tw-wallet-transfers">${shown.map(record=>`<details class="tw-wallet-transfer"><summary><span>${time(record.timestamp??record.createdAt)}</span><strong>${record.kind==='FUND'?'Owner Wallet → '+esc(record.agent.name):esc(record.agent.name)+' → Owner Wallet'}</strong><span>SOL</span><strong>${record.kind==='FUND'?'+':'−'}${sol(record.amountLamports)}</strong><span class="tw-wallet-transfer-status" data-status="${esc(record.status)}">${transferStatus(record.status)}</span></summary><div class="tw-wallet-transfer-detail"><div>FROM <strong>${esc(record.source||'—')}</strong></div><div>TO <strong>${esc(record.destination||'—')}</strong></div><div>STATUS <strong>${transferStatus(record.status)}</strong></div>${record.signature?`<div>SIGNATURE <strong title="${esc(record.signature)}">${esc(short(record.signature))}</strong></div><a href="https://explorer.solana.com/tx/${encodeURIComponent(record.signature)}" target="_blank" rel="noopener noreferrer">VIEW ON SOLANA ↗</a><button type="button" data-wallet-check="${esc(record.agent.id)}:${esc(record.kind)}:${esc(record.id)}" ${detailRefresh===record.id?'disabled':''}>${detailRefresh===record.id?'CHECKING…':'CHECK STATUS'}</button>`:''}</div></details>`).join('')}</div>`:'<p class="tw-wallet-empty">No real wallet transfers yet.</p>'}</section>`;
  bind();
 }
 function bind(){
  host.querySelector('[data-wallet-search]')?.addEventListener('input',event=>{const el=event.target,start=el.selectionStart;search=el.value;paint();const next=host.querySelector('[data-wallet-search]');next?.focus();next?.setSelectionRange(start,start);});
  host.querySelector('[data-wallet-connect]')?.addEventListener('click',onConnect);
  host.querySelector('[data-wallet-authenticate]')?.addEventListener('click',onAuthenticate);
  host.querySelector('[data-wallet-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(owner);copyFeedback='COPIED ✓';}catch{copyFeedback='COPY UNAVAILABLE';}paint();setTimeout(()=>{if(alive()){copyFeedback='';paint();}},1600);});
  host.querySelector('[data-wallet-refresh]')?.addEventListener('click',()=>refreshOwner(true));
  host.querySelector('[data-wallet-all]')?.addEventListener('click',()=>{showAll=!showAll;paint();});
  host.querySelectorAll('[data-wallet-manage]').forEach(button=>button.addEventListener('click',()=>{const entry=rows.get(button.dataset.walletManage);if(entry)openDrawer(entry.agent);}));
  host.querySelectorAll('[data-wallet-check]').forEach(button=>button.addEventListener('click',async()=>{const [id,kind,operationId]=button.dataset.walletCheck.split(':');detailRefresh=operationId;paint();try{await api(`${agentWalletPath(id)}/${kind==='FUND'?'funding':'withdrawal'}/${encodeURIComponent(operationId)}`);}catch{}finally{detailRefresh=null;await refreshAgent(id);}}));
 }
 async function refreshOwner(force=false){if(!owner||!alive())return;refreshing=true;ownerError=false;paint();try{const result=await api('/wallet/mainnet-balance'+(force?'?refresh=1':''));if(result.owner!==owner||result.network!=='solana:101'||!Number.isSafeInteger(result.lamports))throw Error('Invalid wallet balance');ownerState=result;}catch{ownerState=null;ownerError=true;}finally{refreshing=false;paint();}}
 async function refreshAgent(id){const row=rows.get(id);if(!row||!alive())return;if(agentInflight.has(id))return agentInflight.get(id);const task=(async()=>{try{const state=await api(agentWalletPath(id));if(!alive())return;if(state.agentId!==id||state.ownerWallet!==owner)throw Error('Wallet ownership mismatch');row.state=state;row.status='VERIFIED';}catch{row.state=null;row.status='UNAVAILABLE';}paint();})().finally(()=>agentInflight.delete(id));agentInflight.set(id,task);return task;}
 async function loadAgents(){const ids=[...rows.keys()];let index=0;await Promise.all(Array.from({length:Math.min(2,ids.length)},async()=>{while(index<ids.length&&alive())await refreshAgent(ids[index++]);}));}
 const closed=()=>{if(alive()){refreshOwner(true);loadAgents();}};
 window.addEventListener('tekkwork:agent-wallet-closed',closed);
 window.addEventListener('tekkwork:public-wallet-changed',paint);
 paint();if(owner){refreshOwner(true);loadAgents();}
 return {refresh(){refreshOwner(true);loadAgents();},destroy(){dead=true;window.removeEventListener('tekkwork:agent-wallet-closed',closed);window.removeEventListener('tekkwork:public-wallet-changed',paint);}};
}
