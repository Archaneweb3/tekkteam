// TEKKWORK frontend entry (live, Solana mainnet)
import { createApi } from './api.js';
import { robotSVG } from './robot.js';
import { ICONS, avatar, STRAT_ICONS, strategyRules, stratIcon, stratKey, riskTag, riskWarning } from './ui.js';
import { RISK_ACK } from '../shared/risk-ack.js';
import { FIELDS, CUSTOM_BASES, NAME_MAX, fieldsFor, defaultsFor, sanitize as sanitizeCustom, cleanName, settingsLine } from '../shared/custom-strategy.js';
import { wallet, onWallet, onWalletList, listWallets, connectWallet, disconnect, restoreWallet, signAction, sendSol, actionMessage } from './wallet.js';
import { esc, ago, pct, tone, sol, agentNo, short, price } from './format.js';
import { HomePage } from './pages/home.js';
import { AgentsPage, TokensPage } from './pages/lists.js';
import { AgentPage } from './pages/agent.js';
import { LaunchPage } from './pages/launch.js';
import { HowPage } from './pages/how.js';
import { SkinsPage } from './pages/skins.js';
import { createBoss } from './boss3d.js';

const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// X / Twitter profile comes from config.js → site.xUrl (hidden when empty)
function xHandle(url) { return url ? '@' + url.replace(/\/+$/, '').split('/').pop() : ''; }

const nic = (d) => `<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NAV_IC = {
  home: nic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  agents: nic('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.4-3 4-3s3 1 4 3"/><path d="M10 3v2h4V3"/>'),
  tokens: nic('<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>'),
  launch: nic('<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>'),
  shill: nic('<path d="M4 4l16 16M20 4L4 20"/>'),
  skins: nic('<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.6-2 2.6-4 2.6S8.5 4.6 8 3z"/>'),
  how: nic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7"/><path d="M12 17.5v.01"/>'),
};

// X badge: the official X mark on a black suit with a red tie peeking out (TEKKWORK style)
const X_BADGE = `<span class="xb-suit" aria-hidden="true"><svg class="xb-logo" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg><i class="xb-tie"></i></span>`;

function shell(cfg) {
  const x = cfg.xUrl || '';
  return `
  <header class="topbar">
    <div class="topbar-in">
      <a class="brand" href="#/" aria-label="TEKKWORK home"><img class="brand-logo" src="brand/boss-96.png" alt="" width="40" height="40"><span class="brand-name">TEKK<span class="brand-desk">WORK</span></span></a>
      <nav class="nav" id="nav">
        <a href="#/" data-r="home">${NAV_IC.home}<span>Home</span></a>
        <a href="#/agents" data-r="agents">${NAV_IC.agents}<span>Agents</span></a>
        <a href="#/tokens" data-r="tokens">${NAV_IC.tokens}<span>Tokens</span></a>
        <a href="#/launch" data-r="launch">${NAV_IC.launch}<span>Launch</span></a>
        ${cfg.skins?.enabled ? `<a href="#/skins" data-r="skins">${NAV_IC.skins}<span>Skins</span></a>` : ''}
        <button type="button" class="nav-shill" id="nav-shill">${NAV_IC.shill}<span>Shill on X</span></button>
        <a href="#/how" data-r="how">${NAV_IC.how}<span>How it works</span></a>
      </nav>
      <div class="side-card" aria-hidden="true"><img src="brand/boss.png" alt="" width="84" height="84"><span><b>Your agent does the team work.</b> Launch a coin and it gets its own trader.</span></div>
      <div class="top-right">
        <span class="mode-pill live-pill" id="mode-pill">MAINNET</span>
        ${x ? `<a class="x-link" href="${esc(x)}" target="_blank" rel="noopener" aria-label="Follow ${esc(xHandle(x))} on X" title="Follow ${esc(xHandle(x))} on X">${X_BADGE}</a>` : ''}
        <button class="icon-btn" id="theme-btn" type="button" aria-label="Toggle light / dark theme"></button>
        <button class="btn btn-wallet" id="wallet-btn" type="button">Connect <span class="long">wallet</span></button>
      </div>
      <button class="ca-chip soon" id="ca-chip" type="button" title="Contract address: coming soon"><span class="ca-tag">CA</span><span class="ca-val">Coming soon</span></button>
    </div>
  </header>
  <div class="tape" aria-label="Token prices"><div class="tape-track" id="tape"></div></div>
  <main id="page"></main>
  <footer class="foot"><span class="foot-brand"><img src="brand/boss-96.png" alt="" width="26" height="26"><b>TEKKWORK</b> · your agents do the team work</span>${x ? `<a class="foot-x" href="${esc(x)}" target="_blank" rel="noopener">${X_BADGE}${esc(xHandle(x))}</a>` : ''}<span>TEKKWORK preview · Sample data</span><span>Not financial advice. Memecoins are extremely risky.</span></footer>
  <div class="toasts" id="toasts" aria-live="polite"></div>`;
}

function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeBtn() {
  const dark = currentTheme() === 'dark';
  const b = $('#theme-btn');
  b.innerHTML = dark ? ICONS.sun : ICONS.moon;
  b.title = dark ? 'Light theme' : 'Dark theme';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141417' : '#F3F0EA');
}

function modal(title, body, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="x" type="button" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div></div>`;
  document.body.appendChild(back);
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('.x').addEventListener('click', close);
  return { el: back, close, body: back.querySelector('.modal-body') };
}

function toast(html, seed) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${seed ? `<span class="av av-42">${robotSVG(seed)}</span>` : `<img src="brand/boss-96.png" alt="" width="36" height="36">`}<div>${html}</div>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

async function boot() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty boot"><img src="brand/boss.png" alt="TEKKWORK" width="130" height="130"><span>clocking in at TEKKWORK<span class="cursor"></span></span></div></div></div>`;
  const api = await createApi();
  app.innerHTML = shell(api.config || {});
  paintThemeBtn();
  if (!api.config.tradingEnabled) $('#mode-pill').textContent = api.config.preview ? 'PREVIEW' : 'TRADING PAUSED';
  if (api.config.preview) document.querySelector('#page').insertAdjacentHTML('beforebegin', '<div class="preview-note">Preview · Sample data. Wallet funding, launch and trading are not connected.</div>');

  let page = null;
  const ctx = {
    api,
    navigate: (h) => { if (location.hash === h) route(); else location.hash = h; },
    toast,
    openConnect,
    progressModal,
    agentAction,
    shill: (agentId) => shillModal(agentId),
    strategyBuilder: (opts) => strategyBuilder(opts),
    skinModal: (agent, pick, after) => skinModal(agent, pick, after),
  };

  // ── wallet ──
  function paintWallet() {
    const b = $('#wallet-btn');
    if (wallet.address) {
      b.innerHTML = `${wallet.icon ? `<img class="w-ic" src="${esc(wallet.icon)}" alt="">` : '<span class="dot"></span>'}${esc(short(wallet.address, 4))}`;
      b.title = `${wallet.name || 'Wallet'} connected. Click to disconnect`;
    } else { b.innerHTML = 'Connect <span class="long">wallet</span>'; b.title = ''; }
  }
  onWallet(() => { paintWallet(); page?.onWallet?.(); });
  $('#wallet-btn').addEventListener('click', async () => {
    if (wallet.address) {
      const m = modal('Wallet', `<p>Connected with <b>${esc(wallet.name || 'your wallet')}</b>: <code class="mono">${esc(wallet.address)}</code></p><button class="btn btn-block" id="w-dis">Disconnect</button>`);
      m.body.querySelector('#w-dis').addEventListener('click', async () => { await disconnect(); m.close(); });
    } else openConnect();
  });

  function openConnect() {
    if (api.config.preview) {
      modal('Wallet connection — coming soon', '<p>Explore the launch form, agent profiles and strategies in this preview. A TEKKWORK backend is required before wallet funding and live trading become available.</p>');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let done = false;
      const m = modal('Connect wallet', `
        <p>Your wallet is the creator wallet. It launches coins, funds agents and receives your share of creator fees. Each agent gets its own separate wallet.</p>
        <div class="wallet-list" id="c-list"></div>
        <div class="err" id="c-err" hidden></div>
        <p class="note">Solana wallets only. In MetaMask, pick a Solana account.</p>`, { onClose: () => { off(); if (!done) resolve(null); } });
      const list = m.body.querySelector('#c-list');
      const err = m.body.querySelector('#c-err');
      const paint = () => {
        list.innerHTML = listWallets().map((w) => `
          <button class="wallet-opt${w.installed || w.sdk ? '' : ' get'}" type="button" data-id="${esc(w.id)}">
            <span class="wicon">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : esc(w.name.slice(0, 1))}</span>
            <span class="wtext"><b>${esc(w.name)}</b><small>${w.installed ? 'Detected in this browser' : w.sdk ? 'Browser extension or mobile app' : 'Not installed'}</small></span>
            ${w.installed || w.sdk ? '' : '<span class="wget">Get ↗</span>'}
          </button>`).join('');
      };
      paint();
      const off = onWalletList(paint); // wallets can register a moment after the page loads
      list.addEventListener('click', async (e) => {
        const b = e.target.closest('.wallet-opt');
        if (!b || b.disabled) return;
        const w = listWallets().find((x) => x.id === b.dataset.id);
        if (!w) return;
        if (!w.installed && !w.sdk) { window.open(w.url, '_blank', 'noopener'); return; }
        err.hidden = true;
        list.querySelectorAll('.wallet-opt').forEach((x) => { x.disabled = true; });
        b.querySelector('small').textContent = 'Approve in ' + w.name + '…';
        try {
          const a = await connectWallet(w.id);
          done = true; m.close(); resolve(a);
        } catch (ex) {
          const rejected = ex?.code === 4001 || /reject|cancel|denied|closed/i.test(ex?.message || '');
          err.hidden = false;
          err.textContent = rejected ? `Connection was cancelled in ${w.name}.` : (ex?.message || `Could not connect ${w.name}.`);
          paint();
        }
      });
    });
  }

  // Step-by-step modal used by launch and creator actions
  function progressModal(title, steps) {
    const m = modal(title, `<ul class="progress">${steps.map((s) => `<li><span class="ic"></span><span>${esc(s)}</span></li>`).join('')}</ul><div id="p-note" class="p-note"></div><div class="err" id="p-err" hidden></div><div id="p-foot" class="p-foot"></div>`);
    const lis = [...m.body.querySelectorAll('.progress li')];
    let cur = -1;
    const foot = () => m.body.querySelector('#p-foot');
    const p = {
      step(i) {
        lis.forEach((li, j) => { li.classList.toggle('done', j < i); li.classList.toggle('doing', j === i); li.querySelector('.ic').textContent = j < i ? '✓' : ''; });
        cur = i;
      },
      note(html) { m.body.querySelector('#p-note').innerHTML = html; },
      ask(label) {
        return new Promise((resolve) => {
          foot().innerHTML = `<button class="btn btn-primary btn-block btn-lg" id="p-ask">${esc(label)}</button>`;
          foot().querySelector('#p-ask').addEventListener('click', () => { foot().innerHTML = ''; resolve(); });
        });
      },
      fail(i, msg) {
        if (lis[i]) { lis[i].classList.remove('doing'); lis[i].classList.add('fail'); lis[i].querySelector('.ic').textContent = '!'; }
        const e = m.body.querySelector('#p-err'); e.hidden = false; e.textContent = msg;
        foot().innerHTML = `<button class="btn btn-block" id="p-close">Close</button>`;
        foot().querySelector('#p-close').addEventListener('click', m.close);
      },
      failCurrent(msg) { p.fail(Math.max(0, Math.min(cur, lis.length - 1)), msg); },
      link(label, fn) {
        foot().insertAdjacentHTML('afterbegin', `<button class="btn btn-primary btn-block" id="p-link">${esc(label)}</button>`);
        foot().querySelector('#p-link').addEventListener('click', () => { m.close(); fn(); });
      },
      done(label, onOpen) {
        p.step(lis.length);
        foot().innerHTML = `<button class="btn btn-primary btn-block" id="p-open">${esc(label)} · open agent page</button>`;
        foot().querySelector('#p-open').addEventListener('click', () => { m.close(); onOpen(); });
      },
      close: m.close,
    };
    return p;
  }

  // ── creator actions on the agent page ──
  async function ensureCreator(agent) {
    if (!wallet.address) await openConnect();
    if (wallet.address !== agent.creator) throw new Error('Connect the creator wallet (' + short(agent.creator, 4) + ') to do this.');
  }

  async function agentAction(act, agent, after) {
    try {
      await ensureCreator(agent);
      if (act === 'deposit' || act === 'fund-launch') return depositModal(agent, act === 'fund-launch', after);
      if (act === 'withdraw') return withdrawModal(agent, after);
      if (act === 'strategy') return strategyModal(agent, after);
      if (act === 'skins') return skinModal(agent, null, after);
      if (act === 'pause' || act === 'resume' || act === 'retry') {
        const auth = await signAction(actionMessage(act, agent.wallet));
        if (act === 'retry') await api.retry(agent.id, auth);
        else await api.pause(agent.id, { paused: act === 'pause', ...auth });
        toast(`<b>${act === 'pause' ? 'Trading paused' : act === 'resume' ? 'Trading resumed' : 'Launch restarted'}</b>${esc(agent.name)}`, agent.avatarSeed);
        after && after();
      }
    } catch (e) {
      toast(`<b>Could not complete that</b>${esc(e.message)}`);
    }
  }

  function depositModal(agent, isLaunch, after) {
    const need = isLaunch ? Math.max(0, agent.requiredSol - agent.balanceSol) : 0.25;
    const presets = isLaunch ? [] : [0.1, 0.25, 0.5, 1];
    const m = modal(isLaunch ? `Fund ${agent.name}` : `Add SOL to ${agent.name}`, `
      <p>Send SOL from your wallet to the agent wallet <code class="mono">${esc(short(agent.wallet, 6))}</code>. The agent trades it.</p>
      <div class="field"><label for="f-amt">Amount</label><div class="input-affix suf"><input class="input" id="f-amt" type="number" min="0.001" step="0.01" value="${Number(need.toFixed(4))}" inputmode="decimal" ${isLaunch ? 'readonly' : ''}><span class="suf-t">SOL</span></div>
      ${presets.length ? `<div class="presets" id="f-pre">${presets.map((v) => `<button type="button" data-v="${v}" class="${v === 0.25 ? 'on' : ''}">${v} SOL</button>`).join('')}</div>` : ''}</div>
      <div class="err" id="f-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="f-go">Send with ${esc(wallet.name || 'your wallet')}</button>`);
    const amt = m.body.querySelector('#f-amt');
    m.body.querySelector('#f-pre')?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      amt.value = b.dataset.v;
      m.body.querySelectorAll('#f-pre button').forEach((x) => x.classList.toggle('on', x === b));
    });
    m.body.querySelector('#f-go').addEventListener('click', async () => {
      const v = Number(amt.value);
      const err = m.body.querySelector('#f-err');
      const btn = m.body.querySelector('#f-go');
      if (!(v > 0)) { err.hidden = false; err.textContent = 'Enter an amount.'; return; }
      btn.disabled = true; btn.textContent = `Confirm in ${wallet.name || 'your wallet'}…`;
      try {
        const sig = await sendSol(agent.wallet, v, api.blockhash);
        btn.textContent = 'Confirming on-chain…';
        if (isLaunch) await api.confirmFunding(agent.id, sig);
        else await api.deposit(agent.id, sig);
        m.close();
        toast(`<b>Sent ${v} SOL to ${esc(agent.name)}</b><a class="ext" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">View transaction ↗</a>`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Transfer failed.';
        btn.disabled = false; btn.textContent = `Send with ${wallet.name || 'your wallet'}`;
      }
    });
  }

  function strategyModal(agent, after) {
    const list = api.config.strategies || [];
    let chosen = agent.strategy || api.config.defaultStrategy;
    let mine = null; // the creator's own custom strategy (loaded below)
    const optHTML = (st) => `
        <button type="button" class="strat-opt strat-${esc(stratKey(st))}${st.id === chosen ? ' on' : ''}" data-s="${esc(st.id)}">
          <span class="so-ic">${stratIcon(st)}</span>
          <span class="so-t"><b>${esc(st.name)}${riskTag(st)}${st.custom ? ' <em class="cust-tag">custom</em>' : ''}${st.id === agent.strategy ? ' <em>current</em>' : ''}</b><small>${esc(st.custom ? st.tagline : st.goal)}</small></span>
          <span class="so-rules">${strategyRules(st).slice(st.custom ? 1 : 0, (st.custom ? 1 : 0) + 4).map(([k, v]) => `<span><i>${k}</i>${v}</span>`).join('')}</span>
        </button>`;
    const customHTML = () => api.config.customEnabled === false ? '' : mine
      ? `<div class="cust-row">${optHTML(mine)}<button type="button" class="btn btn-sm" id="st-edit">${STRAT_ICONS.custom}<span>Edit my strategy</span></button></div>`
      : `<button type="button" class="cust-new" id="st-build"><span class="so-ic">${STRAT_ICONS.custom}</span><span><b>Build your own strategy</b><small>Move the sliders, give it a name. One custom strategy per wallet.</small></span><span class="cust-plus">+</span></button>`;
    const m = modal(`Strategy for ${agent.name}`, `
      <p>Pick how ${esc(agent.name)} trades from now on. Open positions switch to the new exit rules right away. You sign a message with your wallet, no SOL is sent.</p>
      <div id="st-custom" class="st-custom"><div class="cust-load">Loading your custom strategy…</div></div>
      <div class="strat-list" id="st-list">${list.map(optHTML).join('')}</div>
      <div id="st-risk"></div>
      <div class="err" id="st-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="st-go" type="button">Sign and switch</button>`);
    let riskOk = false;
    const risky = () => list.find((x) => x.id === chosen)?.risk === 'extreme';
    const paint = () => {
      m.body.querySelectorAll('.strat-opt').forEach((b) => b.classList.toggle('on', b.dataset.s === chosen));
      const st = list.find((x) => x.id === chosen);
      m.body.querySelector('#st-risk').innerHTML = chosen !== agent.strategy ? riskWarning(st, { checkbox: true, checked: riskOk }) : '';
    };
    m.body.addEventListener('change', (e) => { if (e.target.matches('[data-risk-ok]')) { riskOk = e.target.checked; e.target.closest('.risk-ok')?.classList.remove('need'); } });
    const paintCustom = () => {
      const box = m.body.querySelector('#st-custom');
      box.innerHTML = customHTML();
      box.querySelector('#st-edit, #st-build')?.addEventListener('click', () => { m.close(); strategyBuilder({ agent, existing: mine, after }); });
    };
    api.getCustom(agent.creator).then((c) => { mine = c; paintCustom(); }).catch(() => { mine = null; paintCustom(); });
    m.body.addEventListener('click', (e) => { const b = e.target.closest('.strat-opt'); if (b) { if (chosen !== b.dataset.s) riskOk = false; chosen = b.dataset.s; paint(); if (risky()) m.body.querySelector('#st-risk .risk-warn')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    m.body.querySelector('#st-go').addEventListener('click', async () => {
      const err = m.body.querySelector('#st-err'), btn = m.body.querySelector('#st-go');
      if (chosen === agent.strategy) { m.close(); return; }
      if (risky() && !riskOk) {
        const lab = m.body.querySelector('#st-risk .risk-ok');
        lab?.classList.add('need'); lab?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        err.hidden = false; err.textContent = 'Tick the box first: this strategy can lose all of the agent\'s SOL.';
        return;
      }
      err.hidden = true;
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('strategy', agent.wallet, [`Strategy: ${chosen}`, ...(risky() ? [RISK_ACK] : [])]));
        await api.setStrategy(agent.id, { strategy: chosen, ...auth });
        m.close();
        const st = list.find((x) => x.id === chosen) || (mine && mine.id === chosen ? mine : null);
        toast(`<b>Strategy: ${esc(st?.name || chosen)}</b>${esc(agent.name)} trades with the new rules from the next decision.`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Could not switch the strategy.';
        btn.disabled = false; btn.textContent = 'Sign and switch';
      }
    });
  }

  // ── skins: buy (SOL to the rewards wallet) or wear an owned one ──
  function skinModal(agent, pick = null, after) {
    const S = api.config.skins || {};
    const items = S.items || [];
    const owned = new Set(agent.skins || []);
    let sel = pick || agent.skin || items[0]?.id || 'default';
    let viewer = null;
    const m = modal(`Skins for ${agent.name}`, `
      <p>Give ${esc(agent.name)} a new look everywhere on TEKKWORK. Paid with SOL from your creator wallet. <b>The SOL goes to the TEKKWORK rewards wallet</b>, which pays the promotion rewards.${items.some((x) => x.nft) ? ' NFT skins go to your wallet: one NFT dresses one agent, and if you sell the NFT the skin goes with it.' : ''}</p>
      <div class="skin-stage" id="sk-stage"></div>
      <div class="skin-list" id="sk-list"></div>
      <div class="err" id="sk-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="sk-go" type="button"></button>`, { onClose: () => viewer?.destroy() });
    m.el.querySelector('.modal').classList.add('modal-wide');
    const q = (x) => m.body.querySelector(x);
    const stage = () => {
      viewer?.destroy(); viewer = null;
      const host = q('#sk-stage');
      host.innerHTML = '';
      if (sel === 'default') { host.innerHTML = `<div class="skin-default">${robotSVG(agent.baseSeed || agent.wallet, { stand: true })}</div>`; return; }
      try { viewer = createBoss(host, { skin: sel, label: 'Skin preview. Drag to spin.' }); } catch { host.innerHTML = `<img class="skin-flat" src="brand/skins/${esc(sel)}-stand.png" alt="">`; }
    };
    const paint = () => {
      const cards = [{ id: 'default', name: 'Original worker', priceSol: 0 }, ...items];
      q('#sk-list').innerHTML = cards.map((x) => {
        const wearing = (agent.skin || 'default') === x.id;
        const has = x.id === 'default' || owned.has(x.id);
        return `<button type="button" class="skin-card${x.id === sel ? ' on' : ''}${x.rarity === 'legendary' || x.rarity === 'epic' ? ' ' + x.rarity : ''}" data-id="${esc(x.id)}">${x.rarity === 'legendary' ? '<span class="rarity-tag">LEGENDARY</span>' : x.rarity === 'epic' ? '<span class="rarity-tag epic">EPIC</span>' : ''}
          <span class="skin-thumb">${x.id === 'default' ? robotSVG(agent.baseSeed || agent.wallet) : `<img src="brand/skins/${esc(x.id)}-bust.png" alt="">`}</span>
          <b>${esc(x.name)}${x.nft ? ' <span class="nft-tag">NFT</span>' : ''}</b>
          <small>${wearing ? '<span class="skin-tag on">wearing</span>' : has ? '<span class="skin-tag">owned</span>' : x.stock && x.stock.sold >= x.stock.max ? '<span class="skin-tag out">sold out</span>' : `${x.priceSol} SOL`}</small>
          ${x.stock && !has ? `<small class="skin-left">${Math.max(0, x.stock.max - x.stock.sold)} / ${x.stock.max} left</small>` : ''}
        </button>`;
      }).join('');
      const it = items.find((x) => x.id === sel);
      const btn = q('#sk-go');
      const wearing = (agent.skin || 'default') === sel;
      btn.disabled = wearing;
      const soldOut = it?.stock && it.stock.sold >= it.stock.max && !owned.has(sel);
      btn.disabled = wearing || soldOut;
      btn.textContent = wearing ? 'Wearing it' : sel === 'default' || owned.has(sel) ? 'Sign and wear it' : soldOut ? 'Sold out' : it.stock ? `Reserve + buy for ${it.priceSol} SOL` : `Buy for ${it.priceSol} SOL`;
    };
    q('#sk-list').addEventListener('click', (e) => { const b = e.target.closest('.skin-card'); if (!b || b.dataset.id === sel) return; sel = b.dataset.id; paint(); stage(); });
    q('#sk-go').addEventListener('click', async () => {
      const err = q('#sk-err'), btn = q('#sk-go');
      err.hidden = true;
      const label = btn.textContent;
      btn.disabled = true;
      try {
        await ensureCreator(agent);
        const it = items.find((x) => x.id === sel);
        if (sel !== 'default' && !owned.has(sel)) {
          if (it.stock) {
            // limited skin: sign to hold one copy for 10 minutes, then pay
            btn.textContent = `Sign to reserve a copy in ${wallet.name || 'your wallet'}…`;
            const auth = await signAction(actionMessage('skin-hold', agent.wallet, [`Skin: ${sel}`]));
            const h = await api.holdSkin(agent.id, { skin: sel, ...auth });
            it.stock = { ...it.stock, ...h };
          }
          btn.textContent = `Confirm ${it.priceSol} SOL in ${wallet.name || 'your wallet'}…`;
          const sig = await sendSol(S.payTo, it.priceSol, api.blockhash);
          btn.textContent = 'Confirming the payment on-chain…';
          let r = null, lastErr = null;
          for (let i = 0; i < 4 && !r; i++) {
            try { r = await api.buySkin(agent.id, { skin: sel, signature: sig }); }
            catch (e) { lastErr = e; if (!/not found yet/i.test(e.message)) break; }
          }
          if (!r) throw new Error((lastErr?.message || 'Could not confirm the payment.') + ` Transaction: ${sig}`);
          owned.add(sel); agent.skins = [...owned]; agent.skin = sel;
          toast(`<b>Skin bought: ${esc(it.name)}</b>${esc(agent.name)} is wearing it now.${it.nft ? ' The NFT is on its way to your wallet.' : ''} <a class="ext" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">View tx ↗</a>`, 'skin:' + sel);
        } else {
          btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
          const auth = await signAction(actionMessage('skin', agent.wallet, [`Skin: ${sel}`]));
          await api.setSkin(agent.id, { skin: sel, ...auth });
          agent.skin = sel === 'default' ? null : sel;
          toast(`<b>${sel === 'default' ? 'Original worker is back' : 'Now wearing ' + esc(it.name)}</b>${esc(agent.name)}`, sel === 'default' ? agent.baseSeed : 'skin:' + sel);
        }
        m.close();
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Something went wrong.';
        btn.disabled = false; btn.textContent = label;
      }
    });
    paint(); stage();
  }

  // ── custom strategy builder: sliders, a name, one per wallet ──
  //   agent:    apply it to this agent right after saving (creator only)
  //   existing: the wallet's current custom strategy (edit mode)
  //   onSaved:  called with the saved strategy (launch page uses it)
  async function strategyBuilder({ agent = null, existing, after, onSaved } = {}) {
    try {
      if (!wallet.address) { const a = await openConnect(); if (!a) return; }
      if (agent && wallet.address !== agent.creator) throw new Error('Connect the creator wallet (' + short(agent.creator, 4) + ') to do this.');
      if (existing === undefined) existing = await api.getCustom(wallet.address).catch(() => null);
    } catch (e) { toast(`<b>Could not open the builder</b>${esc(e.message)}`); return; }
    const builtIns = Object.fromEntries((api.config.strategies || []).map((st) => [st.id, { ...st, ...(st.entry || {}) }]));
    let base = existing?.base || (agent && CUSTOM_BASES.includes(agent.strategy) ? agent.strategy : 'scalper');
    let params = existing ? { ...defaultsFor(base, builtIns[base]), ...existing.params } : defaultsFor(base, builtIns[base]);
    let name = existing?.name || '';

    const fmt = (k, v) => {
      const f = FIELDS[k];
      if (k === 'trailAt' && !(v > 0)) return 'off';
      if (f.kind === 'pct' || f.kind === 'neg') return (v < 0 ? '−' : ['takeProfitPct', 'trailAt'].includes(k) ? '+' : '') + (Math.abs(v) * 100).toFixed(f.step < 0.01 ? 1 : 0) + '%';
      if (f.kind === 'usd') return v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(v / 1000) + 'K';
      if (f.kind === 'min') return !v ? 'off' : v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? ' ' + (v % 60) + 'm' : ''}` : v + ' min';
      return String(v);
    };
    const GROUPS = [['size', 'Position size'], ['exit', 'Exits'], ['entry', 'Entry filters']];
    const rowHTML = (k) => {
      const f = FIELDS[k];
      const min = k === 'trailAt' || f.kind === 'min' ? 0 : f.min;
      const off = k === 'trailBy' && !(params.trailAt > 0);
      return `<div class="sl-row${off ? ' off' : ''}" data-k="${k}">
        <label for="sl-${k}"><span>${esc(f.label)}</span><output id="out-${k}">${fmt(k, params[k])}</output></label>
        <input type="range" id="sl-${k}" data-k="${k}" min="${min}" max="${f.max}" step="${f.step}" value="${params[k]}" ${off ? 'disabled' : ''}>
        <small>${esc(f.hint)}</small></div>`;
    };
    const bodyHTML = () => GROUPS.map(([g, title]) => {
      const keys = fieldsFor(base).filter((k) => FIELDS[k].group === g);
      return keys.length ? `<fieldset class="sl-group"><legend>${title}</legend>${keys.map(rowHTML).join('')}</fieldset>` : '';
    }).join('');
    const riskHTML = () => {
      const worst = params.sizePct * Math.abs(params.stopLossPct);
      const allIn = Math.min(1, params.sizePct * params.maxOpen);
      const lvl = worst >= 0.08 || allIn >= 0.9 ? 'high' : worst >= 0.03 || allIn >= 0.5 ? 'mid' : 'low';
      return `<span class="risk-${lvl}">${lvl === 'high' ? 'High risk' : lvl === 'mid' ? 'Medium risk' : 'Low risk'}</span>
        <span>One stop loss costs about <b>${(worst * 100).toFixed(1)}%</b> of the agent's SOL · up to <b>${Math.round(allIn * 100)}%</b> of it in trades at once</span>`;
    };

    const m = modal(existing ? 'Edit your strategy' : 'Build your strategy', `
      <p>Start from an entry style, then move the sliders. ${existing ? 'Saving replaces your strategy: every agent using it follows the new numbers right away.' : '<b>One custom strategy per wallet.</b> You can edit it later.'} You sign a message, no SOL is sent.</p>
      <div class="field"><label for="cs-name">Strategy name</label><input class="input" id="cs-name" maxlength="${NAME_MAX}" placeholder="e.g. Bond's Quick Hands" value="${esc(name)}" autocomplete="off"></div>
      <div class="field"><label>Entry style <small class="muted">(when it buys)</small></label>
        <div class="cs-bases" id="cs-bases">${CUSTOM_BASES.map((b) => `<button type="button" data-b="${b}" class="${b === base ? 'on' : ''}">${STRAT_ICONS[b] || ''}<span>${esc(builtIns[b]?.name || b)}</span></button>`).join('')}</div>
        <p class="hint" id="cs-base-goal">${esc(builtIns[base]?.goal || '')}</p></div>
      <div id="cs-sliders">${bodyHTML()}</div>
      <div class="cs-risk" id="cs-risk">${riskHTML()}</div>
      <div class="err" id="cs-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="cs-go" type="button">${agent ? `Sign, save and use for ${esc(agent.name)}` : 'Sign and save'}</button>`);
    m.el.querySelector('.modal').classList.add('modal-wide');
    const q = (s2) => m.body.querySelector(s2);
    q('#cs-sliders').addEventListener('input', (e) => {
      const k = e.target.dataset.k; if (!k) return;
      params[k] = Number(e.target.value);
      q('#out-' + k).textContent = fmt(k, params[k]);
      if (k === 'trailAt') {
        const row = q('.sl-row[data-k="trailBy"]'), inp = q('#sl-trailBy');
        row.classList.toggle('off', !(params.trailAt > 0)); inp.disabled = !(params.trailAt > 0);
      }
      q('#cs-risk').innerHTML = riskHTML();
    });
    q('#cs-bases').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.dataset.b === base) return;
      const keep = Object.fromEntries(['sizePct', 'maxOpen', 'takeProfitPct', 'stopLossPct', 'trailAt', 'trailBy', 'maxHoldMin', 'cooldownMin', 'minLiquidityUsd'].map((k) => [k, params[k]]));
      base = b.dataset.b;
      params = { ...defaultsFor(base, builtIns[base]), ...keep };
      q('#cs-bases').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      q('#cs-base-goal').textContent = builtIns[base]?.goal || '';
      q('#cs-sliders').innerHTML = bodyHTML();
      q('#cs-risk').innerHTML = riskHTML();
    });
    q('#cs-go').addEventListener('click', async () => {
      const err = q('#cs-err'), btn = q('#cs-go');
      err.hidden = true;
      let clean;
      try { clean = { name: cleanName(q('#cs-name').value), ...sanitizeCustom(base, params) }; }
      catch (e) { err.hidden = false; err.textContent = e.message; return; }
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('custom-strategy', agent ? agent.wallet : 'none', [settingsLine(clean.name, clean.base, clean.params)]));
        const r = await api.saveCustom({ owner: wallet.address, name: clean.name, base: clean.base, params: clean.params, applyTo: agent ? agent.id : undefined, ...auth });
        m.close();
        toast(`<b>Strategy saved: ${esc(r.strategy.name)}</b>${agent ? `${esc(agent.name)} now trades with it.` : 'Pick it for your agent.'}`, agent?.avatarSeed);
        onSaved && onSaved(r.strategy);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Could not save the strategy.';
        btn.disabled = false; btn.textContent = label;
      }
    });
  }

  function withdrawModal(agent, after) {
    const m = modal(`Withdraw from ${agent.name}`, `
      <p>SOL goes back to your creator wallet <code class="mono">${esc(short(agent.creator, 4))}</code>. Free SOL in the agent wallet: <b>${sol(agent.balanceSol, 4)} SOL</b>.</p>
      <div class="seg" id="w-mode"><button class="on" data-m="amount">Amount</button><button data-m="all">Everything</button></div>
      <div class="field" id="w-amt-f"><label for="w-amt">Amount</label><div class="input-affix suf"><input class="input" id="w-amt" type="number" min="0.001" step="0.01" inputmode="decimal" placeholder="0.10"><span class="suf-t">SOL</span></div></div>
      <p class="note" id="w-all-note" hidden><b>Everything</b> pauses the agent, sells all open positions at market, then sends all SOL to you.</p>
      <div class="err" id="w-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="w-go">Sign and withdraw</button>`);
    let all = false;
    m.body.querySelector('#w-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      all = b.dataset.m === 'all';
      m.body.querySelectorAll('#w-mode button').forEach((x) => x.classList.toggle('on', x === b));
      m.body.querySelector('#w-amt-f').hidden = all;
      m.body.querySelector('#w-all-note').hidden = !all;
    });
    m.body.querySelector('#w-go').addEventListener('click', async () => {
      const err = m.body.querySelector('#w-err');
      const btn = m.body.querySelector('#w-go');
      const amountSol = Number(m.body.querySelector('#w-amt').value);
      if (!all && !(amountSol > 0)) { err.hidden = false; err.textContent = 'Enter an amount.'; return; }
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('withdraw', agent.wallet, [`Amount: ${all ? 'all' : amountSol + ' SOL'}`]));
        btn.textContent = all ? 'Selling positions + sending…' : 'Sending…';
        const r = await api.withdraw(agent.id, { all, amountSol, ...auth });
        m.close();
        toast(`<b>Withdrew ${sol(r.amount, 4)} SOL</b><a class="ext" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">View transaction ↗</a>${r.notes?.length ? '<br>' + esc(r.notes.join(' ')) : ''}`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Withdrawal failed.';
        btn.disabled = false; btn.textContent = 'Sign and withdraw';
      }
    });
  }

  // ── Shill on X: pick a coin, get a ready-made post, open X with it ──
  function shillModal(agentId) {
    const snap = api.snapshot;
    const site = (api.config.siteUrl || location.origin).replace(/\/+$/, '');
    const agents = snap.agents.filter((a) => a.coin?.mint && a.status !== 'EXPIRED' && a.status !== 'LAUNCH_FAILED')
      .sort((a, b) => (b.id === agentId) - (a.id === agentId) || b.pnlPct - a.pnlPct);
    const ca = api.config.contractAddress || '';
    const opts = agents.map((a) => `<option value="${esc(a.id)}">${esc('$' + a.coin.ticker + ' · ' + agentNo(a.no) + ' ' + a.name)}</option>`).join('');
    let variant = 0;
    const lines = (a) => {
      if (!a) {
        const L = [
          `Launch a coin on TEKKWORK and it gets its own AI agent with its own Solana wallet. It trades real SOL 24/7 and keeps all the creator fees.\n\nYour agent does the team work.${ca ? `\n\nCA: ${ca}` : ''}\n${site}`,
          `Every coin on TEKKWORK hires its own trader: own wallet, fixed rules, every trade public on-chain.\n\nLaunch one, let it work.${ca ? `\n\nCA: ${ca}` : ''}\n${site}`,
        ];
        return L[variant % L.length];
      }
      const url = `${site}/#/agent/${a.no}`;
      const pnl = a.depositedSol > 0 ? `${a.pnlPct >= 0 ? '+' : ''}${(a.pnlPct * 100).toFixed(1)}%` : 'just clocked in';
      const L = [
        `$${a.coin.ticker} has its own AI agent doing the team work.\n\n${agentNo(a.no)} · ${a.name}: ${pnl}, ${a.trades} trades, every one on-chain.\n\nCA: ${a.coin.mint}\n${url}`,
        `$${a.coin.ticker} is not just a coin. Its agent ${a.name} trades real SOL 24/7 and every creator fee goes back into the bag.\n\nCA: ${a.coin.mint}\n${url}`,
        `Buy $${a.coin.ticker}, watch its agent work.\n\nOwn wallet. Fixed rules. Public P&L (${pnl}).\n\nCA: ${a.coin.mint}\n${url}`,
      ];
      return L[variant % L.length];
    };
    const m = modal('Shill on X', `
      <div class="shill-head">${avatar('crew-shill', 56)}<p>The shiller writes the post, you hit send. Nothing is posted until you confirm it on X.</p></div>
      <div class="field"><label for="s-coin">Coin</label>
        <select class="input" id="s-coin">${opts}<option value="">TEKKWORK itself</option></select></div>
      <div class="field"><label for="s-text">Post</label><textarea class="textarea" id="s-text" rows="7" maxlength="560"></textarea>
        <div class="hint"><span id="s-count"></span> · <button type="button" class="copy" id="s-new">Write another</button></div></div>
      <button class="btn btn-primary btn-block btn-lg" id="s-go" type="button">${ICONS.x}<span>Post on X</span></button>`);
    const sel = m.body.querySelector('#s-coin');
    const ta = m.body.querySelector('#s-text');
    const count = () => { m.body.querySelector('#s-count').textContent = ta.value.length + ' / 280'; };
    const fill = () => { ta.value = lines(agents.find((a) => a.id === sel.value)); count(); };
    if (agentId && agents.some((a) => a.id === agentId)) sel.value = agentId;
    fill();
    sel.addEventListener('change', () => { variant = 0; fill(); });
    ta.addEventListener('input', count);
    m.body.querySelector('#s-new').addEventListener('click', () => { variant += 1; fill(); });
    m.body.querySelector('#s-go').addEventListener('click', () => {
      window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(ta.value.trim()), '_blank', 'noopener');
      m.close();
      toast('<b>Post ready on X</b>Hit Post there to send it.', 'crew-shill');
    });
  }

  // ── ticker tape ──
  let tapeKey = '';
  function paintTape(tokens) {
    const list = tokens.slice().sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 24);
    const key = list.map((t) => t.mint).join(',');
    if (key === tapeKey) {
      const by = Object.fromEntries(list.map((t) => [t.mint, t]));
      document.querySelectorAll('#tape .tape-item').forEach((n) => {
        const t = by[n.dataset.m]; if (!t) return;
        n.querySelector('.p').textContent = price(t.priceUsd);
        const c = n.querySelector('.c'); c.textContent = pct(t.change1h); c.className = 'c ' + tone(t.change1h);
      });
      return;
    }
    tapeKey = key;
    if (!list.length) { $('#tape').innerHTML = '<span class="tape-item">Loading live Solana prices…</span>'; return; }
    const item = (t) => `<span class="tape-item" data-m="${t.mint}"><b>$${esc(t.symbol)}</b><span class="p">${price(t.priceUsd)}</span><span class="c ${tone(t.change1h)}">${pct(t.change1h)}</span></span>`;
    const one = list.map(item).join('<span class="tape-sep">/</span>');
    $('#tape').innerHTML = one + '<span class="tape-sep">/</span>' + one + '<span class="tape-sep">/</span>';
  }
  paintTape(api.snapshot.tokens);

  // ── router ──
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [a, b] = h.split('/');
    if (a === 'agent' && b) return { name: 'agent', id: decodeURIComponent(b) };
    if (['agents', 'tokens', 'launch', 'how', 'skins'].includes(a)) return { name: a };
    return { name: 'home' };
  }
  function route() {
    page?.destroy?.();
    const r = parse();
    page = r.name === 'agent' ? AgentPage(ctx, r.id) : r.name === 'agents' ? AgentsPage(ctx) : r.name === 'tokens' ? TokensPage(ctx) : r.name === 'launch' ? LaunchPage(ctx) : r.name === 'how' ? HowPage(ctx) : r.name === 'skins' ? SkinsPage(ctx) : HomePage(ctx);
    page.mount($('#page'), api.snapshot);
    if (api.config.preview) document.querySelectorAll('#page .live').forEach(el => { el.textContent = 'SAMPLE'; });
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (r.name === 'agent' ? 'agents' : r.name)));
    if (innerWidth < 900) document.querySelector('#nav a.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.title = r.name === 'home' ? 'TEKKWORK · your agents do the team work' : 'TEKKWORK · ' + ({ agent: 'Agent', agents: 'Agents', tokens: 'Tokens', launch: 'Launch', how: 'How it works', skins: 'Skins' })[r.name];
    window.scrollTo(0, 0);
  }
  addEventListener('hashchange', route);

  api.onUpdate((snap) => { page?.update?.(snap); paintTape(snap.tokens); });
  api.onTrade((t) => page?.onTrade?.(t));
  api.onBonded((b) => page?.onBonded?.(b));
  api.onEvent((type, p) => {
    if (type === 'reward') {
      toast(`<b>Reward paid: ${sol(p.amountSol, 3)} SOL</b>${esc(p.agentName)} reached ${esc(p.level)}. <a class="ext" href="https://solscan.io/tx/${esc(p.sig)}" target="_blank" rel="noopener">View tx ↗</a>`);
    }
    if (type === 'levelup') {
      toast(`<b>PROMOTED: ${esc(p.agentName)}</b>${esc(p.from)} → <b>${esc(p.to)}</b> (level ${p.no})${p.rewardSol > 0 ? `<br>Reward on its way: <b>${sol(p.rewardSol, 3)} SOL</b>` : ''}`, p.avatarSeed);
      page?.onLevelUp?.(p);
    }
    if (type === 'skin') {
      toast(`<b>New skin: ${esc(p.skinName)}</b>${esc(p.agentName)} got a new look.`, p.avatarSeed);
    }
    if (type === 'launch') {
      setTimeout(() => {
        const ag = api.snapshot.agents.find((x) => x.id === p.agentId);
        if (ag) toast(`<b>${agentNo(ag.no)} · ${esc(ag.name)} launched</b>$${esc(ag.coin?.ticker || '')} is live on pump.fun`, ag.avatarSeed);
        page?.onLaunch?.();
      }, 3500);
    }
  });

  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-ago]').forEach((n) => { n.textContent = ago(+n.dataset.ago, now); });
    document.querySelectorAll('[data-countdown]').forEach((n) => {
      const s = Math.round((+n.dataset.countdown - now) / 1000);
      n.textContent = s > 0 ? `Next decision in ${s}s` : 'Thinking…';
    });
    document.querySelectorAll('[data-countdown-plain]').forEach((n) => {
      const s = Math.round((+n.dataset.countdownPlain - now) / 1000);
      n.textContent = s > 90 ? `in ${Math.round(s / 60)} min` : s > 0 ? `in ${s}s` : 'now';
    });
  }, 1000);

  document.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied'; }
      catch { c.textContent = 'Select + copy'; }
      setTimeout(() => (c.textContent = 'Copy'), 1400);
      return;
    }
    const row = e.target.closest('[data-go]');
    if (row && !e.target.closest('a,button')) ctx.navigate(row.dataset.go);
  });

  $('#theme-btn').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('tw_theme', next);
    paintThemeBtn();
  });

  // ── contract address chip (set in config.js → site.contractAddress) ──
  const COPY_ICON = '<svg class="ca-copy" viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="5" height="1"/><rect x="0" y="0" width="1" height="5"/><rect x="2" y="2" width="6" height="1"/><rect x="2" y="7" width="6" height="1"/><rect x="2" y="2" width="1" height="6"/><rect x="7" y="2" width="1" height="6"/></svg>';
  function paintCA() {
    const ca = api.config?.contractAddress || '';
    const b = $('#ca-chip');
    b.classList.toggle('soon', !ca);
    b.dataset.ca = ca;
    b.title = ca ? `Contract address ${ca} · click to copy` : 'Contract address: coming soon';
    b.setAttribute('aria-label', ca ? `Copy contract address ${ca}` : 'Contract address coming soon');
    b.innerHTML = `<span class="ca-tag">CA</span><span class="ca-val">${ca ? esc(short(ca, 5)) : 'Coming soon'}</span>${ca ? COPY_ICON : ''}`;
  }
  paintCA();
  api.onUpdate(paintCA);
  $('#ca-chip').addEventListener('click', async () => {
    const ca = $('#ca-chip').dataset.ca;
    if (!ca) return;
    try {
      await navigator.clipboard.writeText(ca);
      toast(`<b>Contract address copied</b><span class="mono">${esc(ca)}</span>`);
    } catch {
      window.prompt('Copy the contract address:', ca);
    }
  });

  $('#nav-shill').addEventListener('click', () => shillModal());
  paintWallet();
  restoreWallet();
  route();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">TEKKWORK could not start: ${esc(e.message)}</div></div></div>`;
});
