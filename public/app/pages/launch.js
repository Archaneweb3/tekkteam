import { robotSVG, robotPNG, robotTraits } from '../robot.js';
import { esc, sol, pct, short, pixIcon, STRAT_ICONS, strategyById, strategyRules, stratIcon, stratKey } from '../ui.js';
import { wallet, sendSol } from '../wallet.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newSeed = () => 'r' + Math.random().toString(36).slice(2, 10);

const ICON_SHUFFLE = pixIcon(['....#..', '#######', '....#..', '.......', '..#....', '#######', '..#....']);
const ICON_BACK = pixIcon(['.......', '..#....', '.##....', '#######', '.##....', '..#....', '.......']);
const DESK_SIZE = 5;
const newDesk = () => Array.from({ length: DESK_SIZE }, newSeed);

export function LaunchPage(app) {
  const cfg = app.api.config;
  // the picker shows a desk of 5 bots; the creator clicks one, or asks for a new desk
  let desk = newDesk();
  let pick = 2;
  const pastDesks = [];
  let deskNo = 1;
  const f = { image: null, name: '', ticker: '', description: '', twitter: '', website: '', agentName: '', capital: cfg.launch.defaultStartingCapital, botSeed: desk[pick], strategy: cfg.defaultStrategy || 'classic' };
  let slideDir = 0;
  let el;

  // The robot only changes when the user clicks NEW ROBOT / BACK, never while typing
  const previewBot = () => robotSVG(f.botSeed);
  const standBot = () => robotSVG(f.botSeed, { stand: true });
  // carousel: the chosen worker big in the middle, neighbours peeking in from the sides
  const at = (k) => desk[(k + DESK_SIZE) % DESK_SIZE];
  const deskHTML = (fresh) => `
    <button type="button" class="dp-arrow prev" id="l-prev" aria-label="Previous worker">‹</button>
    <div class="dp-stage${fresh ? ' drop' : ''}">
      <button type="button" class="dp-side left" data-step="-1" tabindex="-1" aria-hidden="true">${robotSVG(at(pick - 1), { stand: true })}</button>
      <div class="dp-main${slideDir ? (slideDir > 0 ? ' in-right' : ' in-left') : ''}" aria-live="polite" aria-label="Worker ${pick + 1} of ${DESK_SIZE}">${robotSVG(f.botSeed, { stand: true })}</div>
      <button type="button" class="dp-side right" data-step="1" tabindex="-1" aria-hidden="true">${robotSVG(at(pick + 1), { stand: true })}</button>
    </div>
    <button type="button" class="dp-arrow next" id="l-next" aria-label="Next worker">›</button>
    <div class="dp-dots" aria-hidden="true">${desk.map((_, i) => `<span class="${i === pick ? 'on' : ''}"></span>`).join('')}</div>`;
  let mine = null; // the connected wallet's own custom strategy
  const stratCard = (st) => {
    const on = st.id === f.strategy;
    return `<button type="button" role="radio" aria-checked="${on}" class="strat-opt strat-${esc(stratKey(st))}${on ? ' on' : ''}" data-s="${esc(st.id)}">
      <span class="so-ic">${stratIcon(st)}</span>
      <span class="so-t"><b>${esc(st.name)}</b><small>${esc(st.custom ? 'Your custom strategy' : st.tagline)}</small></span>
      <span class="so-nums"><span>${Math.round(st.sizePct * 100)}%<i>size</i></span><span class="up">${pct(st.takeProfitPct, 0)}<i>TP</i></span><span class="down">${pct(st.stopLossPct, 0)}<i>SL</i></span><span>${st.maxHoldMin ? st.maxHoldMin + 'm' : '∞'}<i>hold</i></span></span>
    </button>`;
  };
  const stratHTML = () => (cfg.strategies || []).map(stratCard).join('') + (cfg.customEnabled === false ? '' : mine
    ? stratCard(mine).replace('</button>', `<span class="cust-edit" data-edit="1" role="button" tabindex="0">Edit</span></button>`)
    : `<button type="button" class="strat-opt strat-custom cust-build" data-build="1">
        <span class="so-ic">${STRAT_ICONS.custom}</span>
        <span class="so-t"><b>Build your own</b><small>Sliders + your own name</small></span>
        <span class="cust-plus">+</span>
      </button>`);
  const stratInfoHTML = () => { const st = strategyById(cfg, f.strategy, [mine]); return st ? `<b>${esc(st.name)}:</b> ${esc(st.goal)}` : ''; };
  const infoHTML = () => { const t = robotTraits(f.botSeed); return `<b>Worker ${pick + 1} of ${DESK_SIZE}</b><span>${t.outfit}</span><span>${t.hair}</span>${t.gear ? `<span>${t.gear}</span>` : ''}<span class="dp-hint">It becomes your agent and, unless you upload one, your coin logo.</span>`; };
  const logoHTML = () => (f.image ? `<img src="${f.image}" alt="Coin logo">` : previewBot());
  const total = () => Math.round(((Number(f.capital) || 0) + cfg.launch.launchReserveSol) * 10000) / 10000;

  function previewHTML() {
    const img = `<span class="av av-56">${logoHTML()}</span>`;
    return `
      <div class="preview-stage">
        <span class="av av-120 stand" style="width:96px">${standBot()}</span>
        <div style="min-width:0">
          <div class="agent-tag">AGENT ### · YOUR NEW HIRE</div>
          <div class="pv-name">${esc(f.agentName || 'Your agent')}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="pill pill-active">ACTIVE</span><span class="chip">$${esc(f.ticker || 'TICKER')}</span></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;align-items:center">${img}<div style="min-width:0"><b style="overflow-wrap:anywhere">${esc(f.name || 'Coin name')}</b> <span class="muted">$${esc(f.ticker || 'TICKER')}</span><div class="note" style="overflow-wrap:anywhere">${esc(f.description || 'Your coin description shows on pump.fun and on the agent page.')}</div></div></div>
      <dl class="kv">
        <dt>Starting capital</dt><dd>${sol(Number(f.capital) || 0, 3)} SOL</dd>
        <dt>Launch reserve</dt><dd>${sol(cfg.launch.launchReserveSol, 3)} SOL</dd>
        <dt><b>You send</b></dt><dd><b>${sol(total(), 4)} SOL</b></dd>
        ${(() => { const st = strategyById(cfg, f.strategy, [mine]); return st ? `<dt>Strategy</dt><dd>${esc(st.name)}</dd>` + strategyRules(st).slice(0, 4).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') : ''; })()}
        <dt>Creator fees</dt><dd>${cfg.fees.creatorSharePct > 0 ? `${Math.round(cfg.fees.creatorSharePct * 100)}% you · ${Math.round((1 - cfg.fees.creatorSharePct) * 100)}% agent` : '100% to the agent'}</dd>
      </dl>
      <p class="note">The launch reserve pays for creating the coin on pump.fun. Whatever is left over stays in the agent wallet as trading capital.</p>
      <p class="note">The worker above is exactly how your agent looks. Use <b>New crew</b> in the form for more workers.</p>`;
  }

  const field = (id, label, input, hint = '') => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err" id="${id}-err" hidden></div></div>`;

  function html() {
    const off = !cfg.launchEnabled;
    return `<div class="wrap">
      <div class="page-head"><div><h1>Launch coin + agent</h1><p>Explore the reference launch flow and agent creator. This frontend preview does not create coins or accept SOL.</p></div></div>
      ${off ? `<div class="card" style="padding:14px 18px;border-color:var(--line-strong)"><b>Preview only.</b> <span class="muted">Launch and wallet actions are unavailable until the authorized backend is connected.</span></div>` : ''}
      <div class="launch">
        <form class="card form" id="l-form" novalidate>
          <div class="fieldset">
            <div class="fieldset-title">Coin</div>
            <div class="field"><label>Agent character + coin logo</label>
              <div class="desk-picker">
                <div class="dp-head">
                  <span class="pix dp-title">Hire your agent</span>
                  <span class="dp-no" id="l-desk-no">CREW 01</span>
                  <div class="dp-actions">
                    <button type="button" class="btn btn-sm" id="l-desk-back" disabled aria-label="Previous crew">${ICON_BACK}<span>Back</span></button>
                    <button type="button" class="btn btn-sm btn-primary" id="l-desk-new">${ICON_SHUFFLE}<span>New crew</span></button>
                  </div>
                </div>
                <div class="dp-carousel" id="l-desk" tabindex="0" aria-label="Workers: use the arrows to switch">${deskHTML()}</div>
                <div class="dp-shelf" aria-hidden="true"></div>
                <div class="dp-info" id="l-desk-info">${infoHTML()}</div>
              </div>
              <div class="logo-row">
                <span class="av av-42" id="l-logo">${logoHTML()}</span>
                <div style="min-width:0">
                  <div style="font-weight:700;font-size:13.5px">Coin logo: <span id="l-logo-src">your agent</span></div>
                  <div class="hint"><label for="l-image" class="ext" style="cursor:pointer">Upload my own logo</label> · PNG, JPG or GIF, up to 1 MB <button type="button" class="copy" id="l-logo-reset" hidden>Use my agent</button></div>
                </div>
              </div>
              <input id="l-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="sr">
              <div class="err" id="l-image-err" hidden></div>
            </div>
            <div class="row2">
              ${field('l-name', 'Coin name', `<input class="input" id="l-name" maxlength="32" placeholder="e.g. James Bond" autocomplete="off">`)}
              ${field('l-ticker', 'Ticker', `<div class="input-affix"><span class="pre">$</span><input class="input" id="l-ticker" maxlength="10" placeholder="BOND" autocomplete="off" style="text-transform:uppercase"></div>`)}
            </div>
            ${field('l-desc', 'Description', `<textarea class="textarea" id="l-desc" maxlength="280" placeholder="What is this coin about?"></textarea>`, 'Optional · up to 280 characters')}
            <div class="row2">
              ${field('l-tw', 'Twitter / X', `<input class="input" id="l-tw" maxlength="120" placeholder="https://x.com/…" autocomplete="off">`, 'Optional')}
              ${cfg.siteUrl
                ? field('l-web', 'Website on pump.fun', `<div class="input locked" id="l-web" title="Set automatically">${esc(cfg.siteUrl.replace(/^https?:\/\//, ''))}/#/agent/…</div>`, 'Set automatically: links your coin to its agent here')
                : field('l-web', 'Website', `<input class="input" id="l-web" maxlength="160" placeholder="https://" autocomplete="off">`, 'Optional')}
            </div>
          </div>
          <div class="fieldset">
            <div class="fieldset-title">Agent</div>
            ${field('l-agent', 'Agent name', `<input class="input" id="l-agent" maxlength="24" placeholder="e.g. James Bond 007" autocomplete="off">`)}
            ${field('l-cap', 'Starting agent capital', `<div class="input-affix suf"><input class="input" id="l-cap" type="number" step="0.01" min="${cfg.launch.minStartingCapital}" ${cfg.launch.maxStartingCapital ? `max="${cfg.launch.maxStartingCapital}"` : ''} value="${f.capital}" inputmode="decimal"><span class="suf-t">SOL</span></div>
              <div class="presets" id="l-presets">${cfg.launch.capitalPresets.map((v) => `<button type="button" data-v="${v}" class="${v === f.capital ? 'on' : ''}">${v} SOL</button>`).join('')}</div>`,
              `Sent from your wallet to the agent's own wallet. Minimum ${cfg.launch.minStartingCapital} SOL. <b>This is real SOL and the agent trades it.</b>`)}
          </div>
          <div class="fieldset">
            <div class="fieldset-title">Strategy</div>
            <div class="field"><label>How should your agent trade?</label>
              <div class="strat-grid" id="l-strat" role="radiogroup" aria-label="Trading strategy">${stratHTML()}</div>
              <p class="hint strat-info" id="l-strat-info">${stratInfoHTML()}</p>
              <p class="hint">You can switch strategy later from the agent page (creator wallet only).</p>
            </div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" id="l-submit" ${off ? 'disabled' : ''}>LAUNCH COIN + AGENT</button>
          <p class="note" style="text-align:center" id="l-from">${wallet.address ? 'Launching from <b>' + esc(short(wallet.address, 4)) + '</b>' + (wallet.name ? ' (' + esc(wallet.name) + ')' : '') : 'You will connect your wallet and approve one SOL transfer.'}</p>
        </form>
        <aside class="preview">
          <section class="card preview-card" id="l-preview">${previewHTML()}</section>
          <section class="card preview-card">
            <div class="agent-tag">WHAT HAPPENS WHEN YOU CLICK</div>
            <ul class="checklist">
              <li>Your agent and its own Solana wallet are created on the server</li>
              <li>Your wallet asks you to send the starting capital + launch reserve to that wallet</li>
              <li>The agent creates your coin on pump.fun, so the agent is the coin's creator${cfg.siteUrl ? `. The coin's website on pump.fun links to its agent page on ${esc(cfg.siteUrl.replace(/^https?:\/\//, ''))}` : ''}</li>
              <li>${cfg.fees.creatorSharePct > 0 ? `Creator fees are claimed automatically: ${Math.round(cfg.fees.creatorSharePct * 100)}% to your wallet, ${Math.round((1 - cfg.fees.creatorSharePct) * 100)}% stays with the agent` : "The coin's creator fees are claimed automatically and all of them go to the agent, so it keeps trading"}</li>
              <li>The agent starts trading real SOL, in public. You can pause it or withdraw any time.</li>
            </ul>
          </section>
          <section class="card preview-card"><p class="note"><b>Risk:</b> memecoins are extremely volatile. The agent can lose some or all of its SOL. Only send what you can afford to lose.</p></section>
        </aside>
      </div>
    </div>`;
  }

  const q = (s) => el.querySelector(s);
  const refresh = () => { q('#l-preview').innerHTML = previewHTML(); };
  const paintBot = (animate) => {
    q('#l-desk').innerHTML = deskHTML(animate === 'desk');
    q('#l-desk-info').innerHTML = infoHTML();
    q('#l-desk-no').textContent = 'CREW ' + String(deskNo).padStart(2, '0');
    q('#l-desk-back').disabled = !pastDesks.length;
    q('#l-logo').innerHTML = logoHTML();
    q('#l-logo-src').textContent = f.image ? 'your upload' : 'your agent';
    q('#l-logo-reset').hidden = !f.image;
    refresh();
  };
  const setErr = (id, msg) => { const e = q('#' + id + '-err'); if (!e) return; e.hidden = !msg; e.textContent = msg || ''; };

  function validate() {
    let ok = true;
    const need = (id, cond, msg) => { setErr(id, cond ? '' : msg); if (!cond) ok = false; };
    need('l-name', f.name.trim().length >= 1, 'Give your coin a name.');
    need('l-ticker', /^[A-Z0-9]{2,10}$/.test(f.ticker), 'Ticker must be 2–10 letters or numbers.');
    need('l-agent', f.agentName.trim().length >= 1, 'Give your agent a name.');
    const c = Number(f.capital);
    const max = cfg.launch.maxStartingCapital;
    need('l-cap', c >= cfg.launch.minStartingCapital && (!max || c <= max), `Enter at least ${cfg.launch.minStartingCapital} SOL${max ? ` and at most ${max} SOL` : ''}.`);
    return ok;
  }

  async function onImage(file) {
    setErr('l-image', '');
    if (!file) return;
    if (file.size > 1024 * 1024) return setErr('l-image', 'That image is over 1 MB. Pick a smaller one.');
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = new Image();
    img.onload = () => {
      const s = 512, c = document.createElement('canvas');
      c.width = s; c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      f.image = c.toDataURL('image/png');
      if (f.image.length > 1_300_000) f.image = c.toDataURL('image/jpeg', 0.9);
      paintBot(false);
    };
    img.onerror = () => setErr('l-image', 'Could not read that image. Try a PNG or JPG.');
    img.src = url;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) { el.querySelector('.err:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const capital = Number(f.capital);
    const steps = ['Connect wallet', 'Create agent + agent wallet', `Send ${sol(total(), 4)} SOL to the agent`, 'Confirm the transfer on-chain', 'Upload coin image + metadata', 'Create the coin on pump.fun', 'Agent is live'];
    const prog = app.progressModal('Launching $' + f.ticker, steps);
    let prep = null;
    try {
      prog.step(0);
      if (!wallet.address) {
        const addr = await app.openConnect();
        if (!addr) { prog.fail(0, 'Your wallet is not connected.'); return; }
      }
      prog.step(1);
      prep = await app.api.prepareLaunch({
        creator: wallet.address,
        coin: { name: f.name.trim(), ticker: f.ticker, description: f.description.trim(), twitter: f.twitter.trim(), website: f.website.trim() },
        agentName: f.agentName.trim(),
        startingCapital: capital,
        image: f.image || robotPNG(f.botSeed),
        avatarSeed: f.botSeed,
        strategy: f.strategy,
      });

      prog.step(2);
      prog.note(`<p>Your agent's wallet: <code class="mono">${esc(prep.wallet)}</code></p>
        <p>Send <b>${sol(prep.requiredSol, 4)} SOL</b>: ${sol(capital, 3)} SOL starting capital + ${sol(cfg.launch.launchReserveSol, 3)} SOL launch reserve.</p>`);
      await prog.ask(`Send ${sol(prep.requiredSol, 4)} SOL with ${wallet.name || 'your wallet'}`);
      let signature;
      try {
        signature = await sendSol(prep.wallet, prep.requiredSol, app.api.blockhash);
      } catch (err) {
        prog.fail(2, (err.message || 'Transfer was rejected in the wallet.') + ' Nothing was sent. You can also send the SOL to the wallet above within 30 minutes and the launch continues automatically.');
        return;
      }
      prog.note(`<p>Transfer sent: <a class="ext mono" href="https://solscan.io/tx/${esc(signature)}" target="_blank" rel="noopener">${esc(short(signature, 6))} ↗</a></p>`);

      prog.step(3);
      let r = await app.api.confirmFunding(prep.agentId, signature);
      // wait for the server to launch the coin
      const start = Date.now();
      let d = null;
      while (Date.now() - start < 4 * 60_000) {
        d = await app.api.getAgent(prep.agentId).catch(() => null);
        const st = d?.rawStatus;
        if (st === 'AWAITING_FUNDS') { prog.step(3); if (Date.now() - start > 30000) r = await app.api.confirmFunding(prep.agentId, signature).catch(() => r); }
        else if (st === 'LAUNCHING') prog.step(d.coin?.uri ? 5 : 4);
        else if (st === 'ACTIVE') break;
        else if (st === 'LAUNCH_FAILED') throw new Error('Coin creation failed: ' + (d.error || 'unknown error') + '. Your SOL is safe in the agent wallet: open the agent page to retry or withdraw.');
        await sleep(2500);
      }
      if (d?.rawStatus !== 'ACTIVE') {
        prog.failCurrent('This is taking longer than usual. The server keeps trying; check the agent page in a minute.');
        prog.link('Open agent page', () => app.navigate('#/agent/' + (d?.no || prep.agentId)));
        return;
      }
      prog.step(steps.length);
      prog.note(`<p>Coin: <a class="ext" href="https://pump.fun/coin/${esc(d.coin.mint)}" target="_blank" rel="noopener">view on pump.fun ↗</a> · <a class="ext" href="https://solscan.io/tx/${esc(d.coin.launchSig)}" target="_blank" rel="noopener">launch tx ↗</a></p>`);
      prog.done(`Agent ${String(d.no).padStart(3, '0')} is live`, () => app.navigate('#/agent/' + d.no));
    } catch (err) {
      prog.failCurrent(err.message || 'Launch failed.');
      if (prep) prog.link('Open agent page', () => app.navigate('#/agent/' + prep.agentId));
    }
  }

  function paintStrat() {
    if (!el) return;
    q('#l-strat').innerHTML = stratHTML();
    q('#l-strat-info').innerHTML = stratInfoHTML();
    refresh();
  }
  function loadMine() {
    const addr = wallet.address;
    if (!addr || cfg.customEnabled === false) { if (mine) { if (f.strategy === mine.id) f.strategy = cfg.defaultStrategy || 'classic'; mine = null; paintStrat(); } return; }
    app.api.getCustom(addr).then((c) => {
      if (wallet.address !== addr) return;
      if (mine && f.strategy === mine.id && !c) f.strategy = cfg.defaultStrategy || 'classic';
      mine = c; paintStrat();
    }).catch(() => {});
  }

  return {
    mount(root) {
      el = root;
      el.innerHTML = html();
      loadMine();
      const bindText = (id, key, fn = (v) => v) => q(id).addEventListener('input', (e) => { f[key] = fn(e.target.value); setErr(id.slice(1), ''); refresh(); });
      bindText('#l-name', 'name');
      bindText('#l-ticker', 'ticker', (v) => v.replace(/[^a-z0-9]/gi, '').toUpperCase());
      bindText('#l-desc', 'description');
      bindText('#l-tw', 'twitter');
      bindText('#l-web', 'website');
      bindText('#l-agent', 'agentName');
      q('#l-ticker').addEventListener('blur', (e) => { e.target.value = f.ticker; });
      q('#l-cap').addEventListener('input', (e) => {
        f.capital = e.target.value; setErr('l-cap', '');
        el.querySelectorAll('#l-presets button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(f.capital)));
        refresh();
      });
      q('#l-presets').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        f.capital = Number(b.dataset.v); q('#l-cap').value = f.capital;
        el.querySelectorAll('#l-presets button').forEach((x) => x.classList.toggle('on', x === b));
        refresh();
      });
      q('#l-image').addEventListener('change', (e) => onImage(e.target.files[0]));
      const choose = (i, focus, dir = 0) => {
        pick = (i + DESK_SIZE) % DESK_SIZE; f.botSeed = desk[pick]; slideDir = dir; paintBot(false); slideDir = 0;
      };
      q('#l-desk').addEventListener('click', (e) => {
        const b = e.target.closest('.dp-arrow, .dp-side'); if (!b) return;
        const step = b.classList.contains('prev') ? -1 : b.classList.contains('next') ? 1 : +b.dataset.step;
        choose(pick + step, false, step);
      });
      q('#l-desk').addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); choose(pick + d, false, d); }
      });
      // swipe on phones
      let sx = null;
      q('#l-desk').addEventListener('pointerdown', (e) => { sx = e.clientX; });
      q('#l-desk').addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) choose(pick + (dx < 0 ? 1 : -1), false, dx < 0 ? 1 : -1); });
      q('#l-strat').addEventListener('click', (e) => {
        const b = e.target.closest('.strat-opt'); if (!b) return;
        if (b.dataset.build || e.target.closest('[data-edit]')) {
          app.strategyBuilder({ existing: mine || undefined, onSaved: (st) => { mine = st; f.strategy = st.id; paintStrat(); } });
          return;
        }
        f.strategy = b.dataset.s;
        q('#l-strat').innerHTML = stratHTML();
        q('#l-strat-info').innerHTML = stratInfoHTML();
        refresh();
      });
      q('#l-desk-new').addEventListener('click', () => { pastDesks.push({ desk, pick }); desk = newDesk(); deskNo += 1; f.botSeed = desk[pick]; paintBot('desk'); });
      q('#l-desk-back').addEventListener('click', () => { const p = pastDesks.pop(); if (!p) return; ({ desk, pick } = p); deskNo = Math.max(1, deskNo - 1); f.botSeed = desk[pick]; paintBot('desk'); });
      q('#l-logo-reset').addEventListener('click', () => { f.image = null; q('#l-image').value = ''; paintBot(false); });
      q('#l-form').addEventListener('submit', submit);
    },
    onWallet() { loadMine(); if (el) q('#l-from').innerHTML = wallet.address ? 'Launching from <b>' + esc(short(wallet.address, 4)) + '</b>' + (wallet.name ? ' (' + esc(wallet.name) + ')' : '') : 'You will connect your wallet and approve one SOL transfer.'; },
    update() {},
    destroy() { el = null; },
  };
}
