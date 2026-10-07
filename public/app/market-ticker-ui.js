import {request} from './backend.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=value=>typeof value==='number'&&Number.isFinite(value);
const price=value=>{
  if(!known(value))return '—';
  if(value>=1)return '$'+value.toLocaleString('en-US',{maximumFractionDigits:4});
  if(value>=0.0001)return '$'+value.toLocaleString('en-US',{maximumFractionDigits:6});
  return '$'+value.toExponential(2);
};
const change=value=>{
  if(!known(value))return {text:'—',tone:'flat'};
  const tone=value>0?'up':value<0?'down':'flat';
  return {text:`${value>0?'+':''}${value.toLocaleString('en-US',{maximumFractionDigits:2})}%`,tone};
};

function itemHTML(item){
  const pct=change(item.change24h);
  const href=typeof item.url==='string'&&item.url.startsWith('https://dexscreener.com/')?item.url:'#';
  const external=href!=='#';
  return `<a class="mt-item" href="${esc(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}><span class="mt-symbol">$${esc(item.symbol||'????')}</span><span class="mt-price">${esc(price(item.priceUsd))}</span><span class="mt-change" data-tone="${pct.tone}">${esc(pct.text)}</span></a>`;
}

/** Presentation only: DexScreener-backed ticker snapshot from GET /api/market/ticker. */
export function renderMarketTicker(snapshot){
  const items=Array.isArray(snapshot?.items)?snapshot.items.filter(i=>i&&typeof i.symbol==='string'):[];
  const stale=snapshot?.stale===true;
  const provenance=snapshot?.provenance==='BACKEND VERIFIED'?'BACKEND VERIFIED · DexScreener · 24h':(snapshot?.provenance||'UNAVAILABLE');
  if(!items.length){
    return `<aside class="mt-banner" aria-label="Market ticker"><div class="mt-rail"><span class="mt-meta">${esc(provenance)}</span><span class="mt-empty">Market data unavailable</span></div></aside>`;
  }
  const track=items.map(itemHTML).join('');
  return `<aside class="mt-banner" aria-label="Trending Solana token prices"><div class="mt-meta-row"><span class="mt-meta">${esc(provenance)}${stale?' · STALE':''}</span></div><div class="mt-viewport"><div class="mt-track">${track}${track}</div></div></aside>`;
}

/** Overview Home strip above the workspace hero. */
export function mountMarketTicker(host){
  let dead=false,busy=false;
  const paint=snapshot=>{if(!dead)host.innerHTML=renderMarketTicker(snapshot);};
  async function load(){
    if(dead||busy||document.hidden)return;
    busy=true;
    try{paint(await request('/market/ticker').then(data=>data,()=>({status:'UNAVAILABLE',provenance:'UNAVAILABLE',items:[]})));}
    finally{busy=false;}
  }
  host.classList.add('mt-home-slot');
  host.innerHTML='<aside class="mt-banner" aria-label="Market ticker"><div class="mt-rail"><span class="mt-meta">BACKEND VERIFIED · DexScreener · 24h</span><span class="mt-empty">Loading market…</span></div></aside>';
  const timer=setInterval(load,15000);
  document.addEventListener('visibilitychange',load);
  load();
  return {destroy(){dead=true;clearInterval(timer);document.removeEventListener('visibilitychange',load);host.classList.remove('mt-home-slot');host.innerHTML='';}};
}
