export async function openPumpLaunchDialog(page,{agent,isCurrent=()=>true,onClose=()=>{},mount=(host,options)=>window.mountPumpLaunch(host,options)}={}){
 if(!isCurrent()||!page.isConnected||page.querySelector('.tw-launch-dialog'))return null;
 const dialog=document.createElement('dialog');dialog.className='tw-launch-dialog';
 dialog.innerHTML='<div class="tw-launch-dialog-bar"><span>TOKEN LAUNCH · OWNER ONLY</span><button type="button" aria-label="Close token launch" data-launch-close>×</button></div><section id="tw-mainnet-launch"></section>';
 page.append(dialog);dialog.querySelector('[data-launch-close]').onclick=()=>dialog.close();
 dialog.onclose=()=>{dialog.remove();if(isCurrent())onClose();};dialog.showModal();
 const current=()=>isCurrent()&&dialog.open&&dialog.isConnected;
 dialog.onclick=event=>{const target='#/agent/'+encodeURIComponent(agent?.id??'');if(!current()||!agent?.id||event.target.closest?.('a[href]')?.getAttribute('href')!==target)return;const sameRoute=window.location.hash===target;dialog.close();if(sameRoute)window.dispatchEvent(new Event('hashchange'));};
 try{const preparationOnly=globalThis.window?.TekkworkWalletTestOnly===true;await mount(dialog.querySelector('#tw-mainnet-launch'),{agent,isCurrent:current,preparationOnly,getWallet:preparationOnly?preparationWallet:launchWallet,getPreparationWallet:preparationWallet,getM4Wallet:m4LaunchWallet});}
 catch{if(current())dialog.querySelector('#tw-mainnet-launch').textContent='Launch status unavailable. No transaction was created.';}
 return dialog;
}
import {launchWallet,preparationWallet,m4LaunchWallet} from './backend.js';
