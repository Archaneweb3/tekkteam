// Official browse links open this website inside the wallet. They never connect,
// authenticate, carry a session, or request a signature/transaction by themselves.
export function publicWalletOrigin(href){
 let url;try{url=new URL(href);}catch{return null;}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||host.endsWith('.')||/(?:^|\.)(localhost|local|internal)$/.test(host)||/^[\d.]+$/.test(host)||host.includes(':'))return null;
 return url;
}
export function mobileWalletBrowse(name,href){
 const url=publicWalletOrigin(href);if(!url)return null;
 const route=['#/overview','#/launch','#/wallet','#/agents','#/tokens'].includes(url.hash)?url.hash:'#/overview';
 const target=url.origin+'/'+route,ref=encodeURIComponent(url.origin);
 if(name==='Phantom')return 'https://phantom.com/ul/browse/'+encodeURIComponent(target)+'?ref='+ref;
 if(name==='Solflare')return 'https://solflare.com/ul/v1/browse/'+encodeURIComponent(target)+'?ref='+ref;
 if(name==='Backpack')return 'https://backpack.app/ul/v1/browse/'+encodeURIComponent(target)+'?ref='+ref;
 if(name==='Trust Wallet')return 'https://link.trustwallet.com/open_url?coin_id=501&url='+encodeURIComponent(target);
 if(name==='MetaMask')return 'https://link.metamask.io/dapp/'+url.host+'/';
 return null;
}
export function mobileWalletPresentation({name,selectable,href,userAgent='',touchPoints=0,mwaId}){
 const mobile=/Android|iPhone|iPad|iPod/i.test(userAgent)||(/Macintosh/.test(userAgent)&&touchPoints>1);
 if(!mobile||selectable)return null;
 const url=mobileWalletBrowse(name,href);
 if(name==='MetaMask'&&/MetaMask/i.test(userAgent))return {url:null,label:name,subtitle:'Solana account not detected',note:'Select a Solana account. This browser must expose a Solana Wallet Standard provider; Ethereum accounts cannot connect.'};
 if(['Jupiter Mobile','Espresso Cash'].includes(name))return {url:null,providerId:mwaId,label:name,subtitle:mwaId?'Choose this app in the Android wallet picker':'Android Mobile Wallet Adapter required',note:mwaId?'Android chooses the installed wallet. TEKKTEAM does not select an app or authenticate automatically.':publicWalletOrigin(href)?'Open this website in Android Chrome with a compatible wallet installed. Mobile Wallet Adapter is unavailable in this browser.':'The local preview cannot open wallets on your phone. This requires the updated HTTPS site in Android Chrome.'};
 return {url,label:'Open in '+name,subtitle:url?'Continue inside the wallet app':'HTTPS mobile website required',note:url?'Connect and Sign In inside '+name+'. '+(name==='MetaMask'?'Requires a Solana Wallet Standard provider; EVM accounts cannot connect. ':'')+'Return to this browser manually; each browser keeps its own session. Unsaved fields are not transferred.':publicWalletOrigin(href)?'No compatible Solana transport was detected in this browser.':'This local preview is only available on this computer. Open the HTTPS TEKKTEAM website on your phone to continue.'};
}

export function renderMobileWalletChoice(wallet,mobile,iconMarkup,esc){
 const content=iconMarkup+`<span><strong>${esc(mobile.label)}</strong><small>${esc(mobile.subtitle)}</small></span><span class="tw-wallet-choice-arrow" aria-hidden="true">↗</span>`;
 const action=mobile.url?`<a class="tw-wallet-choice tw-mobile-wallet-choice" href="${esc(mobile.url)}" rel="noreferrer">${content}</a>`:`<button class="tw-wallet-choice tw-mobile-wallet-choice" type="button" ${mobile.providerId?`data-wallet="${esc(mobile.providerId)}"`:'disabled'}>${content}</button>`;
 return `<div class="tw-wallet-choice-wrap" data-mobile-wallet="${esc(wallet.name)}">${action}<p class="tw-mobile-wallet-note">${esc(mobile.note)}</p><p class="tw-wallet-row-error" role="alert" hidden></p></div>`;
}
