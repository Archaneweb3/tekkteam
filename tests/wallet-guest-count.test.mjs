import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('guest Wallet does not assert zero Agents or request private balances',()=>{
 const source=readFileSync('public/app/wallet-workspace.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
 const host={isConnected:true,innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const ctx={request:()=>assert.fail('No guest balance read'),openAgentWalletDrawer:()=>assert.fail('No guest drawer'),walletProviderDisplay:()=>null,esc:String,window:{addEventListener(){},removeEventListener(){}}};
 vm.runInNewContext(source,ctx);const mounted=ctx.mountWalletWorkspace(host);assert.match(host.innerHTML,/<strong>AGENTS UNAVAILABLE<\/strong>/);assert.doesNotMatch(host.innerHTML,/>0 AGENTS</);assert.match(host.innerHTML,/OWNER WALLET NOT CONNECTED/);mounted.destroy();
});
