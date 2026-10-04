import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {createIdentityIntentJournal} from '../public/app/launchpad-identity-intent.js';
import {createLaunchpadActions,mountLaunchpadPage,renderLaunchpadPage} from '../public/app/launchpad-page.js';
const globals={window:globalThis.window,CustomEvent:globalThis.CustomEvent,fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage};
const owner=bs58.encode(new Uint8Array(32).fill(19));let serial=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('manual owner sign-in cannot verify a Standard account disconnected during pending signature or verification',async()=>{
 for(const phase of ['signature','verification','verification-offline']){
  const gate=deferred(),entered=deferred(),storage=new Map(),calls=[];let cookie=false;
  const account={address:owner,chains:['solana:mainnet']};
  const wallet={name:'Phantom',accounts:[account],features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signMessage':{signMessage:async()=>{calls.push('sign');if(phase==='signature'){entered.resolve();await gate.promise;}return [{signature:new Uint8Array(64)}];}}}};
  globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
  globalThis.window={TekkworkSDK:{bs58},addEventListener(){},dispatchEvent:e=>{if(e.type==='wallet-standard:app-ready')e.detail.register(wallet);}};
  globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('/auth/challenge'))return {ok:true,json:async()=>({id:'SYNTHETIC_ONLY',message:'Synthetic local auth contract',manualApprovalRequired:true,expires:Date.now()+60000})};if(url.endsWith('/auth/verify')){entered.resolve();await gate.promise;cookie=true;}if(url.endsWith('/auth/logout')){if(phase==='verification-offline')throw Error('Logout offline');cookie=false;}return {ok:true,json:async()=>({address:owner})};};
  try{
   const backend=await import('../public/app/backend.js?owner-flow='+ ++serial),row=backend.wallets().find(x=>x.name==='Phantom');
   const pending=backend.connect(row.id,{reviewChallenge:async()=>true}),rejected=assert.rejects(pending,phase==='verification-offline'?/SIGNATURE_VERIFICATION_FAILED/:/PROVIDER_MISMATCH/);
   await entered.promise;wallet.accounts=[];gate.resolve();await rejected;
   assert.equal(cookie,phase==='verification-offline');assert.equal(backend.ownerAccessDetached(),true);assert.throws(()=>backend.launchWallet(owner));
   if(phase==='signature')assert.equal(calls.includes('/api/auth/verify'),false);
   else assert.equal(calls.at(-1),'/api/auth/logout');
  }finally{gate.resolve();Object.assign(globalThis,globals);}
 }
});
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
const identityInput={name:'Owner recovery Agent',description:'Local test',character:'frank',strategy:'balanced'};
const identityResult={id:'ONE_AGENT',creator:owner,coin:null,launchpadScope:{available:true,scoped:true,reason:null}};
test('identity lost-response remount restores exact owner-scoped key/input and one request in flight',async()=>{
 const storage=memory(),keys=[],gate=deferred();let fail=true;
 const make=()=>createLaunchpadActions({owner,identityJournal:createIdentityIntentJournal(owner,storage),createIdentity:async(input,key)=>{keys.push(key);assert.deepEqual(input,identityInput);await gate.promise;if(fail)throw Error('SYNTHETIC_LOST_RESPONSE');return identityResult;}});
 const first=make(),attempt=first.create(identityInput),rejected=assert.rejects(attempt);
 assert.equal(first.create(identityInput),attempt);gate.resolve();await rejected;
 const restored=make();assert.deepEqual(restored.pendingIdentity().input,identityInput);
 await assert.rejects(restored.create({...identityInput,name:'Changed'}),/original identity/);
 assert.equal(createIdentityIntentJournal('OTHER_OWNER',storage).read(),null);
 fail=false;await restored.create(identityInput);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(restored.pendingIdentity(),null);
});
test('unwritable or corrupted identity recovery storage refuses creation before HTTP',async()=>{
 for(const storage of [{getItem:()=>null,setItem:()=>{throw Error('Quota');}}, {getItem:()=>'{corrupt'}]){
  let calls=0;const actions=createLaunchpadActions({owner,identityJournal:createIdentityIntentJournal(owner,storage),createIdentity:()=>calls++});
  await assert.rejects(actions.create(identityInput),/recovery data/);assert.equal(calls,0);
 }
});
test('restored identity mounts explicit retry with original values and never creates automatically',async()=>{
 const storage=memory(),journal=createIdentityIntentJournal(owner,storage);journal.write({key:'LOCAL_PENDING_001',input:identityInput});
 let writes=0;const events={},host={innerHTML:'',addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k]};
 const page=mountLaunchpadPage(host,{owner,identityJournal:journal,config:{capabilities:{walletAuth:true}},createIdentity:async()=>{writes++;return identityResult;}});
 assert.match(host.innerHTML,/Resume Agent/);assert.match(host.innerHTML,/Owner recovery Agent/);assert.doesNotMatch(host.innerHTML,/data-launchpad-identity-edit/);assert.equal(writes,0);
 events.click({target:{closest:s=>s==='[data-launchpad-identity-save]'?{}:null}});await new Promise(r=>setImmediate(r));assert.equal(writes,1);assert.equal(journal.read(),null);page.destroy();
});
test('identity review escapes fields and coin review shows selected image before save',()=>{
 const html=renderLaunchpadPage({owner,config:{capabilities:{walletAuth:true}},showCreate:true,identityReview:true,identityDraft:{...identityInput,name:'<script>x</script>'}});
 assert.match(html,/Review Agent/);assert.match(html,/data-launchpad-identity-save/);assert.doesNotMatch(html,/<script>/);
 const image='data:image/png;base64,AAAA';const coin=renderLaunchpadPage({owner,tokenEditor:{agentId:'ONE',name:'Owner',stage:'review',input:{draft:{name:'Coin',ticker:'C'},tokenImage:image}}});
 assert.match(coin,/alt="Coin image selected for this draft"/);assert.ok(coin.includes(image));assert.match(coin,/Save Draft/);
});
test('successful identity commit with failed refresh retains same key through retry and remount',async()=>{
 const storage=memory(),keys=[];let refreshFails=true;
 const make=()=>createLaunchpadActions({owner,identityJournal:createIdentityIntentJournal(owner,storage),createIdentity:async(_,key)=>{keys.push(key);return identityResult;},onChanged:async()=>{if(refreshFails)throw Error('Refresh offline');}});
 const first=make();await assert.rejects(first.create(identityInput),/Refresh offline/);assert.equal(first.pendingIdentity().state,'ACKNOWLEDGED');
 await assert.rejects(first.create(identityInput),/Refresh offline/);refreshFails=false;await make().create(identityInput);
 assert.equal(new Set(keys).size,1);assert.equal(createIdentityIntentJournal(owner,storage).read(),null);
});
test('reload after acknowledged identity refresh clears only matching owned Agent, not by name',()=>{
 for(const matching of [false,true]){
  const storage=memory(),journal=createIdentityIntentJournal(owner,storage);journal.write({key:'ACK_IDENTITY_001',input:identityInput});journal.acknowledge('ACK_IDENTITY_001','ONE_AGENT');
  const host={innerHTML:'',addEventListener(){},removeEventListener(){}};
  const page=mountLaunchpadPage(host,{owner,identityJournal:journal,config:{capabilities:{walletAuth:true}},agents:[{...identityResult,id:matching?'ONE_AGENT':'DIFFERENT_AGENT',name:identityInput.name}]});
  assert.equal(journal.read()===null,matching);page.destroy();
 }
});
test('invalid identity name is rejected before journaling and can be corrected without new unknown intent',async()=>{
 const storage=memory();let calls=0;const actions=createLaunchpadActions({owner,identityJournal:createIdentityIntentJournal(owner,storage),createIdentity:async()=>{calls++;return identityResult;}});
 await assert.rejects(actions.create({...identityInput,name:'  '}));assert.equal(actions.pendingIdentity(),null);assert.equal(calls,0);
 await actions.create(identityInput);assert.equal(calls,1);
});
test('canonical same-key replay may reconcile an identity whose coin was subsequently configured',async()=>{
 const journal=createIdentityIntentJournal(owner,memory());journal.write({key:'ADVANCED_IDENTITY_001',input:identityInput});
 const actions=createLaunchpadActions({owner,identityJournal:journal,createIdentity:async()=>({...identityResult,coin:{name:'Configured coin',ticker:'LOCAL'},replayed:true})});
 const result=await actions.create(identityInput);assert.equal(result.id,'ONE_AGENT');assert.equal(journal.read(),null);
});
