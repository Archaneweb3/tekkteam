import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { Transaction } from '@solana/web3.js';

// Mock-provider regression only: this does not validate Phantom's private simulator.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const methods = [];
  let simulated;
  await page.route('https://api.devnet.solana.com/**', async route => {
    const { method, params, id } = route.request().postDataJSON();
    methods.push(method);
    let result;
    const context = { slot: 1234 };
    if (method === 'getGenesisHash') result = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
    else if (method === 'getLatestBlockhash') result = { context, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 9999 } };
    else if (method === 'getBalance') result = { context, value: 5000000000 };
    else if (method === 'getFeeForMessage') result = { context, value: 5000 };
    else if (method === 'simulateTransaction') {
      simulated = params[0];
      assert.equal(params[1].replaceRecentBlockhash, false);
      assert.equal(params[1].sigVerify, false);
      result = { context, value: { err: null, logs: ['Memo success'], unitsConsumed: 13505 } };
    } else throw new Error(`Unexpected RPC method: ${method}`);
    await route.fulfill({ json: { jsonrpc: '2.0', id, result } });
  });
  await page.addInitScript(() => {
    window.phantom = { solana: { isPhantom: true, isConnected: true,
      publicKey: { toBase58: () => 'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS' },
      connect: async options => { if (!options.onlyIfTrusted) throw Error('Non-silent connection'); },
      signTransaction: async tx => {
        window.capturedProviderBytes = tx.serialize({ requireAllSignatures: false }).toString('base64');
        throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
      },
    } };
  });
  await page.goto('http://127.0.0.1:5188/phantom-diagnostic.html');
  await page.locator('#test').click();
  await page.waitForFunction(() => document.querySelector('#result').textContent.includes('4001'));
  const evidence = JSON.parse(await page.locator('#result').textContent());
  const argument = await page.evaluate(() => window.capturedProviderBytes);
  assert.equal(simulated, argument);
  assert.equal(evidence.rpcEvidence.transaction.serializedTransactionBase64, argument);
  assert.equal(evidence.providerCall.transaction.serializedTransactionBase64, argument);
  assert.equal(evidence.providerCall.transaction.serializedSha256, createHash('sha256').update(Buffer.from(argument, 'base64')).digest('hex'));
  assert.equal(evidence.rpcEvidence.expectedFeeLamports, 5000);
  assert.equal(evidence.phantomInternalRequest.chainId, null);
  const tx = Transaction.from(Buffer.from(argument, 'base64'));
  assert.equal(tx.instructions.length, 1);
  assert.equal(tx.instructions[0].data.toString(), 'TEKKWORK devnet preview diagnostic');
  assert.equal(tx.instructions[0].programId.toBase58(), 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  assert.equal(tx.instructions[0].keys.length, 0);
  assert.equal(tx.compileMessage().header.numRequiredSignatures, 1);
  assert.equal(evidence.providerCall.transaction.signaturesPresent, 0);
  await page.locator('summary').click();
  await page.locator('#capture-bytes').fill(argument);
  await page.locator('#compare').click();
  await page.waitForFunction(() => document.querySelector('#comparison').textContent.includes('transactionBytesMatch'));
  assert.equal(JSON.parse(await page.locator('#comparison').textContent()).transactionBytesMatch, true);
  const altered = Buffer.from(argument, 'base64'); altered[altered.length - 1] ^= 1;
  await page.locator('#capture-bytes').fill(altered.toString('base64'));
  await page.locator('#compare').click();
  await page.waitForFunction(() => document.querySelector('#comparison').textContent.includes('"transactionBytesMatch": false'));
  await page.locator('#capture-kind').selectOption('message');
  await page.locator('#capture-bytes').fill(evidence.providerCall.transaction.messageBase64);
  await page.locator('#compare').click();
  await page.waitForFunction(() => document.querySelector('#comparison').textContent.includes('message-only capture'));
  assert.equal(JSON.parse(await page.locator('#comparison').textContent()).messageBytesMatch, true);
  assert.deepEqual(errors, []);
  assert.ok(!methods.some(m => /send|airdrop/i.test(m)));
  console.log('PASS: exact RPC/provider bytes, SHA-256, memo-only invariant, rejection evidence, full/message comparisons, no broadcast. Mock provider only.');
} finally { await browser.close(); }
