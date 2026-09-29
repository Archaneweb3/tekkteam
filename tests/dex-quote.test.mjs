import test from 'node:test';
import assert from 'node:assert/strict';
import { createJupiterQuoteProvider, assertQuoteFresh, JUPITER_BUILD_URL, NATIVE_SOL_MINT } from '../server/dex/quote.js';

const token = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const wallet = '11111111111111111111111111111111';
const intent = { direction: 'BUY', network: 'solana:mainnet', inputMint: NATIVE_SOL_MINT, outputMint: token, inputAmount: '100000', slippageBps: 100, agentWallet: wallet };
const response = (i = intent) => ({ inputMint: i.inputMint, outputMint: i.outputMint, inAmount: i.inputAmount, outAmount: '200000', otherAmountThreshold: '198000', swapMode: 'ExactIn', slippageBps: i.slippageBps, priceImpactPct: '0.01',
  routePlan: [{ percent: 100, bps: 10000, swapInfo: { ammKey: token, label: 'fixture-route', inputMint: i.inputMint, outputMint: i.outputMint, inAmount: i.inputAmount, outAmount: '200000' } }],
  swapInstruction: { data: 'UNTRUSTED NEVER RETURNED' }, setupInstructions: [], otherInstructions: [] });
const provider = (raw = response(), extra = {}) => createJupiterQuoteProvider({ apiKey: 'fixture-key', now: () => 1000, fetchImpl: async () => new Response(JSON.stringify(raw)), ...extra });
const rejects = (p, code) => assert.rejects(p, { code });

test('mock quote uses current V2 API with exact immutable intent; strips all executable material', async () => {
  let calls = 0;
  const p = provider(response(), { fetchImpl: async (url, options) => {
    calls++;
    const u = new URL(url); assert.equal(u.origin + u.pathname, JUPITER_BUILD_URL);
    assert.equal(u.searchParams.get('amount'), intent.inputAmount);
    assert.equal(u.searchParams.get('taker'), wallet);
    assert.equal(u.searchParams.get('slippageBps'), '100');
    assert.equal(u.searchParams.get('platformFeeBps'), '0');
    assert.equal(u.searchParams.has('tipAmount'), false);
    assert.equal(options.headers['x-api-key'], 'fixture-key');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET');
    return new Response(JSON.stringify(response()));
  } });
  const q = await p.quote(intent);
  assert.equal(q.estimatedOutput, '200000'); assert.equal(q.minimumOutput, '198000');
  assert.equal(q.createdAt, 1000); assert.equal(q.expiresAt, 16000); assert.equal(q.executable, false);
  assert.equal(q.reference.length, 64); assert.equal(q.swapInstruction, undefined);
  assert.equal(JSON.stringify(q).includes('fixture-key'), false);
  assert.ok(Object.isFrozen(q) && Object.isFrozen(q.route) && Object.isFrozen(q.route[0])); assert.equal(calls, 1);
});
test('SELL quote supported without choosing token or amount', async () => {
  const i = { ...intent, direction: 'SELL', inputMint: token, outputMint: NATIVE_SOL_MINT };
  const q = await provider(response(i)).quote(i); assert.equal(q.outputMint, NATIVE_SOL_MINT);
});
test('quote freshness expires at boundary, rejects future clock and slow response', async () => {
  assertQuoteFresh({ createdAt: 1000, expiresAt: 16000 }, 15999);
  assert.throws(() => assertQuoteFresh({ createdAt: 1000, expiresAt: 16000 }, 16000), { code: 'QUOTE_EXPIRED' });
  assert.throws(() => assertQuoteFresh({ createdAt: 1000, expiresAt: 16000 }, 999), { code: 'QUOTE_EXPIRED' });
  let time = 1000;
  await rejects(provider(response(), { now: () => time, fetchImpl: async () => { time = 16000; return new Response(JSON.stringify(response())); } }).quote(intent), 'QUOTE_EXPIRED');
});
for (const field of ['inputMint', 'outputMint', 'inAmount', 'swapMode', 'slippageBps']) test(`provider ${field} mutation rejected`, async () => {
  const r = response(); r[field] = field === 'slippageBps' ? 101 : 'different';
  await rejects(provider(r).quote(intent), 'QUOTE_INTENT_MISMATCH');
});
test('minimum output must respect input slippage ceiling, output ceiling, positive u64', async () => {
  for (const min of ['197999', '200001']) await rejects(provider({ ...response(), otherAmountThreshold: min }).quote(intent), 'SLIPPAGE_VIOLATION');
  for (const min of ['0', '-1', 'NaN', '18446744073709551616']) await rejects(provider({ ...response(), otherAmountThreshold: min }).quote(intent), 'QUOTE_INVALID');
});
test('intent slippage and amount/network/mint validation occurs before fetch', async () => {
  let calls = 0; const p = provider(response(), { fetchImpl: async () => { calls++; throw Error(); } });
  for (const slippageBps of [101, -1, 0.5, NaN]) await rejects(p.quote({ ...intent, slippageBps }), 'SLIPPAGE_VIOLATION');
  for (const change of [{ inputAmount: '0' }, { inputAmount: 1000 }, { inputAmount: '18446744073709551616' }, { network: 'devnet' }, { outputMint: intent.inputMint }, { direction: 'AUTO' }, { agentWallet: 'invalid' }]) await rejects(p.quote({ ...intent, ...change }), 'INVALID_INTENT');
  assert.equal(calls, 0);
});
test('missing configuration/provider errors never return dummy quote or expose upstream body', async () => {
  await rejects(provider(response(), { apiKey: '' }).quote(intent), 'QUOTE_UNAVAILABLE');
  for (const fetchImpl of [async () => { throw Error('SECRET UPSTREAM'); }, async () => new Response('SECRET', { status: 429 }), async () => new Response('{bad'), async () => new Response('x'.repeat(262145))]) await rejects(provider(response(), { fetchImpl }).quote(intent), 'QUOTE_UNAVAILABLE');
});
test('unsupported routes, platform fees and invalid impact fail closed', async () => {
  for (const routePlan of [[], [null], [...response().routePlan, ...response().routePlan], [{ ...response().routePlan[0], percent: 50 }]]) await rejects(provider({ ...response(), routePlan }).quote(intent), 'QUOTE_ROUTE_UNSUPPORTED');
  await rejects(provider({ ...response(), platformFee: { feeBps: 1, amount: '1' } }).quote(intent), 'QUOTE_FEE_UNSUPPORTED');
  await rejects(provider({ ...response(), priceImpactPct: 'NaN' }).quote(intent), 'QUOTE_INVALID');
});
