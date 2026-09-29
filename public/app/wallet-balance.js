import {request} from './backend.js';
import {icon} from './icons.js';

// Presentation only: the authenticated server session owns the address.
let result=null,inflight=null,revision=0,cleanup=()=>{};
const short=s=>`${s.slice(0,6)}…${s.slice(-6)}`;
const displayKey='tekkwork:owner-wallet-display';
const safeIcon=value=>typeof value==='string'&&(/^(data:image\/(svg\+xml|png|webp|jpeg);base64,)/i.test(value)||/^https:\/\//i.test(value))?value:null;
export function rememberWalletProvider(owner,provider){if(!owner||!provider?.name)return;try{sessionStorage.setItem(displayKey,JSON.stringify({owner,name:provider.name,icon:safeIcon(provider.icon)}));}catch{}}
export function forgetWalletProvider(){try{sessionStorage.removeItem(displayKey);}catch{}}
export function walletProviderDisplay(owner,live){if(live?.name)return live;try{const saved=JSON.parse(sessionStorage.getItem(displayKey)||'null');if(saved?.owner===owner&&typeof saved.name==='string')return {name:saved.name,icon:safeIcon(saved.icon)};}catch{}return null;}
export function mountWalletBalance(button,{owner,provider,onConnect,onDisconnect}){
 cleanup();const version=++revision;let panel=null,copyTimer;
 const alive=()=>version===revision&&button.isConnected;
 const balance=()=>result?.owner===owner?(result.error?'Balance unavailable':`${(result.lamports/1e9).toFixed(4)} SOL`):'Loading balance…';
 const paint=()=>{
  if(!alive())return;
  if(!owner){button.innerHTML=icon('wallet')+'<span>CONNECT WALLET</span>';button.setAttribute('aria-label','Connect wallet');button.removeAttribute('aria-expanded');return;}
  button.innerHTML=`${icon('wallet')}<span class="tw-connected-label"><strong></strong><small><i aria-hidden="true"></i> CONNECTED</small></span>`;
  button.querySelector('strong').textContent=short(owner);
  button.setAttribute('aria-label',`Connected wallet ${short(owner)}. Open owner wallet details`);
  button.setAttribute('aria-expanded',String(!!panel?.isConnected));
  if(panel?.isConnected){panel.querySelector('[data-balance]').textContent=balance();panel.querySelector('[data-balance]').title=result?.owner===owner&&!result.error?`${(result.lamports/1e9).toFixed(9)} SOL`:'';const network=panel.querySelector('[data-network]');network.textContent=result?.owner===owner&&!result.error&&result.network==='solana:101'?'● SOLANA MAINNET':'NETWORK UNAVAILABLE';network.dataset.state=network.textContent==='NETWORK UNAVAILABLE'?'unavailable':'verified';}
 };
 const refresh=async(force=false)=>{
  if(!owner)return;if(!force&&result?.owner===owner&&Date.now()-result.at<15000){paint();return;}
  if(inflight?.owner===owner){await inflight.promise;paint();return;}
  const task=request('/wallet/mainnet-balance'+(force?'?refresh=1':''));inflight={owner,promise:task};
  try{const r=await task;if(r.owner!==owner||r.network!=='solana:101'||!Number.isSafeInteger(r.lamports))throw Error('Balance identity mismatch');result={...r,at:Date.now()};}
  catch{result={owner,error:true,at:Date.now()};}finally{if(inflight?.promise===task)inflight=null;paint();}
 };
 const position=()=>{if(!panel?.isConnected||matchMedia('(max-width:900px)').matches)return;const r=button.getBoundingClientRect();panel.style.left=`${Math.min(r.right+12,innerWidth-panel.offsetWidth-12)}px`;panel.style.top=`${Math.max(12,Math.min(r.top,innerHeight-panel.offsetHeight-12))}px`;};
 const close=(focus=true)=>{if(!panel)return;panel.remove();panel=null;document.body.classList.remove('tw-wallet-sheet-open');paint();if(focus&&button.isConnected)button.focus();};
 const outside=e=>{if(panel&&!panel.contains(e.target)&&!button.contains(e.target))close(false);};
 const keys=e=>{if(!panel)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}if(e.key==='Tab'){e.stopImmediatePropagation();const items=[...panel.querySelectorAll('button:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keys);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
 button.onclick=()=>{
  if(!owner){onConnect();return;}if(panel){close();return;}
  panel=document.createElement('section');panel.className='tw-wallet-popover tw-owner-popover';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Owner wallet details');
  panel.innerHTML=`<header><span>OWNER WALLET</span><button type="button" data-close aria-label="Close owner wallet details">${icon('close')}</button></header><div class="tw-owner-provider"><span class="tw-owner-provider-icon"></span><div><strong data-provider></strong><small><i aria-hidden="true"></i> CONNECTED</small></div></div><div class="tw-owner-address"><span data-address></span><button type="button" data-copy-icon aria-label="Copy complete wallet address" title="Copy complete wallet address">${icon('copy')}</button></div><div class="tw-owner-copy-feedback" role="status" aria-live="polite"></div><div class="tw-owner-balance"><strong data-balance></strong><span>OWNER BALANCE</span></div><div class="tw-owner-network" data-network>NETWORK UNAVAILABLE</div><div class="tw-owner-actions"><button type="button" class="tw-button secondary" data-refresh>${icon('refresh')} <span>REFRESH BALANCE</span></button></div><div class="tw-owner-disconnect"><button type="button" data-disconnect>${icon('logout')}<span>Disconnect wallet</span><span aria-hidden="true">→</span></button></div>`;
  panel.querySelector('[data-address]').textContent=short(owner);panel.querySelector('[data-address]').title=owner;
  const display=walletProviderDisplay(owner,provider);
  panel.querySelector('[data-provider]').textContent=display?.name||'Wallet';
  panel.querySelector('.tw-owner-provider-icon').innerHTML=display?.icon?'<img alt="" src="'+display.icon.replaceAll('"','&quot;')+'">':icon('wallet');
  const copied=async()=>{const feedback=panel?.querySelector('.tw-owner-copy-feedback');if(!feedback)return false;let success=false;try{await navigator.clipboard.writeText(owner);feedback.textContent='COPIED ✓';success=true;}catch{feedback.textContent='COPY UNAVAILABLE';}clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(feedback.isConnected)feedback.textContent='';},1800);return success;};
  panel.querySelector('[data-close]').onclick=()=>close();panel.querySelector('[data-copy-icon]').onclick=async()=>{if(!await copied())return;const action=panel?.querySelector('[data-copy-icon]');if(!action)return;action.innerHTML=icon('check');clearTimeout(action.copyTimer);action.copyTimer=setTimeout(()=>{if(action.isConnected)action.innerHTML=icon('copy');},1800);};
  panel.querySelector('[data-refresh]').onclick=async e=>{const action=e.currentTarget;action.disabled=true;action.classList.add('is-loading');action.querySelector('span').textContent='REFRESHING...';await refresh(true);if(action.isConnected){action.classList.remove('is-loading');action.querySelector('span').textContent=result?.error?'REFRESH BALANCE':'UPDATED ✓';setTimeout(()=>{if(action.isConnected){action.querySelector('span').textContent='REFRESH BALANCE';action.disabled=false;}},900);}};
  panel.querySelector('[data-disconnect]').onclick=async e=>{const action=e.currentTarget;action.disabled=true;try{await onDisconnect();forgetWalletProvider();close(false);result=null;}catch{if(action.isConnected){action.disabled=false;action.querySelector('span').textContent='Try disconnect again';}}};
  document.body.append(panel);document.body.classList.add('tw-wallet-sheet-open');paint();position();panel.querySelector('[data-close]').focus();
 };
 window.tekkworkRefreshWalletBalance=()=>alive()?refresh(true):undefined;
 cleanup=()=>{close(false);clearTimeout(copyTimer);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keys);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 paint();refresh();
}
window.addEventListener('tekkwork:balance-changed',()=>window.tekkworkRefreshWalletBalance?.());
