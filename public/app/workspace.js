import { request, post, wallets, connect, disconnect, signTestTransaction } from './backend.js';
import { renderOverview } from './overview.js';
import { createBoss } from './boss3d.js';
import { robotSVG } from './robot.js';
import { enhanceShell, enhanceLaunch } from './game-ui.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = s => s ? `${s.slice(0, 5)}…${s.slice(-4)}` : '';
const $ = (s, root = document) => root.querySelector(s);
const icon = (name) => ({ overview: '◈', agents: '▦', tokens: '◉', launch: '+', skins: '◇', how: '↗' }[name] || '↗');
let state, scenes = [], routeVersion = 0, poll, draftKey = crypto.randomUUID();
const root = $('#app');
const routeName = () => location.hash.slice(2).split('/')[0] || 'overview';
const statusText = a => ({ DRAFT: 'Draft', PREPARED: 'Ready to sign', SUBMITTED: 'Confirming', DEVNET_LIVE: 'Devnet minted', FAILED: 'Test failed' }[a.status] || a.status);
const stamp = v => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const empty = (title, copy, cta = true) => `<div class="tw-empty"><span class="tw-empty-symbol">✦</span><h3>${title}</h3><p>${copy}</p>${cta ? '<a class="tw-button primary" href="#/launch">Create your first agent <span>↗</span></a>' : ''}</div>`;
const head = (eyebrow, title, description) => `<div class="tw-page-heading"><span class="tw-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>`;
function toast(message) { $('#tw-toast').textContent = message; $('#tw-toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#tw-toast').classList.remove('show'), 5500); }
function shell() {
  root.innerHTML = `<div class="tw-shell"><header class="tw-header"><a href="#/" class="tw-brand"><span class="tw-mark">t<span>↗</span></span>tekkwork<span class="tw-beta">BETA</span></a><nav aria-label="Main navigation">${[['overview', '', 'Overview'], ['agents', 'agents', 'Agents'], ['tokens', 'tokens', 'Tokens'], ['skins', 'skins', 'Characters'], ['how', 'how', 'Guide']].map(([id, href, label]) => `<a href="#/${href}" data-nav="${id}">${label}</a>`).join('')}</nav><button class="tw-button wallet" id="tw-wallet">${state.session ? short(state.session.address) : 'Connect wallet'} <span>↗</span></button></header><div class="tw-system"><span><i></i> Workspace API online</span><span>${state.config.network === 'devnet' ? 'Solana devnet' : 'Local environment'} <b>·</b> Real-fund actions disabled</span><span>TEKKWORK token · Coming soon</span></div><main id="tw-page"></main><footer class="tw-footer"><a href="#/" class="tw-wordmark">tekkwork<span>↗</span></a><p>Your agents. One shared workspace.</p><span>Development beta. No autonomous trading.<br>Digital assets can lose all their value.</span></footer></div><div id="tw-toast" role="status" aria-live="polite"></div>`;
  enhanceShell(root);
  if (state.config.preview) {
    $('.tw-system').textContent = 'CLIENT DEMO · Interactive preview · Wallet, saving and transactions unavailable';
    $('#tw-wallet').textContent = 'Demo mode';
  }
  $('#tw-wallet').onclick = async () => {
    if (state.session) { await disconnect(); await refresh(); shell(); render(); }
    else openWallet();
  };
}
function openWallet() {
  if (state.config.preview) { toast('Client demo: explore the office, characters and setup. Wallet login, saving and minting are unavailable.'); return; }
  const draft = $('#tw-create') ? Object.fromEntries(new FormData($('#tw-create'))) : null;
  const dialog = document.createElement('dialog'); dialog.className = 'tw-dialog';
  const list = wallets();
  dialog.innerHTML = `<button class="tw-close" aria-label="Close">×</button><span class="tw-eyebrow">YOUR WORKSPACE KEY</span><h2>Connect. Sign. You're in.</h2><p>Sign a one-time message to access your agents. Signing in does not send SOL or approve a transaction.</p><div class="tw-wallet-list">${list.length ? list.map(w => `<button class="tw-button" data-wallet="${esc(w.id)}">${esc(w.name)} <span>↗</span></button>`).join('') : '<p>No compatible Solana wallet detected. Open this site in a wallet-enabled browser with Phantom or Solflare installed.</p>'}</div><p class="tw-error" role="alert"></p>`;
  document.body.append(dialog); dialog.showModal(); $('.tw-close', dialog).onclick = () => dialog.close(); dialog.onclose = () => dialog.remove();
  dialog.addEventListener('click', async e => {
    const button = e.target.closest('[data-wallet]'); if (!button) return;
    button.disabled = true;
    try {
      await connect(button.dataset.wallet); await refresh(); dialog.close(); shell(); render();
      if (draft && $('#tw-create')) for (const [name,value] of Object.entries(draft)) {
        const field = $('#tw-create').elements.namedItem(name);
        if (field) field.value = value;
        if (name === 'character') $('#tw-create input[name="character"]:checked')?.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }
    catch (error) { $('.tw-error', dialog).textContent = error.message; button.disabled = false; }
  });
}
async function refresh() { state = await request('/state'); return state; }
const card = a => `<a class="tw-agent" href="#/agent/${encodeURIComponent(a.id)}"><div class="tw-agent-top"><span class="tw-avatar">${robotSVG(a.avatarSeed)}</span><span class="tw-status ${a.status === 'DEVNET_LIVE' ? 'blue' : ''}">${esc(statusText(a))}</span></div><span class="tw-eyebrow">AGENT ${String(a.no).padStart(3, '0')}</span><h3>${esc(a.name)}</h3><p>${esc(a.coin.name)} <span>/$${esc(a.coin.ticker)}</span></p><div class="tw-agent-bottom"><span>${esc(state.config.strategies.find(s => s.id === a.strategy)?.name || a.strategy)} profile</span><span>↗</span></div></a>`;
const activity = () => state.events.length ? `<ol class="tw-events">${state.events.slice(0, 8).map(e => `<li><span class="tw-event-icon">${e.type === 'minted' ? '✓' : '+'}</span><div><p>${esc(e.message)}</p><time>${stamp(e.createdAt)}</time></div><a href="#/agent/${encodeURIComponent(e.agentId)}" aria-label="View agent">↗</a></li>`).join('')}</ol>` : `<div class="tw-quiet"><span>↗</span><h3>Your next move starts here.</h3><p>Saved drafts and confirmed test launches will appear in this log. No imported activity. No made-up performance.</p></div>`;
function home(page) {
  scenes.push(renderOverview(page, {
    state, openWallet, activity,
    onAction: role => {
      if (role === 'trade') $('#tw-activity').scrollIntoView({ behavior: 'smooth', block: 'center' });
      else if (role === 'shill') share();
      else location.hash = role === 'launch' ? '#/launch' : '#/how';
    },
  }));
}
function share() { const url = new URL('https://x.com/intent/post'); url.searchParams.set('text', 'Building my own agent workspace with TEKKWORK.'); window.open(url.href, '_blank', 'noopener,noreferrer'); }
function agents(page) {
  page.innerHTML = `${head('YOUR TEAM, YOUR DIRECTION', 'Agent roster.', 'A home for every agent you create. Drafts and test tokens stay clearly labeled.')}<div class="tw-toolbar"><label class="tw-search"><span>⌕</span><input id="tw-search" type="search" placeholder="Find an agent or token" aria-label="Search agents"></label><a class="tw-button primary" href="#/launch">New agent +</a></div><div class="tw-agent-grid directory" id="tw-directory"></div>`;
  const paint = () => { const query = $('#tw-search').value.toLowerCase(); const list = state.agents.filter(a => `${a.name} ${a.coin.name} ${a.coin.ticker}`.toLowerCase().includes(query)); $('#tw-directory').innerHTML = list.length ? list.map(card).join('') : empty(query ? 'No matching agents.' : 'Make room for your first agent.', query ? 'Try another name or ticker.' : 'Connect a wallet and create an agent to begin.', !query); };
  $('#tw-search').oninput = paint; paint();
}
function tokens(page) {
  const list = state.agents.filter(a => a.coin.mint);
  page.innerHTML = `${head('TOKEN REGISTRY', 'Token registry.', 'Only tokens confirmed by the TEKKWORK backend appear here. Devnet tokens have no real monetary value.')}<div class="tw-panel">${list.length ? `<div class="tw-token-list">${list.map(a => `<a href="#/agent/${a.id}"><span class="tw-avatar">${robotSVG(a.avatarSeed)}</span><div><h3>${esc(a.coin.name)}</h3><p>$${esc(a.coin.ticker)}</p></div><span class="tw-status blue">Solana devnet</span><span>↗</span></a>`).join('')}</div>` : empty('Nothing minted. Nothing invented.', 'Your confirmed test tokens will be listed here after devnet setup and a wallet-approved transaction.')}</div>`;
}
function launch(page) {
  page.innerHTML = `${head('THE START OF SOMETHING', 'Create your agent.', 'Start with a saved draft. No wallet funding or token transaction is needed to create an agent.')}<form id="tw-create" class="tw-create"><div class="tw-form-panel"><span class="tw-step-label">01 — IDENTITY</span><h2>Give it a personality.</h2><div class="tw-field"><label for="agent-name">Agent name</label><input id="agent-name" name="name" required minlength="2" maxlength="40" placeholder="e.g. Felix Studio"></div><div class="tw-field-row"><div class="tw-field"><label for="token-name">Token name</label><input id="token-name" name="tokenName" required minlength="2" maxlength="32" placeholder="Your project name"></div><div class="tw-field"><label for="token-ticker">Ticker</label><input id="token-ticker" name="ticker" required pattern="[A-Za-z0-9]{1,10}" maxlength="10" placeholder="TEKK"></div></div><div class="tw-field"><label for="agent-description">The idea <span>Optional</span></label><textarea id="agent-description" name="description" maxlength="300" placeholder="What are you building?"></textarea></div><span class="tw-step-label">02 — DIRECTION</span><h2>Choose a strategy profile.</h2><p class="tw-muted">Profiles are saved settings, not an active trading service.</p><div class="tw-strategies">${state.config.strategies.map((s,i) => `<label><input type="radio" name="strategy" value="${s.id}" ${i ? '' : 'checked'}><span><strong>${s.name}</strong><small>${s.description}</small></span><b>${s.maxPositionPct}%<small>position cap</small></b></label>`).join('')}</div><p class="tw-error" id="tw-form-error" role="alert"></p><button class="tw-button primary" type="submit">${state.session ? 'Save agent draft' : 'Connect wallet to begin'} <span>↗</span></button><p class="tw-fine">Draft creation is free. Future on-chain operations require a separate approval. No launch or returns are promised.</p></div><aside class="tw-character-picker"><span class="tw-step-label">03 — YOUR CHARACTER</span><h2 id="tw-character-name">${state.config.characters[0].name}</h2><div id="tw-character-preview"></div><div class="tw-character-options">${state.config.characters.map((c,i) => `<label title="${c.name}"><input type="radio" name="character" value="${c.id}" ${i ? '' : 'checked'}><span>${robotSVG('skin:' + c.id)}<small>${c.name.split(' ')[0]}</small></span></label>`).join('')}</div><p>Original voxel crew.<br>One distinct identity for your next idea.</p><div class="tw-readiness"><span class="tw-status">${state.config.network.toUpperCase()}</span><b>What happens next?</b><p>${state.config.launchEnabled ? 'After saving, you can create a test token using devnet SOL. This does not list a coin on pump.fun.' : 'Your draft is stored in the local database. Devnet minting becomes available after RPC setup.'}</p></div></aside></form>`;
  enhanceLaunch(page);
  let preview;
  const show = id => { preview?.destroy(); const host = $('#tw-character-preview'); host.innerHTML = ''; $('#tw-character-name').textContent = state.config.characters.find(c => c.id === id).name; try { preview = createBoss(host, { skin: id }); } catch { host.innerHTML = robotSVG('skin:' + id); } };
  const picked = sessionStorage.getItem('tw_selected_character');
  const initial = state.config.characters.some(c => c.id === picked) ? picked : 'frank';
  $('#tw-create').elements.namedItem('character').value = initial;
  show(initial);
  $('#tw-create input[name="character"]:checked').dispatchEvent(new Event('change', { bubbles: true }));
  scenes.push({ destroy: () => preview?.destroy() });
  $('#tw-create').addEventListener('change', e => { if (e.target.name === 'character') show(e.target.value); });
  $('#tw-create').onsubmit = async e => {
    e.preventDefault(); if (!state.session) { openWallet(); return; }
    const form = e.target, button = $('button[type="submit"]', form); button.disabled = true;
    try { const a = await post('/agents', Object.fromEntries(new FormData(form)), { 'Idempotency-Key': draftKey }); draftKey = crypto.randomUUID(); await refresh(); location.hash = '#/agent/' + a.id; toast('Your agent draft is saved. No funds were moved.'); }
    catch (error) { $('#tw-form-error').textContent = error.message; button.disabled = false; }
  };
}
async function detail(page, id, version) {
  if (!state.session) { page.innerHTML = `${head('PRIVATE WORKSPACE', 'Your team stays yours.', 'Connect the owner wallet to view this agent.')}<button id="tw-detail-connect" class="tw-button primary">Connect wallet ↗</button>`; $('#tw-detail-connect').onclick = openWallet; return; }
  let a; try { a = await request('/agents/' + encodeURIComponent(id)); } catch (e) { if (version === routeVersion) page.innerHTML = empty('Agent unavailable.', esc(e.message), false); return; }
  if (version !== routeVersion) return;
  page.innerHTML = `<a class="tw-text-link" href="#/agents">← Back to your fleet</a><section class="tw-detail"><div><span class="tw-eyebrow">AGENT ${String(a.no).padStart(3,'0')}</span><h1>${esc(a.name)}</h1><span class="tw-status blue">${esc(statusText(a))}</span><p>${esc(a.description || 'Your next idea has a workspace of its own.')}</p><dl><div><dt>Token</dt><dd>${esc(a.coin.name)} / $${esc(a.coin.ticker)}</dd></div><div><dt>Owner</dt><dd class="tw-mono">${esc(short(a.creator))}</dd></div><div><dt>Created</dt><dd>${stamp(a.createdAt)}</dd></div><div><dt>Trading</dt><dd>Not enabled</dd></div></dl><label class="tw-field">Strategy profile<select id="tw-strategy">${state.config.strategies.map(s => `<option value="${s.id}" ${s.id === a.strategy ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label><button class="tw-button" id="tw-save-strategy">Save profile</button></div><div class="tw-detail-character" id="tw-detail-character"></div></section><section class="tw-panel tw-execution"><span class="tw-eyebrow">EXECUTION / ${state.config.network.toUpperCase()}</span><h2>${a.status === 'DEVNET_LIVE' ? 'Your test token is confirmed.' : 'Test it before it goes live.'}</h2><p>Devnet issuance creates 1,000,000 test tokens with 6 decimals in your wallet. Mint authority is revoked. Token name and description remain in TEKKWORK; on-chain metadata, liquidity, pump.fun listing and autonomous trading are not implemented.</p>${a.coin.mint ? `<p class="tw-mono">Mint: ${esc(a.coin.mint)}</p>` : ''}${a.launch?.signature ? `<a class="tw-text-link" target="_blank" rel="noopener" href="https://explorer.solana.com/tx/${encodeURIComponent(a.launch.signature)}?cluster=devnet">View devnet transaction ↗</a>` : ''}<div class="tw-execution-actions">${state.config.launchEnabled && !['SUBMITTED','DEVNET_LIVE'].includes(a.status) ? '<button class="tw-button primary" id="tw-test-mint">Review devnet mint ↗</button>' : !state.config.launchEnabled ? '<span class="tw-status">Devnet RPC setup required</span>' : ''}${a.status === 'SUBMITTED' ? '<button class="tw-button" id="tw-reconcile">Check confirmation</button>' : ''}</div><p id="tw-detail-error" class="tw-error" role="alert"></p></section>`;
  try { scenes.push(createBoss($('#tw-detail-character'), { skin: a.character })); } catch { $('#tw-detail-character').innerHTML = robotSVG(a.avatarSeed); }
  $('#tw-save-strategy').onclick = async e => { e.target.disabled = true; try { await request('/agents/' + a.id, { method: 'PATCH', body: JSON.stringify({ strategy: $('#tw-strategy').value }) }); await refresh(); toast('Strategy profile saved. Execution remains disabled.'); } catch (error) { toast(error.message); } finally { e.target.disabled = false; } };
  $('#tw-reconcile')?.addEventListener('click', async e => { e.target.disabled = true; try { await post(`/agents/${a.id}/reconcile`); await refresh(); render(); } catch (error) { $('#tw-detail-error').textContent = error.message; e.target.disabled = false; } });
  $('#tw-test-mint')?.addEventListener('click', async e => {
    const button = e.target; button.disabled = true;
    try {
      const prepared = await post(`/agents/${a.id}/prepare`);
      if (!confirm(`DEVNET ONLY\nCreates 1,000,000 test tokens. No pump.fun listing.\nEstimated cost: ${prepared.estimatedCostSol?.toFixed(6) ?? 'unavailable'} test SOL.\nWallet balance: ${prepared.balanceSol?.toFixed(6) ?? 'unavailable'} test SOL.\n\nApprove this test transaction in your wallet?`)) { button.disabled = false; return; }
      button.textContent = 'Approve in your wallet…';
      const transaction = await signTestTransaction(prepared.transaction, a.creator);
      await post(`/agents/${a.id}/submit`, { transaction }); await post(`/agents/${a.id}/reconcile`); await refresh(); render();
    } catch (error) { $('#tw-detail-error').textContent = error.message; button.disabled = false; button.textContent = 'Review devnet mint ↗'; }
  });
}
function characters(page) {
  page.innerHTML = `${head('A LITTLE MORE YOU', 'Choose your character.', 'Meet the TEKKWORK voxel crew. Every character is included in agent drafts—no NFT purchase required.')}<div class="tw-character-gallery">${state.config.characters.map((c,i) => `<article style="--character-color:${c.color}"><span class="tw-eyebrow">CREW / 0${i+1}</span><div class="tw-model" data-model="${c.id}"></div><h2>${c.name}</h2><p>${c.role}</p><a class="tw-text-link" data-pick-character="${c.id}" href="#/launch">Choose character ↗</a></article>`).join('')}</div>`;
  page.querySelectorAll('[data-pick-character]').forEach(link => link.addEventListener('click', () => sessionStorage.setItem('tw_selected_character', link.dataset.pickCharacter)));
  document.querySelectorAll('[data-model]').forEach(host => { try { scenes.push(createBoss(host, { skin: host.dataset.model })); } catch { host.innerHTML = robotSVG('skin:' + host.dataset.model); } });
}
function guide(page) {
  page.innerHTML = `${head('CLEAR BY DESIGN', 'Workspace guide.', 'TEKKWORK is an agent workspace in development. Here is what works today—and what does not.')}<div class="tw-guide-grid">${[['01','Connect your wallet','A one-time signature verifies ownership. Sessions expire after eight hours. No private key is requested.'], ['02','Create your agent','Choose an original character, name your project, and save a strategy profile. Drafts persist in the TEKKWORK database.'], ['03','Create a devnet token','When a devnet RPC is configured, review and sign a test-token transaction. Your wallet pays test-network costs.'], ['04','Check every state','Drafts, prepared transactions, submissions and confirmations have separate labels. A submission is never treated as a confirmed launch.']].map(([n,t,p]) => `<article><span>${n}</span><h2>${t}</h2><p>${p}</p></article>`).join('')}</div><section class="tw-panel tw-capabilities"><h2>Today's capabilities</h2>${[['Wallet-signature authentication','Available'],['Private, persistent agent drafts','Available'],['Test-token issuance','Devnet RPC required'],['pump.fun mainnet launch','Not implemented'],['Autonomous AI / trading execution','Not implemented'],['On-chain token metadata & liquidity','Not implemented'],['Fee collection & paid collectibles','Not implemented']].map(([l,s]) => `<div><span>${l}</span><b>${s}</b></div>`).join('')}<p>This version does not trade real funds, claim profits, or provide investment advice. Strategy profiles are configuration records, not an AI model or trading worker.</p></section>`;
}
function render() {
  const version = ++routeVersion; scenes.forEach(s => s.destroy()); scenes = [];
  const page = $('#tw-page'), name = routeName();
  document.body.dataset.route = name;
  document.querySelectorAll('[data-nav]').forEach(a => { a.classList.toggle('active', a.dataset.nav === name); if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  page.innerHTML = ''; document.title = `TEKKWORK — ${name === 'overview' ? 'Your agent workspace' : name[0].toUpperCase() + name.slice(1)}`;
  ({ overview: home, agents, tokens, launch, skins: characters, how: guide }[name] || (name === 'agent' ? p => detail(p, location.hash.slice(2).split('/')[1], version) : p => { p.innerHTML = empty('This space does not exist.', 'Return to the overview to continue.', false); }))(page);
  if (state.config.preview) {
    page.querySelectorAll('.desk-status-list dd').forEach((node,i) => { if(i===0) node.textContent='Not connected — demo'; });
    if(name==='how') page.querySelectorAll('.tw-capabilities b').forEach(node=>{if(node.textContent==='Available') node.textContent='Local backend only';});
  }
}
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
async function boot() {
  root.innerHTML = '<div class="tw-loading">Opening your workspace…</div>';
  try { await refresh(); shell(); render(); }
  catch { root.innerHTML = '<div class="tw-loading"><h1>Workspace API is offline.</h1><p>Start the TEKKWORK backend with <code>npm run server</code>, then reload this page.</p><button class="tw-button" onclick="location.reload()">Try again ↗</button></div>'; return; }
  if (state.config.preview) return;
  poll = setInterval(async () => {
    if (document.hidden) return;
    try {
      const previousOwner = state.session?.address;
      await refresh();
      if (previousOwner !== state.session?.address) { shell(); render(); }
      $('.tw-system').classList.remove('offline'); $('.tw-system span').innerHTML = '<i></i> Workspace API online';
    } catch { $('.tw-system').classList.add('offline'); $('.tw-system span').textContent = 'Workspace API unavailable'; }
  }, 15000);
}
window.addEventListener('pagehide', () => { clearInterval(poll); scenes.forEach(s => s.destroy()); });
boot();
