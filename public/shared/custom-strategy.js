// ─────────────────────────────────────────────────────────────
//  Custom strategies: a creator builds ONE named strategy per wallet
//  with sliders. It starts from an entry style (Classic, Scalper, Trend,
//  Dip Buyer, Sniper) and every number below can be changed within these
//  (wide) limits. Shared by the browser (sliders) and the server
//  (validation), so both always agree.
// ─────────────────────────────────────────────────────────────

export const CUSTOM_BASES = ['classic', 'scalper', 'trend', 'dip', 'sniper'];
export const CUSTOM_PREFIX = 'custom-';
export const NAME_MAX = 24;

// kind: pct = fraction shown as %, neg = negative fraction, usd, int, min (minutes, 0 = off)
export const FIELDS = {
  sizePct:        { label: 'Per trade',           group: 'size',  kind: 'pct', min: 0.01, max: 0.50, step: 0.01, hint: 'Share of the agent\'s SOL used for each buy' },
  maxOpen:        { label: 'Open positions',      group: 'size',  kind: 'int', min: 1,    max: 5,    step: 1,    hint: 'How many tokens it may hold at once' },
  takeProfitPct:  { label: 'Take profit',         group: 'exit',  kind: 'pct', min: 0.02, max: 3.00, step: 0.01, hint: 'Sell everything once up this much' },
  stopLossPct:    { label: 'Stop loss',           group: 'exit',  kind: 'neg', min: -0.50, max: -0.01, step: 0.01, hint: 'Sell everything once down this much' },
  trailAt:        { label: 'Trailing starts at',  group: 'exit',  kind: 'pct', min: 0.02, max: 1.00, step: 0.01, hint: 'Profit that switches the trailing stop on (0 = off)', optional: true },
  trailBy:        { label: 'Trail distance',      group: 'exit',  kind: 'pct', min: 0.01, max: 0.50, step: 0.01, hint: 'Sell when it drops this much from its best point' },
  maxHoldMin:     { label: 'Max hold time',       group: 'exit',  kind: 'min', min: 0,    max: 1440, step: 5,    hint: 'Close the trade after this long (0 = no limit)' },
  cooldownMin:    { label: 'Cooldown',            group: 'exit',  kind: 'min', min: 0,    max: 240,  step: 5,    hint: 'Wait before buying the same token again' },
  minLiquidityUsd:{ label: 'Min liquidity',       group: 'entry', kind: 'usd', min: 30000, max: 1000000, step: 5000, hint: 'Only tokens with at least this much liquidity' },
  minVol5mUsd:    { label: 'Min 5m volume',       group: 'entry', kind: 'usd', min: 1000, max: 500000, step: 1000, hint: 'Volume in the last 5 minutes', bases: ['scalper', 'sniper'] },
  minChange5m:    { label: 'Min 5m move',         group: 'entry', kind: 'pct', min: 0.005, max: 0.30, step: 0.005, hint: 'Price must be up at least this much in 5m', bases: ['scalper', 'sniper'] },
  maxChange5m:    { label: 'Max 5m move',         group: 'entry', kind: 'pct', min: 0.01, max: 0.60, step: 0.01, hint: 'Skip tokens that already moved more than this', bases: ['sniper'] },
  maxSpike5m:     { label: 'Max recent spike',    group: 'entry', kind: 'pct', min: 0.05, max: 1.00, step: 0.01, hint: 'Never chase a token that spiked more than this', bases: ['sniper'] },
  minVol1hUsd:    { label: 'Min 1h volume',       group: 'entry', kind: 'usd', min: 10000, max: 5000000, step: 10000, hint: 'Volume in the last hour', bases: ['trend'] },
  minRun1h:       { label: 'Min pump first',      group: 'entry', kind: 'pct', min: 0.02, max: 1.00, step: 0.01, hint: 'The token must have run up this much in the last hour', bases: ['dip'] },
  pullbackMin:    { label: 'Pullback from',       group: 'entry', kind: 'pct', min: 0.02, max: 0.50, step: 0.01, hint: 'Buy the dip when it is down at least…', bases: ['dip'] },
  pullbackMax:    { label: 'Pullback up to',      group: 'entry', kind: 'pct', min: 0.03, max: 0.70, step: 0.01, hint: '…and no more than this from the 1h high', bases: ['dip'] },
  bounceFromLow:  { label: 'Bounce off low',      group: 'entry', kind: 'pct', min: 0.005, max: 0.20, step: 0.005, hint: 'Must already bounce this much off the low', bases: ['dip'] },
};

export const fieldsFor = (base) => Object.entries(FIELDS).filter(([, f]) => !f.bases || f.bases.includes(base)).map(([k]) => k);

const round = (x, step) => { const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) + 1; return Number((Math.round(x / step) * step).toFixed(d)); };

// Defaults for a base, taken from the built-in strategy (flat params, trail split into trailAt/trailBy)
export function defaultsFor(base, builtIn = {}) {
  const b = builtIn || {};
  const out = {};
  for (const k of fieldsFor(base)) {
    const f = FIELDS[k];
    let v = k === 'trailAt' ? (b.trail ? b.trail.at : 0) : k === 'trailBy' ? (b.trail ? b.trail.by : 0.03) : b[k];
    if (v == null) v = k === 'maxHoldMin' || k === 'cooldownMin' ? 0 : k === 'minLiquidityUsd' ? 30000 : f.min;
    out[k] = v;
  }
  return sanitize(base, out).params;
}

// Validates + clamps. Returns { base, params } or throws with a plain message.
export function sanitize(base, raw) {
  if (!CUSTOM_BASES.includes(base)) throw new Error('Pick an entry style');
  const params = {};
  for (const k of fieldsFor(base)) {
    const f = FIELDS[k];
    let v = Number(raw?.[k]);
    if (!Number.isFinite(v)) throw new Error(`${f.label} is missing`);
    if (k === 'trailAt' && v <= 0) { params[k] = 0; continue; }
    v = Math.min(f.max, Math.max(f.min, v));
    params[k] = f.kind === 'int' ? Math.round(v) : round(v, f.step);
  }
  if (base === 'dip' && params.pullbackMax <= params.pullbackMin) params.pullbackMax = Math.min(FIELDS.pullbackMax.max, round(params.pullbackMin + 0.01, 0.01));
  if (base === 'sniper' && params.maxChange5m <= params.minChange5m) params.maxChange5m = Math.min(FIELDS.maxChange5m.max, round(params.minChange5m + 0.01, 0.01));
  return { base, params };
}

export function cleanName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (n.length < 2) throw new Error('Give your strategy a name (2+ characters)');
  return n;
}

// The runtime strategy object the engine uses (same shape as config.js → strategies)
export function toRuntime(c) {
  const p = c.params;
  const s = { name: c.name, custom: true, base: c.base, ...p };
  s.trail = p.trailAt > 0 ? { at: p.trailAt, by: p.trailBy } : null;
  delete s.trailAt; delete s.trailBy;
  s.maxHoldMin = p.maxHoldMin || null;
  return s;
}

// One line with every setting: part of the message the wallet signs, so the
// server stores exactly what the creator saw and approved.
export function settingsLine(name, base, params) {
  return `Settings: ${JSON.stringify({ name, base, ...Object.fromEntries(fieldsFor(base).map((k) => [k, params[k]])) })}`;
}
