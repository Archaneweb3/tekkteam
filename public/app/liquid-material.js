// Presentation only. All mounted groups share one sleeping scheduler.
const controls=new Map(),jobs=new Set(),active=new Set();
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(pointer:fine)');
let raf=0,last=0,listening=false;
const blocked=el=>!el.isConnected||el.matches(':disabled,[aria-disabled="true"],[aria-busy="true"],.loading')||!!el.closest('[inert]');
function wake(){if(!raf&&!document.hidden)raf=requestAnimationFrame(tick);}
function tick(now){raf=0;const dt=Math.min((now-last)/1000||.016,.032);last=now;let moving=false;
 for(const s of active){if(blocked(s.el))s.target=s.tp=0;const k=reduce.matches?1:1-Math.exp(-dt*18);let unsettled=false;
  for(const [a,b]of[['x','tx'],['y','ty'],['light','target'],['press','tp']]){s[a]+=(s[b]-s[a])*k;if(Math.abs(s[a]-s[b])>.003)unsettled=true;}
  const v=s.el.style;v.setProperty('--pointer-x',`${s.x.toFixed(2)}%`);v.setProperty('--pointer-y',`${s.y.toFixed(2)}%`);v.setProperty('--pointer-light',s.light.toFixed(3));v.setProperty('--material-press',s.press.toFixed(3));v.setProperty('--pointer-angle',`${Math.atan2(s.y-50,s.x-50)*180/Math.PI+90}deg`);v.setProperty('--pointer-distance',Math.min(1,Math.hypot(s.x-50,s.y-50)/71).toFixed(3));v.setProperty('--icon-x',`${(s.x-50)/75*s.light}px`);v.setProperty('--icon-y',`${(s.y-50)/75*s.light}px`);
  if(unsettled)moving=true;else if(s.target===0&&s.tp===0)active.delete(s);
 }
 for(const job of jobs)if(job(dt))moving=true;if(moving)wake();
}
function move(e){if(!fine.matches||reduce.matches)return;const candidates=[];
 // Browser hit-testing bounds work to two controls, not every card's layout.
 for(let el=e.target instanceof Element?e.target:null;el&&candidates.length<2;el=el.parentElement){const s=controls.get(el);if(s&&!blocked(el))candidates.push(s);}
 for(const s of active)if(!candidates.includes(s))s.target=s.el.matches(':focus-visible')?.4:0;
 for(const s of candidates){const r=s.el.getBoundingClientRect();s.tx=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));s.ty=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));s.target=1;active.add(s);}wake();
}
function release(){for(const s of active)s.tp=0;wake();}
function leave(){for(const s of active)s.target=s.tp=0;wake();}
function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;leave();}else wake();}
function listen(on){if(listening===on)return;listening=on;const method=on?'addEventListener':'removeEventListener';document[method]('pointermove',move,{passive:true});document[method]('pointerup',release);document[method]('pointercancel',leave);document[method]('pointerleave',leave);document[method]('visibilitychange',visibility);window[method]('blur',leave);reduce[method]('change',leave);fine[method]('change',leave);if(!on){cancelAnimationFrame(raf);raf=0;}}
export function mountLiquidMaterial(elements,{nav=null}={}){
 const owned=[],clean=[];for(const el of elements){if(controls.has(el))continue;const s={el,x:50,y:50,tx:50,ty:50,light:0,target:0,press:0,tp:0};controls.set(el,s);owned.push(s);el.classList.add('liquid-control');
  const on=(type,fn)=>{el.addEventListener(type,fn);clean.push(()=>el.removeEventListener(type,fn));};
  const press=()=>{if(blocked(el))return;s.tp=reduce.matches?0:1;active.add(s);wake();};
  on('pointerdown',press);on('keydown',e=>{if(!e.repeat&&(e.key==='Enter'||e.key===' '))press();});on('keyup',release);on('animationend',()=>el.classList.remove('liquid-ripple'));on('focus',()=>{s.target=.4;active.add(s);wake();});on('blur',()=>{s.target=s.tp=0;wake();});
 }
 let observer,resize,plate,job;
 if(nav){nav.classList.add('liquid-nav');plate=document.createElement('span');plate.className='liquid-active-plate';plate.setAttribute('aria-hidden','true');nav.prepend(plate);let y=0,v=0,target=0,initialized=false;
  const locate=()=>{const a=nav.querySelector('a.active');plate.hidden=!a;if(!a)return;target=a.offsetTop;plate.style.left=`${a.offsetLeft}px`;plate.style.width=`${a.offsetWidth}px`;plate.style.height=`${a.offsetHeight}px`;if(!initialized){y=target;initialized=true;}wake();};
  job=dt=>{y=reduce.matches?target:y+(target-y)*(1-Math.exp(-24*dt));plate.style.transform=`translateY(${y}px)`;return Math.abs(target-y)>.02;};jobs.add(job);observer=new MutationObserver(locate);observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});resize=new ResizeObserver(locate);resize.observe(nav);locate();
 }
 listen(true);return{destroy(){clean.forEach(fn=>fn());observer?.disconnect();resize?.disconnect();jobs.delete(job);plate?.remove();nav?.classList.remove('liquid-nav');for(const s of owned){controls.delete(s.el);active.delete(s);s.el.classList.remove('liquid-control','liquid-ripple');for(const name of['pointer-x','pointer-y','pointer-light','material-press','pointer-angle','pointer-distance','icon-x','icon-y'])s.el.style.removeProperty('--'+name);}if(!controls.size&&!jobs.size)listen(false);}};
}
