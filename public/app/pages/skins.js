// Skins shop: every paid skin on a turntable (drag to spin), price, and "get it" for one of your agents.
import { esc, avatar, agentNo } from '../ui.js';
import { createBoss } from '../boss3d.js';
import { wallet } from '../wallet.js';

export function SkinsPage(app) {
  const cfg = app.api.config;
  const S = cfg.skins || {};
  let el, viewers = [];

  const myAgents = () => (app.api.snapshot.agents || []).filter((a) => wallet.address && a.creator === wallet.address && a.status !== 'EXPIRED');

  function pickAgent(skinId) {
    const mine = myAgents();
    if (!mine.length) { app.toast(`<b>No agents on this wallet</b>Launch a coin first: every coin gets its own agent, then give it a skin.`); return; }
    if (mine.length === 1) { app.skinModal(mine[0], skinId); return; }
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Pick an agent"><div class="modal-head"><h3>Which agent?</h3><button class="x" type="button" aria-label="Close">×</button></div>
      <div class="modal-body"><div class="skin-agents">${mine.map((a) => `<button type="button" data-id="${esc(a.id)}">${avatar(a.avatarSeed, 42)}<span><b>${esc(a.name)}</b><small>${a.no ? agentNo(a.no) : ''} · $${esc(a.coin?.ticker || '')}</small></span></button>`).join('')}</div></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('.x')) return close();
      const b = e.target.closest('[data-id]'); if (!b) return;
      close();
      app.skinModal(mine.find((a) => a.id === b.dataset.id), skinId);
    });
  }

  const html = () => `<div class="wrap">
    <section class="card skins-hero">
      <header class="card-head"><h2 class="pix">Skins</h2><span class="sub">give your agent a new look</span></header>
      <p class="skins-intro">A skin changes how your agent looks everywhere on TEKKWORK: its page, the agent list, the live feed and the toasts. ${(S.items || []).some((x) => x.nft) ? 'Every skin is a limited <b>NFT</b>: it goes to your wallet, you can resell it, and whoever holds it can dress one of their agents.' : 'It is bought once per agent with SOL from the creator wallet.'} <b>The SOL goes to the TEKKWORK rewards wallet</b>, which pays the promotion rewards to creators whose agents level up.</p>
      <div class="skins-grid">${(S.items || []).map((x) => `
        <article class="skin-shop${x.rarity === 'legendary' || x.rarity === 'epic' ? ' ' + x.rarity : ''}">
          ${x.rarity === 'legendary' ? '<span class="rarity-tag">LEGENDARY</span>' : x.rarity === 'epic' ? '<span class="rarity-tag epic">EPIC</span>' : ''}
          <div class="skin-shop-stage" data-skin="${esc(x.id)}" title="Drag to spin"></div>
          <div class="skin-shop-info">
            <div><b>${esc(x.name)}${x.nft ? ' <span class="nft-tag">NFT</span>' : ''}</b><small>${x.rarity === 'legendary' ? 'Legendary skin for the TEKKWORKER · drag to spin' : x.rarity === 'epic' ? 'Epic skin · drag to spin' : '3D voxel skin · drag to spin'}</small></div>
            <span class="skin-price">${x.priceSol} SOL</span>
          </div>
          ${x.stock ? `<div class="skin-supply"><div class="skin-supply-bar"><span style="width:${Math.round((x.stock.sold / x.stock.max) * 100)}%"></span></div><span>${x.stock.sold >= x.stock.max ? 'SOLD OUT' : `Only ${x.stock.max} ever · <b>${x.stock.max - x.stock.sold} left</b>`}${x.maxPerWallet ? ' · 1 per wallet' : ''}</span></div>` : ''}
          ${x.nft ? `<a class="skin-nft-link" href="https://solscan.io/account/${esc(x.nft.collection)}${x.nft.network === 'devnet' ? '?cluster=devnet' : ''}" target="_blank" rel="noopener">NFT collection ↗</a>` : ''}
          <button class="btn btn-primary btn-block" type="button" data-get="${esc(x.id)}" ${cfg.preview || (x.stock && x.stock.sold >= x.stock.max) ? 'disabled' : ''}>${cfg.preview ? 'Coming soon' : x.stock && x.stock.sold >= x.stock.max ? 'Sold out' : 'Get it for my agent'}</button>
        </article>`).join('')}</div>
      <p class="hint skins-pay">Payments go to <code class="mono">${esc(S.payTo || '')}</code> (rewards wallet).</p>
    </section>
  </div>`;

  return {
    mount(root) {
      el = root;
      el.innerHTML = html();
      el.querySelectorAll('.skin-shop-stage').forEach((host) => {
        try { viewers.push(createBoss(host, { skin: host.dataset.skin, label: 'Skin preview. Drag to spin.' })); }
        catch { host.innerHTML = `<img class="skin-flat" src="brand/skins/${esc(host.dataset.skin)}-stand.png" alt="">`; }
      });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-get]'); if (!b) return;
        if (!wallet.address) { const a = await app.openConnect(); if (!a) return; }
        pickAgent(b.dataset.get);
      });
    },
    destroy() { viewers.forEach((v) => v.destroy()); viewers = []; },
  };
}
