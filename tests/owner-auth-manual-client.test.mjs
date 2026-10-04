import test from 'node:test';import assert from 'node:assert/strict';import bs58 from 'bs58';
const saved={window:globalThis.window,fetch:globalThis.fetch,CustomEvent:globalThis.CustomEvent};
let serial=0;
async function client(){let signs=0,verifies=0;const owner=bs58.encode(Buffer.alloc(32,4)),account={address:owner,chains:['solana:mainnet']};
 const wallet={name:'Phantom',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{async connect(){wallet.accounts=[account];return {accounts:wallet.accounts};}},'solana:signMessage':{async signMessage(){signs++;return [{signature:new Uint8Array(64)}];}}}};
 globalThis.window={TekkworkSDK:{bs58},addEventListener(type,callback){if(type==='wallet-standard:app-ready')callback({detail:{register:()=>{}}});},dispatchEvent(){}};
 // Register the real adapter's Wallet Standard catalog through its app-ready event.
 let registration;
 window.addEventListener=(type,callback)=>{if(type==='wallet-standard:app-ready')registration=callback;};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 window.dispatchEvent=e=>{if(e.type==='wallet-standard:app-ready')e.detail.register(wallet);};
 globalThis.fetch=async(url,o)=>{if(url.endsWith('/auth/challenge'))return {ok:true,json:async()=>({id:'fixture-nonce',message:'LOCAL_FIXTURE_CHALLENGE',expires:Date.now()+10000,manualApprovalRequired:true})};if(url.endsWith('/auth/verify')){verifies++;return {ok:true,json:async()=>({address:owner})};}throw Error('UNEXPECTED_TRANSPORT');};
 const backend=await import('../public/app/backend.js?manual-client-'+(++serial));const row=backend.wallets().find(w=>w.name==='Phantom');assert.ok(row);
 return {backend,row,wallet,owner,get signs(){return signs;},get verifies(){return verifies;}};
}
test('missing/cancelled manual approval never invokes wallet signMessage or verification',async()=>{try{for(const reviewChallenge of [undefined,async()=>false]){const f=await client();await assert.rejects(f.backend.connect(f.row.id,{reviewChallenge}));assert.equal(f.signs,0);assert.equal(f.verifies,0);}}finally{Object.assign(globalThis,saved);}});
test('waiting for explicit review causes zero signing; approving then changing provider prevents signing',async()=>{try{const f=await client();let release,shown;const reached=new Promise(r=>shown=r),wait=new Promise(r=>release=r);const pending=f.backend.connect(f.row.id,{reviewChallenge:async(c,owner)=>{assert.equal(owner,f.owner);shown();await wait;return true;}});await reached;assert.equal(f.signs,0);assert.equal(f.verifies,0);f.wallet.accounts=[];release();await assert.rejects(pending);assert.equal(f.signs,0);}finally{Object.assign(globalThis,saved);}});
