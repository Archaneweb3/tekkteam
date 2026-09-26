import {request} from './backend.js';
import {icon} from './icons.js';
// Owner identity comes exclusively from workspace's canonical authenticated state.
let result=null,inflight=null,revision=0;
export function mountWalletBalance(button,{owner,onConnect,onDisconnect}){
 const version=++revision;let popover;
 const alive=()=>version===revision&&button.isConnected;
 const label=()=>result?.owner===owner?(result.error?'Balance unavailable':`${(result.lamports/1e9).toFixed(4)} SOL`):'Loading balance…';
 const paint=()=>{if(!alive())return;button.replaceChildren();if(!owner){button.textContent='Connect wallet';return;}button.innerHTML=icon('wallet');const text=document.createElement('span');text.textContent=label()+' · '+owner.slice(0,5)+'…'+owner.slice(-4);button.append(text);if(popover?.isConnected)popover.querySelector('[data-balance]').textContent=result?.owner===owner&&!result.error?(result.lamports/1e9).toFixed(9)+' SOL':label();};
 const refresh=async(force=false)=>{
  if(!owner)return;if(!force&&result?.owner===owner&&Date.now()-result.at<15000){paint();return;}
  if(inflight?.owner===owner){await inflight.promise;paint();return;}
  const task=request('/wallet/mainnet-balance'+(force?'?refresh=1':''));inflight={owner,promise:task};
  try{const r=await task;if(r.owner!==owner||r.network!=='solana:101'||!Number.isSafeInteger(r.lamports))throw Error('Balance identity mismatch');result={...r,at:Date.now()};}
  catch{result={owner,error:true,at:Date.now()};}finally{if(inflight?.promise===task)inflight=null;paint();}
 };
 button.onclick=()=>{
  if(!owner){onConnect();return;}if(popover?.isConnected){popover.remove();return;}
  popover=document.createElement('div');popover.className='tw-wallet-popover';popover.innerHTML='<h3>Connected wallet</h3><p data-address></p><p data-balance></p><p>Solana Mainnet</p><div><button class="tw-button ghost" data-copy>Copy address</button><button class="tw-button ghost" data-refresh>Refresh</button><button class="tw-button ghost" data-disconnect>Disconnect</button></div>';
  popover.querySelector('[data-address]').textContent=owner;button.after(popover);paint();
  popover.querySelector('[data-copy]').onclick=async e=>{try{await navigator.clipboard.writeText(owner);e.target.textContent='Copied';}catch{e.target.textContent='Copy unavailable';}};
  popover.querySelector('[data-refresh]').onclick=async e=>{e.target.disabled=true;await refresh(true);e.target.disabled=false;};
  popover.querySelector('[data-disconnect]').onclick=async e=>{e.target.disabled=true;try{await onDisconnect();popover.remove();result=null;}catch{e.target.disabled=false;e.target.textContent='Try disconnect again';}};
 };
 window.tekkworkRefreshWalletBalance=()=>alive()?refresh(true):undefined;
 paint();refresh();
}
window.addEventListener('tekkwork:balance-changed',()=>window.tekkworkRefreshWalletBalance?.());
