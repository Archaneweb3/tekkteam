import {icon} from './icons.js';
import {characterPortraitUrl} from './character-registry.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idleRows=(message='No Paper activity yet')=>`<div class="phone-idle-note">${esc(message)}</div><ol class="phone-events phone-idle-rows">${[['agents','Your workforce','Agents appear after creation'],['trade','Paper decisions','Waiting for strategy activity'],['tokens','Token signals','No recorded signals'],['risk','Risk checks','No recorded decisions']].map(([glyph,title,note])=>`<li><span class="phone-event-symbol">${icon(glyph)}</span><div><strong>${title}</strong><p>${note}</p></div></li>`).join('')}</ol>`;
const age=value=>{const t=typeof value==='number'?value:Date.parse(value);if(!Number.isFinite(t))return'';const mins=Math.max(0,Math.floor((Date.now()-t)/60000));return mins<1?'now':mins<60?`${mins}m ago`:mins<1440?`${Math.floor(mins/60)}h ago`:`${Math.floor(mins/1440)}d ago`;};
// Hardware is a GLB; the accessible screen always derives from real read data.
export function deviceMarkup(){return `<aside class="workforce-device" aria-label="Paper activity device"><div class="workforce-phone"><div class="phone-front"><div class="phone-screen"><div class="phone-status-bar" aria-hidden="true"><span>TEKK OS</span><i class="phone-notch"></i><svg viewBox="0 0 32 12"><path d="M1 10V8m4 2V5m4 5V2" stroke="currentColor" stroke-width="2"/><rect x="15" y="2" width="13" height="8" rx="2" fill="none" stroke="currentColor"/><path d="M29 4v4" stroke="currentColor"/><rect x="17" y="4" width="9" height="4" rx="1" fill="currentColor"/></svg></div><header><strong>TEKKTEAM</strong><svg class="phone-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7z" fill="#ffdb43" stroke="#bc751c" stroke-width="1.5"/></svg></header><div class="phone-screen-heading"><h2>LIVE ACTIVITY</h2><span class="phone-paper"><i></i> Paper</span></div><div data-device-feed role="status">${idleRows('Loading Paper activity')}</div><footer><i></i> Paper mode · No real trades</footer></div><span class="phone-yellow-tab" aria-hidden="true"></span></div></div><span class="device-caption">YOUR WORKFORCE. IN VIEW.</span></aside>`;}
export function paintDevice(host,network){
 const target=host.querySelector('[data-device-feed]');if(!target)return;
 if(!Array.isArray(network?.activity)){target.innerHTML=idleRows('Activity unavailable · reconnecting');return;}
 const events=network.activity.slice(0,5),agents=new Map((network.agents??[]).map(a=>[a.agentId??a.id,a]));
 if(!events.length){target.innerHTML=idleRows();return;}
 const labels={BUY:'BUY',SELL:'SELL',SIGNAL_SKIPPED:'SKIPPED',RISK_REJECTED:'RISK REJECTED',SIGNAL_DETECTED:'SIGNAL'};
 target.innerHTML=`<ol class="phone-events">${events.map(e=>{const a=agents.get(e.agentId),tone=e.type==='BUY'?'buy':e.type==='SELL'?'sell':'decision';const portrait=a?`<img class="phone-agent-portrait" src="${characterPortraitUrl(a)}" alt="">`:`<span class="phone-event-symbol">${icon('agents')}</span>`;return `<li>${portrait}<div><strong>${esc(a?.name??e.agentId??'Agent')}</strong><p><b class="phone-event-${tone}">${esc(labels[e.type]??String(e.type??'Activity').replaceAll('_',' '))}</b> ${e.tokenSymbol?'$'+esc(e.tokenSymbol):''}</p>${Number.isFinite(e.pnlPercent)?`<small class="phone-event-${e.pnlPercent<0?'sell':'buy'}">${e.pnlPercent>0?'+':''}${esc(e.pnlPercent.toFixed(2))}%</small>`:Number.isFinite(e.executedSizeSol)?`<small>${esc(e.executedSizeSol)} SOL</small>`:e.reason?`<small>${esc(e.reason)}</small>`:''}</div><time>${esc(age(e.timestamp))}</time></li>`;}).join('')}</ol>`;
}

// The existing screen/data renderer stays intact; only the hardware becomes GLB.
export function mountDevice(host){
 const device=host.querySelector('.workforce-device');if(!device)return{destroy(){}};
 device.classList.add('phone-model-device');const surface=document.createElement('div');surface.className='phone-model-surface';surface.setAttribute('aria-hidden','true');device.querySelector('.workforce-phone').prepend(surface);
 let dead=false,renderer=null,angle=0,start=null;
 const phone=device.querySelector('.workforce-phone'),front=device.querySelector('.phone-front');
 const controls=document.createElement('div');controls.className='phone-rotate-controls';controls.innerHTML=`<button type="button" aria-label="Rotate phone left">${icon('back')}</button><span>Drag to rotate</span><button type="button" aria-label="Reset phone view">Reset</button>`;device.append(controls);
 const rotate=value=>{angle=value;renderer?.rotate(angle);front.style.setProperty('--phone-yaw',`${angle}deg`);};
 const down=e=>{if(e.button!==0)return;start={x:e.clientX,angle};phone.setPointerCapture(e.pointerId);phone.classList.add('is-dragging');};
 const move=e=>{if(start)rotate(start.angle+(e.clientX-start.x)*.7);};
 const up=()=>{start=null;phone.classList.remove('is-dragging');};
 const left=()=>rotate(angle-30),reset=()=>rotate(0);
 phone.addEventListener('pointerdown',down);phone.addEventListener('pointermove',move);phone.addEventListener('pointerup',up);phone.addEventListener('pointercancel',up);phone.addEventListener('lostpointercapture',up);
 controls.querySelector('button').addEventListener('click',left);controls.querySelectorAll('button')[1].addEventListener('click',reset);
 Promise.resolve(window.mountWorkspacePhone?.(surface)).then(handle=>{if(dead)handle?.destroy();else{renderer=handle;rotate(angle);}}).catch(()=>device.classList.add('phone-model-unavailable'));
 return{destroy(){dead=true;phone.removeEventListener('pointerdown',down);phone.removeEventListener('pointermove',move);phone.removeEventListener('pointerup',up);phone.removeEventListener('pointercancel',up);phone.removeEventListener('lostpointercapture',up);controls.remove();renderer?.destroy();surface.remove();}};
}
