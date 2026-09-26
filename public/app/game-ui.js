const glyphs={overview:'◆',agents:'▦',tokens:'⬡',skins:'✦',how:'?'};
export function enhanceShell(root){
  root.querySelectorAll('[data-nav]').forEach(a=>{const i=document.createElement('span');i.className='game-nav-icon';i.setAttribute('aria-hidden','true');i.textContent=glyphs[a.dataset.nav];a.prepend(i);});
}
export function enhanceLaunch(root){
  const form=root.querySelector('#tw-create'),panel=form.querySelector('.tw-form-panel');
  const markers=[...panel.querySelectorAll('.tw-step-label')];
  const identity=document.createElement('section');identity.id='setup-identity';identity.className='game-setup-section';
  while(panel.firstChild && panel.firstChild!==markers[1])identity.append(panel.firstChild);
  panel.prepend(identity);
  const strategy=document.createElement('section');strategy.id='setup-strategy';strategy.className='game-setup-section';
  let node=markers[1];while(node && !node.matches?.('#tw-form-error')){const next=node.nextSibling;strategy.append(node);node=next;}
  identity.after(strategy);
  const nav=document.createElement('nav');nav.className='game-setup-tabs';nav.setAttribute('aria-label','Agent setup sections');
  nav.innerHTML='<a href="#setup-character" data-section="tw-character-preview"><b>01</b> Character</a><a href="#setup-identity" data-section="setup-identity"><b>02</b> Identity</a><a href="#setup-strategy" data-section="setup-strategy"><b>03</b> Strategy</a>';
  form.before(nav);
  nav.addEventListener('click',e=>{const a=e.target.closest('[data-section]');if(!a)return;e.preventDefault();root.querySelector('#'+a.dataset.section).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});nav.querySelectorAll('a').forEach(n=>n.classList.toggle('selected',n===a));});
  const picker=form.querySelector('.tw-character-picker');picker.querySelector('.tw-step-label').textContent='01 / SELECT YOUR AGENT';
  identity.querySelector('.tw-step-label').textContent='02 / PROJECT IDENTITY';strategy.querySelector('.tw-step-label').textContent='03 / STRATEGY LOADOUT';
  const badge=document.createElement('span');badge.className='game-included';badge.textContent='ALL CHARACTERS INCLUDED';picker.prepend(badge);
  const count=document.createElement('div');count.className='game-selection';count.setAttribute('aria-live','polite');picker.querySelector('.tw-character-options').after(count);
  const update=()=>{const options=[...form.querySelectorAll('input[name="character"]')];count.textContent=`SELECTED ${options.findIndex(i=>i.checked)+1} / ${options.length} · DRAG TO ROTATE`;};update();form.addEventListener('change',update);
}
