import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateDexTransaction} from '../server/dex/transaction-validator.js';
import {cpmmEnvelopeContext} from '../server/dex/cpmm-envelope.js';
const e=JSON.parse(fs.readFileSync(new URL('./fixtures/cpmm-envelope-simulation.json',import.meta.url)));
test('captured unsigned Mainnet BUY simulation matches local output, net debit and WSOL closure',()=>{
 const c=cpmmEnvelopeContext(e.policy),d=validateDexTransaction(e.encoded,e.policy);assert.equal(d.messageHash,e.messageHash);assert.equal(e.simulation.err,null);assert(e.simulation.unitsConsumed<=e.policy.computeBudget.units);assert(e.fee<=Number(e.policy.networkFeeCapLamports));
 const [wallet,wsol,target]=e.simulation.accounts;assert.equal(BigInt(wallet.lamports),BigInt(e.policy.agentBalanceLamports)-c.q.amount-BigInt(e.fee)-BigInt(e.policy.rentLamports));assert.equal(wsol.lamports,0);assert.equal(Buffer.from(target.data[0],'base64').readBigUInt64LE(64),c.q.output);
});
test('persisted positive full BUY and synthetic SELL messages reproduce support',()=>{
 const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/cpmm-full-envelope-positive.json',import.meta.url)));for(const x of cases){const d=validateDexTransaction(x.encoded,x.policy);assert.equal(d.messageHash,x.messageHash);assert.equal(d.status,'SUPPORTED_BY_VALIDATOR');}assert.match(cases[1].label,/SYNTHETIC/);
});
