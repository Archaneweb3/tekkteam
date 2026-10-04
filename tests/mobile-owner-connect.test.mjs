import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createOwnerConnectFlow} from '../public/app/owner-connect-flow.js';
import {validateOwnerAuthChallenge} from '../public/app/owner-auth-review.js';

const owner=bs58.encode(new Uint8Array(32).fill(3));
const other=bs58.encode(new Uint8Array(32).fill(4));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function flowFixture({session=null}={}){
 const counts={connect:0,auth:0,read:0},phases=[];
 let connected=null,currentSession=session;
 const dependencies={
  async connectWallet(){counts.connect++;connected={address:owner,name:'Phantom'};return owner;},
  connection:()=>connected,
  async readSession(){counts.read++;return {session:currentSession};},
  async authenticate(id,address,options){counts.auth++;assert.equal(id,'phantom');assert.equal(address,owner);assert.equal(options.automatic,true);currentSession={address:owner};},
  onPhase:phase=>phases.push(phase)
 };
 return {counts,phases,dependencies,get connected(){return connected;},set connected(value){connected=value;},set session(value){currentSession=value;}};
}

test('fresh connection starts one owner authentication and verifies its server session',async()=>{
 const f=flowFixture(),flow=createOwnerConnectFlow(f.dependencies),result=await flow.run('phantom');
 assert.equal(result.address,owner);assert.equal(result.authenticated,true);assert.equal(result.restored,false);
 assert.deepEqual(f.counts,{connect:1,auth:1,read:2});
 assert.deepEqual(f.phases,['CONNECTING','CONNECTED','AUTH_REQUIRED','SIGN_IN_REQUESTED','AUTHENTICATED']);
});

test('duplicate actions while connection is pending share a single connect/auth request',async()=>{
 const f=flowFixture(),gate=deferred(),connect=f.dependencies.connectWallet;
 f.dependencies.connectWallet=async id=>{await gate.promise;return connect(id);};
 const flow=createOwnerConnectFlow(f.dependencies),first=flow.run('phantom'),duplicate=flow.run('phantom');
 assert.strictEqual(first,duplicate);gate.resolve();await first;
 assert.deepEqual(f.counts,{connect:1,auth:1,read:2});
});

test('server-confirmed same-owner session restores without asking for another authentication',async()=>{
 const f=flowFixture({session:{address:owner}}),result=await createOwnerConnectFlow(f.dependencies).run('phantom');
 assert.equal(result.restored,true);assert.equal(result.state.session.address,owner);
 assert.deepEqual(f.counts,{connect:1,auth:0,read:1});assert.ok(!f.phases.includes('SIGN_IN_REQUESTED'));
});

test('another owner session or a public address alone does not establish owner authentication',async()=>{
 for(const session of [null,{address:other}]){
  const f=flowFixture({session}),result=await createOwnerConnectFlow(f.dependencies).run('phantom');
  assert.equal(result.restored,false);assert.equal(f.counts.auth,1);
 }
 const f=flowFixture(),result=await createOwnerConnectFlow(f.dependencies).run('phantom',{canAuthenticate:false});
 assert.equal(result.authenticated,false);assert.deepEqual(f.counts,{connect:1,auth:0,read:0});
});

test('connection rejection returns disconnected and never requests authentication',async()=>{
 const f=flowFixture();f.dependencies.connectWallet=async()=>{f.counts.connect++;throw Error('Connection cancelled');};
 await assert.rejects(createOwnerConnectFlow(f.dependencies).run('phantom'),/Connection cancelled/);
 assert.equal(f.connected,null);assert.deepEqual(f.counts,{connect:1,auth:0,read:0});assert.equal(f.phases.at(-1),'DISCONNECTED');
});

test('authentication rejection keeps connection and an explicit retry does not reconnect or loop',async()=>{
 const f=flowFixture();let rejected=true;
 f.dependencies.authenticate=async(id,address,options)=>{f.counts.auth++;if(rejected)throw Error('Authentication cancelled');assert.equal(options.automatic,false);assert.equal(address,owner);f.session={address:owner};};
 const flow=createOwnerConnectFlow(f.dependencies);
 await assert.rejects(flow.run('phantom'),/Authentication cancelled/);
 assert.equal(f.connected.address,owner);assert.equal(f.phases.at(-1),'AUTH_REQUIRED');assert.deepEqual(f.counts,{connect:1,auth:1,read:1});
 await Promise.resolve();assert.equal(f.counts.auth,1);
 rejected=false;
 const result=await flow.run('phantom',{authenticateOnly:true});
 assert.equal(result.authenticated,true);assert.deepEqual(f.counts,{connect:1,auth:2,read:3});
});

test('account change while reading a session prevents a stale authentication request',async()=>{
 const f=flowFixture(),gate=deferred(),started=deferred();
 f.dependencies.readSession=async()=>{f.counts.read++;started.resolve();return gate.promise;};
 const flow=createOwnerConnectFlow(f.dependencies),pending=flow.run('phantom');await started.promise;
 f.connected={address:other,name:'Phantom'};gate.resolve({session:null});
 await assert.rejects(pending,/connection changed/);assert.equal(f.counts.auth,0);assert.equal(f.phases.at(-1),'DISCONNECTED');
});

test('closing/cancelling during an asynchronous session read prevents automatic Sign In',async()=>{
 const f=flowFixture(),gate=deferred(),started=deferred();
 f.dependencies.readSession=async()=>{f.counts.read++;started.resolve();return gate.promise;};
 const flow=createOwnerConnectFlow(f.dependencies),pending=flow.run('phantom');await started.promise;
 flow.cancel();gate.resolve({session:null});await assert.rejects(pending,/cancelled/);
 assert.equal(f.connected.address,owner);assert.equal(f.counts.auth,0);assert.equal(f.phases.at(-1),'AUTH_REQUIRED');
});

test('successful message approval without a matching server session never authenticates the owner',async()=>{
 const f=flowFixture();f.dependencies.authenticate=async()=>{f.counts.auth++;};
 await assert.rejects(createOwnerConnectFlow(f.dependencies).run('phantom'),/session was not established/);
 assert.equal(f.connected.address,owner);assert.equal(f.phases.at(-1),'AUTH_REQUIRED');
});

const globals={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent,sessionStorage:globalThis.sessionStorage};
let serial=0;
async function backendFixture(kind){
 const counts={connect:0,sign:0,challenge:0,verify:0,disconnect:0,transactions:0},listeners=new Map(),storage=new Map();
 const origin='https://staging.tekkteam.tech',account={address:owner,chains:['solana:mainnet']};
 const challenge={id:'disposable-fixture-nonce',expires:Date.now()+60000,manualApprovalRequired:true};
 challenge.message=`TEKKTEAM isolated local owner authentication\nDomain: ${new URL(origin).host}\nOrigin: ${origin}\nWallet: ${owner}\nNonce: ${challenge.id}\nExpires: ${new Date(challenge.expires).toISOString()}\nPurpose: authenticate this wallet to disposable local TEKKTEAM data only.\nNo launch, transaction, payment, funding, withdrawal or trading is authorized.`;
 const forbidden=()=>{counts.transactions++;throw Error('Transactions forbidden');};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window={TekkworkSDK:{bs58},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)};
 const sign=async message=>{counts.sign++;assert.deepEqual(message,new TextEncoder().encode(challenge.message));return new Uint8Array(64).fill(9);};
 let wallet;
 if(kind==='injected'){
  wallet={isPhantom:true,isConnected:false,publicKey:{toBase58:()=>owner},async connect(){counts.connect++;wallet.isConnected=true;return {publicKey:wallet.publicKey};},async signMessage(message){return {signature:await sign(message)};},async disconnect(){counts.disconnect++;wallet.isConnected=false;},signTransaction:forbidden,signAllTransactions:forbidden};
  window.phantom={solana:wallet};
 }else{
  wallet={name:'Phantom',chains:['solana:mainnet'],accounts:[],features:{
   'standard:connect':{async connect(){counts.connect++;wallet.accounts=[account];return {accounts:wallet.accounts};}},
   'standard:disconnect':{async disconnect(){counts.disconnect++;wallet.accounts=[];}},
   'solana:signMessage':{async signMessage({account:given,message}){assert.strictEqual(given,account);return [{signature:await sign(message)}];}},
   'solana:signTransaction':{signTransaction:forbidden}
  }};
  listeners.set('wallet-standard:app-ready',event=>event.detail.register(wallet));
 }
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/auth/challenge')){counts.challenge++;assert.equal(JSON.parse(options.body).address,owner);return {ok:true,json:async()=>challenge};}
  if(url.endsWith('/auth/verify')){counts.verify++;assert.equal(JSON.parse(options.body).id,challenge.id);return {ok:true,json:async()=>({address:owner})};}
  throw Error('Unexpected endpoint: '+url);
 };
 const backend=await import('../public/app/backend.js?mobile-owner-connect-'+(++serial));
 const id=backend.wallets({readOnly:true}).find(row=>row.name==='Phantom'&&row.selectable).id;
 const review=(value,address)=>{validateOwnerAuthChallenge(value,address,origin);return true;};
 return {backend,id,wallet,counts,review,challenge,origin};
}

for(const kind of ['injected','standard']){
 test(`${kind} Phantom authenticates an exact connected binding with one provider connect and zero transactions`,async()=>{
  try{
   const f=await backendFixture(kind);assert.equal(await f.backend.connectPublicWallet(f.id),owner);
   assert.equal(await f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review}),owner);
   assert.equal(f.backend.publicWalletPresentation().address,owner);
   assert.deepEqual(f.counts,{connect:1,sign:1,challenge:1,verify:1,disconnect:0,transactions:0});
  }finally{Object.assign(globalThis,globals);}
 });
}

test('connectedOwner cannot spoof a binding before connection or with another address',async()=>{
 try{
  const f=await backendFixture('injected');
  await assert.rejects(f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review}),error=>error.walletAuthCode==='PROVIDER_MISMATCH');
  assert.equal(f.counts.connect,0);assert.equal(f.counts.challenge,0);assert.equal(f.counts.sign,0);
  await f.backend.connectPublicWallet(f.id);
  await assert.rejects(f.backend.connect(f.id,{connectedOwner:other,reviewChallenge:f.review}),error=>error.walletAuthCode==='PROVIDER_MISMATCH');
  assert.equal(f.counts.challenge,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.verify,0);
 }finally{Object.assign(globalThis,globals);}
});

test('backend adapter review cancellation preserves public connection and explicit retry skips reconnect',async()=>{
 try{
  const f=await backendFixture('injected');await f.backend.connectPublicWallet(f.id);
  await assert.rejects(f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:()=>false}));
  assert.equal(f.backend.publicWalletPresentation().address,owner);assert.equal(f.counts.disconnect,0);assert.equal(f.counts.sign,0);
  await f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review});
  assert.deepEqual(f.counts,{connect:1,sign:1,challenge:2,verify:1,disconnect:0,transactions:0});
 }finally{Object.assign(globalThis,globals);}
});

test('provider replacement during exact challenge review is denied before signing',async()=>{
 try{
  const f=await backendFixture('injected');await f.backend.connectPublicWallet(f.id);
  const replaced={...f.wallet};
  await assert.rejects(f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:(challenge,address)=>{
   f.review(challenge,address);window.phantom.solana=replaced;return true;
  }}),error=>error.walletAuthCode==='PROVIDER_MISMATCH');
  assert.equal(f.counts.sign,0);assert.equal(f.counts.verify,0);assert.equal(f.counts.transactions,0);
  assert.equal(f.backend.publicWalletPresentation(),null);
 }finally{Object.assign(globalThis,globals);}
});

test('auth cancellation during async challenge review keeps connection and prevents stale signing',async()=>{
 try{
  const f=await backendFixture('injected'),gate=deferred(),started=deferred();await f.backend.connectPublicWallet(f.id);
  const pending=f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:async(challenge,address)=>{
   f.review(challenge,address);started.resolve();await gate.promise;return true;
  }});
  await started.promise;f.backend.cancelOwnerAuthentication();gate.resolve();await assert.rejects(pending,/cancelled|superseded/);
  assert.equal(f.backend.publicWalletPresentation().address,owner);assert.equal(f.counts.disconnect,0);
  assert.equal(f.counts.sign,0);assert.equal(f.counts.verify,0);assert.equal(f.counts.transactions,0);
 }finally{Object.assign(globalThis,globals);}
});

test('overlapping authentication stays blocked through cancellation until challenge review settles, then retries',async()=>{
 try{
  const f=await backendFixture('injected'),gate=deferred(),started=deferred();await f.backend.connectPublicWallet(f.id);
  const pending=f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:async(challenge,address)=>{
   f.review(challenge,address);started.resolve();return gate.promise;
  }});
  await started.promise;
  const overlap=()=>f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review});
  await assert.rejects(overlap(),error=>error.walletAuthCode==='SIGN_IN_PENDING');
  f.backend.cancelOwnerAuthentication();
  await assert.rejects(overlap(),error=>error.walletAuthCode==='SIGN_IN_PENDING');
  assert.deepEqual(f.counts,{connect:1,sign:0,challenge:1,verify:0,disconnect:0,transactions:0});
  gate.resolve(false);await assert.rejects(pending);
  assert.equal(f.backend.publicWalletPresentation().address,owner);
  assert.equal(await overlap(),owner);
  assert.deepEqual(f.counts,{connect:1,sign:1,challenge:2,verify:1,disconnect:0,transactions:0});
 }finally{Object.assign(globalThis,globals);}
});

test('a pending wallet signature cannot create overlapping prompts and rejection releases the auth guard',async()=>{
 try{
  const f=await backendFixture('injected'),gate=deferred(),started=deferred();await f.backend.connectPublicWallet(f.id);
  const signMessage=f.wallet.signMessage;
  f.wallet.signMessage=async message=>{
   f.counts.sign++;assert.deepEqual(message,new TextEncoder().encode(f.challenge.message));started.resolve();
   await gate.promise;throw Object.assign(Error('User rejected request'),{code:4001});
  };
  const attempt=()=>f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review}),pending=attempt();
  await started.promise;await assert.rejects(attempt(),error=>error.walletAuthCode==='SIGN_IN_PENDING');
  f.backend.cancelOwnerAuthentication();
  await assert.rejects(attempt(),error=>error.walletAuthCode==='SIGN_IN_PENDING');
  assert.deepEqual(f.counts,{connect:1,sign:1,challenge:1,verify:0,disconnect:0,transactions:0});
  gate.resolve();await assert.rejects(pending,error=>error.walletAuthCode==='SIGNATURE_CANCELLED');
  assert.equal(f.backend.publicWalletPresentation().address,owner);
  f.wallet.signMessage=signMessage;assert.equal(await attempt(),owner);
  assert.deepEqual(f.counts,{connect:1,sign:2,challenge:2,verify:1,disconnect:0,transactions:0});
 }finally{Object.assign(globalThis,globals);}
});

test('wrong-origin, expired and wrong-owner challenges fail exact review before any wallet signature',async()=>{
 try{
  const f=await backendFixture('injected');await f.backend.connectPublicWallet(f.id);
  const original={...f.challenge};
  for(const invalid of [
   {...original,message:original.message.replace(f.origin,'https://wrong.example')},
   {...original,expires:Date.now()-1},
   {...original,message:original.message.replace(owner,other)}
  ]){
   Object.assign(f.challenge,invalid);
   await assert.rejects(f.backend.connect(f.id,{connectedOwner:owner,reviewChallenge:f.review}));
   assert.equal(f.backend.publicWalletPresentation().address,owner);
  }
  assert.equal(f.counts.sign,0);assert.equal(f.counts.verify,0);assert.equal(f.counts.transactions,0);
 }finally{Object.assign(globalThis,globals);}
});
