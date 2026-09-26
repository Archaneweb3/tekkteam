import { request, post, wallets, connect, disconnect,observeExistingWallet } from './backend.js';
import { mountOverview } from './overview-dashboard.js';
import { renderWorkspaceMap } from './overview.js';
import { createBoss } from './boss3d.js';
import { robotSVG } from './robot.js';
import { enhanceShell } from './game-ui.js';
import {icon} from './icons.js';
import {hydrateCharacters} from './character-thumbnail.js';
import {mountTrading} from './trading-ui.js';
import {tokenImageField} from './token-image-ui.js';
import {mountWalletBalance} from './wallet-balance.js';
import {mountTradingPage,mountPublicTrader} from './trading-pages.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = s => s ? `${s.slice(0, 5)}…${s.slice(-4)}` : '';
const $ = (s, root = document) => root.querySelector(s);
let state, scenes = [], routeVersion = 0, poll, draftKey = crypto.randomUUID();
const root = $('#app');
const routeName = () => location.hash.slice(2).split('/')[0] || 'overview';
const statusText = a => ({DRAFT:'Draft',READY:'Ready',WORKING:'Working',PAUSED:'Paused'}[a.tradingStatus]||'Draft');
const stamp = v => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const empty = (title, copy, cta = true) => `<div class="tw-empty"><span class="tw-empty-symbol">${icon('box')}</span><h3>${title}</h3><p>${copy}</p>${cta ? '<a class="tw-button primary" href="#/launch">Create your first agent </a>' : ''}</div>`;
const head = (eyebrow, title, description) => `<div class="tw-page-heading"><h1>${title}</h1><p>${description}</p></div>`;
function toast(message) { $('#tw-toast').textContent = message; $('#tw-toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#tw-toast').classList.remove('show'), 5500); }
function shell() {
  root.innerHTML = `<div class="tw-shell"><header class="tw-header"><a href="#/" class="tw-brand"><span class="tw-mark">t</span>tekkwork<span class="tw-beta">BETA</span></a><nav aria-label="Main navigation">${[['overview','Overview'],['agents','Agents'],['tokens','Tokens'],['skins','Characters'],['how','Guide']].map(([id,label])=>`<a href="#/${id}" data-nav="${id}">${label}</a>`).join('')}</nav><button class="tw-button wallet" id="tw-wallet">${state.session ? short(state.session.address) : 'Connect wallet'}</button></header><div class="tw-system"><span><i></i> Workspace API online</span><span>Paper network · Mainnet market data</span><span>Live trading & funding locked</span></div><main id="tw-page"></main><footer class="tw-footer"><a href="#/" class="tw-wordmark">tekkwork</a><span>Paper performance · Not real profits</span></footer></div><div id="tw-toast" role="status" aria-live="polite"></div>`;
  enhanceShell(root);
  if (state.config.mainnetSafetyMode) $('.tw-system').textContent = 'MAINNET SAFETY MODE · Reads and isolated Memo diagnostics only · Broadcasting, drafts and token issuance disabled';
  if (state.config.preview) {
    $('.tw-system').textContent = 'CLIENT DEMO · Interactive preview · Wallet, saving and transactions unavailable';
    $('#tw-wallet').textContent = 'Demo mode';
  }
  paintWallet();
}
function paintWallet(){observeExistingWallet(state.session?.address);mountWalletBalance($('#tw-wallet'),{owner:state.session?.address,onConnect:openWallet,onDisconnect:async()=>{await disconnect();await refresh();shell();render();}});}
window.addEventListener('tekkwork:wallet-account-changed',async()=>{await refresh();shell();render();toast('Wallet account changed. Connect the selected account to sign in.');});
function openWallet() {
  if (state.config.preview) { toast('Client demo: explore the office, characters and setup. Wallet login, saving and minting are unavailable.'); return; }
  const draft = $('#tw-create') ? Object.fromEntries(new FormData($('#tw-create'))) : null;
  const dialog = document.createElement('dialog'); dialog.className = 'tw-dialog';
  const list = wallets();
  dialog.innerHTML = `<button class="tw-close tw-button ghost" aria-label="Close">${icon('close')}</button><span class="tw-eyebrow">YOUR WORKSPACE KEY</span><h2>Connect. Sign. You're in.</h2><p>Sign a one-time message to access your agents. Signing in does not send SOL or approve a transaction.</p><div class="tw-wallet-list">${list.length ? list.map(w => `<button class="tw-button" data-wallet="${esc(w.id)}">${esc(w.name)} </button>`).join('') : '<p>No compatible Solana wallet detected. Open this site in a wallet-enabled browser with Phantom or Solflare installed.</p>'}</div><p class="tw-error" role="alert"></p>`;
  document.body.append(dialog); dialog.showModal(); $('.tw-close', dialog).onclick = () => dialog.close(); dialog.onclose = () => dialog.remove();
  dialog.addEventListener('click', async e => {
    const button = e.target.closest('[data-wallet]'); if (!button) return;
    button.disabled = true;
    $('#tw-wallet').textContent='Connecting…';
    try {
      await connect(button.dataset.wallet); await refresh(); dialog.close(); shell(); render();
      if (draft && $('#tw-create')) for (const [name,value] of Object.entries(draft)) {
        const field = $('#tw-create').elements.namedItem(name);
        if (field) field.value = value;
        if (name === 'character') $('#tw-create input[name="character"]:checked')?.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }
    catch (error) { $('.tw-error', dialog).textContent = error.message; button.disabled = false;paintWallet(); }
  });
}
async function refresh() { state = await request('/state'); return state; }
const card = a => `<a class="tw-agent" href="#/agent/${encodeURIComponent(a.id)}"><div class="tw-card-character"><img data-character="${esc(a.character)}" alt="${esc(a.name)} character"></div><div class="tw-card-title"><h3>${esc(a.name)}</h3><span class="tw-status">${esc(statusText(a))}</span></div><p>${esc(a.coin.name)} · $${esc(a.coin.ticker)}</p><div class="tw-agent-bottom">${esc(state.config.strategies.find(s => s.id === a.strategy)?.name || a.strategy)}</div></a>`;
const activity = () => state.events.length ? `<ol class="tw-events">${state.events.slice(0, 8).map(e => `<li><span class="tw-event-icon">${icon(e.type === 'minted' ? 'check' : 'plus')}</span><div><p>${esc(e.message)}</p><time>${stamp(e.createdAt)}</time></div><a href="#/agent/${encodeURIComponent(e.agentId)}" aria-label="View agent">View</a></li>`).join('')}</ol>` : `<div class="tw-quiet"><h3>Your next move starts here.</h3><p>Your workspace activity will appear here.</p></div>`;
function home(page) {
  page.innerHTML='<section class="ov-workspace-hero" aria-label="3D workspace"></section><div class="ov-data-sections"></div>';
  const map=page.querySelector('.ov-workspace-hero'),dashboard=page.querySelector('.ov-data-sections');
  try{scenes.push(renderWorkspaceMap(map,{onAction:role=>{if(role==='trade')dashboard.querySelector('.tw-overview-feed')?.scrollIntoView({behavior:'smooth',block:'start'});else if(role==='shill')share();else location.hash=role==='launch'?'#/launch':'#/how';}}));}
  catch(error){map.insertAdjacentHTML('beforeend','<p role="alert">3D workspace could not load. Reload to retry.</p>');console.error('Workspace map failed',error);}
  scenes.push(mountOverview(dashboard,{getSession:()=>state.session?.address}));
}
function share() { const url = new URL('https://x.com/intent/post'); url.searchParams.set('text', 'Building my own agent workspace with TEKKWORK.'); window.open(url.href, '_blank', 'noopener,noreferrer'); }
function agents(page) {
  if(location.hash==='#/agents/new'){createAgentPage(page);return;}
  page.innerHTML = `${head('', 'Your agents', 'Choose an agent to manage its strategy and token.')}<div class="tw-toolbar"><label class="tw-search">${icon('search')}<input id="tw-search" type="search" placeholder="Find an agent or token" aria-label="Search agents"></label><a class="tw-button primary" href="#/agents/new">Create agent</a></div><div class="tw-agent-grid directory" id="tw-directory"></div>`;
  const paint = () => { const query = $('#tw-search').value.toLowerCase(); const list = state.agents.filter(a => `${a.name} ${a.coin.name} ${a.coin.ticker}`.toLowerCase().includes(query)); $('#tw-directory').innerHTML = list.length ? list.map(card).join('') : empty(query ? 'No matching agents.' : 'Make room for your first agent.', query ? 'Try another name or ticker.' : 'Connect a wallet and create an agent to begin.', !query); hydrateCharacters($('#tw-directory')); };
  $('#tw-search').oninput = paint; paint();
}
function tokens(page) {
  const list=state.agents;
  page.innerHTML=head('', 'Tokens', 'Your agent tokens. Launch and manage each token from Agent Detail.')+(state.session?'':'<p>Connect your owner wallet to view your tokens.</p>')+'<div class="tw-token-list">'+list.map(a=>`<a href="#/agent/${encodeURIComponent(a.id)}"><span class="tw-avatar"><img data-character="${esc(a.character)}" alt="${esc(a.name)}"></span><div><h3>${esc(a.coin.name)} / $${esc(a.coin.ticker)}</h3><p>${esc(a.name)}</p><p data-token-state="${esc(a.id)}">Checking launch status…</p></div></a>`).join('')+'</div>';
  hydrateCharacters(page);
  for(const a of list)fetch('/api/pump-launch/status?agentId='+encodeURIComponent(a.id)).then(async r=>{if(!r.ok)throw Error('Launch status unavailable');return r.json();}).then(r=>{const el=page.querySelector('[data-token-state="'+a.id+'"]');if(el)el.textContent=r.confirmed&&r.status==='Success'?'Live · '+r.mint:r.signature?'Launch pending confirmation':'Draft token';}).catch(()=>{const el=page.querySelector('[data-token-state="'+a.id+'"]');if(el)el.textContent='Launch status unavailable';});
}
async function launch(page) {
  const version=routeVersion;
  page.innerHTML='<p role="status">Loading your agents…</p>';
  try{
    await refresh();if(version!==routeVersion)return;
    paintWallet();
    const heading=head('TOKEN LAUNCH','Choose your agent.','Launch your token from its Agent Detail page.');
    if(!state.session){page.innerHTML=heading+empty('Connect your wallet','Connect the owner wallet to view your agents.',false)+'<button class="tw-button primary" id="tw-launch-connect">Connect wallet</button>';$('#tw-launch-connect').onclick=openWallet;return;}
    if(state.agents.some(a=>a.creator!==state.session.address))throw Error('Agent owner mismatch. Reconnect your owner wallet.');
    page.innerHTML=heading+(state.agents.length?'<div class="tw-agent-grid directory">'+state.agents.map(card).join('')+'</div>':empty('No agents yet','Create an agent first to launch a token.',false)+'<button class="tw-button primary" id="tw-create-agent">Create agent</button>');
    if($('#tw-create-agent'))$('#tw-create-agent').onclick=createAgentDialog;
    hydrateCharacters(page);
  }catch(e){if(version!==routeVersion)return;page.innerHTML=empty('Could not load agents',esc(e.message),false)+'<button class="tw-button" id="tw-launch-retry">Try again</button>';$('#tw-launch-retry').onclick=()=>launch(page);}
}
function createAgentDialog(){
 location.hash='#/agents/new';
}
function createAgentPage(page){
 const owner=state.session?.address;if(!owner){page.innerHTML=empty('Connect your wallet','Connect the owner wallet to create an agent.',false)+'<button class="tw-button primary" id="tw-new-connect">Connect wallet</button>';$('#tw-new-connect').onclick=openWallet;return;}
 page.innerHTML=head('','Create your agent','Build the agent, configure its token, then launch when you’re ready.');
 const dialog=document.createElement('section');dialog.className='tw-create-dialog tw-create-page';page.append(dialog);
 dialog.innerHTML=`<h2>Create agent</h2><form id="tw-create"><div class="tw-create-fields"><label class="tw-field">Agent name<input name="name" required minlength="2" maxlength="40"></label><div class="tw-create-token"><label class="tw-field">Token name<input name="tokenName" required minlength="2" maxlength="32"></label><label class="tw-field">Symbol<input name="ticker" required pattern="[A-Za-z0-9]+" maxlength="10"></label></div><label class="tw-field">Description<textarea name="description" maxlength="300"></textarea></label><label class="tw-field">Strategy<select name="strategy">${state.config.strategies.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div><fieldset class="tw-character-picker"><legend>Choose your character</legend><div class="tw-character-options">${state.config.characters.filter(c=>['frank','cupsey','fomy','alon','satoshi'].includes(c.id)).map((c,i)=>`<label class="tw-character-option"><input type="radio" name="character" value="${esc(c.id)}" ${i===0?'checked':''} required><span class="tw-character-choice"><img data-character="${esc(c.id)}" alt="${esc(c.name)}"><span>${esc(c.name)}</span><span class="tw-character-check">${icon('check')}</span></span></label>`).join('')}</div></fieldset><p role="alert" class="tw-error"></p><div class="tw-dialog-actions"><button type="button" class="tw-button ghost" data-cancel>Cancel</button><button class="tw-button primary" type="submit">Create agent</button></div></form>`;
 const key=crypto.randomUUID();dialog.querySelector('h2').remove();dialog.querySelector('[data-cancel]').remove();
 dialog.classList.add('tw-create-dialog');hydrateCharacters(dialog);
 const tokenImage=tokenImageField(dialog.querySelector('form'));
 const form=dialog.querySelector('form'),fields=dialog.querySelector('.tw-create-fields'),picker=dialog.querySelector('.tw-character-picker');form.prepend(picker);
 const configuration=document.createElement('div');configuration.className='tw-create-configuration';picker.after(configuration);configuration.append(dialog.querySelector('.tw-token-image'),fields);
 const detailsHeading=document.createElement('h2');detailsHeading.textContent='Agent details';fields.prepend(detailsHeading);
 const strategy=fields.querySelector('[name=strategy]'),explanation=document.createElement('p');explanation.className='tw-strategy-explanation';strategy.closest('label').after(explanation);const explain=()=>{explanation.textContent={momentum:'Looks for stronger short-term market momentum.',selective:'Uses stricter entry conditions and trades less frequently.',balanced:'Balances entry frequency and risk filters.'}[strategy.value];};strategy.onchange=explain;explain();
 const summary=document.createElement('section');summary.className='tw-creation-summary';summary.innerHTML='<h2>Creation</h2><dl><div><dt>Agent creation</dt><dd>Free</dd></div><div><dt>Pump.fun launch</dt><dd>Not launched yet</dd></div><div><dt>Initial buy</dt><dd>0 SOL</dd></div></dl>';dialog.querySelector('.tw-dialog-actions').before(summary);
 const note=document.createElement('p');note.textContent='No SOL is spent until you explicitly launch the token.';dialog.querySelector('.tw-dialog-actions').prepend(note);
 dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=dialog.querySelector('[type="submit"]');button.disabled=true;try{if(state.session?.address!==owner)throw Error('Owner session changed. Reopen this form.');const a=await post('/agents',{...Object.fromEntries(new FormData(e.target)),tokenImage:tokenImage.value()},{'Idempotency-Key':key});if(a.creator!==owner)throw Error('Agent owner mismatch');await refresh();location.hash='#/agent/'+encodeURIComponent(a.id);}catch(error){dialog.querySelector('[role="alert"]').textContent=error.message;button.disabled=false;}};
}
async function detail(page, id, version) {
  if (!state.session) { page.innerHTML = `${head('PRIVATE WORKSPACE', 'Your team stays yours.', 'Connect the owner wallet to view this agent.')}<button id="tw-detail-connect" class="tw-button primary">Connect wallet</button>`; $('#tw-detail-connect').onclick = openWallet; return; }
  let a; try { a = await request('/agents/' + encodeURIComponent(id)); } catch (e) { if (version === routeVersion) page.innerHTML = empty('Agent unavailable.', esc(e.message), false); return; }
  if (version !== routeVersion) return;
  page.innerHTML = `<a class="tw-text-link" href="#/agents">${icon('back')} Back to agents</a><section class="tw-detail"><details class="tw-agent-menu"><summary aria-label="Agent actions">${icon('more')}</summary><div class="tw-agent-menu-panel"><button class="tw-button ghost" id="tw-edit-profile">Edit strategy</button><hr class="tw-menu-divider" id="tw-delete-divider"><button class="tw-button ghost destructive" id="tw-delete-draft" disabled>${icon('delete')} Delete draft</button><p id="tw-delete-note">Checking launch state…</p></div></details><div><span class="tw-eyebrow">AGENT ${String(a.no).padStart(3,'0')}</span><h1>${esc(a.name)}</h1><span class="tw-status blue">${esc(statusText(a))}</span><p>${esc(a.description || 'Your next idea has a workspace of its own.')}</p><dl><div><dt>Token</dt><dd>${esc(a.coin.name)} / $${esc(a.coin.ticker)}</dd></div><div><dt>Owner</dt><dd class="tw-mono">${esc(short(a.creator))}</dd></div><div><dt>Created</dt><dd>${stamp(a.createdAt)}</dd></div><div><dt>Trading</dt><dd>Not enabled</dd></div></dl><label class="tw-field">Strategy profile<select id="tw-strategy">${state.config.strategies.map(s => `<option value="${s.id}" ${s.id === a.strategy ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label><button class="tw-button" id="tw-save-strategy">Save profile</button></div><div class="tw-detail-character" id="tw-detail-character"></div></section><section class="tw-panel tw-execution" id="tw-mainnet-launch"><p role="status">Loading this agent’s Mainnet launch…</p></section>`;
  try { scenes.push(createBoss($('#tw-detail-character'), { skin: a.character })); } catch { $('#tw-detail-character').innerHTML = robotSVG(a.avatarSeed); }
  $('#tw-save-strategy').onclick = async e => { e.target.disabled = true; try { await request('/agents/' + a.id, { method: 'PATCH', body: JSON.stringify({ strategy: $('#tw-strategy').value }) }); await refresh(); toast('Strategy profile saved. Execution remains disabled.'); } catch (error) { toast(error.message); } finally { e.target.disabled = false; } };
  $('#tw-edit-profile').onclick=()=>{ $('.tw-agent-menu').open=false; $('#tw-strategy').focus(); };
  const deleteButton=$('#tw-delete-draft',page);
  if(deleteButton){
    request('/agents/'+encodeURIComponent(a.id)+'/deletion-eligibility').then(r=>{
      if(version!==routeVersion)return;
      if(r.agentId!==a.id)throw Error('Deletion identity mismatch');
      if(r.canDelete===true&&['unlaunched','stale_test_state'].includes(r.launchState)){deleteButton.disabled=false;$('#tw-delete-note').remove();}
      else{$('#tw-delete-note').textContent=r.reason||'Deletion is locked.';if(r.launchState==='launched'){deleteButton.hidden=true;$('#tw-delete-divider').hidden=true;}}
    }).catch(()=>{if(version===routeVersion)$('#tw-delete-note').textContent='Launch state unavailable. Deletion is locked.';});
    deleteButton.onclick=()=>{
      $('.tw-agent-menu').open=false;
      const dialog=document.createElement('dialog');dialog.className='tw-dialog';
      dialog.innerHTML=`<h2>Delete ${esc(a.name)}?</h2><p>This permanently removes this draft agent and its local workspace data.</p><p class="tw-error" role="alert"></p><div class="tw-dialog-actions"><button class="tw-button ghost" data-cancel>Cancel</button><button class="tw-button destructive" data-delete>Delete draft</button></div>`;
      document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
      dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
      dialog.querySelector('[data-delete]').onclick=async event=>{
        event.target.disabled=true;
        try{await request('/agents/'+encodeURIComponent(a.id),{method:'DELETE'});state.agents=state.agents.filter(agent=>agent.id!==a.id);dialog.close();location.hash='#/agents';toast('Draft deleted');}
        catch(error){dialog.querySelector('[role="alert"]').textContent=error.message;event.target.disabled=false;}
      };
    };
  }
  const host=$('#tw-mainnet-launch',page);
  const tradingHost=document.createElement('section');tradingHost.className='tw-panel tw-trading';host.after(tradingHost);scenes.push(mountTrading(tradingHost,a));
  window.mountPumpLaunch(host,{agent:a,isCurrent:()=>version===routeVersion && routeName()==='agent' && location.hash.slice(2).split('/')[1]===id}).catch(error=>{if(host.isConnected)host.textContent='Launch unavailable: '+error.message;});
}

function characters(page) {
  page.innerHTML = `${head('A LITTLE MORE YOU', 'Choose your character.', 'Meet the TEKKWORK voxel crew. Every character is included in agent drafts—no NFT purchase required.')}<div class="tw-character-gallery">${state.config.characters.map((c,i) => `<article style="--character-color:${c.color}"><span class="tw-eyebrow">CREW / 0${i+1}</span><div class="tw-model" data-model="${c.id}"></div><h2>${c.name}</h2><p>${c.role}</p><a class="tw-text-link" data-pick-character="${c.id}" href="#/launch">Choose character</a></article>`).join('')}</div>`;
  page.querySelectorAll('[data-pick-character]').forEach(link => link.addEventListener('click', () => sessionStorage.setItem('tw_selected_character', link.dataset.pickCharacter)));
  document.querySelectorAll('[data-model]').forEach(host => { try { scenes.push(createBoss(host, { skin: host.dataset.model })); } catch { host.innerHTML = robotSVG('skin:' + host.dataset.model); } });
}
function guide(page) {
 page.innerHTML=head('','Workspace guide','Build your agent, launch a token if you choose, and monitor simulated trading.')+'<div class="tw-guide-grid">'+[['Create Agent','Choose a canonical character and name your agent.'],['Configure token','Set token name, symbol, description and public image.'],['Launch on Pump.fun','Optional: review costs in Agent Detail and manually approve in Phantom. Real SOL is used.'],['Select strategy','Configure a Mainnet market and deterministic Paper strategy.'],['Start Paper Trading','Start with simulated capital. Token launch is not required.'],['Monitor performance','Overview brings together activity, rankings, positions and your workforce. Pause from Agent Detail.']].map(([title,copy])=>'<article><h2>'+title+'</h2><p>'+copy+'</p></article>').join('')+'</div><section class="tw-panel"><h2>Live trading — locked</h2><p>Paper performance is simulated, not real profit. Funding and live trade execution remain locked.</p></section>';
}
function render() {
  const version = ++routeVersion; scenes.forEach(s => s.destroy()); scenes = [];
  const page = $('#tw-page'), name = routeName();
  document.body.dataset.route = name;
  const system = $('.tw-system');
  system.dataset.defaultMarkup ??= system.innerHTML;
  system.innerHTML = ['launch','agent'].includes(name) ? '<span>Controlled launch</span><span>Solana Mainnet / solana:101 · pump.fun create_v2</span><span>Manual approval · Initial buy 0 SOL</span>' : system.dataset.defaultMarkup;
  document.querySelectorAll('[data-nav]').forEach(a => { a.classList.toggle('active', a.dataset.nav === name); if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  page.innerHTML = ''; document.title = `TEKKWORK — ${name === 'overview' ? 'Your agent workspace' : name[0].toUpperCase() + name.slice(1)}`;
  ({ overview: home, agents, tokens, launch, skins: characters, how: guide,traders:p=>scenes.push(mountTradingPage(p,'traders')),leaderboard:p=>scenes.push(mountTradingPage(p,'leaderboard')),payroll:p=>scenes.push(mountTradingPage(p,'payroll')),trader:p=>scenes.push(mountPublicTrader(p,location.hash.slice(2).split('/')[1])) }[name] || (name === 'agent' ? p => detail(p, location.hash.slice(2).split('/')[1], version) : p => { p.innerHTML = empty('This space does not exist.', 'Return to the overview to continue.', false); }))(page);
  hydrateCharacters(page);
  if (state.config.preview) {
    page.querySelectorAll('.desk-status-list dd').forEach((node,i) => { if(i===0) node.textContent='Not connected — demo'; });
    if(name==='how') page.querySelectorAll('.tw-capabilities b').forEach(node=>{if(node.textContent==='Available') node.textContent='Local backend only';});
  }
}
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
async function boot() {
  root.innerHTML = '<div class="tw-loading">Opening your workspace…</div>';
  try { await refresh(); shell(); render(); }
  catch { root.innerHTML = '<div class="tw-loading"><h1>Workspace API is offline.</h1><p>Start the TEKKWORK backend with <code>npm run server</code>, then reload this page.</p><button class="tw-button" onclick="location.reload()">Try again</button></div>'; return; }
  if (state.config.preview) return;
  poll = setInterval(async () => {
    if (document.hidden) return;
    try {
      const previousOwner = state.session?.address;
      const detailId=routeName()==='agent'?location.hash.slice(2).split('/')[1]:null;
      const previousStatus=state.agents?.find(a=>a.id===detailId)?.status;
      await refresh();
      if (previousOwner !== state.session?.address) { shell(); render(); }
      else if(detailId && $('#tw-reconcile') && routeName()==='agent' && location.hash.slice(2).split('/')[1]===detailId && previousStatus!==state.agents?.find(a=>a.id===detailId)?.status)render();
      $('.tw-system').classList.remove('offline'); $('.tw-system span').innerHTML = '<i></i> Workspace API online';
    } catch { $('.tw-system').classList.add('offline'); $('.tw-system span').textContent = 'Workspace API unavailable'; }
  }, 15000);
}
window.addEventListener('pagehide', () => { clearInterval(poll); scenes.forEach(s => s.destroy()); });
boot();
