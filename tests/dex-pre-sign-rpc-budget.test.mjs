import test from 'node:test';
import assert from 'node:assert/strict';
import {Connection} from '@solana/web3.js';
import {preSignRpcReader,PRE_SIGN_RPC_BUDGET,observeRpcFetch,withPreSignRpcScope} from '../server/dex/pre-sign-rpc-budget.js';

test('identical concurrent pre-sign reads share one in-flight request, never a settled cache',async()=>{
 let calls=0,release;
 const c={getGenesisHash:async()=>{calls++;await new Promise(resolve=>{release=resolve;});return 'mainnet';}};
 const reader=preSignRpcReader(c);
 const first=reader.getGenesisHash(),second=reader.getGenesisHash();
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);
 release();assert.deepEqual(await Promise.all([first,second]),['mainnet','mainnet']);
 const third=reader.getGenesisHash();await new Promise(resolve=>setTimeout(resolve,PRE_SIGN_RPC_BUDGET.minRequestGapMs+5));release();await third;
 assert.equal(calls,2);
});

test('different pre-sign reads are serialized; minContextSlot is part of identity',async()=>{
 let active=0,peak=0,calls=0;
 const c={getMultipleAccountsInfoAndContext:async(_keys,options)=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,20));active--;return options.minContextSlot;}};
 const r=preSignRpcReader(c),keys=['pool'];
 assert.deepEqual(await Promise.all([r.getMultipleAccountsInfoAndContext(keys,{minContextSlot:100}),r.getMultipleAccountsInfoAndContext(keys,{minContextSlot:100}),r.getMultipleAccountsInfoAndContext(keys,{minContextSlot:101})]),[100,100,101]);
 assert.equal(calls,2);assert.equal(peak,1);
});

test('HTTP Retry-After is captured only as bounded pre-sign metadata, not request contents',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('',{status:429,headers:{'Retry-After':'2'}});
  await assert.rejects(withPreSignRpcScope(async()=>{await observeRpcFetch('https://example.invalid/?api-key=secret',{});throw Error('429 Too Many Requests');}),e=>e.retryAfterMs===2000&&!String(e.message).includes('secret'));
 }finally{globalThis.fetch=original;}
});
test('web3 transport surfaces provider Retry-After to the bounded pre-sign scope',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('limited',{status:429,headers:{'Retry-After':'1'}});
  const connection=new Connection('https://example.invalid',{disableRetryOnRateLimit:true,fetch:observeRpcFetch});
  await assert.rejects(withPreSignRpcScope(()=>preSignRpcReader(connection).getGenesisHash()),e=>e.retryAfterMs===1000&&/429/.test(e.message));
 }finally{globalThis.fetch=original;}
});
