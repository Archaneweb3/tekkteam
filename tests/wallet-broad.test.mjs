import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {walletShortcuts,walletName,injectedWallet} from '../public/app/wallet-catalog.js';
import {mobileWalletBrowse,mobileWalletPresentation,renderMobileWalletChoice} from '../public/app/wallet-mobile.js';
import {canRegisterMobileWallet,messageOnlyMobileWallet} from '../public/app/wallet-mwa-policy.js';
const owner=bs58.encode(new Uint8Array(32).fill(8));
test('MWA capability events and connect results cannot leak transaction features, while signMessage binds current account',async()=>{
 let change,off=false,signed;
 const account={address:owner,publicKey:bs58.decode(owner),chains:['solana:mainnet'],features:['solana:signMessage','solana:signTransaction','solana:signIn']};
 const raw={accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'standard:events':{on:(_,fn)=>{change=fn;return ()=>off=true;}},'solana:signMessage':{signMessage:async input=>{signed=input;return [{signature:new Uint8Array(64)}];}},'solana:signTransaction':{signTransaction:()=>{throw Error('Forbidden');}}}};
 const view=messageOnlyMobileWallet(raw);let event;const remove=view.features['standard:events'].on('change',value=>event=value);
 change({features:raw.features,accounts:raw.accounts});assert.deepEqual(Object.keys(event.features),['standard:connect','standard:events','solana:signMessage']);assert.deepEqual(event.accounts[0].features,['solana:signMessage']);
 const result=await view.features['standard:connect'].connect();assert.equal(result.accounts[0],view.accounts[0]);assert.equal(event.accounts[0],result.accounts[0]);
 const message=new Uint8Array([1,2]);await view.features['solana:signMessage'].signMessage({account:result.accounts[0],message});assert.equal(signed.account,account);assert.equal(signed.message,message);
 raw.accounts=[];assert.throws(()=>view.features['solana:signMessage'].signMessage({account:result.accounts[0],message}),/account changed/);remove();assert.equal(off,true);
});
test('official app links retain only public routes and Trust explicitly selects Solana 501',()=>{
 const href='https://tekkteam.tech/private?session=secret#/launch';
 assert.equal(mobileWalletBrowse('Backpack',href),'https://backpack.app/ul/v1/browse/https%3A%2F%2Ftekkteam.tech%2F%23%2Flaunch?ref=https%3A%2F%2Ftekkteam.tech');
 const trust=new URL(mobileWalletBrowse('Trust Wallet',href));assert.equal(trust.origin,'https://link.trustwallet.com');assert.equal(trust.searchParams.get('coin_id'),'501');assert.equal(trust.searchParams.get('url'),'https://tekkteam.tech/#/launch');
 for(const name of ['Jupiter Mobile','Espresso Cash']){assert.equal(mobileWalletBrowse(name,href),null);const blocked=mobileWalletPresentation({name,href,userAgent:'Android Chrome'});assert.match(blocked.note,/Adapter is unavailable/);assert.doesNotMatch(blocked.note,/local preview/i);const ready=mobileWalletPresentation({name,href,userAgent:'Android Chrome',mwaId:'standard-mwa'});assert.equal(ready.providerId,'standard-mwa');assert.match(renderMobileWalletChoice({name},ready,'',String),/data-wallet="standard-mwa"/);}
 const mm=mobileWalletPresentation({name:'MetaMask',href,userAgent:'Android MetaMask'});assert.equal(mm.url,null);assert.match(mm.note,/Ethereum accounts cannot connect/);
});
test('Android MWA registration is HTTPS browser-only and exposes no transaction or automatic sign-in port',()=>{
 const env={href:'https://tekkteam.tech/#/overview',userAgent:'Mozilla Android Chrome/130.0',secure:true};assert.equal(canRegisterMobileWallet(env),true);
 for(const change of [{secure:false},{href:'http://127.0.0.1:5199'},{userAgent:'iPhone Safari'},{userAgent:'Android Chrome/130.0; wv)'},{userAgent:'Android Chrome/130.0 MetaMask'}])assert.equal(canRegisterMobileWallet({...env,...change}),false);
 const effects=[],raw={version:'1.0.0',name:'Mobile Wallet Adapter',icon:'data:image/png;base64,AA==',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{connect:()=>effects.push('connect')},'standard:disconnect':{},'standard:events':{},'solana:signMessage':{},'solana:signIn':{},'solana:signTransaction':{},'solana:signAndSendTransaction':{}}};
 const view=messageOnlyMobileWallet(raw);assert.deepEqual(effects,[]);assert.deepEqual(Object.keys(view.features),['standard:connect','standard:disconnect','standard:events','solana:signMessage']);assert.deepEqual(view.chains,['solana:mainnet']);raw.accounts=[{address:owner,chains:['solana:mainnet'],features:['solana:signMessage','solana:signTransaction']}];assert.equal(view.accounts[0].address,owner);assert.equal(view.accounts[0],view.accounts[0]);assert.deepEqual(view.accounts[0].features,['solana:signMessage']);
});
test('Trust transport normalizes 32-byte keys, preserves receiver/events and never exposes EVM or transaction methods',async()=>{
 const handlers=new Map(),calls=[],raw={isTrust:true,isConnected:false,publicKey:null,async connect(){assert.equal(this,raw);this.isConnected=true;this.publicKey={toBytes:()=>bs58.decode(owner)};calls.push('connect');},async disconnect(){this.isConnected=false;},async signMessage(bytes){assert.equal(this,raw);calls.push(bytes);return {signature:new Uint8Array(64)};},on:(event,fn)=>handlers.set(event,fn),off:(event,fn)=>{assert.equal(handlers.get(event),fn);handlers.delete(event);},signTransaction(){throw Error('forbidden');}};
 const win={TekkworkSDK:{bs58},trustwallet:{solana:raw},ethereum:{isTrust:true}};
 const adapter=injectedWallet('Trust Wallet',win);assert.equal(injectedWallet('Trust Wallet',win),adapter);assert.equal(adapter.publicKey,null);assert.equal((await adapter.connect()).publicKey.toBase58(),owner);let changed;const onChange=key=>changed=key?.toBase58();adapter.on('accountChanged',onChange);handlers.get('accountChanged')(raw.publicKey);assert.equal(changed,owner);adapter.removeListener('accountChanged',onChange);assert.equal(handlers.size,0);const bytes=new Uint8Array([1]);await adapter.signMessage(bytes);assert.deepEqual(calls,['connect',bytes]);assert.equal(adapter.signTransaction,undefined);assert.equal(adapter.signAndSendTransaction,undefined);assert.equal(injectedWallet('MetaMask',win),null);raw.publicKey={toBytes:()=>new Uint8Array(20)};assert.throws(()=>adapter.publicKey.toBase58(),/Invalid Solana/);
});
test('every first-class wallet uses existing address/owner challenge flow; unlisted Solana wallets remain dynamically discoverable',async()=>{
 const saved={window:globalThis.window,CustomEvent:globalThis.CustomEvent,fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage};
 const accounts=[{address:owner,chains:['solana:mainnet']}],calls=[];
 const names=[...walletShortcuts.map(([name])=>name),'Other compatible wallet'];
 const registered=names.map(name=>({name,chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{async connect(){calls.push(name+' connect');registered.find(w=>w.name===name).accounts=accounts;return {accounts};}},'solana:signMessage':{async signMessage({account,message}){assert.equal(account.address,owner);assert.equal(new TextDecoder().decode(message),'FIXTURE AUTH');calls.push(name+' message');return [{signature:new Uint8Array(64)}];}}}}));
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 globalThis.CustomEvent=class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}};
 globalThis.window={TekkworkSDK:{bs58},addEventListener(){},dispatchEvent:e=>{if(e.type==='wallet-standard:app-ready')e.detail.register(...registered);}};
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(url.endsWith('/auth/challenge')){assert.equal(body.address,owner);return {ok:true,json:async()=>({id:'FIXTURE',message:'FIXTURE AUTH',expires:Date.now()+10000})};}if(url.endsWith('/auth/verify'))return {ok:true,json:async()=>({address:owner})};throw Error('Unexpected network request');};
 try{const backend=await import('../public/app/backend.js?broad-test');const rows=backend.wallets({readOnly:true});assert.deepEqual(rows.map(w=>w.name),names);for(const row of rows){assert.equal(await backend.connectPublicWallet(row.id),owner);assert.equal(calls.filter(x=>x.endsWith(' message')).length,names.indexOf(row.name));assert.equal(await backend.connect(row.id,{reviewChallenge:async()=>true}),owner);}assert.equal(calls.filter(x=>x.endsWith(' message')).length,names.length);assert.equal(walletName('Trust'),'Trust Wallet');assert.equal(walletName('Not Phantom'),'Not Phantom');}finally{Object.assign(globalThis,saved);}
});
