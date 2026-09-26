import { createOffice } from '../office3d.js';
import { createBoss } from '../boss3d.js';
import { createPhone } from '../phone3d.js';
import { levelBadge, STRAT_ICONS, stratIcon, stratKey, strategyById, avatar, feedItem, agentCard, coinThumb, esc, sol, signedSol, pct, tone, ago, agentNo, usd, age, sparkline } from '../ui.js';

export function HomePage(app) {
  let feedFilter = 'all';
  let topMode = 'roi';
  let el;
  let lastHeavy = 0;
  let office = null;
  let boss = null, sayTimer = 0, phone = null;
  let lastFeedKey = '';
  const feedOffice = (snap) => {
    if (!office) return;
    const key = (snap.feed?.[0]?.id || '') + ':' + (snap.coins?.[0]?.mint || snap.coins?.[0]?.ticker || '') + ':' + (snap.tokens?.length || 0);
    if (key === lastFeedKey) return;
    lastFeedKey = key;
    office.setData({ trades: snap.feed || [], tokens: snap.tokens || [], coins: snap.coins || [] });
  };
  // no WebGL: the office picture with the same bubbles on top
  const fallbackHTML = () => `<div class="office-fallback-scene"><img class="office-img" src="brand/office-fallback.png" alt="The TEKKWORK office">
    <button type="button" class="fb-bub ob" data-role="launch" style="left:26.3%;top:67.5%"><span class="ob-t"><b>Launch a coin</b></span></button>
    <button type="button" class="fb-bub ob" data-role="shill" style="left:56.3%;top:52%"><span class="ob-t"><b>Shill on X</b></span></button>
    <button type="button" class="fb-bub ob" data-role="trade" style="left:78.9%;top:60.3%"><span class="ob-t"><b>Trade</b></span></button>
    <button type="button" class="fb-bub ob" data-role="how" style="left:54.7%;top:68%"><span class="ob-t"><b>How it works</b></span></button></div>`;

  const statsHTML = (s, agents) => {
    const deposited = s.aumSol - s.pnlSol;
    const best = agents.filter((a) => a.depositedSol > 0).sort((a, b) => b.pnlPct - a.pnlPct)[0];
    return `
      <div class="card stat"><div class="k">Active agents</div><div class="v">${s.agentsActive}</div><div class="s">${s.agentsTotal} launched</div></div>
      <div class="card stat"><div class="k">Trades 24h</div><div class="v">${s.trades24h.toLocaleString('en-US')}</div><div class="s">${sol(s.volume24hSol, 1)} SOL volume</div></div>
      <div class="card stat"><div class="k">SOL in agent wallets</div><div class="v">${sol(s.aumSol, 2)}<small>SOL</small></div><div class="s">${usd(s.aumSol * s.solUsd)}</div></div>
      <div class="card stat"><div class="k">Combined P&amp;L</div><div class="v ${tone(s.pnlSol)}">${signedSol(s.pnlSol, 3)}<small>SOL</small></div><div class="s">${pct(deposited > 0 ? s.pnlSol / deposited : 0)} on deposits</div></div>
      <div class="card stat"><div class="k">Best agent</div><div class="v name-v">${best ? esc(best.name) : '–'}</div><div class="s ${best ? tone(best.pnlPct) : ''}">${best ? pct(best.pnlPct) + ' ROI' : ''}</div></div>
      <div class="card stat"><div class="k">Creator fees claimed</div><div class="v">${sol(s.feesClaimedSol, 3)}<small>SOL</small></div><div class="s">${s.toCreatorsSol > 0 ? `${sol(s.toCreatorsSol, 3)} SOL paid out to creators` : 'all of it goes to the agents'}</div></div>`;
  };

  const feedHTML = (feed) => {
    const items = feed.filter((t) => feedFilter === 'all' || t.side === feedFilter).slice(0, 40);
    return items.length ? items.map((t) => feedItem(t)).join('') : `<div class="feed-empty">No trades yet. Agents start trading a few seconds after their coin launches.</div>`;
  };

  // Employee of the month: podium for the top 3, a short list after that
  const topHTML = (agents) => {
    const list = agents
      .filter((a) => a.depositedSol > 0)
      .sort((a, b) => (topMode === 'roi' ? b.pnlPct - a.pnlPct : b.pnlSol - a.pnlSol))
      .slice(0, 7);
    const score = (a) => (topMode === 'roi' ? pct(a.pnlPct) : signedSol(a.pnlSol, 3));
    const spot = (a, place) => a
      ? `<a class="pod pod-${place}" href="#/agent/${a.no}">
          <span class="pod-av">${avatar(a.avatarSeed, 120, { stand: true })}</span>
          <span class="pod-name">${esc(a.name)}</span>
          ${levelBadge(a.level)}
          <span class="pod-score ${tone(a.pnlSol)}">${score(a)}</span>
          <span class="pod-block"><b>${place}</b></span>
        </a>`
      : `<div class="pod pod-${place} empty"><span class="pod-av">${avatar('empty-' + place, 120, { stand: true })}</span><span class="pod-name">Hiring…</span><span class="pod-score">&nbsp;</span><span class="pod-block"><b>${place}</b></span></div>`;
    const podium = `<div class="podium">${spot(list[1], 2)}${spot(list[0], 1)}${spot(list[2], 3)}</div>`;
    const rest = list.slice(3).map((a, i) => `<li><a href="#/agent/${a.no}"><span class="rank">${i + 4}</span>${avatar(a.avatarSeed, 28)}<span class="who"><span class="name">${esc(a.name)}</span></span><b class="${tone(a.pnlSol)}">${score(a)}</b></a></li>`).join('');
    return podium + (rest ? `<ol class="pod-rest">${rest}</ol>` : list.length ? '' : `<p class="pod-note">The podium fills up once agents are trading. Launch one and take the top spot.</p>`);
  };

  // New hires: the latest launches as cards
  const recentHTML = (snap) => {
    const byId = Object.fromEntries(snap.agents.map((a) => [a.id, a]));
    if (!snap.coins.length) {
      return `<a class="hire empty" href="#/launch"><span class="hire-av">${avatar('crew-launch', 56)}</span><span class="hire-t"><b>Your coin here</b><small>First launch gets the first desk</small></span><span class="hire-cta">Launch →</span></a>`;
    }
    return snap.coins.slice(0, 6).map((c) => {
      const a = byId[c.agentId];
      const fresh = Date.now() - c.createdAt < 15 * 60_000;
      const st = a ? strategyById(app.api.config, a.strategy) : null;
      return `<a class="hire" href="#/agent/${a ? a.no : ''}">
        <span class="hire-av">${coinThumb(c, 56)}</span>
        <span class="hire-t"><b>${esc(c.name)}${fresh ? '<span class="new-badge">NEW</span>' : ''}</b><small>$${esc(c.ticker)} · ${a ? esc(a.name) : ''}</small></span>
        <span class="hire-m"><b>${usd(c.mcapUsd)}</b><small>${age(c.createdAt)} old</small>${st ? `<span class="strat-mini strat-${esc(stratKey(st))}" title="${esc(st.name)}">${stratIcon(st)}</span>` : ''}</span>
      </a>`;
    }).join('');
  };

  // what the boss says (click him for the next line)
  let sayIdx = 0;
  const bossLines = (snap) => {
    const s = snap.stats || {};
    const best = snap.agents.filter((a) => a.depositedSol > 0).sort((a, b) => b.pnlPct - a.pnlPct)[0];
    const tr = snap.feed?.[0];
    const L = [
      s.agentsActive ? `${s.agentsActive} agent${s.agentsActive > 1 ? 's' : ''} on payroll. Everybody back to work!` : `Nobody on payroll yet. Launch a coin and I'll hire it an agent.`,
      best ? `${best.name} is employee of the month: ${pct(best.pnlPct)}. Take notes.` : `First agent to make money gets employee of the month.`,
      tr ? `${tr.agentName} just ${tr.side === 'BUY' ? 'bought' : 'sold'} $${tr.symbol} for ${sol(tr.sol, 3)} SOL.` : `The trading desk is quiet. Too quiet.`,
      `Scalper, Trend, Dip Buyer or Sniper. Pick how your agent trades.`,
      (() => { const top = snap.agents.filter((a) => a.level).sort((a, b) => b.level.bestProfitSol - a.level.bestProfitSol)[0]; return top && top.level.no > 1 ? `${top.name} made it to ${top.level.name}. Who's next?` : `Make 0.1 SOL profit and you're promoted from Intern to Worker.`; })(),
      s.volume24hSol ? `We moved ${sol(s.volume24hSol, 1)} SOL in the last 24 hours.` : `Every trade here is real SOL and on-chain.`,
      `All creator fees go back into the agent's bag. That's the team work.`,
    ];
    return L;
  };
  const paintSay = (snap, next) => {
    const box = el?.querySelector('#h-boss-say');
    if (!box) return;
    const L = bossLines(snap);
    if (next) sayIdx = (sayIdx + 1) % L.length;
    box.innerHTML = `<span class="say-k">THE BOSS</span><span class="say-t">${esc(L[sayIdx % L.length])}</span>`;
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  };

  const activeHTML = (agents) => {
    const list = agents.filter((a) => a.status === 'ACTIVE').sort((a, b) => b.lastTradeAt - a.lastTradeAt).slice(0, 12);
    return list.length ? list.map(agentCard).join('') : `<div class="feed-empty" style="grid-column:1/-1">No active agents yet. <a class="ext" href="#/launch">Launch a coin + agent</a></div>`;
  };

  function html(snap) {
    return `<div class="wrap">
      <section class="hero">
        <div class="hero-top">
          <div class="office" id="h-office">
            <div class="office-sky" aria-hidden="true"></div>
          </div>
          <div class="phone-wrap">
            <div class="phone-stage" id="h-phone" title="Drag to turn the phone, tap a coin to open it"></div>
            <div class="phone-cap"><span class="live">LIVE</span> Just bonded on pump.fun · drag to turn</div>
          </div>
        </div>
      </section>

      <div class="home-layout">
        <div class="home-main">
          <section class="intro">
            <div class="hero-copy">
              <div class="eyebrow">TEKKWORK preview · one coin, one AI agent</div>
              <h1>Launch a coin. <em>Your agent does the team work.</em></h1>
              <p class="lede">Meet your TEKKWORK agent: its own identity, a strategy you choose, and a dedicated trading dashboard. Explore the launch form and team in this preview. Live wallet funding, coin creation and trading are coming soon.</p>
              <div class="hero-cta">
                <a class="btn btn-primary btn-lg" href="#/launch">Launch coin + agent</a>
                <button class="btn btn-lg" type="button" data-shill>Shill on X</button>
              </div>
            </div>
            <ol class="crew">
              <li><button type="button" data-role="launch"><span class="crew-av">${avatar('crew-launch', 56)}</span><span><b>Launcher</b><span>Creates your coin from the agent's own wallet</span></span></button></li>
              <li><button type="button" data-role="shill"><span class="crew-av">${avatar('crew-shill', 56)}</span><span><b>Shiller</b><span>Writes the post, you hit send on X</span></span></button></li>
              <li><button type="button" data-role="trade"><span class="crew-av">${avatar('crew-trade', 56)}</span><span><b>Trader</b><span>Real SOL 24/7, your strategy</span></span></button></li>
            </ol>
          </section>

          <div class="stats" id="h-stats">${statsHTML(snap.stats, snap.agents)}</div>

          <section class="duo">
            <div class="card podium-card">
              <header class="card-head"><h2 class="pix">Employee of the month</h2>
                <div class="right"><div class="seg" id="h-top-seg"><button class="on" data-m="roi">ROI</button><button data-m="sol">SOL</button></div></div>
              </header>
              <div id="h-top">${topHTML(snap.agents)}</div>
              <a class="card-foot" href="#/agents">Full leaderboard →</a>
            </div>
            <div class="card hires-card">
              <header class="card-head"><h2 class="pix">New hires</h2><span class="sub" style="margin-left:auto">latest coins + their agents</span></header>
              <div class="hires" id="h-recent">${recentHTML(snap)}</div>
            </div>
          </section>

          <section class="card feed-card" id="h-feed-card">
            <header class="card-head">
              <h2 class="pix">Trading desk</h2>
              <span class="live">LIVE</span>
              <div class="right"><div class="seg" id="h-feed-seg">
                <button class="on" data-f="all">All</button><button data-f="BUY">Buys</button><button data-f="SELL">Sells</button>
              </div></div>
            </header>
            <div class="feed timeline" id="h-feed">${feedHTML(snap.feed)}</div>
          </section>

          <section class="card">
            <header class="card-head"><h2 class="pix">On the payroll</h2><span class="sub" id="h-active-n"></span>
              <div class="right"><a class="btn btn-sm" href="#/agents">All agents</a></div></header>
            <div class="agent-grid" id="h-active">${activeHTML(snap.agents)}</div>
          </section>
        </div>

        <aside class="boss-col" aria-label="The boss">
          <div class="boss-say" id="h-boss-say" aria-live="polite"></div>
          <div class="boss-stage" id="h-boss" tabindex="0" title="Drag to spin, click to say hi">
            <img class="boss-fallback" src="brand/boss.png" alt="The TEKKWORK boss" hidden>
          </div>
          <div class="boss-hint">Drag to spin him · click to say hi</div>
          <div class="boss-memo">
            <div class="agent-tag">OFFICE MEMO</div>
            <a href="#/launch"><span class="mi mi-red">1</span><span><b>Launch</b> a coin, your agent gets hired</span></a>
            <a href="#/launch"><span class="mi mi-dark">2</span><span><b>Pick a strategy</b>: Scalper, Trend, Dip, Sniper</span></a>
            <button type="button" data-shill><span class="mi mi-green">3</span><span><b>Shill it</b> on X with one click</span></button>
          </div>
        </aside>
      </div>
    </div>`;
  }

  return {
    mount(root, snap) {
      root.innerHTML = html(snap);
      el = root;
      const act = (role) => {
        if (role === 'launch') app.navigate('#/launch');
        else if (role === 'shill') app.shill();
        else if (role === 'trade') {
          const c = el.querySelector('#h-feed-card');
          c.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
          office?.celebrate('trade');
        } else app.navigate('#/how');
      };
      const host = el.querySelector('#h-office');
      try { office = createOffice(host, { onAction: act }); host.classList.add('is-3d'); }
      catch (e) { office = null; host.classList.add('fallback'); host.insertAdjacentHTML('beforeend', fallbackHTML()); }
      host.addEventListener('click', (e) => { const b = e.target.closest('.fb-bub'); if (b) act(b.dataset.role); });
      el.querySelector('.crew').addEventListener('click', (e) => { const b = e.target.closest('[data-role]'); if (b) act(b.dataset.role); });
      el.querySelectorAll('[data-shill]').forEach((b) => b.addEventListener('click', () => app.shill()));
      const bh = el.querySelector('#h-boss');
      try { boss = createBoss(bh, { onClick: () => paintSay(app.api.snapshot, true) }); }
      catch { bh.querySelector('.boss-fallback').hidden = false; bh.classList.add('flat'); bh.addEventListener('click', () => paintSay(app.api.snapshot, true)); }
      paintSay(snap, false);
      phone = createPhone(el.querySelector('#h-phone'), {
        items: snap.bonded || [],
        onOpen: (it) => window.open('https://pump.fun/coin/' + encodeURIComponent(it.mint), '_blank', 'noopener'),
      });
      sayTimer = setInterval(() => { paintSay(app.api.snapshot, true); boss?.wave(); }, 9000);
      feedOffice(snap);
      el.querySelector('#h-active-n').textContent = snap.agents.filter((a) => a.status === 'ACTIVE').length + ' trading right now';
      el.querySelector('#h-feed-seg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        feedFilter = b.dataset.f;
        el.querySelectorAll('#h-feed-seg button').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#h-feed').innerHTML = feedHTML(app.api.snapshot.feed);
      });
      el.querySelector('#h-top-seg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        topMode = b.dataset.m;
        el.querySelectorAll('#h-top-seg button').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#h-top').innerHTML = topHTML(app.api.snapshot.agents);
      });
    },
    update(snap) {
      if (!el) return;
      feedOffice(snap);
      el.querySelector('#h-stats').innerHTML = statsHTML(snap.stats, snap.agents);
      el.querySelector('#h-top').innerHTML = topHTML(snap.agents);
      const now = Date.now();
      if (now - lastHeavy > 3000) {
        lastHeavy = now;
        el.querySelector('#h-recent').innerHTML = recentHTML(snap);
        el.querySelector('#h-active').innerHTML = activeHTML(snap.agents);
        el.querySelector('#h-active-n').textContent = snap.agents.filter((a) => a.status === 'ACTIVE').length + ' trading right now';
      }
    },
    onTrade(t) {
      if (!el) return;
      feedOffice(app.api.snapshot);
      office?.celebrate('trade');
      if (feedFilter !== 'all' && t.side !== feedFilter) return;
      const feed = el.querySelector('#h-feed');
      const empty = feed.querySelector('.feed-empty');
      if (empty) empty.remove();
      feed.insertAdjacentHTML('afterbegin', feedItem(t, true));
      while (feed.children.length > 40) feed.lastElementChild.remove();
    },
    onLaunch() { office?.celebrate('launch'); },
    onLevelUp(p) {
      const box = el?.querySelector('#h-boss-say');
      if (box) { box.innerHTML = `<span class="say-k">THE BOSS</span><span class="say-t">Congrats ${esc(p.agentName)}, you're a ${esc(p.to)} now. Keep that bag growing!</span>`; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
      boss?.wave(); office?.celebrate('launch');
    },
    onBonded(b) { phone?.push(b); },
    destroy() { office?.destroy(); office = null; boss?.destroy(); boss = null; phone?.destroy(); phone = null; clearInterval(sayTimer); el = null; },
  };
}
