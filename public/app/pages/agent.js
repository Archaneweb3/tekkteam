import { createBoss } from '../boss3d.js';
import { robotSVG } from '../robot.js';
import { levelBadge, levelBar, strategyById, strategyChip, strategyRules, STRAT_ICONS, stratIcon, avatar, statusPill, sidePill, sourceChip, tokIcon, coinThumb, copyBtn, txLink, addrLink, esc, sol, signedSol, pct, tone, ago, agentNo, usd, short, age } from '../ui.js';
import { price, clockSec, dur } from '../format.js';
import { equityChart } from '../charts.js';
import { wallet } from '../wallet.js';
import { createPhone, phoneChrome, F, SW, SH, rr } from '../phone3d.js';

export function AgentPage(app, id) {
  let el, d = null, loading = false, lastFetch = 0, lastChart = 0, hovering = false, showAll = false, mode = null;
  const cfg = app.api.config;
  const rules = cfg.trading;
  const strat = () => strategyById(cfg, d?.strategy, [d?.customStrategy]) || { sizePct: rules.tradeSizePct, maxOpen: rules.maxOpenPositions, takeProfitPct: rules.takeProfitPct, stopLossPct: rules.stopLossPct, name: 'Classic', id: 'classic' };
  const isCreator = () => wallet.address && d && wallet.address === d.creator;

  const rangeBar = (pnl) => {
    const lo = strat().stopLossPct, hi = strat().takeProfitPct;
    const z = ((0 - lo) / (hi - lo)) * 100;
    const p = Math.max(0, Math.min(100, ((pnl - lo) / (hi - lo)) * 100));
    const t = pnl >= 0 ? 'up' : 'down';
    const left = Math.min(z, p), width = Math.abs(p - z);
    return `<div class="range" title="Stop loss ${pct(lo, 0)} · take profit ${pct(hi, 0)}"><div class="track"></div><div class="zero" style="left:${z}%"></div><div class="fill ${t}" style="left:${left}%;width:${width}%"></div><div class="mk ${t}" style="left:${p}%"></div></div>
      <div class="range-lbl"><span>SL ${pct(lo, 0)}</span><span>TP ${pct(hi, 0)}</span></div>`;
  };

  const creatorActions = () => {
    if (!isCreator()) return `<span class="note fund-note">Only the creator's wallet can fund, pause or withdraw.</span>`;
    if (d.rawStatus === 'LAUNCH_FAILED') return `<button class="btn btn-primary" data-act="retry">Retry launch</button><button class="btn" data-act="withdraw">Withdraw SOL</button>`;
    if (d.rawStatus === 'AWAITING_FUNDS' && d.balanceSol > 0) return `<button class="btn btn-sm" data-act="withdraw">Withdraw SOL</button>`;
    if (d.rawStatus !== 'ACTIVE') return '';
    return `<button class="btn btn-primary" data-act="deposit">Add SOL</button>
      <div style="display:flex;gap:8px"><button class="btn btn-sm" data-act="${d.paused ? 'resume' : 'pause'}">${d.paused ? 'Resume trading' : 'Pause trading'}</button><button class="btn btn-sm" data-act="withdraw">Withdraw</button></div>`;
  };

  // ── the agent's phone: every control lives here ──
  let phone = null, pressed = null;
  const tiles = () => {
    if (!d) return [];
    const mine = isCreator();
    const st = d.rawStatus;
    const T = [];
    if (st === 'ACTIVE') {
      T.push({ act: 'deposit', label: 'Add SOL', sub: 'fund the agent', bg: '#E4282E', icon: 'plus', creator: true });
      T.push(d.paused
        ? { act: 'resume', label: 'Resume', sub: 'start trading', bg: '#1E9C47', icon: 'play', creator: true }
        : { act: 'pause', label: 'Pause', sub: 'stop new trades', bg: '#E8A32E', icon: 'pause', creator: true, dark: true });
      T.push({ act: 'withdraw', label: 'Withdraw', sub: 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
      T.push({ act: 'shill', label: 'Shill on X', sub: 'ready-made post', bg: '#0B0B0D', icon: 'x', creator: false, off: !d.coin?.mint });
      T.push({ act: 'strategy', label: 'Strategy', sub: strat().name, bg: '#2F5FD0', icon: 'target', creator: true });
      T.push({ act: 'pump', label: 'pump.fun', sub: 'coin page', bg: '#26262C', icon: 'link', creator: false, off: !d.coin?.mint });
      if (cfg.skins?.enabled) T.push({ act: 'skins', label: 'Skins', sub: d.skin ? ((cfg.skins.items || []).find((x) => x.id === d.skin)?.name || 'custom look') : 'new look', bg: '#8A3FD1', icon: 'star', creator: true });
    } else if (st === 'LAUNCH_FAILED') {
      T.push({ act: 'retry', label: 'Retry launch', sub: 'try again', bg: '#E4282E', icon: 'play', creator: true });
      T.push({ act: 'withdraw', label: 'Withdraw', sub: 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
    } else if (st === 'AWAITING_FUNDS') {
      T.push({ act: 'fund-launch', label: 'Send SOL', sub: sol(Math.max(0, d.requiredSol - d.balanceSol), 4) + ' SOL', bg: '#E4282E', icon: 'plus', creator: true });
      if (d.balanceSol > 0) T.push({ act: 'withdraw', label: 'Withdraw', sub: 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
    }
    return T.map((t) => ({ ...t, locked: t.creator && !mine }));
  };
  const drawIcon = (ctx, kind, x, y, s, col) => {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'plus') { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }
    else if (kind === 'pause') { ctx.fillRect(x - s * 0.7, y - s, s * 0.5, s * 2); ctx.fillRect(x + s * 0.2, y - s, s * 0.5, s * 2); }
    else if (kind === 'play') { ctx.moveTo(x - s * 0.6, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x - s * 0.6, y + s); ctx.closePath(); ctx.fill(); }
    else if (kind === 'down') { ctx.moveTo(x, y - s); ctx.lineTo(x, y + s * 0.6); ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x, y + s * 0.7); ctx.lineTo(x + s * 0.7, y); ctx.moveTo(x - s, y + s); ctx.lineTo(x + s, y + s); ctx.stroke(); }
    else if (kind === 'x') { ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); }
    else if (kind === 'target') { ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, Math.PI * 2); ctx.fill(); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s * 1.1; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
    else if (kind === 'link') { ctx.moveTo(x - s * 0.6, y + s * 0.6); ctx.lineTo(x + s, y - s); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y); ctx.stroke(); }
    else if (kind === 'lock') { ctx.strokeRect(x - s * 0.5, y - s * 1.2, s, s); ctx.fillRect(x - s * 0.8, y - s * 0.4, s * 1.6, s * 1.3); }
    ctx.restore();
  };
  const phoneApp = {
    draw(ctx, now) {
      phoneChrome(ctx, now);
      if (!d) return [];
      const hits = [];
      // header
      ctx.fillStyle = '#9AA3B2'; ctx.font = F(700, 13, 'JetBrains Mono');
      ctx.fillText(`${d.no ? agentNo(d.no) : 'NEW AGENT'}${d.coin?.ticker ? '  ·  $' + d.coin.ticker : ''}`, 24, 78);
      ctx.fillStyle = '#F4F2EE'; ctx.font = F(400, 28, 'Bungee');
      const nm = String(d.name).toUpperCase();
      ctx.fillText(nm.length > 14 ? nm.slice(0, 13) + '…' : nm, 24, 112);
      const stat = { ACTIVE: ['#1E9C47', 'ACTIVE'], PAUSED: ['#E8A32E', 'PAUSED'], 'LOW BALANCE': ['#E4282E', 'LOW BALANCE'], AWAITING_FUNDS: ['#E8A32E', 'WAITING FOR SOL'], LAUNCHING: ['#2F5FD0', 'LAUNCHING'], LAUNCH_FAILED: ['#E4282E', 'LAUNCH FAILED'] }[d.status] || ['#3A3A42', d.status];
      ctx.font = F(800, 12); const pw = ctx.measureText(stat[1]).width + 22;
      ctx.fillStyle = stat[0]; rr(ctx, 24, 126, pw, 24, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(stat[1], 35, 143);
      ctx.fillStyle = '#26262E'; rr(ctx, 32 + pw, 126, 110, 24, 12); ctx.fill();
      ctx.fillStyle = '#C9CED8'; ctx.fillText(strat().name, 44 + pw, 143);
      // career level
      const L = d.level;
      if (L) {
        ctx.fillStyle = L.color; rr(ctx, 24, 160, 30, 30, 9); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = F(400, 17, 'Bungee'); ctx.textAlign = 'center'; ctx.fillText(String(L.no), 39, 182); ctx.textAlign = 'left';
        ctx.fillStyle = '#F4F2EE'; ctx.font = F(800, 15); ctx.fillText(L.name.toUpperCase(), 62, 173);
        ctx.fillStyle = '#9AA3B2'; ctx.font = F(600, 12);
        ctx.fillText(L.next ? `${sol(Math.max(0, L.next.minProfitSol - L.bestProfitSol), 3)} SOL to ${L.next.name}${L.next.rewardSol > 0 ? ` · pays ${sol(L.next.rewardSol, 3)}` : ''}` : 'Boss level reached', 62, 190);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(ctx, 62, 196, SW - 86, 7, 4); ctx.fill();
        ctx.fillStyle = L.next ? L.next.color : L.color; rr(ctx, 62, 196, Math.max(8, (SW - 86) * L.progress), 7, 4); ctx.fill();
      }
      ctx.save(); ctx.translate(0, 46);
      // balance card
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(ctx, 16, 166, SW - 32, 128, 22); ctx.fill();
      ctx.fillStyle = '#9AA3B2'; ctx.font = F(700, 12, 'JetBrains Mono'); ctx.fillText('PORTFOLIO', 34, 196);
      ctx.fillStyle = '#F4F2EE'; ctx.font = F(700, 38, 'Space Grotesk'); ctx.fillText(sol(d.equitySol, 4), 32, 240);
      const vw = ctx.measureText(sol(d.equitySol, 4)).width;
      ctx.fillStyle = '#9AA3B2'; ctx.font = F(700, 17); ctx.fillText('SOL', 40 + vw, 240);
      const up = d.pnlSol >= 0;
      ctx.fillStyle = d.pnlSol === 0 ? '#9AA3B2' : up ? '#5BE38A' : '#FF7A70'; ctx.font = F(700, 15);
      ctx.fillText(`${signedSol(d.pnlSol, 4)} SOL  (${pct(d.pnlPct)})`, 34, 272);
      ctx.fillStyle = '#9AA3B2'; ctx.font = F(600, 13); ctx.textAlign = 'right';
      ctx.fillText(`${d.openPositions ?? d.positions?.length ?? 0} open · ${d.trades} trades`, SW - 34, 196); ctx.textAlign = 'left';
      ctx.restore();
      // tiles
      const T = tiles();
      const tw = (SW - 32 - 12) / 2, th = T.length > 6 ? 74 : 96, gap = T.length > 6 ? 10 : 12, sq = th === 96 ? 0 : 22;
      T.forEach((t, i) => {
        const x = 16 + (i % 2) * (tw + 12), y = 358 + Math.floor(i / 2) * (th + gap);
        const isP = pressed && pressed.act === t.act && now - pressed.at < 220;
        const dim = t.locked || t.off;
        ctx.globalAlpha = dim ? 0.42 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, x, y + 5, tw, th, 20); ctx.fill();
        ctx.fillStyle = t.bg; rr(ctx, x, y + (isP ? 4 : 0), tw, th, 20); ctx.fill();
        if (t.bg === '#0B0B0D' || t.bg === '#26262C') { ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; rr(ctx, x + 1, y + 1 + (isP ? 4 : 0), tw - 2, th - 2, 20); ctx.stroke(); }
        const fg = t.dark ? '#2A1E05' : '#FFFFFF';
        drawIcon(ctx, t.locked ? 'lock' : t.icon, x + 30, y + 34 - sq * 0.55 + (isP ? 4 : 0), sq ? 9 : 11, fg);
        ctx.fillStyle = fg; ctx.font = F(800, sq ? 16.5 : 18); ctx.fillText(t.label, x + 16, y + 70 - sq * 0.95 + (isP ? 4 : 0));
        ctx.globalAlpha = dim ? 0.3 : 0.8; ctx.font = F(600, 12.5);
        ctx.fillText(t.locked ? 'creator only' : (t.sub.length > 17 ? t.sub.slice(0, 16) + '…' : t.sub), x + 16, y + 88 - sq + (isP ? 4 : 0));
        ctx.globalAlpha = 1;
        hits.push({ x0: x, x1: x + tw, y0: y, y1: y + th, ...t });
      });
      // footer: next decision / connect
      const fy = 358 + Math.ceil(T.length / 2) * (th + gap) + 4;
      if (!isCreator()) {
        ctx.fillStyle = '#F4F2EE'; rr(ctx, 16, fy, SW - 32, 58, 18); ctx.fill();
        ctx.fillStyle = '#17171A'; ctx.font = F(800, 16); ctx.textAlign = 'center';
        ctx.fillText(wallet.address ? 'Not the creator wallet' : 'Connect creator wallet', SW / 2, fy + 26);
        ctx.fillStyle = '#6F6B64'; ctx.font = F(600, 12.5);
        ctx.fillText(wallet.address ? 'Only the creator can fund, pause or withdraw' : 'to fund, pause, withdraw or switch strategy', SW / 2, fy + 45);
        ctx.textAlign = 'left';
        if (!wallet.address) hits.push({ x0: 16, x1: SW - 16, y0: fy, y1: fy + 58, act: 'connect' });
      } else if (d.rawStatus === 'ACTIVE' && !d.paused && d.nextDecisionAt) {
        const secs = Math.max(0, Math.round((d.nextDecisionAt - now) / 1000));
        ctx.fillStyle = '#9AA3B2'; ctx.font = F(700, 14); ctx.textAlign = 'center';
        ctx.fillText(secs > 0 ? `Next decision in ${secs}s` : 'Thinking…', SW / 2, fy + 24); ctx.textAlign = 'left';
      }
      return hits;
    },
    tap(hit) {
      pressed = { act: hit.act, at: performance.now() > 0 ? Date.now() : 0 };
      phone?.buzz();
      if (hit.act === 'connect') return app.openConnect();
      if (hit.off) return;
      if (hit.act === 'shill') return app.shill(d.id);
      if (hit.act === 'pump') return window.open('https://pump.fun/coin/' + encodeURIComponent(d.coin.mint), '_blank', 'noopener');
      if (hit.locked) return app.toast(`<b>Creator only</b>Connect the creator wallet (${esc(short(d.creator, 4))}) to ${esc(hit.label.toLowerCase())}.`);
      app.agentAction(hit.act, d, () => fetchDetail(true));
    },
  };

  // agent wearing a paid skin: a live 3D turntable in the hero (kept across re-renders)
  let skinView = null;
  function mountSkin() {
    const slot = el?.querySelector('#ag-skin3d');
    if (!slot) { skinView?.v.destroy(); skinView = null; return; }
    if (skinView && skinView.id === d.skin) { if (skinView.host !== slot) slot.replaceWith(skinView.host); return; }
    skinView?.v.destroy();
    try { skinView = { id: d.skin, host: slot, v: createBoss(slot, { skin: d.skin, label: d.name + ' in its skin. Drag to spin.' }) }; }
    catch { slot.innerHTML = robotSVG(`skin:${d.skin}`, { stand: true }); skinView = null; }
  }
  const heroHTML = () => `<section class="card agent-hero${d.skin ? ' has-skin' : ''}">
      ${d.skin ? `<div class="hero-skin" id="ag-skin3d" title="Drag to spin"></div>` : avatar(d.avatarSeed, 120, { stand: true })}
      <div style="min-width:0">
        <div class="agent-tag">${d.no ? agentNo(d.no) : 'NEW AGENT'} · ${d.coin?.createdAt ? 'launched ' + age(d.coin.createdAt) + ' ago' : 'not launched yet'}</div>
        <h1>${esc(d.name)} ${levelBadge(d.level)}</h1>
        <div class="row">
          ${statusPill(d.status)}
          ${d.coin?.ticker ? `<span class="chip">Coin: <b>$${esc(d.coin.ticker)}</b></span>` : ''}
          ${strategyChip(cfg, d.strategy, [d.customStrategy])}
          <span class="pill pill-live">SOLANA MAINNET</span>
        </div>
        ${d.rawStatus === 'ACTIVE' ? levelBar(d.level) : ''}
        <div class="row">
          <span class="muted" style="font-size:13px;font-weight:600">Agent wallet</span>
          <span class="addr"><code>${esc(d.wallet)}</code>${copyBtn(d.wallet)}<a class="ext" href="https://solscan.io/account/${esc(d.wallet)}" target="_blank" rel="noopener">Solscan ↗</a></span>
        </div>
      </div>
      <div class="actions">
        <div class="sr">${d.coin?.mint ? `<button class="btn btn-sm btn-x" type="button" data-shill-agent>Shill on X</button>` : ''}${creatorActions()}</div>
        <span class="phone-hint">Controls are on the phone <b>→</b></span>
        ${d.rawStatus === 'ACTIVE' && !d.paused ? `<span class="next-think" data-countdown="${d.nextDecisionAt}"></span>` : ''}
      </div>
    </section>`;

  const pendingHTML = () => {
    const s = d.rawStatus;
    let body = '';
    if (s === 'AWAITING_FUNDS') {
      body = `<h2 class="pix">Waiting for SOL</h2>
        <p>Send <b>${sol(d.requiredSol, 4)} SOL</b> to the agent wallet above to launch <b>$${esc(d.coin.ticker)}</b>. Received so far: ${sol(d.balanceSol, 4)} SOL.</p>
        ${isCreator() ? `<div><button class="btn btn-primary" data-act="fund-launch">Send ${sol(Math.max(0, d.requiredSol - d.balanceSol), 4)} SOL</button></div>` : ''}
        <p class="note">Unfunded launches expire 30 minutes after they were started.</p>`;
    } else if (s === 'LAUNCHING') {
      body = `<h2 class="pix">Launching on pump.fun…</h2><p>Funds received. The agent is creating <b>$${esc(d.coin.ticker)}</b> from its own wallet. This usually takes under a minute.</p>${d.error ? `<p class="blocked">${esc(d.error)} (retrying)</p>` : ''}`;
    } else if (s === 'LAUNCH_FAILED') {
      body = `<h2 class="pix">Launch failed</h2><p class="blocked">${esc(d.error || 'Unknown error')}</p><p>The SOL is still in the agent wallet (${sol(d.balanceSol, 4)} SOL). The creator can retry or withdraw it.</p>`;
    }
    return `<section class="card"><div class="card-body" style="display:grid;gap:12px">${body}</div></section>`;
  };

  const statsHTML = () => `
    <div class="card stat"><div class="k">SOL balance</div><div class="v">${sol(d.balanceSol, 4)}<small>SOL</small></div><div class="s">free SOL in the agent wallet</div></div>
    <div class="card stat"><div class="k">Portfolio value</div><div class="v">${sol(d.equitySol, 4)}<small>SOL</small></div><div class="s">${usd(d.equitySol * (app.api.snapshot.stats.solUsd || 0))} incl. positions</div></div>
    <div class="card stat"><div class="k">Total P&amp;L</div><div class="v ${tone(d.pnlSol)}">${signedSol(d.pnlSol, 4)}<small>SOL</small></div><div class="s ${tone(d.pnlSol)}">${pct(d.pnlPct, 2)} on ${sol(d.depositedSol, 3)} SOL net deposited</div></div>
    <div class="card stat"><div class="k">Total trades</div><div class="v">${d.trades}</div><div class="s">${d.closedTrades} closed · ${d.winRate == null ? 'no win rate yet' : Math.round(d.winRate * 100) + '% wins'}</div></div>
    <div class="card stat"><div class="k">Creator fees kept</div><div class="v">${sol(d.feesKeptSol, 4)}<small>SOL</small></div><div class="s">${d.feesToCreatorSol > 0 ? `${sol(d.feesToCreatorSol, 4)} SOL sent to creator` : 'all fees stay with the agent'}</div></div>`;

  const positionsHTML = () => {
    if (!d.positions.length) return `<div class="feed-empty">No open positions. The agent is holding SOL.</div>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Token</th><th class="r">Cost</th><th class="r">Value</th><th class="r">Entry</th><th class="r">Now</th><th class="r">P&amp;L</th><th>Stop loss → take profit</th><th class="r">Held</th></tr></thead>
      <tbody>${d.positions.map((p) => `<tr>
        <td><a class="tokname" href="${esc(p.url || 'https://solscan.io/token/' + p.mint)}" target="_blank" rel="noopener">${tokIcon(p.symbol, p.icon)}$${esc(p.symbol)}</a>${p.recovered ? ' <span class="pill" title="Found on-chain after a restart; cost basis = value when found">RECOVERED</span>' : ''}${p.sellFails ? ` <span class="pill pill-low" title="The sell did not go through yet. The agent keeps retrying.">SELL RETRY ×${p.sellFails > 99 ? '99+' : p.sellFails}</span>` : ''}</td>
        <td class="r">${sol(p.costSol, 4)} SOL</td>
        <td class="r b">${sol(p.valueSol, 4)} SOL</td>
        <td class="r muted">${price(p.entryPriceSol * (app.api.snapshot.stats.solUsd || 0))}</td>
        <td class="r">${price(p.priceUsd)}</td>
        <td class="r"><b class="${tone(p.pnlPct)}">${pct(p.pnlPct)}</b><br><span class="${tone(p.pnlSol)}" style="font-size:12px">${signedSol(p.pnlSol, 4)}</span></td>
        <td>${rangeBar(p.pnlPct)}</td>
        <td class="r muted">${dur(Date.now() - p.openedAt)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  };

  const tradesHTML = () => {
    const list = showAll ? d.history : d.history.slice(0, 25);
    if (!list.length) return `<div class="feed-empty">No trades yet.</div>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Time</th><th>Side</th><th>Token</th><th class="r">Amount</th><th class="r">Price</th><th class="r">P&amp;L</th><th>Trigger</th><th>Transaction</th></tr></thead>
      <tbody>${list.map((t) => `<tr>
        <td><span data-ago="${t.ts}">${ago(t.ts)}</span><br><span class="muted" style="font-size:12px">${clockSec(t.ts)}</span></td>
        <td>${sidePill(t.side)}</td>
        <td class="b">$${esc(t.symbol)}</td>
        <td class="r b">${sol(t.sol, 4)} SOL</td>
        <td class="r muted">${price(t.priceUsd)}</td>
        <td class="r">${t.side === 'SELL' ? `<b class="${tone(t.pnlPct)}">${pct(t.pnlPct)}</b><br><span class="${tone(t.pnlSol)}" style="font-size:12px">${signedSol(t.pnlSol, 4)} SOL</span>` : '<span class="muted">–</span>'}</td>
        <td>${sourceChip(t.source) || '<span class="chip">Agent</span>'}</td>
        <td>${txLink(t.sig)}</td>
      </tr>`).join('')}</tbody></table></div>
      ${d.history.length > 25 ? `<button class="card-foot" style="width:100%;border:0;border-top:1px solid var(--line);background:transparent;cursor:pointer;text-align:left" id="ag-more">${showAll ? 'Show fewer' : 'Show all ' + d.history.length + ' recent trades'}</button>` : ''}`;
  };

  const decisionsHTML = () => {
    if (!d.decisions.length) return `<div class="feed-empty">First decision coming up…</div>`;
    return `<ul class="decisions">${d.decisions.map((x) => `<li>
      <div class="top">${sidePill(x.action)}${x.count > 1 ? `<span class="muted" style="font-size:12px;font-weight:600">${x.failed ? `tried ${x.count > 999 ? '999+' : x.count}×` : `×${x.count} in a row`}</span>` : ''}${x.symbol ? `<b>$${esc(x.symbol)}</b>` : ''}<span class="when" data-ago="${x.ts}">${ago(x.ts)}</span></div>
      ${x.reason ? `<p>${esc(x.reason)}</p>` : ''}
      ${x.blocked ? `<div class="blocked${x.failed ? ' failed' : ''}">${esc(x.blocked)}</div>` : x.action !== 'HOLD' ? '<div class="approved">Approved by risk check · executed on-chain</div>' : ''}
    </li>`).join('')}</ul>`;
  };

  const coinHTML = () => {
    const c = d.coin;
    const link = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const tw = c.twitter ? (c.twitter.startsWith('http') ? c.twitter : 'https://x.com/' + c.twitter.replace(/^@/, '')) : '';
    return `<section class="card coin-card">
      <div class="coin-head">${coinThumb(c, 56)}<div><div class="agent-tag">ASSOCIATED COIN</div><div class="t">${esc(c.name)}<small>$${esc(c.ticker)}</small></div></div></div>
      ${c.description ? `<p style="color:var(--ink-2);font-size:14px">${esc(c.description)}</p>` : ''}
      <dl class="kv">
        ${c.mint ? `<dt>Market cap</dt><dd>${usd(c.mcapUsd)}</dd><dt>All-time high</dt><dd>${usd(c.athUsd)}</dd>` : ''}
        ${c.createdAt ? `<dt>Launched</dt><dd>${age(c.createdAt)} ago</dd>` : ''}
        ${c.mint ? `<dt>Mint</dt><dd><span class="mono">${short(c.mint, 6)}</span> ${copyBtn(c.mint)}</dd>` : ''}
        ${c.launchSig ? `<dt>Launch tx</dt><dd>${txLink(c.launchSig)}</dd>` : ''}
        ${tw ? `<dt>X / Twitter</dt><dd><a class="ext" href="${esc(tw)}" target="_blank" rel="noopener">${esc(c.twitter)}</a></dd>` : ''}
        ${c.website ? `<dt>Website</dt><dd><a class="ext" href="${esc(link(c.website))}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, ''))}</a></dd>` : ''}
      </dl>
      ${c.mint ? `<a class="btn btn-sm" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">View on pump.fun ↗</a>` : ''}
      <p class="note">The agent wallet is this coin's creator on pump.fun. Agents never trade TEKKTEAM coins.</p>
    </section>`;
  };

  const walletHTML = () => `<section class="card coin-card">
      <div class="agent-tag">WALLETS</div>
      <dl class="kv">
        <dt>Agent wallet</dt><dd>${addrLink(d.wallet, short(d.wallet, 6))}</dd>
        <dt>Keys</dt><dd>${esc(d.custody || '')}</dd>
        <dt>Creator wallet</dt><dd>${addrLink(d.creator, short(d.creator, 6))}</dd>
        <dt>Net deposited</dt><dd>${sol(d.depositedSol, 4)} SOL</dd>
        ${d.launchCostSol ? `<dt>Coin creation cost</dt><dd>${sol(d.launchCostSol, 4)} SOL</dd>` : ''}
        ${d.withdrawnSol ? `<dt>Withdrawn</dt><dd>${sol(d.withdrawnSol, 4)} SOL</dd>` : ''}
      </dl>
      <div class="agent-tag" style="margin-top:4px">DEPOSITS &amp; WITHDRAWALS</div>
      <dl class="kv">${[...d.deposits.map((x) => ({ ...x, dir: '+' })), ...d.withdrawals.map((x) => ({ ...x, dir: '−' }))].sort((a, b) => b.ts - a.ts).slice(0, 12)
        .map((x) => `<dt data-ago="${x.ts}">${ago(x.ts)}</dt><dd>${x.dir}${sol(x.amount, 4)} SOL ${x.sig ? txLink(x.sig, 'tx') : ''}</dd>`).join('') || '<dt class="muted">None yet</dt><dd></dd>'}</dl>
      <p class="note">The trading logic never sees a private key. It proposes BUY / SELL / HOLD; the server checks the rules, simulates the transaction and only then signs.</p>
    </section>`;

  const feesHTML = () => `<section class="card coin-card">
      <div class="agent-tag">CREATOR FEES · ${cfg.fees.creatorSharePct > 0 ? `${Math.round(cfg.fees.creatorSharePct * 100)}% CREATOR / ${Math.round((1 - cfg.fees.creatorSharePct) * 100)}% AGENT` : '100% AGENT'}</div>
      <dl class="kv">
        <dt>Kept by agent</dt><dd>${sol(d.feesKeptSol, 4)} SOL</dd>
        ${d.feesToCreatorSol > 0 || cfg.fees.creatorSharePct > 0 ? `<dt>Sent to creator</dt><dd>${sol(d.feesToCreatorSol, 4)} SOL</dd>` : ''}
        ${d.nextFeeClaimAt ? `<dt>Next claim</dt><dd data-countdown-plain="${d.nextFeeClaimAt}"></dd>` : ''}
      </dl>
      <div class="agent-tag" style="margin-top:4px">CLAIMS</div>
      <dl class="kv">${d.feeClaims.map((x) => `<dt data-ago="${x.ts}">${ago(x.ts)}</dt><dd>${sol(x.claimedSol, 4)} SOL ${txLink(x.sig, 'tx')}${x.toCreatorSol > 0 ? `<br><span class="muted" style="font-weight:500">${sol(x.toCreatorSol, 4)} to creator ${x.shareSig ? txLink(x.shareSig, 'tx') : ''}</span>` : ''}</dd>`).join('') || '<dt class="muted">No claims yet</dt><dd></dd>'}</dl>
      ${(d.rewards || []).length ? `<div class="agent-tag" style="margin-top:4px">PROMOTION REWARDS</div>
      <dl class="kv">${d.rewards.map((r) => `<dt>${esc(r.level)}</dt><dd>${sol(r.amountSol, 3)} SOL ${r.status === 'paid' ? txLink(r.sig, 'paid ✓') : `<span class="muted" style="font-weight:600">${r.status === 'waiting_funds' ? 'queued' : 'sending…'}</span>`}</dd>`).join('')}</dl>` : ''}
      <div class="agent-tag" style="margin-top:4px">STRATEGY · ${esc(strat().name.toUpperCase())}${strat().custom ? ' <span class="cust-tag">custom</span>' : ''}</div>
      <dl class="kv">
        ${strategyRules(strat()).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
        <dt>SOL reserve</dt><dd>${rules.minSolReserve} SOL</dd>
      </dl>
      ${isCreator() && d.rawStatus === 'ACTIVE' ? `<button class="btn btn-sm" type="button" data-act="strategy">${stratIcon(strat())}<span>Change strategy</span></button>` : ''}
    </section>`;

  function renderAll() {
    mode = d.rawStatus === 'ACTIVE' ? 'active' : 'pending';
    const main = mode === 'active' ? `
      <div class="kv-grid" id="ag-stats">${statsHTML()}</div>
      <div class="two">
        <section class="card"><header class="card-head"><h2 class="pix">Portfolio value</h2><span class="sub">SOL, incl. open positions</span><span class="right live">LIVE</span></header><div class="chart-box" id="ag-chart"></div></section>
        <section class="card"><header class="card-head"><h2 class="pix">Decisions</h2><span class="sub">what the agent proposed</span></header><div id="ag-dec">${decisionsHTML()}</div></section>
      </div>
      <section class="card"><header class="card-head"><h2 class="pix">Current positions</h2><span class="sub" id="ag-pos-n">${d.positions.length} of ${strat().maxOpen}</span></header><div id="ag-pos">${positionsHTML()}</div></section>
      <section class="card"><header class="card-head"><h2 class="pix">Trade history</h2><span class="sub">on-chain, newest first</span></header><div id="ag-trades">${tradesHTML()}</div></section>
      <div class="three" id="ag-cards">${coinHTML()}${walletHTML()}${feesHTML()}</div>`
      : `<div id="ag-pending">${pendingHTML()}</div><div class="three" id="ag-cards">${coinHTML()}${walletHTML()}</div>`;
    phone?.destroy(); phone = null;
    el.innerHTML = `<div class="wrap">
      <a href="#/agents" class="muted" style="font-weight:600;font-size:13px">← All agents</a>
      <div class="agent-layout">
        <div class="agent-main">
          <div id="ag-hero">${heroHTML()}</div>
          ${main}
        </div>
        <aside class="agent-phone" aria-label="Agent controls">
          <div class="phone-stage big" id="ag-phone" title="Tap a button on the phone. Drag to turn it."></div>
          <div class="phone-cap">Tap the buttons · drag to turn the phone</div>
        </aside>
      </div>
    </div>`;
    phone = createPhone(el.querySelector('#ag-phone'), { screen: phoneApp, zoom: 1.04 });
    if (skinView) { skinView.v.destroy(); skinView = null; }
    mountSkin();
    if (mode === 'active') {
      const box = el.querySelector('#ag-chart');
      box.addEventListener('pointerenter', () => (hovering = true));
      box.addEventListener('pointerleave', () => (hovering = false));
      drawChart(true);
    }
    bind();
  }

  function renderLive() {
    const nextMode = d.rawStatus === 'ACTIVE' ? 'active' : 'pending';
    if (nextMode !== mode) return renderAll();
    el.querySelector('#ag-hero').innerHTML = heroHTML();
    mountSkin();
    phone?.refresh();
    if (mode === 'active') {
      el.querySelector('#ag-stats').innerHTML = statsHTML();
      el.querySelector('#ag-dec').innerHTML = decisionsHTML();
      el.querySelector('#ag-pos').innerHTML = positionsHTML();
      el.querySelector('#ag-pos-n').textContent = `${d.positions.length} of ${strat().maxOpen}`;
      el.querySelector('#ag-trades').innerHTML = tradesHTML();
      el.querySelector('#ag-cards').innerHTML = coinHTML() + walletHTML() + feesHTML();
      drawChart(false);
    } else {
      el.querySelector('#ag-pending').innerHTML = pendingHTML();
      el.querySelector('#ag-cards').innerHTML = coinHTML() + walletHTML();
    }
    bind();
  }

  function drawChart(force) {
    if (!force && (hovering || Date.now() - lastChart < 5000)) return;
    lastChart = Date.now();
    const pts = d.equity.slice();
    if (pts.length && Date.now() - pts[pts.length - 1][0] > 1000) pts.push([Date.now(), d.equitySol]);
    equityChart(el.querySelector('#ag-chart'), pts, d.depositedSol);
  }

  function bind() {
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => app.agentAction(b.dataset.act, d, () => fetchDetail(true))));
    el.querySelectorAll('[data-shill-agent]').forEach((b) => b.addEventListener('click', () => app.shill(d.id)));
    el.querySelector('#ag-more')?.addEventListener('click', () => { showAll = !showAll; el.querySelector('#ag-trades').innerHTML = tradesHTML(); bind(); });
  }

  async function fetchDetail(force = false) {
    if (loading || (!force && Date.now() - lastFetch < 2500)) return;
    loading = true;
    lastFetch = Date.now();
    try {
      const next = await app.api.getAgent(id);
      if (!el) return;
      if (!next) { el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Agent ${esc(id)} not found. <a class="ext" href="#/agents">See all agents</a></div></div></div>`; return; }
      const first = !d;
      d = next;
      if (first) renderAll(); else renderLive();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  return {
    mount(root) {
      el = root;
      el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Loading agent…</div></div></div>`;
      fetchDetail(true);
    },
    update() { fetchDetail(false); },
    onTrade(t) { if (d && t.agentNo === d.no) setTimeout(() => fetchDetail(true), 50); },
    onWallet() { if (d) renderAll(); },
    destroy() { phone?.destroy(); phone = null; skinView?.v.destroy(); skinView = null; el = null; },
  };
}
