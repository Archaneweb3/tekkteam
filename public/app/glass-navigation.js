import {icon} from './icons.js';
import {mountLiquidMaterial} from './liquid-material.js';
import {sidebarIcon} from './sidebar-icons.js';
/** Presentation-only drawer around the original navigation and wallet nodes. */
export function mountGlassNavigation(root,{config={}}={}){
 const header=root.querySelector('.tw-header'),shell=root.querySelector('.tw-shell'),status=root.querySelector('.tw-system');
 if(!header||!shell)return {destroy(){}};
 header.classList.add('spatial-glass');
 const nav=header.querySelector('nav');
 for(const link of nav.querySelectorAll('a')){link.querySelector('svg')?.remove();link.insertAdjacentHTML('afterbegin',sidebarIcon(link.dataset.nav));}
 const mark=header.querySelector('.tw-mark');if(mark)mark.innerHTML=sidebarIcon('crown');
 const material=mountLiquidMaterial([...nav.querySelectorAll('a'),...header.querySelectorAll('#tw-wallet')],{nav});
 const note=document.createElement('aside');note.className='tt-sidebar-note';note.innerHTML='<img src="/assets/characters/portraits/frank.webp" alt=""><strong>Your coin. Your agent.</strong><p>Build your team on Solana.</p>';header.insertBefore(note,header.querySelector('#tw-wallet'));
 const media=matchMedia('(max-width:900px)'),wallet=header.querySelector('#tw-wallet');
 wallet?.classList.add('spatial-glass');
 const dock=document.createElement('div');dock.className='tw-utility-dock';dock.setAttribute('aria-label','Workspace utilities');
 const ca=typeof config.contractAddress==='string'?config.contractAddress.trim():'';
 if(ca){const row=document.createElement('div');row.className='tw-utility-ca';row.innerHTML=`<span>CA</span><code></code><button type="button" aria-label="Copy TEKKTEAM contract address" title="Copy complete contract address">${icon('copy')}</button>`;row.querySelector('code').textContent=ca.slice(0,5)+'…'+ca.slice(-5);row.querySelector('button').onclick=async e=>{const button=e.currentTarget;try{await navigator.clipboard.writeText(ca);button.textContent='COPIED';}catch{button.textContent='COPY FAILED';}clearTimeout(button.copyTimer);button.copyTimer=setTimeout(()=>{if(button.isConnected)button.innerHTML=icon('copy');},1800);};dock.append(row);}
 else if(config.contractAddressStatus==='COMING_SOON'){const row=document.createElement('button');row.type='button';row.className='tw-utility-ca tw-utility-ca-pending';row.setAttribute('aria-label','Copy Coming Soon text');row.title='Copy Coming Soon';row.innerHTML='<span>CA</span><code>COMING SOON</code>';row.onclick=async()=>{try{await navigator.clipboard.writeText('COMING SOON');row.querySelector('code').textContent='COPIED';}catch{row.querySelector('code').textContent='COPY FAILED';}clearTimeout(row.copyTimer);row.copyTimer=setTimeout(()=>{if(row.isConnected)row.querySelector('code').textContent='COMING SOON';},1800);};dock.append(row);}
 const socialIcons={x:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>',telegram:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>'};
 const socials=document.createElement('div');socials.className='tw-utility-socials';for(const [kind,label,url]of [['x','Open X',config.socialXUrl],['telegram','Open Telegram',config.socialTelegramUrl]]){if(typeof url!=='string'||!/^https:\/\//i.test(url))continue;const link=document.createElement('a');link.className='tw-social-'+kind;link.dataset.externalIcon='true';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.ariaLabel=label;link.title=label;link.innerHTML=socialIcons[kind];socials.append(link);}if(socials.childElementCount)dock.append(socials);
 if(status)status.hidden=true;dock.append(wallet);header.append(dock);
 header.id='tw-workspace-navigation';
 const bar=document.createElement('div');bar.className='tw-mobile-nav';
 bar.innerHTML=`<a href="#/overview" class="tw-mobile-wordmark">tekkteam</a><button type="button" class="tw-icon-button" aria-label="Open navigation" aria-controls="tw-workspace-navigation" aria-expanded="false">${icon('more')}</button>`;
  const mobileLinks=document.createElement('nav');mobileLinks.className='tt-mobile-links';mobileLinks.setAttribute('aria-label','Quick navigation');
  for(const source of nav.querySelectorAll('a')){const link=document.createElement('a');link.href=source.getAttribute('href');link.textContent=source.textContent;link.dataset.nav=source.dataset.nav;mobileLinks.append(link);}bar.append(mobileLinks);
 shell.prepend(bar);
 const toggle=bar.querySelector('button'),close=document.createElement('button');close.type='button';close.className='tw-icon-button tw-drawer-close';close.setAttribute('aria-label','Close navigation');close.innerHTML=icon('close');header.prepend(close);
 const scrim=document.createElement('button');scrim.className='tw-nav-scrim';scrim.type='button';scrim.tabIndex=-1;scrim.setAttribute('aria-label','Close navigation');shell.append(scrim);
 let opened=false,restoreOverflow='',muted=[];
 const focusable=()=>[...header.querySelectorAll('a,button,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
 function setOpen(value,restoreFocus=true){
  opened=!!value&&media.matches;root.classList.toggle('tw-drawer-open',opened);toggle.setAttribute('aria-expanded',String(opened));header.inert=media.matches&&!opened;
  if(opened){header.setAttribute('role','dialog');header.setAttribute('aria-modal','true');header.setAttribute('aria-label','Workspace navigation');restoreOverflow=document.body.style.overflow;document.body.style.overflow='hidden';muted=[...shell.children].filter(el=>el!==header&&el!==scrim).map(el=>[el,el.inert]);for(const [el]of muted)el.inert=true;close.focus();}
  else{header.removeAttribute('role');header.removeAttribute('aria-modal');header.removeAttribute('aria-label');document.body.style.overflow=restoreOverflow;for(const [el,previous]of muted)el.inert=previous;muted=[];if(restoreFocus&&media.matches)toggle.focus();}
 }
 const openClick=()=>setOpen(true),closeClick=()=>setOpen(false),routeClose=()=>{if(opened)setOpen(false);},resize=()=>{if(opened)setOpen(false,false);header.inert=media.matches;};
 const keys=e=>{if(!opened||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();setOpen(false);}if(e.key==='Tab'){const els=focusable(),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 const navClick=e=>{if(e.target.closest('a[href^="#/"]')&&opened)setOpen(false);};
 toggle.addEventListener('click',openClick);close.addEventListener('click',closeClick);scrim.addEventListener('click',closeClick);header.addEventListener('click',navClick);document.addEventListener('keydown',keys);window.addEventListener('hashchange',routeClose);media.addEventListener('change',resize);header.inert=media.matches;
 return {destroy(){material.destroy();if(opened)setOpen(false,false);header.inert=false;root.classList.remove('tw-drawer-open');document.removeEventListener('keydown',keys);window.removeEventListener('hashchange',routeClose);media.removeEventListener('change',resize);header.removeEventListener('click',navClick);bar.remove();close.remove();scrim.remove();}};
}
