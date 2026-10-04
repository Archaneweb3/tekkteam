import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {publicConfig} from '../server/config.js';
import {launchpadUnit} from '../public/app/launchpad-view-model.js';
import {renderLaunchpadPage,mountLaunchpadPage,createLaunchpadActions} from '../public/app/launchpad-page.js';
import {createTokenDraftActions,tokenDraftEnvelope,tokenDraftRead} from '../public/app/launchpad-page.js';
const agent={id:'LOCAL_FIXTURE',creator:'OWNER',name:'Fixture Agent',character:'frank',coin:{name:'Fixture Coin',ticker:'FIX'}},mint='So11111111111111111111111111111111111111112';
const contract=(state='CONFIGURED_NOT_LAUNCHED')=>({id:agent.id,owner:agent.creator,lifecycle:{agent:{id:agent.id},token:{state:state==='CONFIRMED'?'CONFIRMED':'CONFIGURED',mint:state==='CONFIRMED'?mint:null},launch:{state,signature:state==='CONFIRMED'?'LOCAL_FIXTURE_SIGNATURE':null,network:state==='CONFIRMED'?'solana:101':null},operation:{state:'PAUSED',mode:'PAPER'}}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('Launchpad review control requires owner metadata and verified lifecycle; no automatic launch',()=>{
 const units=[launchpadUnit(agent,contract())],options={agents:[agent],owner:'OWNER',units,launchControls:true};
 assert.match(renderLaunchpadPage(options),/data-launchpad-inspect="LOCAL_FIXTURE"/);
 for(const changed of [{owner:'OTHER'},{loading:true},{config:{preview:true}},{launchControls:false},{units:[launchpadUnit(agent,null)]}])assert.doesNotMatch(renderLaunchpadPage({...options,...changed}),/data-launchpad-inspect/);
});
function host(){const listeners={};return {innerHTML:'',addEventListener:(event,fn)=>listeners[event]=fn,removeEventListener:event=>delete listeners[event],listeners};}
test('confirmed owner-bound projection alone exposes mint/Pump link and provenance',()=>{const unit=launchpadUnit(agent,contract('CONFIRMED'));assert.equal(unit.launch.confirmed,true);assert.equal(unit.token.mint,mint);assert.equal(unit.launch.provenance,'BACKEND VERIFIED');const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',config:publicConfig('mainnet'),units:[unit]});assert.match(html,/LAUNCH CONFIRMED/);assert.match(html,new RegExp('https://pump.fun/coin/'+mint));assert.match(html,/#\/agent\/LOCAL_FIXTURE/);assert.match(html,/Trading requires separate authorization/);});
test('wrong ID/owner/network/missing proof never becomes confirmed',()=>{for(const alter of [d=>d.id='OTHER',d=>d.owner='OTHER',d=>d.lifecycle.agent.id='OTHER',d=>d.lifecycle.launch.network='solana:103',d=>d.lifecycle.launch.signature=null,d=>d.lifecycle.token.mint='invalid',d=>d.lifecycle.token.state='CONFIGURED']){const d=contract('CONFIRMED');alter(d);const unit=launchpadUnit(agent,d);assert.equal(unit.available,false);assert.equal(unit.token.mint,null);assert.equal(unit.launch.confirmed,false);}});
test('draft/prepared/approval/failed/unknown states never promote a prepared mint',()=>{for(const state of ['CONFIGURED_NOT_LAUNCHED','PREPARED','AWAITING_OWNER_APPROVAL','FAILED','RECONCILIATION_REQUIRED']){const d=contract(state);d.lifecycle.token.mint=mint;d.lifecycle.launch.signature='PREPARED';const unit=launchpadUnit(agent,d);assert.equal(unit.launch.state,state);assert.equal(unit.launch.confirmed,false);const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.doesNotMatch(html,/https:\/\/pump.fun|CA So111/);} });
test('identity-only, missing and invalid lifecycle evidence remain truthful',()=>{const a={...agent,coin:null},d=contract('NOT_CONFIGURED');d.lifecycle.token.state='NOT_CONFIGURED';const unit=launchpadUnit(a,d);assert.equal(unit.available,true);assert.equal(unit.token.configured,false);const html=renderLaunchpadPage({agents:[a],owner:'OWNER',units:[unit]});assert.match(html,/TOKEN NOT CONFIGURED/);assert.match(html,/Token setup is not available/);assert.equal(launchpadUnit(a,null).available,false);assert.equal(launchpadUnit(a,{...d,lifecycle:null}).available,false);});
test('visitor/demo/empty-Mainnet/local CTAs match actual availability',()=>{const visitor=renderLaunchpadPage({agents:[agent],config:publicConfig('mainnet')});assert.match(visitor,/data-launchpad-connect/);assert.doesNotMatch(visitor,/Fixture Agent|VIEW COIN/);const demo=renderLaunchpadPage({config:{...publicConfig('demo'),preview:true}});assert.doesNotMatch(demo,/data-launchpad-connect/);const empty=renderLaunchpadPage({owner:'OWNER',config:publicConfig('mainnet')});assert.match(empty,/NO AGENTS YET/);assert.match(empty,/Create your first Agent/);assert.doesNotMatch(empty,/href="#\/agents\/new"/);assert.match(renderLaunchpadPage({owner:'OWNER',config:publicConfig('local')}),/data-coin-agent-form/);assert.doesNotMatch(empty,/data-launchpad-create/);});
test('owner requests are read-only contracts and lifecycle failure shows unavailable',async()=>{const h=host(),reads=[];const c=mountLaunchpadPage(h,{agents:[agent],owner:'OWNER',loadContract:async id=>{reads.push(id);throw Error('offline')}});assert.match(h.innerHTML,/CHECKING LAUNCH EVIDENCE/);await flush();assert.match(h.innerHTML,/STATUS UNAVAILABLE/);assert.deepEqual(reads,[agent.id]);c.destroy();assert.deepEqual(Object.keys(h.listeners),[]);});
test('unowned roster makes zero reads; visitor connect requires explicit click',()=>{const h=host();let reads=0,connected=0;mountLaunchpadPage(h,{agents:[{...agent,creator:'OTHER'}],owner:'OWNER',loadContract:()=>reads++});assert.equal(reads,0);assert.match(h.innerHTML,/owner mismatch/);const visitor=host(),c=mountLaunchpadPage(visitor,{config:publicConfig('mainnet'),onConnect:()=>connected++});assert.equal(connected,0);visitor.listeners.click({target:{closest:()=>true}});assert.equal(connected,1);c.destroy();});
test('destroyed/stale page ignores asynchronous lifecycle response',async()=>{for(const stale of [true,false]){const h=host();let resolve,current=true;const c=mountLaunchpadPage(h,{agents:[agent],owner:'OWNER',isCurrent:()=>current,loadContract:()=>new Promise(r=>resolve=r)});await Promise.resolve();const before=h.innerHTML;if(stale)current=false;else c.destroy();resolve(contract('CONFIRMED'));await flush();assert.equal(h.innerHTML,before);}});
test('owner-provided text escaped and private contract fields not projected',()=>{const a={...agent,name:'<script>bad</script>',coin:{...agent.coin,image:'javascript:bad'}},d={...contract('CONFIRMED'),secret:'PRIVATE',capabilities:'PRIVATE',wallet:{secret:'PRIVATE'}};const unit=launchpadUnit(a,d);assert.equal(unit.token.image,null);const html=renderLaunchpadPage({agents:[a],owner:'OWNER',units:[unit]});assert.doesNotMatch(html,/<script>|PRIVATE|javascript:/);assert.match(html,/&lt;script&gt;/);assert.equal(Object.keys(unit).includes('wallet'),false);});
test('actual route wires owner-only contract reads and stale/read-failure guards',async()=>{const source=readFileSync('public/app/workspace.js','utf8'),code=source.slice(source.indexOf('async function launch(page)'),source.indexOf('function createAgentDialog()'));for(const outcome of ['ok','stale','fail']){const page={innerHTML:''},reads=[],scenes=[],retry={};const ctx={page,routeVersion:1,state:{agents:[agent],session:{address:'OWNER'},config:publicConfig('mainnet')},scenes,refresh:async()=>{if(outcome==='fail')throw Error('offline');if(outcome==='stale')ctx.routeVersion++;},paintWallet:()=>{},createIdentityIntentJournal:()=>null,publicWalletPresentation:()=>null,mountLaunchpadPage:(_,options)=>{options.loadContract(agent.id);assert.equal(options.owner,'OWNER');assert.equal(options.projectUnit,launchpadUnit);return {destroy(){}}},launchpadUnit,request:path=>reads.push(path),openWallet:()=>{},empty:(title,copy)=>'<h1>'+title+'</h1><p>'+copy+'</p>',$:()=>retry};vm.runInNewContext(code+';run=()=>launch(page)',ctx);await ctx.run();assert.equal(reads.length,outcome==='ok'?1:0);if(outcome==='ok')assert.equal(reads[0],'/agents/LOCAL_FIXTURE/contract');if(outcome==='fail'){assert.match(page.innerHTML,/No launch action was performed/);assert.equal(typeof retry.onclick,'function');}}});
import {mountTokensPage} from '../public/app/tokens-page.js';
test('completed Tokens module consumes actual shared projector without fabricating identity metadata',async()=>{const a={...agent,coin:null},h={innerHTML:''};const c=mountTokensPage(h,{agents:[a],owner:'OWNER',config:publicConfig('mainnet'),selectedAgentId:agent.id,loadContract:async()=>contract('CONFIRMED'),projectUnit:launchpadUnit});await flush();assert.match(h.innerHTML,/Token metadata unavailable/);assert.match(h.innerHTML,new RegExp('https://pump.fun/coin/'+mint));assert.match(h.innerHTML,/TOKEN DETAIL/);c.destroy();});
test('actual Tokens route decodes Agent relation and injects read adapter/disposal',()=>{const source=readFileSync('public/app/workspace.js','utf8'),code=source.slice(source.indexOf('function tokens(page)'),source.indexOf('async function launch(page)'));let options;const ctx={page:{innerHTML:''},routeVersion:7,location:{hash:'#/tokens/agent%2Fone'},state:{agents:[],session:{address:'OWNER'},config:publicConfig('mainnet')},scenes:[],mountTokensPage:(_,o)=>{options=o;return {destroy(){}}},launchpadUnit,request:path=>path,empty:()=>'<h1>Token detail unavailable</h1>'};vm.runInNewContext(code+';tokens(page)',ctx);assert.equal(options.selectedAgentId,'agent/one');assert.equal(options.loadContract('agent/one'),'/agents/agent%2Fone/contract');assert.equal(options.projectUnit,launchpadUnit);assert.equal(ctx.scenes.length,1);ctx.routeVersion++;assert.equal(options.isCurrent(),false);ctx.location.hash='#/tokens/%ZZ';vm.runInNewContext('tokens(page)',ctx);assert.match(ctx.page.innerHTML,/Token detail unavailable/);});

test('scoped identity retries same intent/key and validates server authority before refresh',async()=>{const keys=[];let fail=true,changed=0;const actions=createLaunchpadActions({owner:'OWNER',createIdentity:async(input,key)=>{keys.push(key);if(fail)throw Error('offline');return {id:'NEW',creator:'OWNER',coin:null,launchpadScope:{available:true,scoped:true,reason:null}}},onChanged:()=>changed++});const input={name:'Fixture'};await assert.rejects(actions.create(input));fail=false;await assert.rejects(actions.create({name:'Other'}));await actions.create(input);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(changed,1);});
test('entry is explicit, retry idempotent, no navigation on invalid/stale scope',async()=>{const keys=[];let entered=0,current=true,result={agentId:agent.id,launchpadScope:{available:true,scoped:false,reason:null}};const actions=createLaunchpadActions({owner:'OWNER',isCurrent:()=>current,enterScope:async(id,key)=>{keys.push(key);return result},onEntered:()=>entered++});assert.equal(keys.length,0);await assert.rejects(actions.enter(agent.id));assert.equal(entered,0);result.launchpadScope.scoped=true;await actions.enter(agent.id);assert.equal(entered,1);assert.equal(keys[0],keys[1]);current=false;await actions.enter(agent.id);assert.equal(keys.length,2);});
test('invalid identity response never refreshes and synchronous contract faults settle unavailable',async()=>{let changed=0;for(const result of [{id:'NEW',creator:'OTHER',coin:null},{id:'NEW',creator:'OWNER',coin:{}},{id:'NEW',creator:'OWNER',coin:null,launchpadScope:{available:false,scoped:null}}]){const a=createLaunchpadActions({owner:'OWNER',createIdentity:async()=>result,onChanged:()=>changed++});await assert.rejects(a.create({name:'Fixture'}));}assert.equal(changed,0);const h=host(),c=mountLaunchpadPage(h,{agents:[agent],owner:'OWNER',loadContract:()=>{throw Error('offline')}});await flush();assert.match(h.innerHTML,/STATUS UNAVAILABLE/);c.destroy();});
test('scope display requires matching authoritative contract and explicit supported entry',()=>{const d=contract();d.launchpadScope={available:true,scoped:false,reason:null};const u=launchpadUnit(agent,d);assert.equal(u.scope.scoped,false);assert.match(renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[u]}),/data-launchpad-enter/);d.launchpadScope.scoped=true;assert.doesNotMatch(renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[launchpadUnit(agent,d)]}),/data-launchpad-enter/);d.id='OTHER';assert.equal(launchpadUnit(agent,d).scope.available,false);});

const upload='data:image/png;base64,AAAA'; // disposable adapter fixture; not a decoded/uploaded image claim
const tokenInput=()=>({draft:{name:'Coin',ticker:'FIX',website:'HTTPS://EXAMPLE.invalid:443/'},tokenImage:upload});
const asset=id=>'https://fixture.invalid/metadata/agents/'+id+'/'+'a'.repeat(64)+'.png';
const emptyTokenCapability=id=>({version:1,agentId:id,owner:'OWNER',state:'EMPTY',revision:0,savedDraft:null,save:{allowed:true,reason:null,expectedRevision:0,immutable:true},ownerAuthority:{available:true,provenance:'BACKEND VERIFIED'},image:{required:true,localAsset:'MISSING',complete:false,publicDelivery:'UNVERIFIED'},authorizationGranted:false});
const tokenResult=(id,body)=>({agentId:id,revision:1,draft:{...body.draft,image:body.draft.image??asset(id)},imageAuthority:{localAsset:'VERIFIED',publicDelivery:'UNVERIFIED'},replayed:false});
test('token envelope preserves omission, normalizes scalars and rejects missing/mutually exclusive/invalid image',()=>{
 const e=tokenDraftEnvelope(tokenInput());assert.equal(e.expectedRevision,0);assert.equal(e.draft.website,'https://example.invalid/');assert.equal(Object.hasOwn(e.draft,'description'),false);assert.ok(Object.isFrozen(e.draft));
 const blank=tokenDraftEnvelope({draft:{name:'Coin',ticker:'FIX',description:''},tokenImage:upload});assert.equal(blank.draft.description,'');
 for(const bad of [{draft:{name:'Coin',ticker:'FIX'}},{draft:{name:'Coin',ticker:'FIX',image:asset('ID')},tokenImage:upload},{draft:{name:'Coin',ticker:'FIX'},tokenImage:'data:image/svg+xml;base64,AAAA'},{...tokenInput(),expectedRevision:1},{draft:{name:'Coin',ticker:'FIX',mint:'FAKE'},tokenImage:upload},{draft:{name:'é'.repeat(17),ticker:'FIX'},tokenImage:upload}])assert.throws(()=>tokenDraftEnvelope(bad));
});
test('first-token controller defaults unavailable and never infers readiness from owner',async()=>{
 let calls=0;const a=createTokenDraftActions({owner:'OWNER',saveTokenDraft:()=>calls++});await assert.rejects(a.save('ID',tokenInput()),/TOKEN_FORM_UNAVAILABLE/);assert.equal(calls,0);assert.equal(a.hasAttempt('ID'),false);
});
test('repeated token save clicks coalesce to one immutable offchain intent',async()=>{
 let calls=0,resolve,body,key;const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:(id,b,k)=>{calls++;body=b;key=k;return new Promise(r=>resolve=r);}});
 const first=a.save('ID',tokenInput()),second=a.save('ID',tokenInput());assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);assert.equal(typeof key,'string');assert.equal(body.expectedRevision,0);assert.equal(a.hasAttempt('ID'),true);
 resolve(tokenResult('ID',body));const r=await first;assert.equal(r.revision,1);assert.equal(r.imageAuthority.publicDelivery,'UNVERIFIED');assert.ok(Object.isFrozen(r.draft));await a.save('ID',tokenInput());assert.equal(calls,1);
});
test('lost response retries exact same token intent even if first-save readiness now bound',async()=>{
 const calls=[];let ready=true;const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>ready,saveTokenDraft:async(id,body,key)=>{calls.push({body,key});if(calls.length===1){ready=false;throw Error('PRIVATE_LOST_RESPONSE');}return {...tokenResult(id,body),replayed:true};}});
 await assert.rejects(a.save('ID',tokenInput()));await assert.rejects(a.save('ID',{...tokenInput(),draft:{name:'Changed',ticker:'FIX'}}),/TOKEN_FORM_RETRY_LOCKED/);
 const saved=await a.save('ID',tokenInput());assert.equal(saved.replayed,true);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
});
test('token request adapter cannot mutate the remembered retry payload',async()=>{
 const seen=[];const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async(id,b,key)=>{seen.push(structuredClone(b));const r=tokenResult(id,b);b.draft.name='MUTATED';if(seen.length===1)throw Error('lost');return r;}});
 await assert.rejects(a.save('ID',tokenInput()));const r=await a.save('ID',tokenInput());assert.equal(r.draft.name,'Coin');assert.deepEqual(seen[0],seen[1]);
});
test('owner change, auth loss and stale navigation prevent token writes/late success',async()=>{
 let current=true,currentOwner='OWNER',resolve,calls=0;const a=createTokenDraftActions({owner:'OWNER',getOwner:()=>currentOwner,isCurrent:()=>current,canSaveTokenDraft:()=>true,saveTokenDraft:(id,b)=>{calls++;return new Promise(r=>resolve=()=>r(tokenResult(id,b)));}});
 const p=a.save('ID',tokenInput());await Promise.resolve();currentOwner='OTHER';resolve();assert.equal(await p,null);await assert.rejects(a.save('ID',tokenInput()),/TOKEN_FORM_AUTH_REQUIRED/);assert.equal(calls,1);
 const stale=createTokenDraftActions({owner:'OWNER',isCurrent:()=>current,canSaveTokenDraft:()=>true,saveTokenDraft:()=>calls++});const queued=stale.save('ID',tokenInput());current=false;await assert.rejects(queued);assert.equal(calls,1);
 const auth=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async()=>{calls++;throw Object.assign(Error('PRIVATE_AUTH'),{httpStatus:401});}});await assert.rejects(auth.save('ID',tokenInput()));await assert.rejects(auth.save('ID',tokenInput()),/TOKEN_FORM_AUTH_REQUIRED/);assert.equal(calls,2);
});
test('wrong Agent, altered metadata, foreign asset and delivery claims never become token success',async()=>{
 for(const change of [r=>r.agentId='OTHER',r=>r.revision=2,r=>r.draft.name='Other',r=>r.draft.image=asset('OTHER'),r=>r.imageAuthority.publicDelivery='VERIFIED',r=>r.draft.secret='PRIVATE',r=>delete r.draft.image]){
  const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async(id,b)=>{const r=tokenResult(id,b);change(r);return r;}});await assert.rejects(a.save('ID',tokenInput()),/TOKEN_FORM_RESPONSE_UNVERIFIED/);
 }
});
function tokenHost(){
 const h=host();const status={textContent:''};h.form={values:{tokenName:'Coin',tokenTicker:'FIX',tokenwebsite:'https://example.invalid',tokentwitter:'',tokentelegram:'',tokenDescription:''},matches:selector=>selector==='[data-launchpad-token-form]'};
 h.querySelector=selector=>selector==='[data-launchpad-token-form]'&&h.innerHTML.includes('<form data-launchpad-token-form>')?h.form:selector==='[data-launchpad-message]'?status:null;h.status=status;return h;
}
const tokenClick=(h,selector,dataset={})=>h.listeners.click({target:{closest:s=>s===selector?{dataset}:null}});
async function tokenPage(overrides={}){
 const a={...agent,id:'FORM_ID',coin:null},d={...contract('NOT_CONFIGURED'),id:a.id,lifecycle:{...contract('NOT_CONFIGURED').lifecycle,agent:{id:a.id},token:{state:'NOT_CONFIGURED',mint:null}},launchpadScope:{available:true,scoped:true,reason:null}},h=tokenHost(),calls=[];
 d.tokenDraft=emptyTokenCapability(a.id);
 const c=mountLaunchpadPage(h,{agents:[a],owner:'OWNER',config:publicConfig('mainnet'),loadContract:async()=>d,canSaveTokenDraft:()=>true,saveTokenDraft:async(id,b,key)=>{calls.push({id,b,key});return tokenResult(id,b);},imageField:()=>({value:()=>upload}),...overrides});await flush();
 return {a,d,h,c,calls};
}
function reviewToken(f,values={}){
 tokenClick(f.h,'[data-launchpad-token]',{launchpadToken:f.a.id});Object.assign(f.h.form.values,values);
 const Original=globalThis.FormData;globalThis.FormData=class{constructor(form){this.form=form;}[Symbol.iterator](){return Object.entries(this.form.values)[Symbol.iterator]();}};
 try{f.h.listeners.submit({target:f.h.form,preventDefault(){}});}finally{globalThis.FormData=Original;}
}
test('form reviews supported coin fields before distinct save, no prepare/sign/automatic navigation',async()=>{
 const f=await tokenPage();assert.match(f.h.innerHTML,/Add Coin Details/);assert.equal(f.calls.length,0);reviewToken(f,{includeDescription:'on',tokenDescription:'Coin-only text'});assert.match(f.h.innerHTML,/Coin-only text/);assert.match(f.h.innerHTML,/Save Draft/);assert.match(f.h.innerHTML,/Launch costs · UNAVAILABLE/);assert.equal(f.calls.length,0);
 tokenClick(f.h,'[data-launchpad-token-save]');tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].b.draft.description,'Coin-only text');assert.equal(f.calls[0].b.expectedRevision,0);assert.match(f.h.innerHTML,/COIN DRAFT SAVED/);assert.match(f.h.innerHTML,/Check the current launch status in the related Agent receipt/);assert.match(f.h.innerHTML,/Public delivery UNVERIFIED/);assert.match(f.h.innerHTML,/#\/agent\/FORM_ID/);assert.doesNotMatch(f.h.innerHTML,/NOT LAUNCHED|LAUNCH SUBMITTED|LAUNCH CONFIRMED|signTransaction|0 SOL/);f.c.destroy();
});
test('form validation preserves editing state and makes no save request',async()=>{
 const f=await tokenPage();reviewToken(f,{tokenName:'é'.repeat(17)});assert.equal(f.calls.length,0);assert.match(f.h.status.textContent,/Check coin fields/);assert.match(f.h.innerHTML,/<form data-launchpad-token-form>/);f.c.destroy();
});
test('form lost response shows safe retry, no private diagnostics or changed intent',async()=>{
 const calls=[];const f=await tokenPage({saveTokenDraft:async(id,b,key)=>{calls.push({b,key});if(calls.length===1)throw Error('PRIVATE_LOST_RESPONSE');return {...tokenResult(id,b),replayed:true};}});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.match(f.h.innerHTML,/Draft save outcome unavailable/);assert.match(f.h.innerHTML,/Retry Save/);assert.doesNotMatch(f.h.innerHTML,/PRIVATE_LOST_RESPONSE|EDIT BEFORE SAVING/);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.deepEqual(calls[0],calls[1]);assert.match(f.h.innerHTML,/COIN DRAFT SAVED/);f.c.destroy();
});
test('form auth rejection disables retry and never opens a wallet/signs automatically',async()=>{
 let calls=0,connects=0;const f=await tokenPage({onConnect:()=>connects++,saveTokenDraft:async()=>{calls++;throw Object.assign(Error('PRIVATE_AUTH'),{httpStatus:401});}});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.match(f.h.innerHTML,/Owner authentication expired/);assert.match(f.h.innerHTML,/data-launchpad-token-save disabled/);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.equal(calls,1);assert.equal(connects,0);assert.doesNotMatch(f.h.innerHTML,/PRIVATE_AUTH/);f.c.destroy();
});
test('form known 400/409/503 states remain rejection/conflict/unavailable, never save or launch success',async()=>{
 for(const [httpStatus,copy] of [[400,'Draft save outcome unavailable'],[409,'conflicts with current immutable or receipt state'],[503,'authority or image configuration is unavailable']]){
  const f=await tokenPage({saveTokenDraft:async()=>{throw Object.assign(Error('PRIVATE_SERVER_DETAIL'),{httpStatus});}});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.match(f.h.innerHTML,new RegExp(copy));assert.doesNotMatch(f.h.innerHTML,/COIN DRAFT SAVED|PRIVATE_SERVER_DETAIL|LAUNCH CONFIRMED/);f.c.destroy();
 }
});
test('stale or destroyed form never paints late save or invokes saved callback',async()=>{
 for(const destroyed of [true,false]){let resolve,current=true,saved=0;const f=await tokenPage({isCurrent:()=>current,onTokenSaved:()=>saved++,saveTokenDraft:(id,b)=>new Promise(r=>resolve=()=>r(tokenResult(id,b)))});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await Promise.resolve();const before=f.h.innerHTML;if(destroyed)f.c.destroy();else current=false;resolve();await flush();assert.equal(f.h.innerHTML,before);assert.equal(saved,0);f.c.destroy();}
});
test('readiness absence and legacy/configured/uncertain Agents never gain token write controls',async()=>{
 const f=await tokenPage({canSaveTokenDraft:()=>false});assert.doesNotMatch(f.h.innerHTML,/data-launchpad-token=/);assert.match(f.h.innerHTML,/Coin draft saving is unavailable/);f.c.destroy();
 for(const state of ['PREPARED','AWAITING_OWNER_APPROVAL','RECONCILIATION_REQUIRED','CONFIRMED']){const d=contract(state);d.launchpadScope={available:true,scoped:true,reason:null};const a={...agent,coin:null};const html=renderLaunchpadPage({agents:[a],owner:'OWNER',units:[launchpadUnit(a,d)],tokenAvailability:{[a.id]:true}});assert.doesNotMatch(html,/data-launchpad-token=/);}
 const d=contract('NOT_CONFIGURED');d.lifecycle.token.state='NOT_CONFIGURED';d.launchpadScope={available:true,scoped:false,reason:null};const a={...agent,coin:null};assert.doesNotMatch(renderLaunchpadPage({agents:[a],owner:'OWNER',units:[launchpadUnit(a,d)],tokenAvailability:{[a.id]:true}}),/data-launchpad-token=/);
});
test('review escapes untrusted metadata text, leaves optional omission visible and cannot expose private fields',()=>{
 const html=renderLaunchpadPage({owner:'OWNER',tokenEditor:{agentId:'ID',name:'<script>Agent</script>',stage:'review',input:{draft:{name:'<img onerror=bad>',ticker:'X',secret:'PRIVATE'},tokenImage:upload}}});assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img onerror=bad&gt;/);assert.match(html,/Not provided/);assert.doesNotMatch(html,/<script>|<img onerror|PRIVATE/);
});
test('version1 owner capability is required; missing/mismatched/contradictory fields cannot authorize save',async()=>{
 const f=await tokenPage();assert.equal(tokenDraftRead(f.d,f.a.id,'OWNER').allowed,true);f.c.destroy();
 for(const alter of [d=>delete d.tokenDraft,d=>d.owner='OTHER',d=>d.tokenDraft.owner='OTHER',d=>d.tokenDraft.agentId='OTHER',d=>d.tokenDraft.version=2,d=>d.tokenDraft.state='IMMUTABLE',d=>d.tokenDraft.revision=1,d=>delete d.tokenDraft.save.allowed,d=>d.tokenDraft.save.allowed='true',d=>d.tokenDraft.save.reason='CONFIGURATION_UNAVAILABLE',d=>d.tokenDraft.ownerAuthority.available=false,d=>d.tokenDraft.ownerAuthority.provenance='UNAVAILABLE',d=>d.tokenDraft.image.publicDelivery='VERIFIED',d=>delete d.tokenDraft.image.complete,d=>d.tokenDraft.authorizationGranted=true]){
  const d=structuredClone(f.d);alter(d);assert.equal(tokenDraftRead(d,f.a.id,'OWNER').allowed,false);
  const h=host(),c=mountLaunchpadPage(h,{agents:[f.a],owner:'OWNER',loadContract:async()=>d,canSaveTokenDraft:()=>true,saveTokenDraft:()=>{throw Error('NO_SAVE');}});await flush();assert.doesNotMatch(h.innerHTML,/data-launchpad-token=/);c.destroy();
 }
});
test('immutable saved metadata preserves omission with incomplete image read-only, never grants save or fake launch state',async()=>{
 const a={...agent,id:'FORM_ID',coin:{name:'Saved',ticker:'FIX',image:asset('FORM_ID')}},d={...contract(),id:a.id,lifecycle:{...contract().lifecycle,agent:{id:a.id}},launchpadScope:{available:true,scoped:true,reason:null}};
 d.tokenDraft={...emptyTokenCapability(a.id),state:'IMMUTABLE',revision:1,savedDraft:{name:'Saved',ticker:'FIX',image:asset(a.id),website:'https://example.invalid/'},save:{allowed:false,reason:'IMMUTABLE_IMAGE_UNAVAILABLE',expectedRevision:0,immutable:true},image:{required:true,localAsset:'UNAVAILABLE',complete:false,publicDelivery:'UNVERIFIED'}};
 const read=tokenDraftRead(d,a.id,'OWNER');assert.equal(read.allowed,false);assert.equal(Object.hasOwn(read.saved.draft,'description'),false);
 const h=tokenHost(),c=mountLaunchpadPage(h,{agents:[a],owner:'OWNER',loadContract:async()=>d,canSaveTokenDraft:()=>true,saveTokenDraft:()=>{throw Error('NO_SAVE');}});await flush();assert.match(h.innerHTML,/View Saved Draft/);tokenClick(h,'[data-launchpad-token-view]',{launchpadTokenView:a.id});assert.match(h.innerHTML,/Local image completeness UNAVAILABLE/);assert.match(h.innerHTML,/Current launch status is shown in the Agent receipt above/);assert.match(h.innerHTML,/Not provided/);assert.doesNotMatch(h.innerHTML,/data-launchpad-token-save|data-launchpad-token-form|Public delivery VERIFIED/);c.destroy();
});
test('owner saved-draft projection rejects invalid scalars and never leaks unknown draft fields',()=>{
 const id='ID',d={id,owner:'OWNER',lifecycle:{agent:{id}},tokenDraft:{...emptyTokenCapability(id),state:'IMMUTABLE',revision:1,savedDraft:{name:'Coin',ticker:'FIX',image:asset(id),secret:'PRIVATE'},save:{allowed:false,reason:'TOKEN_ALREADY_CONFIGURED',expectedRevision:0,immutable:true},image:{required:true,localAsset:'VERIFIED',complete:true,publicDelivery:'UNVERIFIED'}}};
 assert.deepEqual(tokenDraftRead(d,id,'OWNER'),{allowed:false,saved:null});
 delete d.tokenDraft.savedDraft.secret;assert.equal(tokenDraftRead(d,id,'OWNER').saved.draft.name,'Coin');
});
test('metadata replay after confirmed or uncertain launch cannot assert an unlaunched or launched fact',async()=>{
 for(const state of ['CONFIRMED','RECONCILIATION_REQUIRED']){
  const a={...agent,id:'REPLAY_ID',coin:{name:'Coin',ticker:'FIX'}},d=contract(state);d.id=a.id;d.lifecycle.agent.id=a.id;
  const actions=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async(id,body)=>({...tokenResult(id,body),replayed:true})});
  const result=await actions.save(a.id,tokenInput());assert.equal(result.replayed,true);assert.equal(Object.hasOwn(result,'launch'),false);
  const html=renderLaunchpadPage({agents:[a],owner:'OWNER',units:[launchpadUnit(a,d)],tokenEditor:{agentId:a.id,name:a.name,stage:'saved',result}});
  const panel=html.slice(html.indexOf('<section class="tw-world-section" data-token-editor=')).split('</section>')[0];
  assert.match(panel,/Coin draft saved, revision 1/);assert.match(panel,/Check the current launch status in the related Agent receipt/);
  assert.doesNotMatch(panel,/NOT LAUNCHED|LAUNCH CONFIRMED|LAUNCH SUBMITTED|RECONCILIATION REQUIRED/);
  assert.match(html,new RegExp(state==='CONFIRMED'?'LAUNCH CONFIRMED':'RECONCILIATION REQUIRED'));
 }
});
test('mounted replay success message confirms metadata only and directs to current receipt',async()=>{
 const f=await tokenPage({saveTokenDraft:async(id,b)=>({...tokenResult(id,b),replayed:true})});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();
 assert.match(f.h.innerHTML,/Coin draft saved\. Public delivery UNVERIFIED\. Check the current launch status/);
 assert.match(f.h.innerHTML,/this save did not request wallet approval/);
 assert.doesNotMatch(f.h.innerHTML,/NOT LAUNCHED|LAUNCH CONFIRMED|LAUNCH SUBMITTED/);f.c.destroy();
});
const rejected400=()=>Object.assign(Error('Token metadata exceeds the current launch request size'),{httpStatus:400});
test('definite noncommitting rejection permits corrected intent with a new key',async()=>{
 const calls=[];const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async(id,b,key)=>{calls.push({b,key});if(calls.length===1)throw rejected400();return tokenResult(id,b);}});
 await assert.rejects(a.save('ID',tokenInput()));assert.equal(a.canEditRejected('ID'),true);assert.equal(a.editRejected('ID'),true);
 const corrected={...tokenInput(),draft:{name:'Corrected',ticker:'FIX'}};await a.save('ID',corrected);assert.notEqual(calls[0].key,calls[1].key);assert.equal(calls[1].b.draft.name,'Corrected');assert.equal(a.editRejected('ID'),false);
});
test('ambiguous outcomes and prior lost responses never unlock editing',async()=>{
 for(const first of [Error('lost'),Object.assign(Error('Generic rejection'),{httpStatus:400}),Object.assign(Error('Token metadata exceeds the current launch request size'),{httpStatus:500})]){
  let calls=0;const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async()=>{if(++calls===1)throw first;throw rejected400();}});
  await assert.rejects(a.save('ID',tokenInput()));assert.equal(a.editRejected('ID'),false);await assert.rejects(a.save('ID',tokenInput()));assert.equal(a.canEditRejected('ID'),false);assert.equal(a.editRejected('ID'),false);
  await assert.rejects(a.save('ID',{...tokenInput(),draft:{name:'Changed',ticker:'FIX'}}),/TOKEN_FORM_RETRY_LOCKED/);assert.equal(calls,2);
 }
});
test('rejection edit respects pending, changed owner, stale page and lost capability',async()=>{
 for(const guard of ['owner','stale','capability']){let owner='OWNER',current=true,ready=true,reject;const a=createTokenDraftActions({owner:'OWNER',getOwner:()=>owner,isCurrent:()=>current,canSaveTokenDraft:()=>ready,saveTokenDraft:()=>new Promise((_,r)=>reject=r)});
 const p=a.save('ID',tokenInput());await Promise.resolve();assert.equal(a.editRejected('ID'),false);reject(rejected400());await assert.rejects(p);assert.equal(a.canEditRejected('ID'),true);
 if(guard==='owner')owner='OTHER';if(guard==='stale')current=false;if(guard==='capability')ready=false;assert.equal(a.editRejected('ID'),false);
 }
});
test('mounted definite rejection edits and saves corrected metadata without remount',async()=>{
 const calls=[];const f=await tokenPage({saveTokenDraft:async(id,b,key)=>{calls.push({b,key});if(calls.length===1)throw rejected400();return tokenResult(id,b);}});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.match(f.h.innerHTML,/EDIT REJECTED DRAFT/);assert.match(f.h.innerHTML,/rejected before saving/);
 tokenClick(f.h,'[data-launchpad-token-edit]');assert.match(f.h.innerHTML,/<form data-launchpad-token-form>/);assert.match(f.h.innerHTML,/value="Coin"/);assert.match(f.h.innerHTML,/Choose the image again/);Object.assign(f.h.form.values,{tokenName:'Corrected'});
 const Original=globalThis.FormData;globalThis.FormData=class{constructor(form){this.form=form;}[Symbol.iterator](){return Object.entries(this.form.values)[Symbol.iterator]();}};try{f.h.listeners.submit({target:f.h.form,preventDefault(){}});}finally{globalThis.FormData=Original;}
 tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.equal(calls.length,2);assert.notEqual(calls[0].key,calls[1].key);assert.equal(calls[1].b.draft.name,'Corrected');assert.match(f.h.innerHTML,/COIN DRAFT SAVED/);f.c.destroy();
});
test('malformed accessor and proxy errors latch uncertainty before inspection',async()=>{
 const errors=[Object.defineProperty(Error('unknown'),'httpStatus',{get(){throw Error('PRIVATE_GETTER');}}),new Proxy(Error('unknown'),{getOwnPropertyDescriptor(){throw Error('PRIVATE_PROXY');}}),Object.defineProperty({httpStatus:400},'message',{get(){throw Error('PRIVATE_MESSAGE');}})];
 for(const malformed of errors){let calls=0;const keys=[];const a=createTokenDraftActions({owner:'OWNER',canSaveTokenDraft:()=>true,saveTokenDraft:async(id,b,key)=>{keys.push(key);if(++calls===1)throw malformed;throw rejected400();}});
 await assert.rejects(a.save('ID',tokenInput()));await assert.rejects(a.save('ID',tokenInput()));assert.equal(keys[0],keys[1]);assert.equal(a.canEditRejected('ID'),false);assert.equal(a.editRejected('ID'),false);await assert.rejects(a.save('ID',{...tokenInput(),draft:{name:'Changed',ticker:'FIX'}}),/TOKEN_FORM_RETRY_LOCKED/);assert.equal(calls,2);
 }
});
test('mounted malformed error renders safe unknown outcome and retains same retry intent',async()=>{
 for(const malformed of [Object.defineProperty(Error('unknown'),'httpStatus',{get(){throw Error('PRIVATE_GETTER');}}),new Proxy(Error('unknown'),{getOwnPropertyDescriptor(){throw Error('PRIVATE_PROXY');},get(){throw Error('PRIVATE_PROXY_GET');}})]){
 const calls=[];const f=await tokenPage({saveTokenDraft:async(id,b,key)=>{calls.push({b,key});if(calls.length===1)throw malformed;throw rejected400();}});reviewToken(f);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.match(f.h.innerHTML,/Draft save outcome unavailable/);assert.doesNotMatch(f.h.innerHTML,/EDIT REJECTED DRAFT|PRIVATE_/);assert.equal(calls.length,1);tokenClick(f.h,'[data-launchpad-token-save]');await flush();assert.deepEqual(calls[0],calls[1]);assert.match(f.h.innerHTML,/Draft save outcome unavailable/);assert.doesNotMatch(f.h.innerHTML,/EDIT REJECTED DRAFT/);f.c.destroy();
 }
});
import {ownerAgentContract} from '../server/launchpad-contracts.js';
const workflowReceipt=more=>({agentId:agent.id,owner:agent.creator,network:'solana:101',status:'Unknown',signature:'LOCAL_FIXTURE_SIGNATURE',broadcastAttempted:true,mint,...more});
const workflowUnit=receipt=>launchpadUnit(agent,ownerAgentContract(agent,{receipt}));
test('owner read workflow distinguishes recorded signed phases from delivery/finality proof',()=>{
 for(const status of ['Unknown','Confirming','Submitted']){const receipt=workflowReceipt({status,notice:'PRIVATE_DIAGNOSTIC',secret:'PRIVATE'}),before=JSON.stringify(receipt),unit=workflowUnit(receipt);assert.equal(unit.launch.state,'RECONCILIATION_REQUIRED');assert.equal(unit.launch.workflow.available,true);assert.equal(unit.launch.workflow.receiptStatus,status);assert.equal(unit.launch.workflow.signatureRecorded,true);assert.equal(unit.launch.workflow.deliveryStatus,'UNVERIFIED');assert.equal(unit.launch.workflow.finality,'UNAVAILABLE');assert.equal(unit.token.mint,null);
 const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.match(html,new RegExp('Recorded receipt phase · '+status+' \\(workflow only\\)'));assert.match(html,/Signature recorded · YES/);assert.match(html,/Transaction delivery · UNVERIFIED/);assert.match(html,/Recorded finality · UNAVAILABLE · Reconciliation pending/);assert.match(html,/Signed outcome is unknown/);assert.match(html,/BACKEND VERIFIED · Recorded launch workflow/);assert.doesNotMatch(html,/LAUNCH SUBMITTED|LAUNCH CONFIRMED|PRIVATE|ON-CHAIN VERIFIED|VIEW COIN/);assert.equal(JSON.stringify(receipt),before);
 }
});
test('confirmed/failed finality remains backend receipt evidence with delivery unverified',()=>{
 for(const [receipt,finality]of [[workflowReceipt({status:'Success',confirmed:true}),'CONFIRMED'],[workflowReceipt({status:'Failed',resolution:'ONCHAIN_FAILURE'}),'FAILED']]){const unit=workflowUnit(receipt);assert.equal(unit.launch.workflow.finality,finality);const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.match(html,new RegExp('Recorded finality · '+finality+' · Canonical '+(finality==='CONFIRMED'?'confirmed':'failed')+' receipt'));assert.match(html,/Transaction delivery · UNVERIFIED/);assert.match(html,/does not prove transaction delivery or independently verify the chain/);assert.doesNotMatch(html,/Reconciliation pending|ON-CHAIN VERIFIED/);assert.equal(unit.token.mint,finality==='CONFIRMED'?mint:null);}
});
test('no receipt and unsigned preparation do not invent a signature or confirmed finality',()=>{
 for(const receipt of [null,workflowReceipt({status:'Prepared',signature:null,broadcastAttempted:false}),workflowReceipt({status:'Unknown',signature:null,broadcastAttempted:true})]){const unit=workflowUnit(receipt),html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.equal(unit.launch.workflow.available,true);assert.match(html,/Signature recorded · NO/);assert.match(html,/Recorded finality · UNAVAILABLE/);assert.doesNotMatch(html,/Signed outcome is unknown|Canonical confirmed receipt|VIEW COIN/);if(receipt?.broadcastAttempted)assert.match(html,/Transaction outcome is unknown/);}
});
test('workflow fields fail closed independently of compatible canonical lifecycle',()=>{
 const dto=ownerAgentContract(agent,{receipt:workflowReceipt({})});
 for(const alter of [d=>delete d.lifecycle.launch.workflowProvenance,d=>d.lifecycle.launch.workflowProvenance='ON-CHAIN VERIFIED',d=>d.lifecycle.launch.deliveryStatus='VERIFIED',d=>d.lifecycle.launch.authorizationGranted=true,d=>d.lifecycle.launch.signatureRecorded=false,d=>d.lifecycle.launch.receiptStatus='PRIVATE',d=>d.lifecycle.launch.finality='CONFIRMED',d=>d.lifecycle.launch.provenanceReason='PRIVATE',d=>d.lifecycle.launch.network='solana:103',d=>d.lifecycle.launch.state='NOT_CONFIGURED']){const d=structuredClone(dto);alter(d);const unit=launchpadUnit(agent,d);assert.equal(unit.launch.workflow.available,false);assert.equal(unit.launch.workflow.provenance,'UNAVAILABLE');assert.equal(unit.token.mint,null);const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.match(html,/Recorded launch workflow · UNAVAILABLE/);assert.doesNotMatch(html,/PRIVATE|data-launchpad-workflow|Signature recorded · YES/);}
 for(const alter of [d=>d.id='OTHER',d=>d.owner='OTHER',d=>d.lifecycle.agent.id='OTHER']){const d=structuredClone(dto);alter(d);const unit=launchpadUnit(agent,d);assert.equal(unit.available,false);assert.equal(unit.launch.workflow.available,false);}
});
test('legacy lifecycle-only contracts retain canonical behavior while workflow unavailable; loading reveals no old proof',()=>{
 const unit=launchpadUnit(agent,contract('CONFIRMED'));assert.equal(unit.launch.confirmed,true);assert.equal(unit.launch.workflow.available,false);const html=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[unit]});assert.match(html,/LAUNCH CONFIRMED/);assert.match(html,/Recorded launch workflow · UNAVAILABLE/);
 const loading=renderLaunchpadPage({agents:[agent],owner:'OWNER',units:[workflowUnit(workflowReceipt({}))],loading:true});assert.match(loading,/CHECKING LAUNCH EVIDENCE/);assert.doesNotMatch(loading,/data-launchpad-workflow|Signature recorded|Reconciliation pending/);
});
test('mounted workflow reads are passive and related-Agent link remains the recovery destination',async()=>{
 const h=host(),reads=[];const c=mountLaunchpadPage(h,{agents:[agent],owner:'OWNER',loadContract:async id=>{reads.push(id);return ownerAgentContract(agent,{receipt:workflowReceipt({})});}});await flush();assert.deepEqual(reads,[agent.id]);assert.match(h.innerHTML,/Reconciliation pending/);assert.match(h.innerHTML,/#\/agent\/LOCAL_FIXTURE/);assert.doesNotMatch(h.innerHTML,/data-launchpad-reconcile|data-launchpad-submit|data-launchpad-approve/);c.destroy();
});
