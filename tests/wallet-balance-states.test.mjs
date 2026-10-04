import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const raw=readFileSync('public/app/wallet-balance.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
const context={window:{addEventListener(){}}};vm.runInNewContext(raw,context);
const view=context.walletBalancePresentation;
test('connected transport never displays cached balance before authentication',()=>{
 const pending=view({readOnly:true,canAuthenticate:true,entry:{lamports:999999999}});
 assert.equal(pending.state,'auth');assert.equal(pending.value,'Sign in to load balance');
 assert.doesNotMatch(pending.value,/unavailable|SOL/);assert.match(pending.detail,/authentication message/);
});
test('authenticated balance distinguishes zero, loading, expired session, denied runtime and RPC failure',()=>{
 assert.equal(view({}).state,'loading');
 const ready=view({entry:{lamports:0}});assert.equal(ready.value,'0.000000 SOL');assert.equal(ready.state,'ready');
 assert.equal(view({entry:{lamports:1234567890}}).value,'1.234568 SOL');
 assert.match(view({canAuthenticate:true,entry:{error:'SIGN_IN_REQUIRED'}}).detail,/session expired/);
 assert.match(view({entry:{error:'READ_DISABLED'}}).detail,/disabled in this local runtime/);
 assert.match(view({entry:{error:'UNAVAILABLE'}}).detail,/request failed/);
 assert.equal(view({entry:{error:'UNAVAILABLE'}}).network,'NETWORK UNAVAILABLE');
});

test('provider icon survives missing extension metadata without leaking across owners or providers',()=>{
 const storage=new Map();const ctx={window:{addEventListener(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};vm.runInNewContext(raw,ctx);
 const icon='data:image/png;base64,aGVsbG8=';
 ctx.rememberWalletProvider('owner-a',{name:'Phantom',icon});
 assert.equal(ctx.walletProviderDisplay('owner-a',{name:'Phantom',icon:null}).icon,icon);
 ctx.rememberWalletProvider('owner-a',{name:'Phantom',icon:null});
 assert.equal(ctx.walletProviderDisplay('owner-a',null).icon,icon);
 assert.equal(ctx.walletProviderDisplay('owner-b',{name:'Phantom',icon:null}).icon,null);
 assert.equal(ctx.walletProviderDisplay('owner-a',{name:'Solflare',icon:null}).icon,null);
 assert.equal(ctx.walletProviderDisplay('owner-a',{name:'Phantom',icon:'javascript:bad'}).icon,icon);
 ctx.forgetWalletProvider();assert.equal(ctx.walletProviderDisplay('owner-a',null),null);
 // Metadata arriving after restoration is retained for the next render/reload.
 ctx.walletProviderDisplay('owner-a',{name:'Phantom',icon});
 assert.equal(ctx.walletProviderDisplay('owner-a',{name:'Phantom'}).icon,icon);
});
