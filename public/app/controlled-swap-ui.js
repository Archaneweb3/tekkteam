import { request } from './backend.js';

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const units = (value, decimals) => { const v = BigInt(value ?? '0'), scale = 10n ** BigInt(decimals); return `${v / scale}.${String(v % scale).padStart(decimals, '0')}`; };
// Volatile tab memory only: a normal workspace rerender destroys this component,
// but must not silently discard the capability returned for the same review.
// Nothing is written to DOM, localStorage, sessionStorage, or logs.
const reviewCapabilities = new Map();

// This surface never signs or broadcasts itself. Each sensitive operation is
// a separate explicit owner click against the server's one-shot state machine.
export function mountControlledSwap(host, agent, { api = request, now = Date.now, newKey = () => crypto.randomUUID() } = {}) {
  const base = '/agents/' + encodeURIComponent(agent.id) + '/controlled-swap';
  const executionBase = '/agents/' + encodeURIComponent(agent.id) + '/controlled-execution';
  let dead = false, busy = false, open = false, state = null, executionState = null, error = '', review = null, pending = null, key = null, revision = 0, prepareAttempted = false, confirmation = null, confirmationAttempted = false;
  const capabilityKey = id => `${agent.id}:${id}`;
  const forgetCapability = id => { if (id) reviewCapabilities.delete(capabilityKey(id)); if (confirmation?.id === id) confirmation = null; };
  const syncCapability = () => {
    if (!Array.isArray(executionState?.records)) return;
    for (const [key, held] of reviewCapabilities) {
      if (held.agentId !== agent.id) continue;
      const record = executionState.records.find(r => r.id === held.id);
      if (!record || record.status !== 'PREPARED' || now() >= Math.min(held.expiresAt, record.expiresAt)) reviewCapabilities.delete(key);
    }
    const selected = selectedRecord();
    const held = selected && reviewCapabilities.get(capabilityKey(selected.id));
    confirmation = held && selected.status === 'PREPARED' && now() < Math.min(held.expiresAt, selected.expiresAt) ? { id: held.id, token: held.token } : null;
  };
  let form = { direction: 'BUY', tokenMint: '', inputAmount: '', slippageBps: '100' };
  const snapshot = () => ({ direction: form.direction, inputMint: form.direction === 'BUY' ? SOL : form.tokenMint.trim(), outputMint: form.direction === 'BUY' ? form.tokenMint.trim() : SOL, inputAmount: form.inputAmount.trim(), slippageBps: Number(form.slippageBps) });
  const active = r => ['QUOTED', 'PREPARED', 'SIGNED', 'SUBMITTED', 'UNKNOWN'].includes(r?.status);
  const selectedRecord = () => executionState?.records?.find(r => r.id === executionState.currentExecutionId) ?? null;
  const cancellable = () => pending && ['QUOTED', 'PREPARED'].includes(pending.status) && !pending.signature;
  const samePending = () => !pending || (pending.status === 'QUOTED' && (pending.requestKey || key?.value) && Object.entries(snapshot()).every(([field, value]) => pending.intent?.[field] === value));
  function render() {
    if (dead) return;
    host.classList.add('tw-controlled-swap');
    const q = review?.quote;
    const selected = selectedRecord();
    const prepared = selected?.status === 'PREPARED' && selected.review ? selected : null;
    const acceptanceSurface = !!executionState?.prepareEnabled;
    const reviewMode = !!(executionState?.enabled && acceptanceSurface && (executionState?.acceptanceEligible || prepared));
    const canPrepare = reviewMode && executionState.acceptanceEligible && !executionState.signingArmed && !busy && !prepareAttempted;
    const canArm = !!(reviewMode && prepared && confirmation?.id === prepared.id && executionState?.armEligibility?.executionId === prepared.id && executionState.armEligibility.eligible === true && now() < prepared.expiresAt && !executionState.signingArmed && !busy);
    const canConfirm = !!(prepared && confirmation?.id === prepared.id && executionState?.armedExecutionId === prepared.id && executionState.signingArmed && now() < prepared.expiresAt && !busy && !confirmationAttempted);
    const productStatus=prepared?'Review ready':selected?.status==='EXPIRED'?'Review expired':selected?.status==='REJECTED_BEFORE_SIGNING'?'Preparation rejected':executionState?.enabled?'No active execution':'Locked';
    host.innerHTML = `<div class="tw-dex-product"><header><div><p class="tw-dex-eyebrow">REAL TRADING · OWNER CONTROLLED</p><h3>Controlled Real</h3></div><span class="tw-dex-badge">${esc(productStatus)}</span></header><div class="tw-dex-product-grid"><div><span>Asset</span><strong>USDC</strong></div><div><span>Amount</span><strong>0.0001 SOL</strong></div><div><span>Venue</span><strong>Raydium CPMM</strong></div><div><span>Current action</span><strong>${esc(prepared?'Review in advanced tools':reviewMode?'Prepare review in advanced tools':'Unavailable')}</strong></div></div><p class="tw-dex-footnote">${prepared?'Unsigned Mainnet review only. No transaction has been sent.':executionState?.signingArmed?'Manual owner confirmation required before any signing.':'Signing and broadcast remain locked unless the exact execution passes owner confirmation.'}</p></div><details ${open ? 'open' : ''}><summary>Developer / Acceptance Tools <span>CONTROLLED REAL · ${reviewMode ? 'PREPARE / REVIEW ONLY' : 'LOCKED'}</span></summary><div class="tw-dex-content">
      <header><div><p class="tw-dex-eyebrow">CONTROLLED REAL · MANUAL OWNER CONFIRMATION</p><h3>Controlled real swap</h3><p>${esc(agent.name || 'Agent')}</p></div><span class="tw-dex-badge">${reviewMode ? 'Prepare available · signing locked' : 'Execution locked'}</span></header>
      <p class="tw-dex-warning"><strong>REAL SOL · MANUAL APPROVAL REQUIRED</strong><br>${reviewMode ? 'Fixed Mainnet acceptance intent. Preparation builds an unsigned review only; no transaction is signed or sent.' : 'This is separate from Paper trading. Quotes are estimates, not executable transactions.'}</p>
      <p role="status">${executionState ? `CONTROLLED REAL · ${reviewMode ? 'PREPARE / REVIEW ONLY' : 'LOCKED'} · Signing ${executionState.signingArmed ? 'armed' : 'locked'} · Live Trading ${executionState.liveEnabled ? 'enabled' : 'locked'} · Autonomous kill switch ${executionState.autonomousKillSwitch ? 'active' : 'inactive'} · Real-money emergency stop ${executionState.realMoneyEmergencyStop ? 'active' : 'inactive'}.` : 'Loading controlled execution status…'}</p>
      ${prepared && prepared.usdcDecimals === 6 ? `<section class="tw-dex-review"><h4>CONTROLLED REAL BUY · SOLANA MAINNET</h4><p><strong>REAL MAINNET TRANSACTION · MANUAL OWNER CONFIRMATION REQUIRED</strong></p><p>Execution ${esc(prepared.id)} · expires ${esc(new Date(prepared.expiresAt).toLocaleString())}</p><dl><div><dt>Asset / mint</dt><dd>USDC · ${esc(USDC)}</dd></div><div><dt>Venue / pool</dt><dd>Raydium CPMM · ${esc(prepared.pool)}</dd></div><div><dt>SPEND</dt><dd>${esc(units(prepared.inputAmount, 9))} SOL</dd></div><div><dt>ESTIMATED RECEIVE</dt><dd>${esc(units(prepared.estimatedOutput, 6))} USDC</dd></div><div><dt>MINIMUM RECEIVE</dt><dd>${esc(units(prepared.minimumOutput, 6))} USDC</dd></div><div><dt>Slippage</dt><dd>${esc(prepared.slippageBps)} bps</dd></div><div><dt>Network fee estimate / cap</dt><dd>${esc(units(prepared.networkFeeLamports, 9))} / ${esc(units(prepared.networkFeeCapLamports, 9))} SOL</dd></div><div><dt>Account / rent cost</dt><dd>${esc(units(prepared.ataRentLamports, 9))} SOL</dd></div><div><dt>Protected reserve + safety</dt><dd>${esc(units(prepared.review.totalProtectedLamports, 9))} SOL</dd></div><div><dt>Agent balance</dt><dd>${esc(units(prepared.review.agentBalanceLamports, 9))} SOL</dd></div><div><dt>Expected remaining (fee cap)</dt><dd>${esc(units(prepared.review.peakAvailableAfterLamports, 9))} SOL</dd></div><div><dt>Final message hash</dt><dd>${esc(prepared.messageHash)}</dd></div></dl><p>${canConfirm ? 'Exact execution armed. Confirming will sign and broadcast once on Mainnet.' : 'No profit guarantee. Signing remains locked until this exact execution is armed and manually confirmed.'}</p></section>` : ''}
      <div class="tw-dex-actions"><button type="button" data-dex="prepare" ${canPrepare ? '' : 'disabled'}>Prepare 0.0001 SOL → USDC review</button></div>
      ${acceptanceSurface ? '<p>Server-locked acceptance: BUY 0.0001 SOL → USDC. Mint, pool, amount and slippage are fixed by server policy.</p>' : `<div class="tw-dex-form"><label>Direction<select data-field="direction" ${busy ? 'disabled' : ''}><option ${form.direction === 'BUY' ? 'selected' : ''}>BUY</option><option ${form.direction === 'SELL' ? 'selected' : ''}>SELL</option></select></label>
      <label class="tw-dex-wide">Explicit token mint<input data-field="tokenMint" value="${esc(form.tokenMint)}" placeholder="Enter the token mint you selected" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''}></label>
      <label>Input amount · raw base units<input data-field="inputAmount" value="${esc(form.inputAmount)}" inputmode="numeric" placeholder="Positive integer" autocomplete="off" ${busy ? 'disabled' : ''}><small>BUY: lamports (1 SOL = 1,000,000,000). SELL: token base units; verify decimals independently.</small></label>
      <label>Slippage tolerance · bps<input data-field="slippageBps" value="${esc(form.slippageBps)}" type="number" min="0" max="100" step="1" ${busy ? 'disabled' : ''}><small>100 bps = 1%. Server risk limits remain authoritative.</small></label></div>
      <p data-pending ${pending ? '' : 'hidden'}>${pending ? `Existing request ${esc(pending.id)} · ${esc(pending.status)}. ${cancellable() ? 'Explicitly cancel this unsigned request before starting a changed or new intent.' : 'Outcome requires reconciliation. Do not create another request.'}` : ''}</p>
      <div class="tw-dex-actions"><button type="button" data-dex="quote" ${busy || !state?.quoteAvailable || !samePending() ? 'disabled' : ''}>${busy ? 'Requesting quote…' : 'Get read-only quote'}</button><button type="button" data-dex="cancel" ${busy || (pending && !cancellable()) ? 'disabled' : ''}>Cancel / new intent</button><button type="button" data-dex="refresh" ${busy ? 'disabled' : ''}>Refresh status</button></div>
      <p class="tw-dex-error" role="alert">${esc(error || (state && !state.quoteAvailable ? 'QUOTE UNAVAILABLE — provider is not configured.' : ''))}</p>
      <section class="tw-dex-review" data-review ${q ? '' : 'hidden'}>${q ? reviewMarkup(q) : ''}</section>`}
      ${acceptanceSurface ? `<p class="tw-dex-error" role="alert">${esc(error)}</p>` : ''}
      ${prepared ? `<p class="tw-dex-expiry" data-controlled-expiry>Review expires in ${Math.max(0,Math.ceil((prepared.expiresAt-now())/1000))}s. Arm and Confirm each revalidate on Mainnet.</p>` : ''}
      ${prepared && !canArm && !canConfirm && executionState?.armEligibility?.executionId === prepared.id && executionState.armEligibility.reason ? `<p class="tw-dex-error" role="status">Arm unavailable for this execution: ${esc(executionState.armEligibility.reason)}. No signing was requested.</p>` : ''}
      ${prepared && !canArm && !canConfirm && executionState?.armEligibility?.executionId === prepared.id && executionState.armEligibility.eligible === true && confirmation?.id !== prepared.id ? '<p class="tw-dex-error" role="status">CAPABILITY_MISSING — this browser session no longer holds the one-time confirmation capability for this execution. No signing was requested.</p>' : ''}
      ${prepared && executionState?.armedExecutionId === prepared.id && executionState.signingArmed ? '<p class="tw-dex-warning" role="status"><strong>ARMED FOR ONE MANUAL CONFIRMATION</strong><br>Arm did not sign or broadcast. Only your separate Confirm click may submit this exact execution.</p>' : ''}
      ${selected?.status === 'EXPIRED' ? `<p class="tw-dex-warning">EXPIRED — REVIEW ONLY · Execution ${esc(selected.id)} cannot be armed or confirmed.</p>` : ''}
      ${acceptanceSurface && executionState?.records?.length > 1 ? `<details class="tw-dex-history"><summary>Execution history</summary><ul>${executionState.records.filter(r => r.id !== selected?.id).map(r => `<li>${esc(r.id)} · ${esc(r.status)}${r.reason ? ' · ' + esc(r.reason) : ''}</li>`).join('')}</ul></details>` : ''}
      <div class="tw-dex-actions">${acceptanceSurface ? '' : '<button type="button" disabled>Prepare controlled buy</button>'}<button type="button" data-dex="arm" ${canArm ? '' : 'disabled'}>Arm this reviewed execution</button><button type="button" data-dex="confirm" ${canConfirm ? '' : 'disabled'}>CONFIRM CONTROLLED BUY</button></div>
      <p class="tw-dex-footnote">${reviewMode ? 'Arming does not sign or broadcast. Confirming the same fresh reviewed execution is a separate, value-moving owner action.' : 'Controlled Real execution remains locked. No real swap can be signed from this surface.'}</p>
    </div></details>`;
    host.querySelector('details').ontoggle = e => { open = e.currentTarget.open; };
    for (const input of host.querySelectorAll('[data-field]')) input.oninput = () => {
      form[input.dataset.field] = input.value; revision++; review = null;
      host.querySelector('[data-review]')?.setAttribute('hidden', '');
      if(host.querySelector('[data-dex=quote]'))host.querySelector('[data-dex=quote]').disabled = busy || !state?.quoteAvailable || !samePending();
    };
    if(host.querySelector('[data-dex=quote]'))host.querySelector('[data-dex=quote]').onclick = getQuote;
    if(host.querySelector('[data-dex=cancel]'))host.querySelector('[data-dex=cancel]').onclick = cancelIntent;
    if(host.querySelector('[data-dex=refresh]'))host.querySelector('[data-dex=refresh]').onclick = refresh;
    host.querySelector('[data-dex=prepare]').onclick = prepareControlledBuy;
    host.querySelector('[data-dex=arm]').onclick = armControlledBuy;
    host.querySelector('[data-dex=confirm]').onclick = confirmControlledBuy;
    tick();
  }
  function reviewMarkup(q) {
    const row = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    return `<h4>Read-only quote review</h4><p data-expiry></p><dl>${row('Direction', review.intent.direction)}${row('From · raw units', q.inputAmount + ' · ' + q.inputMint)}${row('Estimated output · raw units', q.estimatedOutput + ' · ' + q.outputMint)}${row('Minimum received · raw units', q.minimumOutput)}${row('Slippage tolerance', q.slippageBps + ' bps')}${row('Price impact', q.priceImpactPct == null ? 'Unavailable' : q.priceImpactPct + '%')}${row('Network fee estimate', 'Unavailable — not prepared')}${row('Priority fee', 'Unavailable — not prepared')}${row('Token account creation cost · peak upfront', 'Unavailable — not prepared')}${row('Protected SOL reserve · server policy', state?.riskPolicy?.protectedLamports ? state.riskPolicy.protectedLamports + ' lamports, plus transaction fees and account costs' : 'Unavailable — policy not loaded')}${row('Expected available SOL after swap', 'Unavailable — not prepared')}${row('Route / provider', (q.route || []).map(x => x.label).join(' → ') + ' / ' + q.provider)}${row('Quote reference', q.reference)}</dl>`;
  }
  function tick() {
    if (dead) return;
    const selected=selectedRecord();
    const controlledExpiry=host.querySelector('[data-controlled-expiry]');
    if(controlledExpiry&&selected?.status==='PREPARED'){
      const remaining=Math.max(0,Math.ceil((selected.expiresAt-now())/1000));
      controlledExpiry.textContent=remaining?`Review expires in ${remaining}s. Arm and Confirm each revalidate on Mainnet.`:'REVIEW EXPIRED — Arm and Confirm unavailable.';
      if(!remaining){forgetCapability(selected.id);host.querySelector('[data-dex=arm]').disabled=true;host.querySelector('[data-dex=confirm]').disabled=true;}
    }
    if (!review) return;
    const target = host.querySelector('[data-expiry]'); if (!target) return;
    const remaining = Math.max(0, Math.ceil((review.quote.expiresAt - now()) / 1000));
    target.textContent = remaining ? `Quote expires in ${remaining}s · estimates only` : 'QUOTE EXPIRED — request and review a new quote manually.';
  }
  async function refresh() {
    if (busy || dead) return;
    busy = true; render();
    try {
      const [legacy,production] = await Promise.allSettled([api(base),api(executionBase)]);
      state = legacy.status === 'fulfilled' ? legacy.value : null;
      executionState = production.status === 'fulfilled' ? production.value : null;
      if (production.status === 'fulfilled') syncCapability();
      const selected = selectedRecord();
      error = selected?.status === 'REJECTED_BEFORE_SIGNING' ? `Preparation rejected before signing · ${selected.reason || 'QUOTE_UNAVAILABLE'}${selected.quoteDiagnostic?.code ? ' · ' + selected.quoteDiagnostic.code : ''}. No transaction was signed or sent.` : selected?.status === 'EXPIRED' ? `Execution ${selected.id} expired. Review only; signing is unavailable.` : executionState ? '' : 'Controlled execution status unavailable. Preparation remains locked.';
      pending = (state?.records || []).find(active) || null;
      if (pending) {
        key = pending.requestKey ? { fingerprint: JSON.stringify({ agentId: agent.id, network: 'solana:mainnet', direction: pending.intent.direction, inputMint: pending.intent.inputMint, outputMint: pending.intent.outputMint, inputAmount: pending.intent.inputAmount, slippageBps: pending.intent.slippageBps }), value: pending.requestKey } : key;
        form = { direction: pending.intent.direction, tokenMint: pending.intent.direction === 'BUY' ? pending.intent.outputMint : pending.intent.inputMint, inputAmount: pending.intent.inputAmount, slippageBps: String(pending.intent.slippageBps) };
        review = pending.quote ? pending : null;
      } else review = null;
    } catch { state = null; executionState = null; error = 'Controlled swap status unavailable. Execution remains locked.'; }
    finally { busy = false; render(); }
  }
  async function cancelIntent() {
    if (busy || dead || (pending && !cancellable())) return;
    busy = true; error = ''; render();
    try {
      if (pending) {
        const result = await api(base + '/' + encodeURIComponent(pending.id) + '/cancel', { method: 'POST', body: JSON.stringify({}) });
        if (result?.id !== pending.id || !['FAILED', 'CANCELLED', 'EXPIRED'].includes(result?.status) || result.signature) throw Error('Cancellation not verified');
      }
      pending = null; key = null; review = null; revision++;
      form = { direction: 'BUY', tokenMint: '', inputAmount: '', slippageBps: '100' };
    } catch { error = 'Cancellation not confirmed. Existing request retained; refresh status before doing anything else.'; }
    finally { busy = false; render(); }
  }
  async function getQuote() {
    if (busy || dead || !state?.quoteAvailable || !samePending()) return;
    const body = snapshot(), fingerprint = JSON.stringify({ agentId: agent.id, network: 'solana:mainnet', ...body });
    if (!/^[1-9]\d{0,19}$/.test(body.inputAmount) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(form.tokenMint.trim()) || !Number.isInteger(body.slippageBps) || body.slippageBps < 0 || body.slippageBps > 100) { error = 'Enter an explicit mint, positive integer base-unit amount and slippage from 0–100 bps.'; render(); return; }
    if (!key || key.fingerprint !== fingerprint) key = { fingerprint, value: newKey() };
    busy = true; error = ''; review = null; const capturedRevision = revision; render();
    try {
      const result = await api(base + '/quote', { method: 'POST', body: JSON.stringify({ ...body, requestKey: key.value }) });
      if (capturedRevision === revision) {
        pending = active(result) ? result : null;
        review = result.status === 'QUOTED' && result.quote ? result : null;
        if (!review) error = 'QUOTE UNAVAILABLE — request ' + (result.status || 'rejected') + '. No transaction was prepared.';
      }
    } catch { error = 'QUOTE UNAVAILABLE — no transaction was prepared. No automatic retry.'; }
    finally { busy = false; render(); }
  }
  async function prepareControlledBuy() {
    if (busy || dead || prepareAttempted || !executionState?.enabled || !executionState?.prepareEnabled || !executionState?.acceptanceEligible || executionState.signingArmed) return;
    const requestKey = newKey();
    prepareAttempted = true; busy = true; error = ''; render();
    try {
      const result = await api(executionBase + '/prepare', { method: 'POST', body: JSON.stringify({direction:'BUY',inputMint:SOL,outputMint:USDC,inputAmount:'100000',slippageBps:100,requestKey}) });
      executionState = {...executionState,currentExecutionId:result.id,armEligibility:{executionId:result.id,eligible:false,reason:'STATUS_REFRESH_REQUIRED'},records:[result]};
      if(result.status==='PREPARED'&&result.confirmationToken){
        const expiresAt=Number(result.expiresAt);
        if(!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('Confirmation capability expired');
        reviewCapabilities.set(capabilityKey(result.id),{agentId:agent.id,id:result.id,token:result.confirmationToken,expiresAt});
        confirmation={id:result.id,token:result.confirmationToken};
      }
      if (result.status !== 'PREPARED' || !result.messageHash || result.usdcDecimals !== 6) error = 'Preparation was not verified. Do not confirm; refresh status.';
      if(result.status==='PREPARED'){executionState=await api(executionBase);syncCapability();}
    } catch {
      error = 'Preparation status unverified. Refresh status; do not prepare again automatically.';
      try {
        const latest = await api(executionBase);
        executionState = latest;
        const rejected = latest?.records?.find(r => r.id === latest.currentExecutionId && r.requestKey === requestKey && r.status === 'REJECTED_BEFORE_SIGNING' && !r.signature);
        if (rejected) error = `Preparation rejected before signing · ${rejected.reason || 'QUOTE_UNAVAILABLE'}${rejected.quoteDiagnostic?.code ? ' · ' + rejected.quoteDiagnostic.code : ''}. No transaction was signed or sent.`;
      } catch { /* Unknown request outcome remains blocked until manual reconciliation. */ }
    }
    finally { busy = false; render(); }
  }
  async function armControlledBuy(){
    const prepared=selectedRecord();
    if(busy||dead||prepared?.status!=='PREPARED'||prepared.id!==confirmation?.id||executionState.armEligibility?.executionId!==prepared.id||executionState.armEligibility.eligible!==true||executionState.signingArmed||now()>=prepared.expiresAt)return;
    busy=true;error='';render();
    try{const result=await api(executionBase+'/'+encodeURIComponent(prepared.id)+'/arm',{method:'POST',body:'{}'});if(result.executionId!==prepared.id||result.status!=='ARMED')throw Error('Arming not verified');executionState=await api(executionBase);if(executionState.armedExecutionId!==prepared.id)throw Error('Arming status not verified');}
    catch(e){
      error='Arming rejected: '+e.message+'. No signing was requested.';
      try{executionState=await api(executionBase);const current=selectedRecord();if(current?.status==='EXPIRED')error=`Execution ${current.id} expired before Arm. No signing or broadcast.`;}
      catch{error+=' Status unavailable; do not retry automatically.';}
    }
    finally{busy=false;render();}
  }
  async function confirmControlledBuy(){
    const prepared=selectedRecord();
    if(busy||dead||confirmationAttempted||prepared?.status!=='PREPARED'||prepared.id!==confirmation?.id||executionState.armedExecutionId!==prepared.id||now()>=prepared.expiresAt)return;
    const token=confirmation.token;
    // Consumed locally before the request: a remount after an uncertain HTTP
    // outcome must never turn the same capability into another Confirm click.
    forgetCapability(prepared.id);confirmationAttempted=true;busy=true;error='';render();
    try{await api(executionBase+'/'+encodeURIComponent(prepared.id)+'/confirm',{method:'POST',body:JSON.stringify({confirm:true,confirmationToken:token,messageHash:prepared.messageHash,quoteReference:prepared.quoteReference})});executionState=await api(executionBase);syncCapability();}
    catch{error='Confirmation outcome requires reconciliation. Do not confirm again or create another execution automatically.';}
    finally{busy=false;render();}
  }
  const timer = setInterval(tick, 1000);
  refresh();
  return { refresh, destroy() { dead = true; clearInterval(timer); host.innerHTML = ''; } };
}
