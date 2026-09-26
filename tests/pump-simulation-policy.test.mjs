import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
const fixture=JSON.parse(fs.readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url)));
function evaluate(mutate=()=>{}){const e=structuredClone(fixture);mutate(e);return evaluateSimulation(Buffer.from(e.transactionBase64,'base64'),{mint:new PublicKey(e.mint),blockhash:e.recentBlockhash,genesis:e.genesis,chainId:e.chainId},{before:e.before,afterRead:e.afterRead,simulation:e.simulation,fee:e.feeQuote.value});}
test('same-bank captured simulation passes estimated policy, not absolute cap',()=>{const p=evaluate();assert.equal(p.allowed,true);assert.equal(p.estimatedPayerDebitLamports,5511640);assert.equal(p.createdAccountFundingLamports,5501640);assert.equal(p.accountEffects.filter(a=>a.created).length,3);});
test('reject failure, missing balances, unknown program or CPI',()=>{
 for(const mutate of [e=>{e.simulation.value.err={InstructionError:[0,'failure']};},e=>{e.simulation.value.accounts=null;},e=>{delete e.simulation.value.err;},e=>{e.simulation.value.logs=e.simulation.value.logs.filter(l=>!l.includes('Instruction: CreateV2'));},e=>{e.simulation.value.logs.push('Program FakeProgram invoke [2]');},e=>{e.simulation.value.innerInstructions[0].instructions[0].parsed.type='withdrawNonce';},e=>{e.simulation.value.innerInstructions[0].instructions[0].parsed.info.source='11111111111111111111111111111111';}])assert.equal(evaluate(mutate).allowed,false);
});
test('cross-bank external account differences are warnings, not transaction mutation proof',()=>{
 const p=evaluate(e=>{e.before.context.slot--;e.simulation.value.accounts[1].lamports++;});
 assert.equal(p.allowed,true);assert.deepEqual(p.reasons,[]);
 for(const code of ['PRESTATE_NOT_SAME_BANK','READONLY_ACCOUNT_CHANGED','DEBIT_NOT_RECONCILED_WITH_FEE_AND_ACCOUNT_EFFECTS'])assert.ok(p.warnings.includes(code),code);
 assert.equal(p.estimatedPayerDebitLamports,5511640);
});
test('cross-bank policy still rejects excessive debit and unexpected CPI movement',()=>{
 for(const mutate of [e=>{e.simulation.value.accounts[5].lamports-=5000000;},e=>{e.simulation.value.innerInstructions[0].instructions[0].parsed.info.source='11111111111111111111111111111111';}])assert.equal(evaluate(e=>{e.before.context.slot--;mutate(e);}).allowed,false);
});
test('same-bank unexpected readonly mutation remains fatal',()=>{
 const p=evaluate(e=>{e.simulation.value.accounts[1].lamports++;});assert.equal(p.allowed,false);assert.ok(p.reasons.includes('READONLY_ACCOUNT_CHANGED'));
});
test('reject over-limit debit even when balances reconcile',()=>{const p=evaluate(e=>{e.simulation.value.accounts[5].lamports-=5000000;e.simulation.value.accounts[0].lamports+=5000000;});assert.equal(p.allowed,false);assert.ok(p.reasons.includes('ESTIMATED_DEBIT_EXCEEDS_LIMIT'));});
test('reject unexplained debit and unknown fee',()=>{assert.equal(evaluate(e=>e.feeQuote.value=null).allowed,false);assert.equal(evaluate(e=>e.simulation.value.accounts[5].lamports--).allowed,false);});
