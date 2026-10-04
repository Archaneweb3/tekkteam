import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';

const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const challenge='TEKKTEAM wallet sign-in\nWallet: '+owner+'\nThis signature does not authorize a payment.';
const original={window:globalThis.window,location:globalThis.location,CustomEvent:globalThis.CustomEvent,fetch:globalThis.fetch};

function environment(registeredWallet){
 const listeners=new Map();let unregister;
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 globalThis.location={hostname:'127.0.0.1',port:'5188',search:'?walletDiagnostics=1'};
 globalThis.window={TekkworkSDK:{bs58:{encode:()=> 'fixture-signature',decode:bs58.decode}},addEventListener(type,callback){listeners.set(type,callback);},dispatchEvent(event){listeners.get(event.type)?.(event);}};
 if(registeredWallet)globalThis.window.addEventListener('wallet-standard:app-ready',event=>{unregister=event.detail.register(...(Array.isArray(registeredWallet)?registeredWallet:[registeredWallet]));});
 return {unregister:()=>unregister?.()};
}

test('selected Wallet Standard Phantom stays bound through connect and sign; bytes are UTF-8',async()=>{
 const calls={connect:0,sign:0,challenge:0,verify:0};let signedAccount,signedBytes;
 const account={address:owner,chains:['solana:mainnet']};
 const wallet={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>{calls.connect++;return {accounts:[account]};}},'solana:signMessage':{signMessage:async({account:given,message})=>{calls.sign++;signedAccount=given;signedBytes=message;return [{signature:new Uint8Array(64)}];}}}};
 const env=environment(wallet);
 globalThis.fetch=async url=>{if(url.endsWith('/auth/challenge')){calls.challenge++;return {ok:true,json:async()=>({id:'fixture-id',message:challenge})};}if(url.endsWith('/auth/verify')){calls.verify++;return {ok:true,json:async()=>({address:owner})};}throw Error('Unexpected fetch');};
 try{
  const backend=await import('../public/app/backend.js?wallet-standard-fixture');
  const id=backend.wallets().find(x=>x.name==='Phantom').id;
  assert.equal(await backend.connect(id),owner);
  assert.deepEqual(calls,{connect:1,sign:1,challenge:1,verify:1});
  assert.strictEqual(signedAccount,account);
  assert.ok(signedBytes instanceof Uint8Array);
  assert.deepEqual(signedBytes,new TextEncoder().encode(challenge));
  const before={...calls};
  const probe=await backend.probePhantomSignature(id);
  assert.equal(probe.source,'WALLET_STANDARD');assert.equal(probe.messageByteLength,new TextEncoder().encode('TEKKTEAM wallet verification test').length);
  assert.equal(calls.challenge,before.challenge);assert.equal(calls.verify,before.verify);
  wallet.features['solana:signMessage'].signMessage=async()=>{throw Error('Unexpected error');};
  await assert.rejects(backend.connect(id),error=>error.walletAuthCode==='PHANTOM_SIGNING_ERROR'&&error.walletAuthStage==='SIGN_MESSAGE'&&error.providerSource==='WALLET_STANDARD');
  wallet.features['solana:signMessage'].signMessage=async()=>{throw Object.assign(Error('User rejected request'),{code:4001});};
  await assert.rejects(backend.connect(id),error=>error.walletAuthCode==='SIGNATURE_CANCELLED');
  wallet.features['solana:signMessage'].signMessage=undefined;
  await assert.rejects(backend.connect(id),error=>error.walletAuthCode==='SIGN_MESSAGE_UNSUPPORTED');
  env.unregister();
  wallet.features['solana:signMessage'].signMessage=async()=>{throw Error('should not sign');};
  await assert.rejects(backend.connect(id),error=>error.walletAuthCode==='PROVIDER_MISMATCH');
 }finally{Object.assign(globalThis,original);}
});

test('injected Phantom cannot be swapped for another provider before signing',async()=>{
 environment();let phantomSigns=0,otherSigns=0;
 const phantom={isPhantom:true,publicKey:{toBase58:()=>owner},connect:async()=>{},signMessage:async()=>{phantomSigns++;return {signature:new Uint8Array(64)};}};
 const other={publicKey:{toBase58:()=>owner},connect:async()=>{},signMessage:async()=>{otherSigns++;return {signature:new Uint8Array(64)};}};
 window.phantom={solana:phantom};window.solana=other;
 globalThis.fetch=async url=>url.endsWith('/auth/challenge')?{ok:true,json:async()=>({id:'fixture-id',message:challenge})}:{ok:true,json:async()=>({address:owner})};
 try{
  const backend=await import('../public/app/backend.js?injected-phantom-fixture');
  const id=backend.wallets().find(x=>x.name==='Phantom').id;
  await backend.connect(id);assert.equal(phantomSigns,1);assert.equal(otherSigns,0);
  globalThis.fetch=async url=>{if(url.endsWith('/auth/challenge')){window.phantom.solana=other;return {ok:true,json:async()=>({id:'fixture-id',message:challenge})};}return {ok:true,json:async()=>({address:owner})};};
  await assert.rejects(backend.connect(id),error=>error.walletAuthCode==='PROVIDER_MISMATCH');
  assert.equal(otherSigns,0);
 }finally{Object.assign(globalThis,original);}
});

test('unsupported Wallet Standard registration does not mask the explicit Phantom injection',async()=>{
 const unsupported={name:'Phantom',features:{'solana:signMessage':{signMessage:async()=>[]}}};
 environment(unsupported);
 window.phantom={solana:{isPhantom:true,publicKey:{toBase58:()=>owner},connect:async()=>{},signMessage:async()=>({signature:new Uint8Array(64)})}};
 try{const backend=await import('../public/app/backend.js?unsupported-standard-fixture');assert.equal(backend.wallets().find(x=>x.name==='Phantom'&&x.selectable)?.id,'phantom');}
 finally{Object.assign(globalThis,original);}
});

test('Solflare and Solana MetaMask use the same Mainnet challenge pipeline; EVM-only MetaMask is disabled',async()=>{
 const events=[];
 const account={address:owner,chains:['solana:mainnet']};
 const make=(name,accounts,chains)=>({name,icon:'data:image/png;base64,AAAA',accounts,chains,features:{'standard:connect':{connect:async()=>{events.push(`${name}:connect`);return {accounts};}},'solana:signMessage':{signMessage:async({account:current,message})=>{assert.strictEqual(current,account);assert.ok([challenge,'TEKKTEAM wallet verification test'].some(text=>Array.from(message).join()===Array.from(new TextEncoder().encode(text)).join()));events.push(`${name}:sign`);return [{signature:new Uint8Array(64)}];}}}});
 const solflare=make('Solflare',[account],['solana:mainnet']);
 const meta=make('MetaMask',[account],['solana:mainnet']);
 const evm=make('MetaMask EVM',[],['eip155:1']);
 environment([solflare,meta,evm]);
 window.ethereum={isMetaMask:true};
 globalThis.fetch=async url=>{if(url.endsWith('/auth/challenge')){events.push('challenge');return {ok:true,json:async()=>({id:'fixture-id',message:challenge})};}events.push('verify');return {ok:true,json:async()=>({address:owner})};};
 try{
  const backend=await import('../public/app/backend.js?multi-wallet-fixture');
  const rows=backend.wallets();
  assert.equal(rows.find(x=>x.name==='Solflare').status,'Ready');
  assert.equal(rows.find(x=>x.name==='MetaMask'&&x.selectable).status,'Ready');
  assert.equal(rows.filter(x=>x.name==='MetaMask').length,1);
  assert.equal(rows.filter(x=>x.name==='Solflare').length,1);
  assert.equal(rows.find(x=>x.name==='MetaMask').source,'WALLET_STANDARD');
  for(const name of ['Solflare','MetaMask']){
   events.length=0;const id=rows.find(x=>x.name===name&&x.selectable).id;
   assert.equal(await backend.connect(id),owner);
   assert.deepEqual(events,[`${name}:connect`,'challenge',`${name}:sign`,'verify']);
   events.length=0;await backend.probeWalletSignature(id);assert.deepEqual(events,[`${name}:connect`,`${name}:sign`]);
  }
  await assert.rejects(backend.connect('standard-2'),/Wallet is no longer available/);
 }finally{Object.assign(globalThis,original);}
});

test('connected wallet lacking Mainnet account fails before backend challenge',async()=>{
 const devnet={address:owner,chains:['solana:devnet']};let requests=0;
 const wallet={name:'Solflare',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{connect:async()=>({accounts:[devnet]})},'solana:signMessage':{signMessage:async()=>{throw Error('must not sign');}}}};
 environment(wallet);globalThis.fetch=async()=>{requests++;throw Error('must not request challenge');};
 try{const backend=await import('../public/app/backend.js?mainnet-account-fixture');const row=backend.wallets().find(w=>w.name==='Solflare');assert.equal(row.status,'Connect to verify Solana account');await assert.rejects(backend.connect(row.id),e=>e.walletAuthCode==='SOLANA_ACCOUNT_UNAVAILABLE');assert.equal(requests,0);}
 finally{Object.assign(globalThis,original);}
});

test('duplicate Standard and injected discoveries collapse to one bound wallet; probes require explicit mode',async()=>{
 const account={address:owner,chains:['solana:mainnet']};
 const solflare={name:'Solflare',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signMessage':{signMessage:async()=>[{signature:new Uint8Array(64)}]}}};
 const solflareDuplicate={name:'Solflare Legacy',chains:['eip155:1'],accounts:[],features:{}};
 environment([solflare,solflareDuplicate]);
 window.ethereum={isMetaMask:true};
 window.phantom={solana:{isPhantom:true,connect:async()=>{},signMessage:async()=>({signature:new Uint8Array(64)})}};
 window.solflare={isSolflare:true,connect:async()=>{throw Error('Injected fallback must not run');},signMessage:async()=>({signature:new Uint8Array(64)})};
 try{
  const backend=await import('../public/app/backend.js?normalized-discovery-fixture');
  const rows=backend.wallets();
  assert.equal(rows.filter(row=>row.name==='Solflare').length,1);
  assert.equal(rows.filter(row=>row.name==='Phantom').length,1);
  assert.equal(rows.filter(row=>row.name==='MetaMask').length,1);
  assert.equal(rows.find(row=>row.name==='Solflare').status,'Connect to verify Solana account');
  assert.equal(rows.find(row=>row.name==='Solflare').source,'WALLET_STANDARD');
  assert.equal(backend.phantomSignProbeAvailable(),true);
  location.search='';assert.equal(backend.phantomSignProbeAvailable(),false);
 }finally{Object.assign(globalThis,original);}
});

test('Solflare connect failure is isolated before authentication',async()=>{
 let requests=0;
 const solflare={name:'Solflare',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{connect:async()=>{throw Object.assign(Error('Connection request failed'),{code:4900});}},'solana:signMessage':{signMessage:async()=>{throw Error('must not sign');}}}};
 environment(solflare);globalThis.fetch=async()=>{requests++;throw Error('must not request auth');};
 try{
  const backend=await import('../public/app/backend.js?solflare-connect-error-fixture');
  const row=backend.wallets().find(wallet=>wallet.brand==='Solflare');
  assert.equal(row.status,'Connect to verify Solana account');
  await assert.rejects(backend.connect(row.id),error=>error.walletAuthStage==='PROVIDER_CONNECT'&&error.walletAuthCode==='WALLET_CONNECTION_FAILED');
  assert.equal(requests,0);
 }finally{Object.assign(globalThis,original);}
});

test('Solflare not installed has one official install row and Trust is explicitly unavailable without a provider',async()=>{
 environment();
 try{const backend=await import('../public/app/backend.js?solflare-install-fixture');const rows=backend.wallets();const row=rows.find(wallet=>wallet.brand==='Solflare');assert.equal(row.status,'Not installed');assert.equal(row.selectable,false);assert.equal(row.installUrl,'https://www.solflare.com/download/');assert.equal(row.icon,null);assert.equal(rows.find(wallet=>wallet.name==='Trust Wallet').selectable,false);}
 finally{Object.assign(globalThis,original);}
});

test('verified injected Solflare binds the same provider through connect and signing',async()=>{
 environment();let signs=0;
 const solflare={isSolflare:true,publicKey:{toBase58:()=>owner},connect:async()=>{},signMessage:async()=>{signs++;return {signature:new Uint8Array(64)};}};
 window.solflare=solflare;
 globalThis.fetch=async url=>url.endsWith('/auth/challenge')?{ok:true,json:async()=>({id:'fixture-id',message:challenge})}:{ok:true,json:async()=>({address:owner})};
 try{const backend=await import('../public/app/backend.js?injected-solflare-fixture');const row=backend.wallets().find(wallet=>wallet.name==='Solflare');assert.equal(row.source,'WINDOW_SOLFLARE');assert.equal(await backend.connect(row.id),owner);assert.equal(signs,1);window.solflare={...solflare};await assert.rejects(backend.connect(row.id),error=>error.walletAuthCode==='PROVIDER_MISMATCH');assert.equal(signs,1);}
 finally{Object.assign(globalThis,original);}
});
