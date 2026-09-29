import {mountAgentWallet} from './agent-wallet-ui.js';
import {mountAnalytics} from './performance-ui.js';
import {request} from './backend.js';
import {renderPerformance,renderActivity,renderPositions,esc} from './trading-pages.js';
import {mountStrategyCenter} from './strategy-center.js';
import {mountMarketRadar} from './market-radar-ui.js';
export function mountTrading(host,agent){
 let dead=false,busy=false;
 host.innerHTML='<div data-performance></div><div id="tw-strategy-center"></div><div data-market-radar></div><div data-agent-wallet></div><div data-paper-results></div>';
 const wallet=mountAgentWallet(host.querySelector('[data-agent-wallet]'),agent);
 const analytics=mountAnalytics(host.querySelector('[data-performance]'),agent);
 const results=host.querySelector('[data-paper-results]'),base='/agents/'+encodeURIComponent(agent.id)+'/trading';
 function paint(state){if(dead)return;
  const detail=document.querySelector('.tw-detail');if(detail){const badge=detail.querySelector('.tw-status');if(badge)badge.textContent=state.status;for(const entry of detail.querySelectorAll('dl>div'))if(entry.querySelector('dt')?.textContent.trim()==='Trading')entry.querySelector('dd').textContent='Paper · '+state.status;}
  results.innerHTML=renderPerformance(state)+'<p role="status">'+esc(state.health||'')+' '+esc(state.decision||'')+'</p><p class="tw-error" role="alert"></p><h3>Open positions</h3>'+renderPositions(state.openPositions)+'<h3>Trading history</h3>'+renderActivity(state.activity);
  results.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{await request(base+'/'+button.dataset.action,{method:'POST',body:'{}'});paint(await request(base));}catch(e){if(!dead){results.querySelector('[role="alert"]').textContent=e.message;button.disabled=false;}}finally{busy=false;}});
 }
 const radar=mountMarketRadar(host.querySelector('[data-market-radar]'),agent,{onStart:()=>{const button=host.querySelector('[data-lifecycle]');if(!button)return;button.scrollIntoView({block:'center'});button.focus();if(!button.disabled&&button.textContent==='Start Paper Trading')button.click();}});
 const center=mountStrategyCenter(host.querySelector('#tw-strategy-center'),agent,{onState:s=>{paint(s);radar.refresh();analytics.refresh();}});
 return {destroy(){dead=true;wallet.destroy();analytics.destroy();center.destroy();radar.destroy();}};
}
