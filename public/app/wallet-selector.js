// Presentation only. Provider selection, authentication and balance state stay in backend.js.
import {mobileWalletPresentation} from './wallet-mobile.js';
import {walletSelectionStatus} from './wallet-choice-copy.js';
const primary=['Phantom','Solflare','Backpack'];
const popular=['MetaMask','Trust Wallet','Jupiter Mobile','Espresso Cash'];
const artwork={'Phantom':'phantom.webp','Solflare':'solflare.webp','Backpack':'backpack.webp','MetaMask':'metamask.webp','Trust Wallet':'trust-wallet.webp','Jupiter Mobile':'jupiter.webp','Espresso Cash':'espresso-cash.png'};
export function selectorWallets(rows,expanded){
 const names=expanded?[...primary,...popular]:primary;
 return names.flatMap(name=>{const row=rows.find(w=>w.name===name);return row?[row]:[];});
}
export function selectorWalletRow(w,{esc,href,userAgent,touchPoints,mwaId}){
 const mobile=mobileWalletPresentation({name:w.name,selectable:w.selectable,href,userAgent,touchPoints,mwaId});
 const image=artwork[w.name]?'/assets/wallets/'+artwork[w.name]:w.icon;
 const logo=image?`<img src="${esc(image)}" alt="" width="40" height="40">`:'';
 const providerId=w.selectable?w.id:mobile?.providerId;
 const url=providerId?null:mobile?.url||w.installUrl;
 const action=providerId?'→':mobile?.url?'Open':url?'Get':'Unavailable';
 const status=w.selectable?walletSelectionStatus(w):mobile?.url?'Continue in the wallet app':mobile?.subtitle||'Not detected in this browser';
 const content=`${logo}<span><strong>${esc(w.name)}</strong><small>${esc(status||'Connect Solana wallet')}</small></span><span class="tw-wallet-choice-arrow" aria-hidden="true">${action}</span>`;
 const row=providerId?`<button class="tw-wallet-choice" type="button" data-wallet="${esc(providerId)}">${content}</button>`:url?`<a class="tw-wallet-choice tw-wallet-availability" href="${esc(url)}" ${mobile?.url?'':'target="_blank"'} rel="noopener noreferrer" aria-label="${esc(action+' '+w.name)}">${content}</a>`:`<div class="tw-wallet-choice tw-wallet-availability" aria-disabled="true">${content}</div>`;
 return `<div class="tw-wallet-choice-wrap" data-wallet-name="${esc(w.name)}">${row}${mobile?.url?`<details class="tw-wallet-app-help"><summary>About opening ${esc(w.name)}</summary><p>${esc(mobile.note)}</p></details>`:''}<p class="tw-wallet-row-error" role="alert" hidden></p></div>`;
}
export function selectorWalletRows(rows,expanded,options){
 return selectorWallets(rows,expanded).map((w,i)=>`${i===0?'<h3 class="tw-wallet-group">Recommended</h3>':i===3?'<h3 class="tw-wallet-group">More Wallets</h3>':''}${selectorWalletRow(w,options)}`).join('');
}
