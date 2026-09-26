import { pct, usd, agentLoop, sol, esc, STRAT_ICONS, strategyRules, riskTag, riskWarning } from '../ui.js';

const P = (x) => Math.round(x * 1000) / 10 + '%';
// the New Pairs safety filters in plain words
function safetyRules(f) {
  const r = [];
  if (f.minAgeSec != null) r.push(['Coin age', `${Math.round(f.minAgeSec / 60)}–${Math.round(f.maxAgeSec / 60)} min`]);
  if (f.minMcapSol != null) r.push(['Market cap', `${f.minMcapSol}–${f.maxMcapSol} SOL`]);
  if (f.minVolSol != null) r.push(['Volume so far', `at least ${f.minVolSol} SOL`]);
  if (f.minBuys != null) r.push(['Buyers', `${f.minBuys}+ buys from ${f.minUniqueBuyers}+ different wallets`]);
  if (f.minBuySellRatio != null) r.push(['Buy pressure', `${f.minBuySellRatio}x more SOL buying than selling (2 min)`]);
  if (f.minChange60s != null) r.push(['Momentum', `up ${P(f.minChange60s)}+ in 60 s, but not more than ${P(f.maxSpike60s)} (no chasing)`]);
  if (f.maxDevPct != null) r.push(['Dev', `holds at most ${P(f.maxDevPct)} and has not sold anything`]);
  if (f.maxEarlyBuyers != null) r.push(['Bundles', `max ${f.maxEarlyBuyers} buyers in the first 3 s, max ${P(f.maxUnseenPct || 0)} bought in the launch block`]);
  if (f.maxTopHolderPct != null) r.push(['Whales', `top holder ≤ ${P(f.maxTopHolderPct)}, top 10 ≤ ${P(f.maxTop10Pct)}`]);
  if (f.maxAgentsPerCoin != null) r.push(['Crowding', `max ${f.maxAgentsPerCoin} TEKKWORK agents in the same coin`]);
  r.push(['Early exit', 'sells at once if the dev sells, sellers take over or trading stops']);
  return r;
}

export function HowPage(app) {
  const c = app.api.config;
  const r = c.trading;
  const creatorPct = Math.round(c.fees.creatorSharePct * 100);
  return {
    mount(root) {
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>How it works</h1><p>One coin, one trading agent, one wallet. Real SOL on Solana mainnet, and everything the agent does is on-chain and public.</p></div>
          <div class="right"><a class="btn btn-primary" href="#/launch">Launch coin + agent</a></div></div>

        <section class="card">
          <header class="card-head"><h2 class="pix">From launch to live trades</h2></header>
          <ol class="steps">
            <li><span class="n">01</span><b>Connect your wallet</b><p>Phantom, Solflare or MetaMask (Solana account). It is the creator wallet and stays yours.</p></li>
            <li><span class="n">02</span><b>Fill in your coin</b><p>Image, name, ticker, description, socials, agent name and starting capital.</p></li>
            <li><span class="n">03</span><b>Agent wallet is created</b><p>The server creates a brand-new Solana wallet for the agent. Its key is encrypted on the server.</p></li>
            <li><span class="n">04</span><b>Send SOL</b><p>One transfer from your wallet: starting capital + ${c.launch.launchReserveSol} SOL to cover creating the coin.</p></li>
            <li><span class="n">05</span><b>Coin launches</b><p>The agent creates your coin on pump.fun from its own wallet, so the agent is the coin's creator.</p></li>
            <li><span class="n">06</span><b>Agent trades</b><p>It buys and sells Solana tokens with real SOL, following fixed rules.</p></li>
            ${creatorPct > 0 ? `<li><span class="n">07</span><b>Fees split ${creatorPct}/${100 - creatorPct}</b><p>Creator fees are claimed automatically: ${creatorPct}% to you, ${100 - creatorPct}% stays with the agent to keep trading.</p></li>` : ''}
          </ol>
        </section>

        <section class="card">
          <header class="card-head"><h2 class="pix">What every agent does</h2><span class="sub">the office crew</span></header>
          <div class="how-loop">${agentLoop()}</div>
        </section>

        <section class="card">
          <header class="card-head"><h2 class="pix">Career ladder</h2><span class="sub">agents get promoted by the trading profit they make · promotions are permanent</span></header>
          <ol class="ladder">${(c.levels || []).map((l, i, all) => `<li style="--lc:${esc(l.color)};--h:${40 + i * 18}px">
            <span class="ld-step"><b>${l.no}</b></span>
            <span class="ld-name">${esc(l.name)}</span>
            <span class="ld-req">${i === 0 ? 'every new agent' : `${l.minProfitSol} SOL profit`}</span>
            ${l.rewardSol > 0 ? `<span class="ld-rew">+${l.rewardSol} SOL reward</span>` : '<span class="ld-rew muted">&nbsp;</span>'}
          </li>`).join('')}</ol>
          ${c.rewards?.enabled ? `<div class="rew-box">
            <p><b>Promotion rewards are paid automatically</b> in real SOL to the ${c.rewards.payTo === 'agent' ? "agent's own wallet" : "creator's wallet"} the moment an agent reaches a new level. Skip a level and you get every reward on the way.</p>
            <dl class="kv">
              ${c.rewards.wallet ? `<dt>Rewards wallet</dt><dd><a class="ext mono" href="https://solscan.io/account/${esc(c.rewards.wallet)}" target="_blank" rel="noopener">${esc(c.rewards.wallet.slice(0, 6) + '…' + c.rewards.wallet.slice(-6))} ↗</a></dd>` : ''}
              ${c.rewards.balanceSol != null ? `<dt>Balance</dt><dd>${sol(c.rewards.balanceSol, 3)} SOL</dd>` : ''}
              <dt>Paid so far</dt><dd>${sol(c.rewards.paidSol || 0, 3)} SOL</dd>
            </dl>
          </div>` : ''}
        </section>

        <section class="card">
          <header class="card-head"><h2 class="pix">Strategies</h2><span class="sub">the creator picks one per agent, and can switch later</span></header>
          <div class="strat-cards">${(c.strategies || []).filter((st) => !st.safety).map((st) => `<article class="strat-card strat-${esc(st.id)}">
            <div class="sc-head"><span class="so-ic">${STRAT_ICONS[st.id] || ''}</span><div><b>${esc(st.name)}</b><small>${esc(st.tagline)}</small></div></div>
            <p>${esc(st.goal)}</p>
            <dl class="kv">${strategyRules(st).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          </article>`).join('')}${c.customEnabled === false ? '' : `<article class="strat-card strat-custom">
            <div class="sc-head"><span class="so-ic">${STRAT_ICONS.custom}</span><div><b>Your own</b><small>Custom · one per wallet</small></div></div>
            <p>Build your own strategy with sliders and give it a name. Pick an entry style above, then set trade size, open positions, take profit, stop loss, trailing stop, max hold time, cooldown and the entry filters.</p>
            <dl class="kv"><dt>Per trade</dt><dd>1–50% of SOL</dd><dt>Take profit</dt><dd>+2% to +300%</dd><dt>Stop loss</dt><dd>−1% to −50%</dd><dt>Max hold</dt><dd>off or up to 24h</dd></dl>
          </article>`}${(c.strategies || []).filter((st) => st.safety).map((st) => `<article class="strat-card strat-wide strat-${esc(st.id)}">
            <div class="sw-main">
              <div class="sc-head"><span class="so-ic">${STRAT_ICONS[st.id] || ''}</span><div><b>${esc(st.name)}</b>${riskTag(st)}<small>${esc(st.tagline)}</small></div></div>
              <p>${esc(st.goal)}</p>
              <dl class="kv">${strategyRules(st).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            </div>
            <div class="sw-warn">${riskWarning(st)}</div>
            <div class="sw-filters"><p class="sc-sub">Buys only when every filter passes</p><ul class="risk-filters">${safetyRules(st.safety).map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul></div>
          </article>`).join('')}</div>
        </section>

        <section class="card">
          <header class="card-head"><h2 class="pix">What happens on every decision</h2><span class="sub">every ${Math.round(c.brain.decisionEveryMs[0] / 1000)}–${Math.round(c.brain.decisionEveryMs[1] / 1000)} seconds per agent</span></header>
          <div class="pipe">
            <div class="node"><b>Market data</b><span>Live DexScreener data: price, liquidity, volume, 5m / 1h / 24h change</span></div><span class="arrow">→</span>
            <div class="node key"><b>Decision</b><span>Built-in trading rules pick BUY, SELL or HOLD. Same logic for every agent</span></div><span class="arrow">→</span>
            <div class="node key"><b>Risk check</b><span>Size, SOL reserve, max positions, token list, pause switch</span></div><span class="arrow">→</span>
            <div class="node"><b>Safety simulation</b><span>The swap is simulated first. If it would spend more than allowed, it is refused</span></div><span class="arrow">→</span>
            <div class="node"><b>Signed + sent</b><span>Signed inside the server vault, sent to Solana, confirmed on-chain</span></div><span class="arrow">→</span>
            <div class="node"><b>Public update</b><span>Balance, positions, P&amp;L and the Solscan link show up for everyone</span></div>
          </div>
          <div class="prose">
            <p><b>The logic proposes, the server decides.</b> The trading logic never touches a private key. Stop loss and take profit are hard rules, checked every time prices refresh (about every 15 seconds).</p>
          </div>
        </section>

        <div class="two">
          <section class="card">
            <header class="card-head"><h2 class="pix">Fixed rules</h2><span class="sub">same for every agent</span></header>
            <div class="card-body"><div class="rules">
              <div class="rule"><div class="k">Size per trade</div><div class="v">${Math.round(r.tradeSizePct * 100)}% of SOL balance</div></div>
              <div class="rule"><div class="k">Max open positions</div><div class="v">${r.maxOpenPositions}</div></div>
              <div class="rule"><div class="k">Stop loss</div><div class="v down">${pct(r.stopLossPct, 0)}</div></div>
              <div class="rule"><div class="k">Take profit</div><div class="v up">${pct(r.takeProfitPct, 0)}</div></div>
              <div class="rule"><div class="k">SOL reserve</div><div class="v">${r.minSolReserve} SOL</div></div>
              <div class="rule"><div class="k">Tradable tokens</div><div class="v v-text">≥ ${usd(c.market.minLiquidityUsd)} liquidity, ≥ ${usd(c.market.minVolume24hUsd)} 24h volume, ≥ ${c.market.minAgeHours}h old</div></div>
            </div></div>
          </section>
          <section class="card">
            <header class="card-head"><h2 class="pix">Your money</h2></header>
            <div class="prose">
              <p><b>Two wallets, never mixed.</b> Your wallet launches and funds. The agent wallet trades. The site never asks for your seed phrase.</p>
              <p><b>You stay in control.</b> The creator can pause the agent, add SOL or withdraw at any time. "Withdraw everything" sells all positions and sends all SOL back to your wallet. Every action is confirmed by a signature from your wallet.</p>
              <p><b>Costs.</b> Each swap pays network fees, a ${r.priorityFeeSol} SOL priority fee, pool fees and PumpPortal's 0.5% fee. Small agents lose a bigger share to fees.</p>
              <p><b>Risk.</b> Memecoins are extremely volatile and the agent can lose some or all of its SOL. Nothing here is financial advice.</p>
            </div>
          </section>
        </div>
      </div>`;
    },
    update() {},
    destroy() {},
  };
}
