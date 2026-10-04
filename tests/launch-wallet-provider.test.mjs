import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import bs58 from 'bs58';
const owner=bs58.encode(new Uint8Array(32).fill(4));
for(const name of ['Phantom','Solflare','MetaMask'])test(name+' selected Solana provider signs only, rejects account change/disconnect',async t=>{
 const saved={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent};t.after(()=>Object.assign(globalThis,saved));
 let transactionCalls=0,messageCalls=0,change,release;const account={address:owner,chains:['solana:mainnet']};
 const wallet={name,chains:['solana:mainnet'],accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:wallet.accounts})},'standard:events':{on:(_,fn)=>{change=fn;return()=>{};}},'solana:signMessage':{signMessage:async()=>{messageCalls++;return [{signature:new Uint8Array(64)}];}},'solana:signTransaction':{signTransaction:async input=>{transactionCalls++;assert.equal(input.chain,'solana:mainnet');assert.equal(input.account,account);if(release)await release;return [{signedTransaction:new Uint8Array([1,2,3])}];}}}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.window={TekkworkSDK:{Buffer,bs58},addEventListener(){},dispatchEvent(event){if(event.type==='wallet-standard:app-ready')event.detail.register(wallet);}};
 globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/auth/challenge')?{id:'fixture',message:'Fixture only'}:{}});
 const b=await import('../public/app/backend.js?launch-'+name);const rows=b.wallets();await b.connect(rows.find(r=>r.name===name).id);
 const signer=b.launchWallet(owner);assert.equal(transactionCalls,0);assert.equal(await signer.signTransaction('AQID'),'AQID');assert.equal(transactionCalls,1);assert.equal(messageCalls,1);
 let resume;release=new Promise(r=>resume=r);const pending=signer.signTransaction('AQID');wallet.accounts=[];change({accounts:[]});resume();await assert.rejects(pending,/changed|selected/);
 assert.throws(()=>b.launchWallet(owner));assert.equal(transactionCalls,2);
});

for(const name of ['Phantom','Solflare'])test(name+' injected provider rejects replacement, missing signer and late disconnect',async t=>{
 const saved={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent};t.after(()=>Object.assign(globalThis,saved));
 let calls=0,connectCalls=0,release;const key={toBase58:()=>owner};
 const injected={isPhantom:name==='Phantom',isSolflare:name==='Solflare',isConnected:false,publicKey:key,
  connect:async()=>{connectCalls++;injected.isConnected=true;},signMessage:async()=>({signature:new Uint8Array(64)}),
  signTransaction:async tx=>{calls++;assert.deepEqual([...tx.bytes],[1,2,3]);if(release)await release;return {serialize:options=>{assert.deepEqual(options,{requireAllSignatures:true,verifySignatures:true});return Buffer.from([1,2,3]);}};},
  disconnect:async()=>{injected.isConnected=false;},on(){},removeListener(){}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.window={TekkworkSDK:{Buffer,bs58,Transaction:{from:bytes=>({bytes})}},addEventListener(){},dispatchEvent(){},...(name==='Phantom'?{phantom:{solana:injected}}:{solflare:injected})};
 globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/auth/challenge')?{id:'fixture',message:'Fixture only'}:{}});
 const b=await import('../public/app/backend.js?injected-'+name);const rows=b.wallets();await b.connect(rows.find(r=>r.name===name).id);
 const signer=b.launchWallet(owner);assert.equal(calls,0);assert.equal(await signer.signTransaction('AQID'),'AQID');assert.equal(connectCalls,1);
 const original=injected.signTransaction;injected.signTransaction=undefined;await assert.rejects(signer.signTransaction('AQID'),/signing unavailable/);injected.signTransaction=original;
 if(name==='Phantom')window.phantom.solana={...injected};else window.solflare={...injected};
 await assert.rejects(signer.signTransaction('AQID'),/changed/);assert.equal(calls,1);
 if(name==='Phantom')window.phantom.solana=injected;else window.solflare=injected;
 let resume;release=new Promise(r=>resume=r);const pending=signer.signTransaction('AQID');injected.isConnected=false;resume();await assert.rejects(pending,/changed/);assert.equal(calls,2);
 injected.isConnected=true;await b.disconnect();assert.throws(()=>b.launchWallet(owner),/Reconnect/);assert.equal(connectCalls,1);
});
