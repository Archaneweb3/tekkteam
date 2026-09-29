import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

export const JUPITER_BUILD_URL = 'https://api.jup.ag/swap/v2/build';
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';
const U64_MAX = (1n << 64n) - 1n;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const address = (value) => {
  try { if (typeof value !== 'string' || new PublicKey(value).toBase58() !== value) fail('INVALID_INTENT'); }
  catch { fail('INVALID_INTENT'); }
  return value;
};
const amount = (value, code = 'QUOTE_INVALID') => {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > U64_MAX) fail(code);
  return BigInt(value);
};

export function assertQuoteFresh(quote, now = Date.now()) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(quote?.createdAt) || !Number.isSafeInteger(quote?.expiresAt) ||
      now < quote.createdAt || now >= quote.expiresAt || quote.expiresAt <= quote.createdAt || quote.expiresAt - quote.createdAt > 30_000) fail('QUOTE_EXPIRED');
  return quote;
}

// Read-only provider adapter: raw instructions are deliberately never returned.
// A valid economic snapshot is NOT a validated transaction or a signing permit.
export function createJupiterQuoteProvider({ fetchImpl = fetch, apiKey = '', now = Date.now, maxSlippageBps = 100, ttlMs = 15_000 } = {}) {
  if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 500 || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 30_000) fail('INVALID_QUOTE_POLICY');
  return Object.freeze({
    async quote(intent) {
      if (!apiKey) fail('QUOTE_UNAVAILABLE');
      if (!intent || intent.network !== 'solana:mainnet' || !['BUY', 'SELL'].includes(intent.direction)) fail('INVALID_INTENT');
      const inputMint = address(intent.inputMint), outputMint = address(intent.outputMint), taker = address(intent.agentWallet);
      if (inputMint === outputMint || (intent.direction === 'BUY' ? inputMint !== NATIVE_SOL_MINT : outputMint !== NATIVE_SOL_MINT)) fail('INVALID_INTENT');
      const inputAmount = intent.inputAmount;
      amount(inputAmount, 'INVALID_INTENT');
      const slippageBps = intent.slippageBps;
      if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > maxSlippageBps) fail('SLIPPAGE_VIOLATION');
      const createdAt = now(), expiresAt = createdAt + ttlMs;
      const query = new URLSearchParams({ inputMint, outputMint, amount: inputAmount, taker, slippageBps: String(slippageBps), platformFeeBps: '0', wrapAndUnwrapSol: 'true' });
      let raw;
      try {
        const response = await fetchImpl(`${JUPITER_BUILD_URL}?${query}`, { method: 'GET', headers: { 'x-api-key': apiKey }, redirect: 'error', signal: AbortSignal.timeout(Math.min(ttlMs, 10_000)), cache: 'no-store' });
        if (!response.ok) fail('QUOTE_UNAVAILABLE');
        // Bound the actual stream, not just Content-Length from an untrusted provider.
        const reader = response.body?.getReader();
        if (!reader) fail('QUOTE_UNAVAILABLE');
        const chunks = []; let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 262_144) { await reader.cancel(); fail('QUOTE_UNAVAILABLE'); }
          chunks.push(Buffer.from(value));
        }
        raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch { fail('QUOTE_UNAVAILABLE'); }
      assertQuoteFresh({ createdAt, expiresAt }, now());
      if (!raw || raw.error || raw.inputMint !== inputMint || raw.outputMint !== outputMint || raw.inAmount !== inputAmount || raw.swapMode !== 'ExactIn' || raw.slippageBps !== slippageBps) fail('QUOTE_INTENT_MISMATCH');
      const estimated = amount(raw.outAmount), minimum = amount(raw.otherAmountThreshold);
      if (minimum > estimated || minimum < estimated * BigInt(10_000 - slippageBps) / 10_000n) fail('SLIPPAGE_VIOLATION');
      if (raw.platformFee && (raw.platformFee.feeBps !== 0 || String(raw.platformFee.amount) !== '0')) fail('QUOTE_FEE_UNSUPPORTED');
      // Initial economic support is deliberately one direct route, not arbitrary splits/CPI paths.
      if (!Array.isArray(raw.routePlan) || raw.routePlan.length !== 1) fail('QUOTE_ROUTE_UNSUPPORTED');
      const leg = raw.routePlan[0];
      if (!leg || typeof leg !== 'object') fail('QUOTE_ROUTE_UNSUPPORTED');
      const info = leg.swapInfo;
      if ((leg.percent !== undefined && leg.percent !== 100) || (leg.bps !== undefined && leg.bps !== 10_000) || (leg.percent === undefined && leg.bps === undefined) ||
          !info || info.inputMint !== inputMint || info.outputMint !== outputMint || info.inAmount !== inputAmount || info.outAmount !== raw.outAmount ||
          typeof info.label !== 'string' || !info.label.length || info.label.length > 80) fail('QUOTE_ROUTE_UNSUPPORTED');
      const ammKey = address(info.ammKey);
      let priceImpactPct = null;
      if (raw.priceImpactPct !== undefined && raw.priceImpactPct !== null) {
        if (typeof raw.priceImpactPct !== 'string' || !/^\d+(\.\d+)?$/.test(raw.priceImpactPct) || !Number.isFinite(Number(raw.priceImpactPct)) || Number(raw.priceImpactPct) > 100) fail('QUOTE_INVALID');
        priceImpactPct = raw.priceImpactPct;
      }
      const result = { provider: 'JUPITER_SWAP_V2', network: 'solana:mainnet', inputMint, outputMint, inputAmount, estimatedOutput: raw.outAmount, minimumOutput: raw.otherAmountThreshold,
        slippageBps, route: [Object.freeze({ ammKey, label: info.label, inputMint, outputMint, percent: 100 })], priceImpactPct, createdAt, expiresAt, executable: false };
      result.reference = createHash('sha256').update(JSON.stringify({ ...result, agentWallet: taker })).digest('hex');
      Object.freeze(result.route);
      return Object.freeze(result);
    }
  });
}
