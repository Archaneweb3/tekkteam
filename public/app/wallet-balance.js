import {request} from './backend.js';
import {icon} from './icons.js';

// Presentation only: the authenticated server session owns the address.
let result=null,inflight=null,revision=0,cleanup=()=>{};
const short=s=>`${s.slice(0,6)}…${s.slice(-6)}`;
const displayKey='tekkwork:owner-wallet-display';
const safeIcon=value=>typeof value==='string'&&(/^(data:image\/(svg\+xml|png|webp|jpeg);base64,)/i.test(value)||/^https:\/\//i.test(value))?value:null;
function savedWalletProvider(owner){try{const saved=JSON.parse(sessionStorage.getItem(displayKey)||'null');if(saved?.owner===owner&&typeof saved.name==='string')return {name:saved.name,icon:safeIcon(saved.icon)};}catch{}return null;}
export function rememberWalletProvider(owner,provider){if(!owner||!provider?.name)return;const saved=savedWalletProvider(owner);try{sessionStorage.setItem(displayKey,JSON.stringify({owner,name:provider.name,icon:safeIcon(provider.icon)||(saved?.name===provider.name?saved.icon:null)}));}catch{}}
export function forgetWalletProvider(){try{sessionStorage.removeItem(displayKey);}catch{}}
export function walletProviderDisplay(owner,live){const saved=savedWalletProvider(owner);if(!live?.name)return saved;const icon=safeIcon(live.icon)||(saved?.name===live.name?saved.icon:null);if(safeIcon(live.icon))rememberWalletProvider(owner,live);return {...live,icon};}
export function walletBalancePresentation({readOnly,canAuthenticate,entry}){
 if(readOnly||entry?.error==='SIGN_IN_REQUIRED')return {state:'auth',value:canAuthenticate?'Sign in to load balance':'Balance access unavailable',detail:canAuthenticate?(readOnly?'Your wallet is connected. Sign an authentication message to request your SOL balance.':'Your session expired. Sign in again to request your SOL balance.'):'This connection can display your public address only.',network:canAuthenticate?'AUTHENTICATION REQUIRED':'READ-ONLY · OWNER ACCESS UNAVAILABLE'};
 if(!entry)return {state:'loading',value:'Loading balance...',detail:'Checking your authenticated wallet on Solana Mainnet.',network:'VERIFYING MAINNET'};
 if(entry.error){const messages={BALANCE_RPC_RATE_LIMITED:'Solana RPC rate limit reached. Wait briefly, then refresh.',BALANCE_RPC_NETWORK_MISMATCH:'RPC network verification failed. Expected Solana Mainnet Beta.',BALANCE_RPC_RESPONSE_INVALID:'Solana RPC returned an invalid balance response.',BALANCE_RPC_TIMEOUT:'Solana Mainnet RPC timed out. Try Refresh Balance.',BALANCE_RPC_DNS_FAILED:'Unable to resolve Solana Mainnet RPC.',BALANCE_RPC_HTTP_FAILED:'Solana Mainnet RPC rejected the request.',BALANCE_RPC_UNREACHABLE:'Unable to reach Solana Mainnet RPC. Try Refresh Balance.'};return {state:'error',value:'Balance unavailable',detail:entry.error==='READ_DISABLED'?'You are signed in. Balance reads are disabled in this local runtime.':messages[entry.error]||'You are signed in, but the Mainnet balance request failed. Try Refresh Balance.',network:'NETWORK UNAVAILABLE'};}
 return {state:'ready',value:`${(entry.lamports/1e9).toFixed(6)} SOL`,detail:'Connected wallet balance · confirmed on Solana Mainnet.',network:'● SOLANA MAINNET'};
}
export function mountWalletBalance(button,{owner,provider,onConnect,onDisconnect,onAuthenticate,readOnly=false,getConnection}){
 cleanup();const version=++revision;let panel=null,copyTimer,loading=false;
 if(!readOnly&&result?.owner===owner&&result.error==='SIGN_IN_REQUIRED')result=null;
 const alive=()=>version===revision&&button.isConnected;
 const presentation=()=>walletBalancePresentation({readOnly,canAuthenticate:!!onAuthenticate,entry:!loading&&result?.owner===owner?result:null});
 const paint=()=>{
  if(!alive())return;
  if(!owner){button.innerHTML=icon('wallet')+'<span>CONNECT WALLET</span>';button.setAttribute('aria-label','Connect wallet');button.removeAttribute('aria-expanded');return;}
  button.innerHTML=`${icon('wallet')}<span class="tw-connected-label"><strong></strong><small><i aria-hidden="true"></i> CONNECTED</small></span>`;
  button.querySelector('strong').textContent=short(owner);
  button.setAttribute('aria-label',`Connected wallet ${short(owner)}. Open ${readOnly?'connected':'owner'} wallet details`);
  button.setAttribute('aria-expanded',String(!!panel?.isConnected));
  if(panel?.isConnected){const view=presentation();panel.dataset.balanceState=view.state;panel.querySelector('[data-balance]').textContent=view.value;panel.querySelector('[data-balance]').title=view.state==='ready'?`${(result.lamports/1e9).toFixed(9)} SOL`:'';panel.querySelector('[data-balance-detail]').textContent=view.detail;const network=panel.querySelector('[data-network]');network.textContent=view.network;network.dataset.state=view.state==='ready'?'verified':'unavailable';const auth=panel.querySelector('[data-authenticate]');if(auth)auth.hidden=view.state!=='auth';panel.querySelector('[data-refresh]').disabled=['auth','loading'].includes(view.state);position();}
 };
 const refresh=async(force=false)=>{
  if(readOnly||!owner)return;if(!force&&result?.owner===owner&&Date.now()-result.at<15000){paint();return;}
  if(inflight?.owner===owner){try{await inflight.promise;}catch{/* The initiating refresh owns error classification. */}paint();return;}
  loading=true;paint();const task=request('/wallet/mainnet-balance'+(force?'?refresh=1':''));inflight={owner,promise:task};
  try{const r=await task;if(r.owner!==owner||r.network!=='solana:101'||!Number.isSafeInteger(r.lamports)||r.lamports<0)throw Error('Balance identity mismatch');result={...r,at:Date.now()};}
  catch(error){result={owner,error:error.httpStatus===401?'SIGN_IN_REQUIRED':error.httpStatus===403&&error.message==='OWNER_AUTH_HARNESS_ROUTE_DENIED'?'READ_DISABLED':error.code||'UNAVAILABLE',at:Date.now()};}finally{loading=false;if(inflight?.promise===task)inflight=null;paint();}
 };
 const position=()=>{if(!panel?.isConnected||matchMedia('(max-width:900px)').matches)return;const r=button.getBoundingClientRect();panel.style.left=`${Math.min(r.right+12,innerWidth-panel.offsetWidth-12)}px`;panel.style.top=`${Math.max(12,Math.min(r.top,innerHeight-panel.offsetHeight-12))}px`;};
 const close=(focus=true)=>{if(!panel)return;panel.remove();panel=null;document.body.classList.remove('tw-wallet-sheet-open');paint();if(focus&&button.isConnected)button.focus();};
 const outside=e=>{if(panel&&!panel.contains(e.target)&&!button.contains(e.target))close(false);};
 const keys=e=>{if(!panel)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}if(e.key==='Tab'){e.stopImmediatePropagation();const items=[...panel.querySelectorAll('button:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 // Returning from a wallet app only re-reads balance. Never reconnect or sign.
 const resume=()=>{if(alive()&&!document.hidden)void refresh();};
 document.addEventListener('visibilitychange',resume);window.addEventListener('pageshow',resume);
 document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keys);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
 button.onclick=()=>{
  if(readOnly&&getConnection&&getConnection()?.address!==owner)return;
  if(!owner){onConnect();return;}if(panel){close();return;}
  panel=document.createElement('section');panel.className='tw-wallet-popover tw-owner-popover';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Owner wallet details');
  panel.innerHTML=`<header><span>YOUR WALLET</span><button type="button" data-close aria-label="Close owner wallet details">${icon('close')}</button></header><div class="tw-owner-provider"><span class="tw-owner-provider-icon"></span><div><strong data-provider></strong><small><i aria-hidden="true"></i> CONNECTED</small></div></div><div class="tw-owner-address"><span data-address></span><button type="button" data-copy-icon aria-label="Copy complete wallet address" title="Copy complete wallet address">${icon('copy')}</button></div><div class="tw-owner-copy-feedback" role="status" aria-live="polite"></div><div class="tw-owner-balance"><strong data-balance></strong><span>WALLET BALANCE</span></div><div class="tw-owner-network" data-network>NETWORK UNAVAILABLE</div><div class="tw-owner-actions"><button type="button" class="tw-button secondary" data-refresh>${icon('refresh')} <span>REFRESH BALANCE</span></button></div><div class="tw-owner-disconnect"><button type="button" data-disconnect>${icon('logout')}<span>Disconnect wallet</span><span aria-hidden="true">→</span></button></div>`;
  panel.querySelector('[data-address]').textContent=short(owner);panel.querySelector('[data-address]').title=owner;
  const detail=document.createElement('p');detail.setAttribute('data-balance-detail','');panel.querySelector('.tw-owner-balance').append(detail);
  if(readOnly){panel.querySelector('header>span').textContent='CONNECTED WALLET';panel.setAttribute('aria-label','Connected wallet details');panel.querySelector('[data-refresh]').title='Sign in before refreshing your balance.';}
  if(onAuthenticate){const action=document.createElement('button');action.type='button';action.className='tw-button primary';action.setAttribute('data-authenticate','');action.textContent='Sign In';action.onclick=()=>{close(false);onAuthenticate();};panel.querySelector('.tw-owner-actions').prepend(action);}
  const display=readOnly?{name:provider?.name||'Wallet',icon:safeIcon(provider?.icon)}:walletProviderDisplay(owner,provider);
  panel.querySelector('[data-provider]').textContent=display?.name||'Wallet';
  panel.querySelector('.tw-owner-provider-icon').innerHTML=display?.icon?'<img alt="" src="'+display.icon.replaceAll('"','&quot;')+'">':icon('wallet');
  const copied=async()=>{const feedback=panel?.querySelector('.tw-owner-copy-feedback');if(!feedback)return false;let success=false;try{await navigator.clipboard.writeText(owner);feedback.textContent='COPIED ✓';success=true;}catch{feedback.textContent='COPY UNAVAILABLE';}clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(feedback.isConnected)feedback.textContent='';},1800);return success;};
  panel.querySelector('[data-close]').onclick=()=>close();panel.querySelector('[data-copy-icon]').onclick=async()=>{if(!await copied())return;const action=panel?.querySelector('[data-copy-icon]');if(!action)return;action.innerHTML=icon('check');clearTimeout(action.copyTimer);action.copyTimer=setTimeout(()=>{if(action.isConnected)action.innerHTML=icon('copy');},1800);};
  panel.querySelector('[data-refresh]').onclick=async e=>{if(readOnly||presentation().state==='auth')return;const action=e.currentTarget;action.disabled=true;action.classList.add('is-loading');action.querySelector('span').textContent='REFRESHING...';await refresh(true);if(action.isConnected){action.classList.remove('is-loading');action.querySelector('span').textContent=result?.error?'REFRESH BALANCE':'UPDATED ✓';setTimeout(()=>{if(action.isConnected){action.querySelector('span').textContent='REFRESH BALANCE';paint();}},900);}};
  panel.querySelector('[data-disconnect]').onclick=async e=>{const action=e.currentTarget;action.disabled=true;try{await onDisconnect();if(!readOnly)forgetWalletProvider();close(false);result=null;}catch{if(action.isConnected){action.disabled=false;action.querySelector('span').textContent='Try disconnect again';}}};
  document.body.append(panel);document.body.classList.add('tw-wallet-sheet-open');paint();position();panel.querySelector('[data-close]').focus();
 };
 window.tekkworkRefreshWalletBalance=()=>alive()?refresh(true):undefined;
 cleanup=()=>{close(false);clearTimeout(copyTimer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keys);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 paint();refresh();
}
window.addEventListener('tekkwork:balance-changed',()=>window.tekkworkRefreshWalletBalance?.());
