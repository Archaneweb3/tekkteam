// Read-only RPC control. No wallet provider, signing, sending, or backend calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import { Transaction } from '@solana/web3.js';
const endpoint = 'https://api.devnet.solana.com';
const source = fs.readFileSync(new URL('../docs/phantom-preview-edge-2026-09-26.md', import.meta.url), 'utf8');
const blocks = [...source.matchAll(/```text\r?\n([\s\S]*?)```/g)].map(m => m[1].trim());
const original = Buffer.from(blocks[0], 'base64');
const captured = Buffer.from(bs58.decode(blocks[2]));
const hash = b => createHash('sha256').update(b).digest('hex');
const serialize = tx => tx.serialize({ requireAllSignatures: false, verifySignatures: false });
const instruction = i => ({ programId: i.programId.toBase58(), keys: i.keys.map(k => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })), dataHex: i.data.toString('hex') });
const describe = b => { const tx = Transaction.from(b); return { length: b.length, sha256: hash(b), base64: b.toString('base64'), feePayer: tx.feePayer.toBase58(), blockhash: tx.recentBlockhash, requiredSignatures: tx.compileMessage().header.numRequiredSignatures, signaturesPresent: tx.signatures.filter(s => s.signature).length, instructions: tx.instructions.map(instruction) }; };
assert.equal(captured.length, 255);
assert.equal(hash(captured), '2450bdcbce0d42a9300370ca15bf9a45e15a7433c7733a8062c49ea2732a687b');
assert.ok(captured.equals(Buffer.from(blocks[3], 'base64')));
const a = Transaction.from(original), b = Transaction.from(captured);
assert.ok(serialize(b).equals(captured));
assert.equal(a.feePayer.toBase58(), b.feePayer.toBase58());
assert.equal(a.recentBlockhash, b.recentBlockhash);
assert.equal(a.instructions.length, 1);
assert.equal(b.instructions.length, 3);
assert.deepEqual(instruction(a.instructions[0]), instruction(b.instructions[2]));
assert.deepEqual(b.instructions.slice(0, 2).map(i => i.data.toString('hex')), ['03d8b8050000000000', '02400d0300']);
let id = 0;
const allowed = new Set(['getGenesisHash', 'getBlockHeight', 'isBlockhashValid', 'getBalance', 'getLatestBlockhash', 'getFeeForMessage', 'simulateTransaction']);
async function rpc(method, params = []) {
  assert.ok(allowed.has(method));
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${method}`);
  const body = await response.json(); if (body.error) throw new Error(JSON.stringify(body.error)); return body.result;
}
const config = { encoding: 'base64', commitment: 'finalized', sigVerify: false, replaceRecentBlockhash: false };
async function simulate(bytes) {
  const tx = Transaction.from(bytes);
  const simulation = await rpc('simulateTransaction', [bytes.toString('base64'), config]);
  const fee = await rpc('getFeeForMessage', [tx.serializeMessage().toString('base64'), { commitment: 'finalized' }]);
  return { transaction: describe(bytes), simulation, fee };
}
const report = { startedAt: new Date().toISOString(), endpoint, config, historicalOriginal: describe(original), historicalPhantom: describe(captured) };
report.genesisHash = await rpc('getGenesisHash');
report.blockHeight = await rpc('getBlockHeight', [{ commitment: 'finalized' }]);
report.historicalBlockhashValid = await rpc('isBlockhashValid', [b.recentBlockhash, { commitment: 'finalized' }]);
report.balanceBefore = await rpc('getBalance', [a.feePayer.toBase58(), { commitment: 'finalized' }]);
report.historicalReplay = { original: await simulate(original), transformed: await simulate(captured) };
if (!report.historicalBlockhashValid.value) {
  report.historicalReplay.note = 'Historical blockhash is invalid; exact replay cannot execute. The following separate pair is a causal control, NOT byte-identical historical replay.';
  console.error('Historical validity false; historical replay errors:', JSON.stringify([report.historicalReplay.original.simulation.value.err, report.historicalReplay.transformed.simulation.value.err]));
  const fresh = await rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const freshA = Transaction.from(original), freshB = Transaction.from(captured);
  freshA.recentBlockhash = fresh.value.blockhash; freshB.recentBlockhash = fresh.value.blockhash;
  assert.deepEqual(freshA.instructions.map(instruction), a.instructions.map(instruction));
  assert.deepEqual(freshB.instructions.map(instruction), b.instructions.map(instruction));
  // Reverting only the blockhash must recover each exact historical byte array.
  const checkA = Transaction.from(serialize(freshA)), checkB = Transaction.from(serialize(freshB));
  checkA.recentBlockhash = a.recentBlockhash; checkB.recentBlockhash = b.recentBlockhash;
  assert.ok(serialize(checkA).equals(original)); assert.ok(serialize(checkB).equals(captured));
  report.causalControl = { label: 'Fresh shared-blockhash control, not historical replay', fresh, original: await simulate(serialize(freshA)), transformed: await simulate(serialize(freshB)) };
}
report.balanceAfter = await rpc('getBalance', [a.feePayer.toBase58(), { commitment: 'finalized' }]);
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
