import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransferIntentKeys} from '../public/app/wallet-transfer-intent.js';
const intent={kind:'WITHDRAW',agentId:'a',source:'agent-wallet',destination:'owner-wallet',lamports:50000000,network:'solana:mainnet'};
function fixture(){let count=0;return {keys:createTransferIntentKeys(()=>`key-${++count}`),count:()=>count};}
test('failed prepare amount 0.05 to 0.005 creates fresh immutable intent',()=>{const {keys}=fixture();const a=keys.forPrepare(intent);assert.notEqual(keys.forPrepare({...intent,lamports:5000000}),a);assert.notEqual(keys.forPrepare(intent),a);});
test('same intent retries, double clicks, rerenders and reconciliation retain key',()=>{const {keys,count}=fixture();const a=keys.forPrepare(intent);for(let i=0;i<10;i++)assert.equal(keys.forPrepare({...intent}),a);assert.equal(count(),1);});
test('close then intentional reopen, including terminal result, gets new key',()=>{const {keys,count}=fixture();const a=keys.forPrepare(intent);keys.begin();assert.equal(count(),1);assert.notEqual(keys.forPrepare(intent),a);});
test('successful funding then new withdrawal never shares key',()=>{const {keys}=fixture();const a=keys.forPrepare({...intent,kind:'FUND',source:intent.destination,destination:intent.source});keys.begin();assert.notEqual(keys.forPrepare(intent),a);});
for(const field of ['kind','agentId','source','destination','lamports','network'])test('changed '+field+' means new key',()=>{const {keys}=fixture();const a=keys.forPrepare(intent);const value=field==='lamports'?5000000:field==='kind'?'FUND':'different';assert.notEqual(keys.forPrepare({...intent,[field]:value}),a);});
test('snapshot ignores unrelated changes and cannot be mutated through original object',()=>{const {keys}=fixture(),i={...intent};const a=keys.forPrepare(i);i.lamports=1;assert.equal(keys.forPrepare({...intent,status:'FAILED',balance:3}),a);assert.notEqual(keys.forPrepare(i),a);});
