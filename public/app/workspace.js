import {mountRealLeaderboard} from './real-leaderboard.js';
import { request, post, saveTokenDraft, wallets, connect, disconnect,ownerAccessDetached,cancelOwnerAuthentication,observeExistingWallet,phantomSignProbeAvailable,probeWalletSignature,connectedWalletPresentation,connectPublicWallet,disconnectPublicWallet,publicWalletPresentation } from './backend.js';
import {walletAuthError,walletAuthPresentation} from './wallet-auth-errors.js';
import {reviewOwnerAuthChallenge,validateOwnerAuthChallenge} from './owner-auth-review.js';
import {createOwnerConnectFlow} from './owner-connect-flow.js';
import {walletSelectionStatus,walletFailureStatus} from './wallet-choice-copy.js';
import {mobileWalletPresentation,renderMobileWalletChoice} from './wallet-mobile.js';
import {selectorWalletRows} from './wallet-selector.js';
import { mountOverview } from './overview-dashboard.js';
import { renderWorkspaceMap } from './overview.js';
import { createBoss } from './boss3d.js';
import { robotSVG } from './robot.js';
import { enhanceShell } from './game-ui.js';
import {icon} from './icons.js';
import {hydrateCharacters} from './character-thumbnail.js';
import {characterPortraitUrl} from './character-registry.js';
import {mountAgentDetailTabs} from './agent-detail-tabs.js';
import {openAgentWalletDrawer} from './agent-wallet-ui.js';
import {mountWalletWorkspace} from './wallet-workspace.js';
import {tokenImageField} from './token-image-ui.js';
import {defaultStrategyConfig} from './strategy-config.js';
import {mountWalletBalance,rememberWalletProvider,walletProviderDisplay} from './wallet-balance.js';
import {mountTradingPage,mountPublicTrader} from './trading-pages.js';
import {mountMarketPage} from './market-page.js';
import {mountGlassNavigation} from './glass-navigation.js';
import {guideCategories,mountGuideDrawer} from './guide-drawer.js';
import {deleteFlowContent} from './agent-delete-flow.js';
import {mountLaunchpadPage,tokenDraftRead} from './launchpad-page.js';
import {launchpadUnit} from './launchpad-view-model.js';
import {createIdentityIntentJournal} from './launchpad-identity-intent.js';
import {mountTokensPage} from './tokens-page.js';
import {openPumpLaunchDialog} from './pump-launch-dialog.js';
import {launchWallet,m4LaunchWallet,preparationWallet} from './backend.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = s => s ? `${s.slice(0, 5)}…${s.slice(-4)}` : '';
const $ = (s, root = document) => root.querySelector(s);
let state, scenes = [], routeVersion = 0, poll, draftKey = crypto.randomUUID();
let navigationPresentation, workspaceUnavailable = false, bootBusy = false;
const root = $('#app');
document.documentElement.classList.add('tt-product');
const routeName = () => location.hash.slice(2).split('/')[0] || 'overview';
const statusText = a => ({DRAFT:'Draft',READY:'Ready',WORKING:'Working',PAUSED:'Paused'}[a.tradingStatus]||'Draft');
const stamp = v => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const empty = (title, copy, cta = true) => `<div class="tw-empty"><span class="tw-empty-symbol">${icon('box')}</span><h3>${title}</h3><p>${copy}</p>${cta ? '<a class="tw-button primary" href="#/agents/new">Create your first agent </a>' : ''}</div>`;
const head = (eyebrow, title, description) => `<div class="tw-page-heading"><h1>${title}</h1><p>${description}</p></div>`;
function toast(message) { $('#tw-toast').textContent = message; $('#tw-toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#tw-toast').classList.remove('show'), 5500); }
function shell() {
  navigationPresentation?.destroy();
  root.innerHTML = `<div class="tw-shell"><header class="tw-header"><a href="#/" class="tw-brand"><span class="tw-mark">t</span>tekkteam</a><nav aria-label="Main navigation">${[['overview','Home'],['launch','Launchpad'],['agents','Agents'],['tokens','Tokens'],['wallet','Wallet']].map(([id,label])=>`<a href="#/${id}" data-nav="${id}">${label}</a>`).join('')}</nav><button class="tw-button wallet" id="tw-wallet">${workspaceUnavailable ? 'Wallet unavailable' : state?.session ? short(state.session.address) : 'Connect wallet'}</button></header><div class="tw-system"><span><i></i> Workspace API online</span><span>Paper network · Mainnet market data</span><span>Live trading & funding locked</span></div><main id="tw-page"></main><footer class="tw-footer"><a href="#/" class="tw-wordmark">tekkteam</a><div class="tt-footer-links"><a href="#/payroll">Payroll</a><a href="#/traders">Trading</a><a href="#/market">Market</a><a href="#/leaderboard">Leaderboard</a><a href="#/how">Guide</a></div><span>Paper performance · Not real profits</span></footer></div><div id="tw-toast" role="status" aria-live="polite"></div>`;
  enhanceShell(root);
  if (state?.config.mainnetSafetyMode) $('.tw-system').textContent = 'MAINNET SAFETY MODE · Reads and isolated Memo diagnostics only · Broadcasting, drafts and token issuance disabled';
  if (state?.config.preview) {
    $('.tw-system').textContent = 'CLIENT DEMO · Read-only wallet connection · Owner access, saving and transactions unavailable';
    $('#tw-wallet').textContent = 'Demo mode';
  }
  if(workspaceUnavailable){$('.tw-system').textContent='Workspace API unavailable · Owner and network state not verified';}
  paintWallet();
  navigationPresentation=mountGlassNavigation(root,{config:state?.config??{}});
}
function paintWallet(){if(workspaceUnavailable||!state||state.config.preview||!state.session?.address){const wallet=publicWalletPresentation();mountWalletBalance($('#tw-wallet'),{owner:wallet?.address,provider:wallet,readOnly:true,getConnection:publicWalletPresentation,onConnect:openWallet,onAuthenticate:ownerSignInAvailable()?()=>openWallet({authenticate:true}):undefined,onDisconnect:async()=>{clearOwnerView();const pending=disconnectPublicWallet();paintWallet();await pending;}});return;}observeExistingWallet(state.session?.address,walletProviderDisplay(state.session?.address,connectedWalletPresentation(state.session?.address)));mountWalletBalance($('#tw-wallet'),{owner:state.session?.address,provider:walletProviderDisplay(state.session?.address,connectedWalletPresentation(state.session?.address)),onConnect:openWallet,onAuthenticate:()=>openWallet({authenticate:true}),onDisconnect:async()=>{clearOwnerView();shell();render();await Promise.all([disconnect(),disconnectPublicWallet()]);}});}
function ownerSignInAvailable(){return !workspaceUnavailable&&!!state&&!state.config.preview&&state.config.capabilities?.walletAuth===true&&state.localFixture?.authSource!=='TEST_SESSION_SEEDED';}
function clearOwnerView(){if(typeof cancelOwnerAuthentication==='function')cancelOwnerAuthentication();refresh.generation=(refresh.generation||0)+1;refresh.detached=true;if(state)state={config:state.config,localFixture:state.localFixture,session:null,agents:[],events:[],stats:{}};}
window.addEventListener('tekkwork:public-wallet-changed',()=>{if(state?.session?.address&&publicWalletPresentation()?.address!==state.session.address){clearOwnerView();shell();render();void disconnect().catch(()=>{});}else paintWallet();});
window.addEventListener('tekkwork:wallet-account-changed',()=>{clearOwnerView();if(!workspaceUnavailable&&state){shell();render();toast('Wallet account changed. Sign in again to view owner data.');}});
function openWallet({authenticate=false}={}) {
  if(document.querySelector('.tw-connect-dialog[open]'))return;
  const draft = $('#tw-create') ? Object.fromEntries(new FormData($('#tw-create'))) : null;
  const opener=document.activeElement;
  const dialog = document.createElement('dialog'); dialog.className = 'tw-dialog tw-connect-dialog';
  const readOnly=!ownerSignInAvailable();
  const walletList=wallets({readOnly:true});
  const reownRow=walletList.find(w=>w.name==='WalletConnect'&&w.selectable);
  const directWallets=walletList.filter(w=>w!==reownRow);
  const connected=publicWalletPresentation();
  const signInWallet=connected&&walletList.find(w=>w.name===connected.name&&w.publicKey===connected.address&&w.selectable);
  let showMoreWallets=false,mobileRequested=false;
  const walletRows=()=>selectorWalletRows(directWallets,showMoreWallets,{esc,href:location.href,userAgent:mobileRequested?'Android':navigator.userAgent,touchPoints:navigator.maxTouchPoints,mwaId:walletList.find(row=>row.name==='Mobile Wallet Adapter'&&row.selectable)?.id});
  const probes=!readOnly&&phantomSignProbeAvailable()?walletList.filter(w=>w.probeAvailable&&['Phantom','Solflare','MetaMask'].includes(w.name)).map(w=>`<button class="tw-button ghost" type="button" data-wallet-probe="${esc(w.id)}">TEST ${esc(w.name.toUpperCase())}${w.name==='MetaMask'?' SOLANA':''} SIGNATURE</button>`).join(''):'';
  dialog.innerHTML = `<header class="tw-wallet-selector-header"><button class="tw-close tw-button ghost" type="button" aria-label="Close wallet dialog">${icon('close')}</button><span class="tw-eyebrow">OWNER ACCESS</span><h2>CONNECT WALLET</h2><p>Connect your owner wallet to manage agents and wallet-controlled actions.</p></header><div class="tw-wallet-selector-body"><div class="tw-wallet-list" id="tw-selector-wallets">${walletRows()}</div><div class="tw-more-wallets"><button class="tw-button secondary" type="button" data-load-wallets aria-expanded="false" aria-controls="tw-selector-wallets">Load More Wallets</button><button class="tw-button ghost" type="button" data-less-wallets hidden>Show Less</button></div>${!directWallets.some(w=>w.selectable)&&!mobileWalletPresentation({name:'Phantom',href:location.href,userAgent:navigator.userAgent,touchPoints:navigator.maxTouchPoints})?'<button type="button" class="tw-button secondary tw-mobile-wallet-switch" data-mobile-wallets>Use a wallet app</button>':''}${probes?`<div class="tw-wallet-probes">${probes}</div><p class="tw-wallet-network-note">Development diagnostic only. Signs a fixed harmless message after your manual approval; no login or transaction.</p>`:''}<p class="tw-connect-progress" role="status" aria-live="polite"></p><p class="tw-error" role="alert"></p><details class="tw-connect-details" hidden><summary>Technical details</summary><p></p></details></div><p class="tw-wallet-network-note tw-wallet-selector-footer">SOLANA MAINNET · Message sign-in only · No transactions</p>`;
  document.body.append(dialog); dialog.showModal(); $('.tw-close', dialog).onclick = () => dialog.close(); dialog.onclose = () => {if(connecting&&!completed){ownerFlow.cancel();if(walletEstablished){clearOwnerView();shell();render();}else{clearOwnerView();void disconnectPublicWallet().catch(()=>{});}}dialog.remove();if(opener?.isConnected)opener.focus();};
  dialog.querySelector('h2').nextElementSibling.textContent='Connect your Solana wallet, then approve the sign-in message in your wallet. No transaction or payment is requested.';
  if(!readOnly&&signInWallet){const auth=document.createElement('button');auth.type='button';auth.className='tw-wallet-choice';auth.dataset.wallet=signInWallet.id;auth.dataset.walletAuthenticate='true';auth.innerHTML='<span><strong>Sign In</strong><small>Manage your Agents</small></span><span class="tw-wallet-choice-arrow">→</span>';dialog.querySelector('.tw-wallet-list').append(auth);}
  if(readOnly){dialog.querySelector('.tw-eyebrow').textContent='READ-ONLY CONNECTION';dialog.querySelector('h2').nextElementSibling.textContent='Connect your wallet to read its public address in this browser. Owner authentication, balances, saving and transactions remain unavailable.';}
  let connecting=false,completed=false,walletEstablished=false;
  const ownerFlow=createOwnerConnectFlow({connectWallet:id=>connectPublicWallet(id),connection:publicWalletPresentation,readSession:()=>request('/state'),authenticate:(id,owner,{automatic})=>connect(id,{connectedOwner:owner,reviewChallenge:automatic?(challenge,address)=>{validateOwnerAuthChallenge(challenge,address,location.origin);return true;}:reviewOwnerAuthChallenge}),onPhase:phase=>{dialog.dataset.connectionPhase=phase;if(phase==='CONNECTED')walletEstablished=true;if(phase==='SIGN_IN_REQUESTED'){$('.tw-connect-progress',dialog).textContent='APPROVE THE SIGN-IN MESSAGE IN YOUR WALLET · No transaction.';}}});
  const repaintWalletRows=()=>{
    const auth=dialog.querySelector('[data-wallet-authenticate]');
    dialog.querySelector('.tw-wallet-list').innerHTML=walletRows();
    if(auth)dialog.querySelector('.tw-wallet-list').append(auth);
    dialog.querySelector('[data-load-wallets]').hidden=showMoreWallets;
    dialog.querySelector('[data-load-wallets]').setAttribute('aria-expanded',String(showMoreWallets));
    dialog.querySelector('[data-less-wallets]').hidden=!showMoreWallets;
  };
  dialog.addEventListener('click', async e => {
    if(e.target.closest('[data-load-wallets],[data-less-wallets]')){if(connecting)return;showMoreWallets=!!e.target.closest('[data-load-wallets]');repaintWalletRows();if(showMoreWallets){dialog.querySelector('[data-wallet-name="MetaMask"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});dialog.querySelector('[data-less-wallets]').focus({preventScroll:true});}else{dialog.querySelector('.tw-wallet-selector-body').scrollTop=0;dialog.querySelector('[data-load-wallets]').focus({preventScroll:true});}return;}
    const mobileAction=e.target.closest('[data-mobile-wallets]');if(mobileAction){if(connecting)return;mobileRequested=true;repaintWalletRows();mobileAction.hidden=true;return;}
    const probe=e.target.closest('[data-wallet-probe]');
    if(probe){if(readOnly)return;if(connecting)return;connecting=true;probe.disabled=true;$('.tw-connect-progress',dialog).textContent='WAITING FOR MANUAL WALLET SIGNATURE…';$('.tw-error',dialog).textContent='';$('.tw-connect-details',dialog).hidden=true;try{const result=await probeWalletSignature(probe.dataset.walletProbe);$('.tw-connect-progress',dialog).textContent='SOLANA SIGNATURE TEST PASSED · No backend login or transaction.';$('.tw-connect-details',dialog).hidden=false;$('.tw-connect-details p',dialog).textContent=`Provider source: ${result.source} · isPhantom: ${result.isPhantom??'not exposed'} · Public key: ${result.publicKey} · signMessage: available · Wallet Standard feature: ${result.walletStandardSignMessageAvailable} · Message bytes: ${result.messageByteLength}`;}catch(error){const product=walletAuthPresentation(error);$('.tw-connect-progress',dialog).textContent='';$('.tw-error',dialog).textContent=product.title+' · '+product.message;$('.tw-connect-details',dialog).hidden=false;$('.tw-connect-details p',dialog).textContent=product.details;}finally{connecting=false;probe.disabled=false;}return;}
    const button = e.target.closest('[data-wallet]'); if (!button||connecting) return;
    connecting=true;dialog.querySelectorAll('[data-wallet]').forEach(row=>row.disabled=true);
    dialog.querySelectorAll('.tw-wallet-row-error').forEach(row=>{row.hidden=true;row.textContent='';});
    const selectedStatus=button.querySelector('small');selectedStatus.textContent='Connecting...';selectedStatus.hidden=false;
    $('.tw-connect-progress',dialog).textContent='CONNECTING TO '+button.querySelector('strong').textContent.toUpperCase()+'…';
    $('.tw-error',dialog).textContent='';$('.tw-connect-details',dialog).hidden=true;
    try {
      const result=await ownerFlow.run(button.dataset.wallet,{authenticateOnly:button.dataset.walletAuthenticate==='true',canAuthenticate:ownerSignInAvailable()});
      const owner=result.address;
      if(!result.authenticated){completed=true;dialog.close();paintWallet();if(routeName()==='launch')render();return;}
      if(publicWalletPresentation()?.address!==owner)throw Error('Wallet account changed during sign-in.');
      refresh.detached=false;
      try{await refresh();if(state.session?.address!==owner)throw Error('Session not established');}catch(error){throw walletAuthError('SESSION',error);}
      rememberWalletProvider(owner,walletList.find(w=>w.id===button.dataset.wallet));completed=true;dialog.close(); shell(); render();
      if (draft && $('#tw-create')) for (const [name,value] of Object.entries(draft)) {
        const field = $('#tw-create').elements.namedItem(name);
        if (field) field.value = value;
        if (name === 'character') $('#tw-create input[name="character"]:checked')?.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }
    catch (error) {if(!dialog.isConnected)return;if(button.dataset.walletAuthenticate==='true')button.hidden=false;const product=walletAuthPresentation(error);if(walletEstablished&&publicWalletPresentation()?.address){completed=true;clearOwnerView();dialog.close();shell();render();toast('Wallet connected. Sign in required. '+(error.walletAuthCode==='SIGN_IN_PENDING'?'Finish or cancel the existing sign-in request in your wallet.':product.message));return;}$('.tw-connect-progress',dialog).textContent='';const local=['PROVIDER_CONNECT','PUBLIC_KEY','SIGN_MESSAGE'].includes(error.walletAuthStage);const disabled=error.walletAuthCode==='SOLANA_ACCOUNT_UNAVAILABLE'||error.walletAuthCode==='SIGN_MESSAGE_UNSUPPORTED';if(local){selectedStatus.textContent=walletFailureStatus(error);selectedStatus.hidden=false;const action=disabled?'—':error.walletAuthCode==='WALLET_CONNECTION_REJECTED'?'→':'RETRY';button.querySelector('.tw-wallet-choice-arrow').textContent=action;button.dataset.retry=String(action==='RETRY');}else{selectedStatus.textContent='';selectedStatus.hidden=true;$('.tw-error', dialog).textContent=product.title+' · '+product.message;}$('.tw-connect-details',dialog).hidden=readOnly||!phantomSignProbeAvailable();$('.tw-connect-details p',dialog).textContent=product.details;connecting=false;dialog.querySelectorAll('[data-wallet]').forEach(row=>row.disabled=!walletList.find(w=>w.id===row.dataset.wallet)?.selectable||row===button&&disabled);button.focus();}
  });
  if(authenticate&&signInWallet&&!readOnly){dialog.querySelector('h2').textContent='Sign In';dialog.querySelector('h2').nextElementSibling.textContent='Preparing your sign-in message. You can review it before opening your wallet.';dialog.querySelectorAll('.tw-wallet-choice-wrap').forEach(row=>row.hidden=true);dialog.querySelectorAll('.tw-wallet-group,.tw-more-wallets,.tw-mobile-wallet-switch').forEach(row=>row.hidden=true);const action=dialog.querySelector('[data-wallet-authenticate]');action.hidden=true;action.click();}
}
async function refresh() {
  const generation=refresh.generation||0;
  const next = await request('/state');
  if(generation!==(refresh.generation||0))throw Error('Retired owner response');
  if(!next||typeof next!=='object'||!next.config||typeof next.config!=='object'||!Array.isArray(next.config.strategies)||!Array.isArray(next.agents)||!Array.isArray(next.events)||!next.stats||typeof next.stats!=='object'||!(next.session===null||typeof next.session?.address==='string'))throw Error('Workspace state unavailable');
  const config=next.config, network=config.network, demo=network==='demo', devnet=network==='devnet', mainnet=network==='mainnet';
  const contextFlags=['preview','backendOnline','mainnetSafetyMode','broadcastEnabled','launchEnabled','tradingEnabled','mainnetLaunchEnabled'];
  const capabilities=config.capabilities, capabilityFlags=['walletAuth','persistentAgents','devnetMint','pumpfun','autonomousTrading'];
  if(!['local','devnet','mainnet','demo'].includes(network)||!Array.isArray(config.characters)||contextFlags.some(key=>typeof config[key]!=='boolean')||!capabilities||capabilityFlags.some(key=>typeof capabilities[key]!=='boolean'))throw Error('Workspace context unavailable');
  // Accept the CURRENT server publicConfig and static demo envelopes; unknown context is not availability.
  if(config.preview!==demo||config.backendOnline===demo||config.mainnetSafetyMode!==mainnet||config.broadcastEnabled!==devnet||config.launchEnabled!==devnet||config.tradingEnabled||config.mainnetLaunchEnabled||capabilities.walletAuth===demo||capabilities.persistentAgents!==(!mainnet&&!demo)||capabilities.devnetMint!==devnet||capabilities.pumpfun||capabilities.autonomousTrading)throw Error('Workspace context inconsistent');
  const declared=config.networkConfig;
  if(devnet||mainnet){
    if(!declared||declared.network!==network||declared.mode!==network.toUpperCase()||declared.walletChain!=='solana:'+network||declared.phantomChain!==(mainnet?'solana:101':'solana:103')||typeof declared.genesis!=='string'||!declared.genesis||(mainnet&&(declared.safetyMode!==true||declared.broadcastEnabled!==false||declared.valueMovementEnabled!==false)))throw Error('Workspace network context inconsistent');
  }else if(declared!==null)throw Error('Workspace network context inconsistent');
  if(demo&&(next.session!==null||next.agents.length||next.events.length))throw Error('Demo owner context inconsistent');
  state=refresh.detached?{config:next.config,localFixture:next.localFixture,session:null,agents:[],events:[],stats:{}}:next;return state;
}
const worldHero = (eyebrow, title, copy, art, primary, secondary='') => `<section class="tw-world-hero"><div class="tw-world-hero-copy"><span class="tw-world-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${copy}</p><div class="tw-world-actions">${primary}${secondary}</div></div><div class="tw-world-hero-art"><img src="${characterPortraitUrl(art)}" alt="" aria-hidden="true"></div></section>`;
const worldMetric = (label, value, tone='') => `<div class="tw-world-metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
const worldFilters = (values, selected) => `<div class="tw-world-filters" role="group" aria-label="Filter results">${values.map(v=>`<button type="button" data-filter="${v}" aria-pressed="${selected===v}">${v}</button>`).join('')}</div>`;
const tokenLabel = a => a.coin?.name&&a.coin?.ticker?`${esc(a.coin.name)} · $${esc(a.coin.ticker)}`:'Token not configured';
const card = a => `<a class="tw-agent" href="#/agent/${encodeURIComponent(a.id)}"><div class="tw-card-character"><img data-character="${esc(a.character)}" alt="${esc(a.name)} character"></div><div class="tw-card-title"><h3>${esc(a.name)}</h3><span class="tw-status" data-status="${esc(statusText(a))}">${esc(statusText(a))}</span></div><p>${tokenLabel(a)}</p><div class="tw-agent-bottom">${esc(state.config.strategies.find(s => s.id === a.strategy)?.name || a.strategy)}</div><span class="tw-world-card-action">VIEW AGENT →</span></a>`;
const activity = () => state.events.length ? `<ol class="tw-events">${state.events.slice(0, 8).map(e => `<li><span class="tw-event-icon">${icon(e.type === 'minted' ? 'check' : 'plus')}</span><div><p>${esc(e.message)}</p><time>${stamp(e.createdAt)}</time></div><a href="#/agent/${encodeURIComponent(e.agentId)}" aria-label="View agent">View</a></li>`).join('')}</ol>` : `<div class="tw-quiet"><h3>Your next move starts here.</h3><p>Your workspace activity will appear here.</p></div>`;
function home(page) {
  page.innerHTML='<section class="ov-workspace-hero" aria-label="3D workspace"></section><div class="ov-data-sections"></div>';
  const map=page.querySelector('.ov-workspace-hero'),dashboard=page.querySelector('.ov-data-sections');
  let world;
  try{world=renderWorkspaceMap(map,{onAction:role=>{if(role==='trade')dashboard.querySelector('.tw-overview-feed')?.scrollIntoView({behavior:'smooth',block:'start'});else if(role==='shill')share();else location.hash=role==='launch'?'#/launch':'#/how';}});scenes.push(world);}
  catch(error){map.innerHTML="<section class=\"tw-empty\" aria-label=\"Static workspace\"><h2>Launch your coin. Give it an agent.</h2><p>AI Agent Launchpad · Pump.fun launch with explicit wallet approval. Paper remains available; Live trading stays OFF.</p><p>WebGL rendering is unavailable. A static preview is shown. Launch Coin + Agent and View Agents links remain available.</p><div class=\"tw-world-actions\"><a class=\"tw-button primary\" href=\"#/launch\">Launch Coin + Agent</a><a class=\"tw-button\" href=\"#/agents\">View Agents</a></div></section>";console.error('Workspace map failed',error);}
  scenes.push(mountOverview(dashboard,{getSession:()=>state.session?.address,onNetwork:network=>world?.updateActivity?.(network)}));
}
function share() { const url = new URL('https://x.com/intent/post'); url.searchParams.set('text', 'Building my own agent workspace with TEKKTEAM.'); window.open(url.href, '_blank', 'noopener,noreferrer'); }
function agents(page) {
  if(location.hash==='#/agents/new'){createAgentPage(page);return;}
  if(!state.session?.address){
    page.innerHTML=`<section class="tw-world tw-world-agents">${worldHero('OWNER WORKSPACE','YOUR AGENTS.<br><em>YOUR WORKFORCE.</em>','Connect your owner wallet to inspect your Agents. Disconnected access is not an empty workforce.','frank','<button id="tw-agents-connect" type="button" class="tw-world-cta primary">CONNECT OWNER WALLET →</button>','<a class="tw-world-cta secondary" href="#/launch">OPEN LAUNCHPAD →</a>')}</section>`;
    page.querySelector('#tw-agents-connect').onclick=openWallet;return;
  }
  const agents=state.agents;
  page.innerHTML = `<div class="tw-world tw-world-agents">${worldHero('YOUR AI WORKFORCE','BUILD A TEAM.<br><em>LET THEM WORK.</em>','Create autonomous agents, configure their strategy and track their work.','frank','<a class="tw-world-cta primary" href="#/agents/new">CREATE AGENT <span>↗</span></a>','<a class="tw-world-cta secondary" href="#agent-activity">VIEW ACTIVITY <span>→</span></a>')}<div class="tw-world-metrics">${worldMetric('TOTAL AGENTS',agents.length)}${worldMetric('ACTIVE',agents.filter(a=>a.tradingStatus==='WORKING').length,'positive')}${worldMetric('PAUSED',agents.filter(a=>a.tradingStatus==='PAUSED').length)}${worldMetric('DRAFT',agents.filter(a=>a.tradingStatus==='DRAFT').length)}</div><section class="tw-world-section" id="agent-activity"><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">WORKFORCE ROSTER</span><h2>YOUR AGENTS <small>${agents.length}</small></h2></div></div><div class="tw-world-toolbar">${worldFilters(['ALL','ACTIVE','PAUSED','DRAFT'],'ALL')}<label class="tw-world-search">${icon('search')}<input id="tw-search" type="search" placeholder="Search agents or tokens" aria-label="Search agents"></label></div><div class="tw-agent-grid directory" id="tw-directory"></div></section></div>`;
  let filter='ALL';
  const paint = () => { const query = $('#tw-search').value.toLowerCase(); const list = agents.filter(a => `${a.name} ${a.coin?.name??''} ${a.coin?.ticker??''}`.toLowerCase().includes(query) && (filter==='ALL'||(filter==='ACTIVE'?a.tradingStatus==='WORKING':a.tradingStatus===filter))); $('#tw-directory').innerHTML = list.length ? list.map(card).join('') : `<div class="tw-world-empty"><img src="${characterPortraitUrl('frank')}" alt=""><div><span class="tw-world-eyebrow">NO RESULTS</span><h3>${query||filter!=='ALL'?'NO AGENTS FOUND':'YOUR WORKFORCE IS EMPTY'}</h3><p>${query||filter!=='ALL'?'Try another search or filter.':'Create your first AI agent and put it to work.'}</p>${query||filter!=='ALL'?'':'<a class="tw-world-cta primary" href="#/agents/new">CREATE AGENT →</a>'}</div></div>`; hydrateCharacters($('#tw-directory')); };
  $('#tw-search').oninput = paint;page.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;page.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));paint();}); paint();
}
function tokens(page) {
 const version=routeVersion;
 let selectedAgentId=null;
 try{selectedAgentId=location.hash.slice(2).split('/')[1];if(selectedAgentId)selectedAgentId=decodeURIComponent(selectedAgentId);}catch{page.innerHTML=empty('Token detail unavailable','The Agent relationship could not be read.',false);return;}
 scenes.push(mountTokensPage(page,{agents:state.agents,owner:state.session?.address,config:state.config,selectedAgentId:selectedAgentId||null,isCurrent:()=>version===routeVersion,loadContract:id=>request('/agents/'+encodeURIComponent(id)+'/contract'),projectUnit:launchpadUnit}));
}
async function launch(page) {
  const version=routeVersion;
  page.innerHTML='<p role="status">Loading your launch pipeline.</p>';
  try{
    await refresh();if(version!==routeVersion)return;
    paintWallet();
    const owner=state.session?.address,contracts=new Map();
    const current=()=>version===routeVersion&&state?.session?.address===owner;
    scenes.push(mountLaunchpadPage(page,{agents:state.agents,owner,walletConnected:!!publicWalletPresentation(),config:state.config,isCurrent:current,getOwner:()=>state?.session?.address,identityJournal:owner?createIdentityIntentJournal(owner):null,
      loadContract:async id=>{if(!current()||!owner||state.config.preview)return null;const dto=await request('/agents/'+encodeURIComponent(id)+'/contract');if(!current())return null;contracts.set(id,dto);return dto;},
      canSaveTokenDraft:id=>current()&&!state.config.preview&&!!owner&&tokenDraftRead(contracts.get(id),id,owner).allowed===true,
      saveTokenDraft:(id,body,key)=>{if(!current()||!owner||state.config.preview||!state.agents.some(a=>a.id===id&&a.creator===owner))throw Error('Owner token save context unavailable');return saveTokenDraft(id,body,key);},
      onTokenSaved:async(result,{reviewLaunch=false}={})=>{if(!current()||state.config.preview||!state.agents.some(a=>a.id===result.agentId&&a.creator===owner))return;contracts.delete(result.agentId);await refresh();if(!current())return;if(reviewLaunch){const agent=state.agents.find(a=>a.id===result.agentId&&a.creator===owner);if(!agent)throw Error('Saved Agent unavailable');await openPumpLaunchDialog(page,{agent,isCurrent:current,onClose:()=>{if(current())render();}});}else render();},
      onLaunch:async id=>{if(!current()||!owner||state.config.preview)return;const agent=await request('/agents/'+encodeURIComponent(id));if(!current()||agent.id!==id||agent.creator!==owner)throw Error('Owner launch context changed');await openPumpLaunchDialog(page,{agent,isCurrent:current,onClose:()=>{if(current())render();}});},
      projectUnit:launchpadUnit,onConnect:()=>openWallet({authenticate:!!publicWalletPresentation()}),createIdentity:(input,key)=>post('/launchpad/agent-identities',input,{'idempotency-key':key}),enterScope:(id,key)=>post('/launchpad/agents/'+encodeURIComponent(id)+'/enter',{}, {'idempotency-key':key}),onChanged:async(_result,{deferRender=false}={})=>{await refresh();if(current()&&!deferRender)render();},onEntered:id=>{if(current())location.hash='#/agent/'+encodeURIComponent(id);}}));
  }catch(e){if(version!==routeVersion)return;page.innerHTML=empty('Launchpad unavailable','The workspace response could not be verified. No launch action was performed.',false)+'<button type="button" class="tw-button" id="tw-launch-retry">Try again</button>';$('#tw-launch-retry').onclick=()=>launch(page);}
}
function createAgentDialog(){
 location.hash='#/agents/new';
}
function createAgentPage(page){
 const owner=state.session?.address;if(!owner){page.innerHTML=`<section class="tw-owner-access tw-create-access" aria-labelledby="tw-create-access-title"><div class="tw-owner-access-copy"><span class="tw-world-eyebrow">OWNER ACCESS</span><h1 id="tw-create-access-title">CONNECT YOUR<br><em>WALLET.</em></h1><p>Connect your owner wallet to start building your agent.</p><button id="tw-new-connect" class="tw-world-cta primary" type="button">CONNECT WALLET <span aria-hidden="true">→</span></button><div class="tw-owner-access-trust"><span>✓&nbsp; No transaction required</span><span>✓&nbsp; You stay in control</span></div></div><div class="tw-owner-access-scene" aria-hidden="true"><span class="tw-status tw-owner-access-badge">● OWNER WALLET REQUIRED</span><img class="tw-create-access-art" src="/assets/access/create-agent-wallet-gate.webp" width="512" height="512" alt="" decoding="async"></div></section>`;$('#tw-new-connect').onclick=openWallet;return;}
 const crew=state.config.characters.filter(c=>['frank','cupsey','fomy','alon','satoshi'].includes(c.id));
 const profileNames=Object.fromEntries(state.config.strategies.map(s=>[s.id,s.name.toUpperCase()]));
 const profileCopy=Object.fromEntries(state.config.strategies.map(s=>[s.id,s.description]));
 page.innerHTML=`<div class="ca-experience"><header class="ca-hero"><span class="tw-world-eyebrow">BUILD YOUR WORKFORCE</span><h1>CREATE YOUR <em>AGENT.</em></h1><p>Build your next autonomous worker and choose how it trades.</p></header><nav class="ca-progress" aria-label="Creation progress">${['IDENTITY','TRADING','REVIEW'].map((s,i)=>`<span data-progress="${i+1}"><b>0${i+1}</b> ${s}</span>`).join('')}</nav><section class="tw-create-dialog tw-create-page"><form id="tw-create" novalidate>
 <div class="ca-step ca-identity" data-step="1"><div class="ca-preview-column"><div class="ca-preview-stage"><span class="ca-hud">WORKFORCE / CHARACTER SELECT</span><img data-create-preview src="${characterPortraitUrl(crew[0]?.id)}" alt="Selected agent character"><span class="ca-stage-base" aria-hidden="true"></span></div><strong class="ca-character-name" data-character-name>${esc(crew[0]?.name||'Character')}</strong><fieldset class="tw-character-picker"><legend>Choose your character</legend><div class="tw-character-options">${crew.map((c,i)=>`<label class="tw-character-option"><input type="radio" name="character" value="${esc(c.id)}" ${i===0?'checked':''} required><span class="tw-character-choice"><img data-character="${esc(c.id)}" alt=""><span>${esc(c.name)}</span><span class="tw-character-check">${icon('check')}</span></span></label>`).join('')}</div></fieldset><p class="ca-field-error" data-error-for="character"></p></div><div class="ca-identity-fields"><span class="ca-kicker">01 / IDENTITY</span><h2>GIVE YOUR WORKER<br>A NAME.</h2><div class="tw-create-fields"><label class="tw-field">Agent name<input name="name" required minlength="2" maxlength="40" autocomplete="off"><small class="ca-field-error" data-error-for="name"></small></label><div class="tw-create-token"><label class="tw-field">Token name<input name="tokenName" required minlength="2" maxlength="32" autocomplete="off"><small class="ca-field-error" data-error-for="tokenName"></small></label><label class="tw-field">Symbol <span class="ca-tip" title="A short ticker for your token, using letters or numbers." aria-label="What is a token symbol?">?</span><input name="ticker" required pattern="[A-Za-z0-9]+" maxlength="10" autocomplete="off"><small class="ca-field-error" data-error-for="ticker"></small></label></div><label class="tw-field">Description<textarea name="description" maxlength="300" rows="3"></textarea></label><label class="ca-legacy-strategy">Strategy<select name="strategy">${state.config.strategies.map(s=>`<option value="${esc(s.id)}" ${s.id==='operator'?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label></div><div class="ca-image-slot"></div><div class="ca-step-actions"><button type="button" class="tw-button primary" data-next="2">CONTINUE <span aria-hidden="true">→</span></button></div></div></div>
 <div class="ca-step ca-trading" data-step="2" hidden><span class="ca-kicker">02 / TRADING</span><h2>HOW SHOULD YOUR<br>AGENT TRADE?</h2><p>Choose a Paper risk profile. You can refine it after creation.</p><div class="ca-profiles" role="group" aria-label="Trading risk profile">${state.config.strategies.filter(s=>!s.legacy).map(s=>s.id).map((id,i)=>`<button type="button" data-profile="${id}" aria-pressed="${id==='balanced'}"><span>0${i+1}</span><strong>${profileNames[id]}</strong><small>${profileCopy[id]}</small></button>`).join('')}</div><section class="ca-plan"><div><span class="ca-kicker">YOUR TRADING PLAN</span><h3 data-plan-name>BALANCED</h3></div><dl><div><dt>Paper capital</dt><dd>0.1 SOL</dd></div><div><dt>Trade size</dt><dd data-plan-size></dd></div><div><dt>Stop loss</dt><dd data-plan-stop></dd></div><div><dt>Take profit</dt><dd data-plan-profit></dd></div><div><dt>Maximum hold</dt><dd>15 min</dd></div><div><dt>Maximum positions</dt><dd data-plan-positions></dd></div></dl><details class="ca-help"><summary>How risk works <span aria-hidden="true">?</span></summary><p>Profiles adjust entry filters and exit triggers. Stop loss is a trigger, not a guaranteed fill price. Paper results are simulated, not profit guarantees.</p></details></section><details class="ca-advanced"><summary>ADVANCED SETTINGS</summary><p>Technical strategy controls are available after creation in Agent Settings. This step saves the selected profile only.</p></details><div class="ca-step-actions"><button type="button" class="tw-button secondary" data-back="1">← BACK</button><button type="button" class="tw-button primary" data-next="3">REVIEW AGENT →</button></div></div>
 <div class="ca-step ca-review" data-step="3" hidden><span class="ca-kicker">03 / REVIEW</span><h2>READY TO JOIN<br>THE WORKFORCE?</h2><div class="ca-review-grid"><div class="ca-review-character"><img data-review-character src="${characterPortraitUrl(crew[0]?.id)}" alt="Selected agent character"><strong data-review-name></strong><span data-review-token></span><b>READY</b></div><div class="ca-review-details"><dl><div><dt>Character</dt><dd data-review-character-name></dd></div><div><dt>Trading profile</dt><dd data-review-profile></dd></div><div><dt>Mode</dt><dd>Paper Trading</dd></div><div><dt>Trade size</dt><dd data-review-size></dd></div><div><dt>Stop loss</dt><dd data-review-stop></dd></div><div><dt>Take profit</dt><dd data-review-profit></dd></div><div><dt>Max hold</dt><dd>15 min</dd></div></dl><section class="tw-creation-summary"><h3>CREATION SUMMARY</h3><dl><div><dt>Agent creation</dt><dd>FREE</dd></div><div><dt>Token launch</dt><dd>NOT LAUNCHED</dd></div><div><dt>Initial buy</dt><dd>0 SOL</dd></div></dl></section><p class="ca-no-spend">NO SOL WILL BE SPENT WHEN CREATING THIS AGENT.</p></div></div><p role="alert" class="tw-error" data-create-error></p><details class="ca-technical-error" hidden><summary>Technical detail</summary><p></p></details><div class="ca-step-actions"><button type="button" class="tw-button secondary" data-back="2">← BACK</button><button class="tw-button primary" type="submit">CREATE AGENT <span aria-hidden="true">↗</span></button></div></div>
 </form></section></div>`;
 const form=$('#tw-create',page),key=crypto.randomUUID(),tokenImage=tokenImageField(form);
 $('.ca-image-slot',form).append($('.tw-token-image',form));hydrateCharacters(form);
 const imageCheck=$('[data-character-image]',form);imageCheck.checked=true;imageCheck.dispatchEvent(new Event('change',{bubbles:true}));
 let step=1,submitting=false;
 const field=name=>form.elements.namedItem(name);
 const selectedCharacter=()=>crew.find(c=>c.id===field('character').value)||crew[0];
 const plan=()=>defaultStrategyConfig(field('strategy').value);
 function syncProfile(){const config=plan(),id=config.strategy;form.querySelectorAll('[data-profile]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.profile===id)));$('[data-plan-name]',form).textContent=profileNames[id];$('[data-plan-size]',form).textContent=config.risk.maxSolPerTrade+' SOL';$('[data-plan-stop]',form).textContent='−'+config.position.stopLossPercent+'%';$('[data-plan-profit]',form).textContent='+'+config.position.takeProfitPercent+'%';$('[data-plan-positions]',form).textContent=config.risk.maxOpenPositions;}
 function validateIdentity(){let valid=true;for(const [name,message] of [['name','Enter an Agent name (2–40 characters).'],['tokenName','Enter a Token name (2–32 characters).'],['ticker','Enter a Symbol using letters or numbers.']]){const input=field(name),error=form.querySelector(`[data-error-for="${name}"]`);error.textContent=input.checkValidity()?'':message;input.setAttribute('aria-invalid',String(!input.checkValidity()));if(!input.checkValidity()){valid=false;if(!form.querySelector('[data-create-focus]'))input.dataset.createFocus='';}}const characterError=$('[data-error-for="character"]',form);characterError.textContent=field('character').value?'':'Choose a character.';if(!field('character').value)valid=false;try{tokenImage.value();$('.tw-token-image [role="status"]',form).textContent='';}catch(error){$('.tw-token-image [role="status"]',form).textContent=error.message;valid=false;}if(!valid){form.querySelector('[data-create-focus]')?.focus();form.querySelector('[data-create-focus]')?.removeAttribute('data-create-focus');}return valid;}
 function paintReview(){const c=selectedCharacter(),config=plan();$('[data-review-character]',form).src=characterPortraitUrl(c.id);$('[data-review-character-name]',form).textContent=c.name;$('[data-review-name]',form).textContent=field('name').value.trim();$('[data-review-token]',form).textContent=field('tokenName').value.trim()+' / $'+field('ticker').value.trim().toUpperCase();$('[data-review-profile]',form).textContent=profileNames[config.strategy];$('[data-review-size]',form).textContent=config.risk.maxSolPerTrade+' SOL';$('[data-review-stop]',form).textContent='−'+config.position.stopLossPercent+'%';$('[data-review-profit]',form).textContent='+'+config.position.takeProfitPercent+'%';}
 function showStep(next){step=next;form.querySelectorAll('.ca-step').forEach(section=>section.hidden=Number(section.dataset.step)!==step);page.querySelectorAll('[data-progress]').forEach(item=>{const n=Number(item.dataset.progress);item.classList.toggle('active',n===step);item.classList.toggle('complete',n<step);item.setAttribute('aria-current',n===step?'step':'false');});if(step===3)paintReview();page.querySelector('.ca-progress').scrollIntoView({block:'nearest'});}
 form.addEventListener('change',event=>{if(event.target.name==='character'){const c=selectedCharacter();$('[data-create-preview]',form).src=characterPortraitUrl(c.id);$('[data-create-preview]',form).alt=c.name+' character';$('[data-character-name]',form).textContent=c.name;$('[data-error-for="character"]',form).textContent='';}if(event.target.name==='strategy')syncProfile();});
 form.addEventListener('input',event=>{const name=event.target.name;if(['name','tokenName','ticker'].includes(name)){const error=form.querySelector(`[data-error-for="${name}"]`);if(error)error.textContent='';event.target.removeAttribute('aria-invalid');}});
 form.addEventListener('click',event=>{const profile=event.target.closest('[data-profile]');if(profile){field('strategy').value=profile.dataset.profile;syncProfile();return;}const next=event.target.closest('[data-next]');if(next){if(step===1&&!validateIdentity())return;showStep(Number(next.dataset.next));return;}const back=event.target.closest('[data-back]');if(back)showStep(Number(back.dataset.back));});
 syncProfile();showStep(1);
 form.onsubmit=async event=>{event.preventDefault();if(submitting)return;if(step!==3){if(step===1&&validateIdentity())showStep(2);return;}if(!validateIdentity()){showStep(1);return;}const button=form.querySelector('[type="submit"]');submitting=true;button.disabled=true;button.textContent='CREATING AGENT…';$('[data-create-error]',form).textContent='';$('.ca-technical-error',form).hidden=true;try{if(state.session?.address!==owner)throw Error('Owner session changed. Reopen this form.');const a=await post('/agents',{...Object.fromEntries(new FormData(form)),tokenImage:tokenImage.value()},{'Idempotency-Key':key});if(a.creator!==owner)throw Error('Agent owner mismatch');button.textContent='AGENT CREATED';await refresh();location.hash='#/agent/'+encodeURIComponent(a.id);}catch(error){$('[data-create-error]',form).textContent='Could not create the agent. Review your details and try again.';$('.ca-technical-error',form).hidden=false;$('.ca-technical-error p',form).textContent=error.message;button.textContent='CREATE AGENT';button.disabled=false;submitting=false;}};
}
async function detail(page, id, version) {
  if (!state.session) { page.innerHTML = `<section class="tw-owner-access" aria-labelledby="tw-owner-access-title"><div class="tw-owner-access-copy"><span class="tw-world-eyebrow">OWNER ACCESS</span><h1 id="tw-owner-access-title">YOUR TEAM<br><em>STAYS YOURS.</em></h1><p>Connect your owner wallet to unlock this agent workspace.</p><button id="tw-detail-connect" class="tw-world-cta primary" type="button">CONNECT WALLET <span aria-hidden="true">→</span></button><div class="tw-owner-access-trust"><span>✓&nbsp; Ownership verified by wallet</span><span>✓&nbsp; No transaction required</span></div></div><div class="tw-owner-access-scene" aria-hidden="true"><span class="tw-status tw-owner-access-badge">● OWNER ONLY</span><div class="tw-owner-access-stage"><img src="${characterPortraitUrl('frank')}" alt=""><span class="tw-owner-access-lock">${icon('lock')}</span></div></div></section>`; $('#tw-detail-connect').onclick = openWallet; return; }
  let a; try { a = await request('/agents/' + encodeURIComponent(id)); } catch (e) { if (version === routeVersion) page.innerHTML = empty('Agent unavailable.', esc(e.message), false); return; }
  if (version !== routeVersion) return;
  page.innerHTML = `<a class="tw-text-link" href="#/agents">${icon('back')} Back to agents</a><section class="tw-detail ad-agent-hero"><details class="tw-agent-menu"><summary aria-label="Agent actions">${icon('more')}</summary><div class="tw-agent-menu-panel"><button class="tw-button ghost" id="tw-edit-profile">Edit strategy</button><hr class="tw-menu-divider"><button class="tw-button ghost destructive" id="tw-delete-draft" type="button">${icon('delete')} Delete agent</button></div></details><div class="ad-hero-copy"><div class="ad-hero-kicker"><span>AGENT ${String(a.no).padStart(3,'0')}</span><span class="ad-mode-badge">PAPER · SIMULATED</span></div><h1>${esc(a.name)}</h1><div class="ad-hero-role"><span class="tw-status blue" data-status="${esc(statusText(a))}">${esc(statusText(a))}</span><span>PAPER TRADER</span><span>${esc(a.strategy || 'Strategy not set')}</span></div><p>${esc(a.description || 'Your next idea has a workspace of its own.')}</p><div class="ad-hero-actions"><button class="tw-world-cta primary" type="button" data-hero-trading>Open trading controls <span aria-hidden="true">↗</span></button><button class="tw-world-cta secondary" type="button" data-hero-settings>Edit strategy</button></div><dl><div><dt>Token</dt><dd>${tokenLabel(a)}</dd></div><div><dt>Owner</dt><dd class="tw-mono">${esc(short(a.creator))}</dd></div><div><dt>Created</dt><dd>${stamp(a.createdAt)}</dd></div></dl></div><div class="tw-detail-character" id="tw-detail-character"></div></section><section id="tw-agent-tabs"></section>`;
  const tokenFact=$('.ad-hero-copy dl>div:first-child',page),launchAction=document.createElement('button');
  launchAction.type='button';launchAction.className='tw-text-link ad-token-action';launchAction.textContent='CHECKING TOKEN STATUS…';launchAction.disabled=true;tokenFact?.append(launchAction);
  const launchStatusUrl='/api/pump-launch/status?agentId='+encodeURIComponent(a.id);
  const refreshLaunchAction=async()=>{try{const response=await fetch(launchStatusUrl);if(!response.ok)throw Error('Launch status unavailable');const receipt=await response.json();if(version!==routeVersion||!launchAction.isConnected)return;const confirmed=receipt.status==='Success'&&receipt.confirmed===true&&!!receipt.signature&&!!receipt.mint;launchAction.textContent=confirmed?'VIEW TOKEN ↗':receipt.status==='Idle'?'LAUNCH TOKEN →':'VIEW LAUNCH STATUS →';launchAction.disabled=false;}catch{if(launchAction.isConnected){launchAction.textContent='TOKEN STATUS UNAVAILABLE';launchAction.disabled=true;}}};
  const openLaunch=async()=>{if(launchAction.disabled)return;await openPumpLaunchDialog(page,{agent:a,isCurrent:()=>version===routeVersion&&routeName()==='agent',onClose:refreshLaunchAction});};
  launchAction.onclick=openLaunch;
  const launchEvent=event=>{if(event.detail?.agentId===a.id)openLaunch();};page.addEventListener('tekkwork:open-agent-launch',launchEvent);
  refreshLaunchAction();
  try { scenes.push(createBoss($('#tw-detail-character'), { skin: a.character })); } catch { $('#tw-detail-character').innerHTML = `<img src="${characterPortraitUrl(a.character)}" alt="${esc(a.name)} character">`; }
  const heroAction=$('[data-hero-trading]',page);heroAction.disabled=true;heroAction.textContent='CHECKING AGENT…';
  const updateHero=t=>{if(version!==routeVersion||!heroAction.isConnected)return;const working=t?.status==='WORKING';heroAction.disabled=!t||!['READY','DRAFT','PAUSED','WORKING'].includes(t.status);heroAction.innerHTML=working?'PAUSE AI AGENT <span aria-hidden="true">Ⅱ</span>':'START AI AGENT <span aria-hidden="true">→</span>';const status=$('.ad-hero-role .tw-status',page);if(status&&t){const label=t.openPositions?.length?(working?'POSITION OPEN':t.status==='PAUSED'?'PAUSED · POSITION OPEN':'POSITION OPEN'):working?'SCANNING MARKETS':t.status==='PAUSED'?'PAUSED':t.status==='READY'?'READY TO START':'DRAFT';status.textContent=label;status.dataset.status=label;}const strategy=$('.ad-hero-role>span:last-child',page);if(strategy&&t?.strategy)strategy.textContent=t.strategy.toUpperCase();};
  const tabs=mountAgentDetailTabs($('#tw-agent-tabs',page),a,{isCurrent:()=>version===routeVersion&&routeName()==='agent',onTradingState:updateHero,mountLaunch:async host=>{try{await window.mountPumpLaunch(host,{agent:a,getWallet:launchWallet,getPreparationWallet:preparationWallet,getM4Wallet:m4LaunchWallet,isCurrent:()=>version===routeVersion&&routeName()==='agent'&&location.hash.slice(2).split('/')[1]===id&&!!host.isConnected});}catch(error){if(host.isConnected)host.textContent='Launch unavailable: '+error.message;}}});
  scenes.push(tabs);
  heroAction.onclick=()=>{if(heroAction.disabled)return;tabs.select('trading');$('#tw-agent-tabs',page)?.scrollIntoView({block:'start',behavior:'smooth'});const panel=$('#tw-agent-tab-panel',page);const observer=new MutationObserver(()=>{const action=panel.querySelector('[data-paper-action]');if(!action)return;observer.disconnect();if(version===routeVersion&&!action.disabled)action.click();});observer.observe(panel,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),8000);};
  $('[data-hero-settings]',page).onclick=()=>{tabs.select('settings');$('#tw-agent-tabs',page)?.scrollIntoView({block:'start',behavior:'smooth'});};
  $('#tw-edit-profile').onclick=()=>{ $('.tw-agent-menu').open=false;tabs.select('settings');requestAnimationFrame(()=>{$('#tw-strategy-center h2')?.focus();$('#tw-strategy-center')?.scrollIntoView({block:'start'});}); };
  const deleteButton=$('#tw-delete-draft',page);
  if(deleteButton){
    let checking=false,submitting=false;
    deleteButton.onclick=async()=>{
      if(checking||version!==routeVersion)return;
      $('.tw-agent-menu').open=false;
      checking=true;
      const opener=deleteButton,dialog=document.createElement('dialog');dialog.className='tw-dialog tw-delete-dialog';
      dialog.setAttribute('aria-labelledby','tw-delete-title');dialog.innerHTML='<span class="tw-world-eyebrow">OWNER ACCESS · DELETE AGENT</span><h2 id="tw-delete-title">CHECKING AGENT…</h2><p>Checking the latest deletion eligibility.</p><button type="button" class="tw-button secondary" data-cancel>CANCEL</button>';
      document.body.append(dialog);dialog.showModal();
      dialog.onclose=()=>{dialog.remove();if(opener.isConnected)opener.focus();};
      let deleteStage='review';
      const path='/agents/'+encodeURIComponent(a.id),load=async changed=>{
        if(state.session?.address!==a.creator)throw Error('Owner session changed. Reconnect before deleting.');
        const eligibility=await request(path+'/deletion-eligibility');
        if(eligibility.agentId!==a.id)throw Error('Deletion identity mismatch');
        if(dialog.open&&version===routeVersion){dialog.innerHTML=deleteFlowContent(a,eligibility,{changed,stage:deleteStage});const heading=dialog.querySelector('#tw-delete-title');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});dialog.scrollTop=0;}
        return eligibility;
      };
      dialog.onclick=async event=>{
        if(event.target===dialog){dialog.close();return;}
        if(event.target.closest('[data-cancel]')){dialog.close();return;}
        if(event.target.closest('[data-delete-setup]')){deleteStage='resolve';await load(false);return;}
        if(event.target.closest('[data-delete-refresh]')){const button=event.target.closest('[data-delete-refresh]');button.disabled=true;button.textContent='CHECKING…';try{await load(false);}catch{if(dialog.open){button.disabled=false;button.textContent='RETRY STATUS';}}return;}
        const resolve=event.target.closest('[data-delete-resolve]');if(resolve){const target=resolve.dataset.deleteResolve;dialog.close();if(target==='launch'){openLaunch();return;}if(target==='wallet'){openAgentWalletDrawer(a);return;}tabs.select('trading');$('#tw-agent-tabs',page)?.scrollIntoView({block:'start'});return;}
        const confirm=event.target.closest('[data-delete-confirm]');if(!confirm||confirm.disabled||submitting)return;
        const confirmedWord=dialog.querySelector('[data-delete-word]')?.value;
        submitting=true;confirm.disabled=true;confirm.textContent='CHECKING AGENT…';
        try{
          const current=await load(true);if(!current.deleteEligible||!current.canDelete){return;}
          if(!dialog.open||confirmedWord!=='DELETE'){if(dialog.open)dialog.querySelector('[role="alert"]').textContent='Type DELETE to confirm.';return;}
          dialog.querySelector('[data-delete-confirm]').textContent='DELETING AGENT…';await request(path,{method:'DELETE'});
          state.agents=state.agents.filter(agent=>agent.id!==a.id);dialog.close();location.hash='#/agents';toast('AGENT DELETED · '+a.name+' was removed from your workforce.');
        }catch{if(dialog.open){try{await load(true);}catch{dialog.innerHTML='<h2 id="tw-delete-title">AGENT COULDN’T BE DELETED</h2><p>Eligibility is unavailable. Nothing was deleted.</p><button type="button" class="tw-button secondary" data-cancel>CLOSE</button>';}}}
        finally{submitting=false;const button=dialog.querySelector('[data-delete-confirm]');if(button){button.textContent='DELETE AGENT';button.disabled=dialog.querySelector('[data-delete-word]')?.value!=='DELETE';}}
      };
      dialog.oninput=event=>{if(event.target.matches('[data-delete-word]'))dialog.querySelector('[data-delete-confirm]').disabled=event.target.value!=='DELETE';};
      try{await load(false);}catch{if(dialog.open)dialog.innerHTML='<h2 id="tw-delete-title">DELETION STATUS UNAVAILABLE</h2><p>Could not verify the Agent’s current state. No deletion is possible right now.</p><button type="button" class="tw-button secondary" data-cancel>CLOSE</button>';}
      finally{checking=false;}
    };
  }
}

function characters(page) {
  const crew=state.config.characters,assigned=c=>state.agents.filter(a=>a.character===c.id);
  page.innerHTML = `<div class="tw-world tw-world-characters">${worldHero('CHARACTER LAB','BUILD THE FACE<br><em>OF YOUR WORKFORCE.</em>','Choose the characters representing your agents.','cupsey','<a class="tw-world-cta primary" href="#character-gallery">EXPLORE CREW <span>↓</span></a>')}<div class="tw-world-metrics">${worldMetric('TOTAL CHARACTERS',crew.length)}${worldMetric('ASSIGNED',state.session?crew.filter(c=>assigned(c).length).length:'—','positive')}${worldMetric('AVAILABLE',state.session?crew.filter(c=>!assigned(c).length).length:'—')}</div><section class="tw-world-section" id="character-gallery"><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">MEET THE CREW</span><h2>CHARACTER ROSTER <small>${crew.length}</small></h2></div></div><div class="tw-character-gallery">${crew.map((c,i) => `<article style="--character-color:${esc(c.color)}"><span class="tw-eyebrow">CREW / 0${i+1}</span><div class="tw-model" data-model="${esc(c.id)}"></div><div class="tw-character-meta"><div><h2>${esc(c.name)}</h2><p>${esc(c.role)}</p></div><span class="tw-status" data-status="${assigned(c).length?'ACTIVE':'DRAFT'}">${!state.session?'SIGN IN TO CHECK':assigned(c).length?'ASSIGNED':'AVAILABLE'}</span></div><p class="tw-character-assignment">${!state.session?'Owner assignments unavailable':assigned(c).length?'AGENT · '+esc(assigned(c).map(a=>a.name).join(', ')):'READY FOR YOUR WORKFORCE'}</p>${assigned(c).length?`<a class="tw-world-card-action" href="#/agent/${encodeURIComponent(assigned(c)[0].id)}">VIEW AGENT →</a>`:`<a class="tw-world-card-action" href="#/skins/assign/${encodeURIComponent(c.id)}">CHOOSE CHARACTER →</a>`}</article>`).join('')}</div></section></div>`;
  document.querySelectorAll('[data-model]').forEach(host => { try { scenes.push(createBoss(host, { skin: host.dataset.model })); } catch { host.innerHTML = `<img src="${characterPortraitUrl(host.dataset.model)}" alt="${esc(state.config.characters.find(c=>c.id===host.dataset.model)?.name || 'Agent')} character">`; } });
}
function characterAssignment(page,id){
 const c=state.config.characters.find(item=>item.id===id);
 if(!c){page.innerHTML=empty('Character unavailable','Return to Characters and choose an available character.',false);return;}
 if(state.agents.some(a=>a.character===id)){page.innerHTML=empty('Character assigned','This character is already in use. Choose an available character.',false)+'<a class="tw-world-cta secondary" href="#/skins">BACK TO CHARACTERS</a>';return;}
 const owner=state.session?.address;
 page.innerHTML=`<div class="tw-world tw-character-assign"><a class="tw-text-link" href="#/skins">← BACK TO CHARACTERS</a><span class="tw-world-eyebrow">CHARACTER LAB</span><h1>ASSIGN CHARACTER</h1><p>Choose which Agent should use this character.</p><section class="tw-character-assign-selected"><img src="${characterPortraitUrl(c.id)}" alt="${esc(c.name)} character"><div><span class="tw-status">${owner?'AVAILABLE':'SIGN IN TO CHECK'}</span><h2>${esc(c.name)}</h2><p>${esc(c.role)}</p></div></section><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">YOUR WORKFORCE</span><h2>CHOOSE AN AGENT</h2></div></div><div class="tw-character-assign-agents">${!owner?'<p>Connect your owner wallet to assign a character.</p><button class="tw-world-cta primary" data-connect>CONNECT WALLET →</button>':state.agents.length?state.agents.map(a=>`<article class="tw-character-assign-agent"><img src="${characterPortraitUrl(a.character)}" alt=""><div><h3>${esc(a.name)}</h3><p>${tokenLabel(a)}</p><span class="tw-status">PAPER TRADER</span> <span class="tw-status">${esc(a.strategy)}</span><p>Current character: ${esc(state.config.characters.find(x=>x.id===a.character)?.name||a.character)}</p></div><button class="tw-world-cta primary" data-assign-agent="${esc(a.id)}">ASSIGN TO ${esc(a.name.toUpperCase())} →</button></article>`).join(''):'<p>No owned Agents yet. Create an Agent first.</p>'}</div></div>`;
 page.querySelector('[data-connect]')?.addEventListener('click',openWallet);
 let pending=false;
 page.querySelectorAll('[data-assign-agent]').forEach(button=>button.onclick=()=>{
  const a=state.agents.find(item=>item.id===button.dataset.assignAgent);if(!a||pending)return;
  const previous=state.config.characters.find(x=>x.id===a.character)?.name||a.character;
  const dialog=document.createElement('dialog');dialog.className='tw-dialog tw-character-assign-dialog';
  dialog.innerHTML=`<span class="tw-world-eyebrow">OWNER CONFIRMATION</span><h2>ASSIGN CHARACTER?</h2><p><strong>${esc(c.name)}</strong> → <strong>${esc(a.name)}</strong></p><p>${esc(c.name)} will replace ${esc(previous)} as this Agent's character.</p><p class="tw-error" role="alert"></p><div class="tw-dialog-actions"><button class="tw-world-cta secondary" data-cancel>CANCEL</button><button class="tw-world-cta primary" data-confirm>ASSIGN CHARACTER</button></div>`;
  document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  dialog.querySelector('[data-confirm]').onclick=async()=>{if(pending)return;pending=true;dialog.querySelector('[data-confirm]').disabled=true;try{if(state.session?.address!==owner)throw Error('Owner session changed. Reconnect and review again.');const updated=await post('/agents/'+encodeURIComponent(a.id)+'/character',{character:c.id,expectedCharacter:a.character});if(updated.creator!==owner||updated.character!==c.id)throw Error('Assignment response did not match the selected owner and character.');state.agents=state.agents.map(item=>item.id===a.id?updated:item);dialog.close();page.innerHTML=`<div class="tw-world tw-character-assign-success"><span class="tw-world-eyebrow">CHARACTER LAB</span><h1>CHARACTER ASSIGNED</h1><img src="${characterPortraitUrl(c.id)}" alt="${esc(c.name)} character"><p>${esc(c.name)} is now assigned to ${esc(a.name)}.</p><div class="tw-world-actions"><a class="tw-world-cta primary" href="#/agent/${encodeURIComponent(a.id)}">VIEW AGENT →</a><a class="tw-world-cta secondary" href="#/skins">BACK TO CHARACTERS</a></div></div>`;}catch(error){dialog.querySelector('.tw-error').textContent=error.message;dialog.querySelector('[data-confirm]').disabled=false;}finally{pending=false;}};
 });
}
function guideLanding(page){
 const steps=[['01','CONNECT WALLET','Address connection and signed owner authentication are separate; preview never requests a signature.','#/agents'],['02','COIN + AGENT','Create a Launchpad identity, then review and save its first immutable coin draft only when verified owner save capability is available. Identity-only Agents stay valid. Saving metadata does not launch a token.','#/launch'],['03','REVIEW AND APPROVE','For configured tokens, review owner payer, exact costs and transaction in Agent Detail before separate wallet approval.','#/agents'],['04','CONFIGURE, THEN START','After verified mint confirmation, configure Paper and use separately authorized Start. Funding and Live remain OFF.','#/agents'],['05','MONITOR AND RECONCILE','Inspect positions and history. Signed uncertainty needs same-signature status reconciliation, not a fresh launch.','#/traders']];
 const faq=[['What is Paper Trading?','A simulated trading environment. It does not send real-money swaps.'],['Does the strategy guarantee profit?','No. Current strategies are deterministic momentum/activity presets, not AI-generated decisions. Trading results are uncertain, including in Paper mode.'],['What does Stop Loss mean?','An exit trigger, not a guaranteed fill price.'],['Why can a loss exceed my Stop Loss?','Price moves, liquidity and execution conditions can change the final fill.'],['What is Floating PnL?','The estimated gain or loss of an open position.'],['What is Realized PnL?','The gain or loss recorded after a position closes.'],['What is Live Trading?','Real Mainnet execution with separate qualification and authorization. Live stays OFF; Paper approval is not Live authorization.'],['Who pays, signs and is the creator?','The current Pump builder uses the owner as fee payer and encoded creator, with owner wallet approval and a separate required mint signer. This is source behavior, not proof of a completed launch or fee rights.'],['Does funding start trading?','No. Launch initial buy, Agent funding, configuration and Start are separate. Funding and withdrawal remain OFF; Paper uses simulated capital. Pause does not liquidate existing positions.'],['Does each Agent have its own wallet?','Only when separately created: an optional encrypted server-custodied wallet, distinct from the owner browser wallet and launch mint account. Identity or launch does not automatically create or fund it.']];
 page.innerHTML=`<div class="tw-world tw-world-guide">${worldHero('WORKSPACE GUIDE','FROM ZERO<br><em>TO YOUR FIRST AGENT.</em>','Connect, review your coin and Agent, then operate only separately authorized capabilities.','diamond','<button class="tw-world-cta primary" type="button" data-guide-start>START HERE <span>↓</span></button>')}<section class="tw-world-section" id="quick-start"><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">QUICK START</span><h2>FIVE MOVES TO GET GOING</h2></div></div><div class="tw-guide-journey">${steps.map(([no,title,copy,href])=>`<a href="${href}"><span>${no}</span><strong>${title}</strong><small>${copy}</small><b>→</b></a>`).join('')}</div></section><section class="tw-world-section"><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">EXPLORE THE WORKSHOP</span><h2>LEARN BY TOPIC</h2></div></div><div class="tw-guide-categories">${guideCategories.map(({id,title,description,icon:iconName})=>`<button type="button" data-guide-category="${id}" aria-haspopup="dialog"><i>${icon(iconName)}</i><strong>${title}</strong><small>${description}</small><span aria-hidden="true">↗</span></button>`).join('')}</div></section><section class="tw-world-section"><div class="tw-world-section-head"><div><span class="tw-world-eyebrow">QUICK ANSWERS</span><h2>FAQ</h2></div></div><div class="tw-guide-faq">${faq.map(([question,answer])=>`<details><summary>${question}<span>+</span></summary><p>${answer}</p></details>`).join('')}</div></section><div class="tw-guide-finish"><div><span class="tw-world-eyebrow">YOUR NEXT MOVE</span><h2>READY TO PUT YOUR AGENT TO WORK?</h2></div><div class="tw-world-actions"><a class="tw-world-cta primary" href="#/launch">Launch Coin + Agent →</a><a class="tw-world-cta secondary" href="#/agents">VIEW AGENTS →</a></div></div></div>`;
 page.querySelector('[data-guide-start]').onclick=()=>page.querySelector('#quick-start').scrollIntoView({behavior:'smooth',block:'start'});
 scenes.push(mountGuideDrawer(page));
}
function renderUnavailable(page,name){
  const titles={overview:'Home',launch:'Launchpad',agents:'Agents',tokens:'Tokens',market:'Market',traders:'Trading',wallet:'Wallet',leaderboard:'Leaderboard',payroll:'Payroll',how:'Guide',agent:'Agent'};
  const orientation=name==='overview'?worldHero('AI AGENT LAUNCHPAD','Launch your coin.<br><em>Give it an agent.</em>','Pump.fun launches require explicit wallet approval. Paper and Real are separate; launching does not authorize trading.','frank','<a class="tw-world-cta primary" href="#/launch">Launch Coin + Agent</a>','<a class="tw-world-cta secondary" href="#/agents">VIEW AGENTS →</a>'):name==='how'?head('GUIDE','Create. Launch. Operate.','Agent identity, token configuration, wallet approval and trading authorization are separate steps. An identity-only Agent is valid. Paper is simulated; Real requires separate authorization.'):head('WORKSPACE UNAVAILABLE',titles[name]||'Workspace','This destination needs a valid workspace response.');
  page.innerHTML=orientation+'<section class="tw-empty" role="status"><h2>Workspace API unavailable</h2><p>Agent, token, wallet and network state could not be verified. This is unavailable data, not an empty workspace. Owner controls are unavailable.</p><button type="button" class="tw-button" data-workspace-retry>Retry workspace connection</button></section>';
  const retry=page.querySelector('[data-workspace-retry]');retry.disabled=bootBusy;
  retry.onclick=()=>boot();
}
function render() {
  const version = ++routeVersion; scenes.forEach(s => s.destroy()); scenes = [];
  const page = $('#tw-page'), name = routeName();
  if(!page)return;
  page.className='';
  document.body.dataset.route = name;
  if(workspaceUnavailable||!state){document.title='TEKKTEAM - Workspace unavailable';document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===name);if(a.dataset.nav===name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});renderUnavailable(page,name);return;}
  const system = $('.tw-system');
  system.dataset.defaultMarkup ??= system.innerHTML;
  system.innerHTML = ['launch','agent'].includes(name) ? '<span>Controlled launch</span><span>Solana Mainnet / solana:101 · pump.fun create_v2</span><span>Manual approval · Initial buy 0 SOL</span>' : system.dataset.defaultMarkup;
  document.querySelectorAll('[data-nav]').forEach(a => { a.classList.toggle('active', a.dataset.nav === name); if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  // #tw-page is shared by every route. Market styles its host directly;
  // release those route-local classes before mounting the next page.
  page.className = '';
  page.innerHTML = ''; document.title = `TEKKTEAM — ${name === 'overview' ? 'Your agent workspace' : name === 'skins' ? 'Characters' : name[0].toUpperCase() + name.slice(1)}`;
  try{decodeURIComponent(location.hash);}catch{page.innerHTML=empty('This link is invalid.','Open a destination from the navigation to continue.',false);return;}
   ({ overview: home, agents, tokens, market:p=>scenes.push(mountMarketPage(p,{agents:state.agents,owner:state.session?.address})), launch, skins: p=>location.hash.startsWith('#/skins/assign/')?characterAssignment(p,decodeURIComponent(location.hash.slice('#/skins/assign/'.length))):characters(p), how: guideLanding,wallet:p=>scenes.push(mountWalletWorkspace(p,{agents:state.agents,owner:state.session?.address,provider:connectedWalletPresentation(state.session?.address),onConnect:openWallet})),traders:p=>scenes.push(mountTradingPage(p,'traders')),leaderboard:p=>scenes.push(mountRealLeaderboard(p)),payroll:p=>scenes.push(mountTradingPage(p,'payroll')),trader:p=>scenes.push(mountPublicTrader(p,location.hash.slice(2).split('/')[1])) }[name] || (name === 'agent' ? p => detail(p, location.hash.slice(2).split('/')[1], version) : p => { p.innerHTML = empty('This space does not exist.', 'Return to the overview to continue.', false); }))(page);
  hydrateCharacters(page);
  page.querySelectorAll('a[href^="#"]:not([href^="#/"])').forEach(link=>link.addEventListener('click',event=>{const target=page.querySelector(link.getAttribute('href'));if(!target)return;event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}));
  if (state.config.preview) {
    page.querySelectorAll('.desk-status-list dd').forEach((node,i) => { if(i===0) node.textContent='Not connected — demo'; });
    if(name==='how') page.querySelectorAll('.tw-capabilities b').forEach(node=>{if(node.textContent==='Available') node.textContent='Local backend only';});
  }
}
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
async function boot() {
  if(typeof ownerAccessDetached==='function'&&ownerAccessDetached())refresh.detached=true;
  if(bootBusy)return;bootBusy=true;clearInterval(poll);
  const retry=$('[data-workspace-retry]');if(retry){retry.disabled=true;retry.textContent='Checking workspace…';}
  try { await refresh(); workspaceUnavailable=false; shell(); render(); }
  catch { state=null;workspaceUnavailable=true;bootBusy=false;shell();render();return; }
  finally {bootBusy=false;}
  if (state.config.preview) return;
  poll = setInterval(async () => {
    if (document.hidden) return;
    try {
      const previousOwner = state.session?.address;
      const previousAgentIds=routeName()==='wallet'?state.agents?.map(a=>a.id).join('|'):null;
      const detailId=routeName()==='agent'?location.hash.slice(2).split('/')[1]:null;
      const previousStatus=state.agents?.find(a=>a.id===detailId)?.status;
      await refresh();
      if (previousOwner !== state.session?.address) { shell(); render(); }
      else if(routeName()==='wallet'&&previousAgentIds!==state.agents?.map(a=>a.id).join('|'))render();
      else if(detailId && $('#tw-reconcile') && routeName()==='agent' && location.hash.slice(2).split('/')[1]===detailId && previousStatus!==state.agents?.find(a=>a.id===detailId)?.status)render();
      const system = $('.tw-system');
      system?.classList.remove('offline');
      const apiStatus = system?.querySelector('span');
      if (apiStatus?.textContent.startsWith('Workspace API')) apiStatus.innerHTML = '<i></i> Workspace API online';
    } catch {
      const system = $('.tw-system');
      system?.classList.add('offline');
      const apiStatus = system?.querySelector('span');
      if (apiStatus?.textContent.startsWith('Workspace API')) apiStatus.textContent = 'Workspace API unavailable';
    }
  }, 15000);
}
window.addEventListener('pagehide', () => { clearInterval(poll); scenes.forEach(s => s.destroy()); });
boot();
