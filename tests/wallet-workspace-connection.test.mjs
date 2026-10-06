import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync('public/app/wallet-workspace.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountWalletWorkspace','function mountWalletWorkspace');
test('connected unauthenticated wallet is visible without private balance or Agent reads',()=>{
 let connection=null,reads=0;const events=new Map(),host={innerHTML:'',isConnected:true,querySelector:()=>null,querySelectorAll:()=>[]};
 const ctx={request:()=>{reads++;throw Error('Must not read owner data');},esc:v=>String(v),walletProviderDisplay:()=>({name:'Phantom'}),openAgentWalletDrawer(){},window:{addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)}};
 vm.runInNewContext(code,ctx);const mount=ctx.mountWalletWorkspace(host,{getConnection:()=>connection});
 assert.match(host.innerHTML,/OWNER WALLET NOT CONNECTED/);assert.doesNotMatch(host.innerHTML,/Fresh Mainnet read pending/);
 connection={address:'C2nddai75FJZWWkNdUF7csEBryRCMikJyTTZZqYcMiBv',name:'Phantom'};events.get('tekkwork:public-wallet-changed')();
 assert.match(host.innerHTML,/C2ndda…YcMiBv/);assert.match(host.innerHTML,/CONNECTED · SIGN IN REQUIRED/);assert.match(host.innerHTML,/data-wallet-authenticate/);assert.doesNotMatch(host.innerHTML,/OWNER WALLET NOT CONNECTED|data-wallet-refresh/);assert.equal(reads,0);
 connection=null;events.get('tekkwork:public-wallet-changed')();assert.match(host.innerHTML,/OWNER WALLET NOT CONNECTED/);assert.equal(reads,0);
 mount.destroy();assert.equal(events.size,0);
});
