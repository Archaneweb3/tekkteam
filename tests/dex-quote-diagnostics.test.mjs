import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyQuoteFailure} from '../server/dex/quote-diagnostics.js';

const cases=[
 ['failed to get account info: 429','RPC_UNAVAILABLE'],
 ['MISSING_ACCOUNT','POOL_ACCOUNT_UNAVAILABLE'],
 ['POOL_SNAPSHOT_LENGTH_MISMATCH','POOL_ACCOUNT_UNAVAILABLE'],
 ['POOL_DISCRIMINATOR','POOL_PROVENANCE_FAILED'],
 ['SWAP_DISABLED','POOL_CLOSED_OR_UNAVAILABLE'],
 ['VAULT_STATE','VAULT_UNAVAILABLE'],
 ['MINT_UNINITIALIZED','MINT_UNAVAILABLE'],
 ['NONCLASSIC_TOKEN','TOKEN_PROGRAM_UNSUPPORTED'],
 ['EMPTY_RESERVE','RESERVE_UNAVAILABLE'],
 ['ZERO_OUTPUT','QUOTE_MATH_FAILED'],
 ['INVALID_INTENT','AMOUNT_INVALID'],
 ['SLIPPAGE_LIMIT','SLIPPAGE_INVALID'],
 ['QUOTE_EXPIRED','QUOTE_EXPIRED'],
 ['STALE_CPMM_SNAPSHOT','STATE_STALE'],
 ['WRONG_NETWORK','NETWORK_MISMATCH'],
 ['CPMM_PROGRAM_UNAVAILABLE','ADAPTER_NOT_READY']
];
for(const [raw,want] of cases)test('quote diagnostic '+want+' from '+raw,()=>{
 const got=classifyQuoteFailure(Error(raw));
 assert.equal(got.stage,'QUOTE');assert.equal(got.code,want);
 assert.equal(JSON.stringify(got).includes('failed to get'),false);
});
test('unknown upstream text is never persisted as technical detail',()=>{
 assert.deepEqual(classifyQuoteFailure(Error('rpc URL https://secret.example/key?token=top-secret')),{stage:'QUOTE',code:'OTHER',detail:null});
});
test('snapshot diagnostics persist only whitelisted slots, counts and times',()=>{
 const error=Object.assign(Error('STALE_POOL_SNAPSHOT'),{code:'STALE_POOL_SNAPSHOT',snapshotDiagnostic:{poolFetchContextSlot:120,dependentFetchContextSlot:119,currentRpcSlot:121,poolFetchedAt:1000,dependentSnapshotFetchedAt:1030,quoteEvaluatedAt:1031,slotDelta:-1,ageMs:1,maxAgeMs:10000,accountCountExpected:15,accountCountReceived:15,minContextSlot:120,cacheTtlMs:null,source:'FRESH_MAINNET_RPC',rpcUrl:'https://secret.example/key'}});
 const result=classifyQuoteFailure(error);
 assert.equal(result.snapshot.slotDelta,-1);assert.equal(result.snapshot.minContextSlot,120);
 assert.equal(result.snapshot.ageMs,1);assert.equal(result.snapshot.maxAgeMs,10000);
 assert.equal(JSON.stringify(result).includes('secret.example'),false);
});
