import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {resolveAssociatedCoinPaperPolicy as resolvePolicy} from '../server/associated-coin-paper-policy.js';
import {installAgentTrading} from '../server/agent-trading.js';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';
const mint='So11111111111111111111111111111111111111112',other='11111111111111111111111111111111',time=1800000000000;
const agent={id:'fixture',creator:'fixture-owner',strategy:'balanced',coin:null};
const scope=scoped=>({available:true,scoped,reason:null});
const receipt=()=>({agentId:agent.id,owner:agent.creator,network:'solana:101',status:'Success',confirmed:true,signature:'fixture-signature',mint});
const quote=m=>({mint:m,network:'solana:101',priceUsd:1,solUsd:150,liquidityUsd:50000,change5m:2,buys5m:20,sells5m:5,volume5m:2000,observedAt:time});
const state=(more={})=>({agentId:agent.id,mode:'paper',enabled:false,strategy:'balanced',mint,revision:0,...more});
function fixture(t,{scoped=true,ledgerAuthority=false}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE agents(id TEXT PRIMARY KEY,owner TEXT,data TEXT,no INTEGER)');db.prepare('INSERT INTO agents VALUES(?,?,?,?)').run(agent.id,agent.creator,JSON.stringify(agent),1);
 const routes=new Map(),app={get(path,...handlers){routes.set('GET '+path,handlers.at(-1));},post(path,...handlers){routes.set('POST '+path,handlers.at(-1));}};
 let currentScope=scope(scoped),currentReceipt=receipt(),marketCalls=0,scanCalls=0,wait=null;
 let ledger=null;if(ledgerAuthority){db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)');ledger=installLaunchpadScopeLedger(db,{now:()=>time});if(scoped){db.exec('BEGIN IMMEDIATE');ledger.insertLaunchpadScope(agent,{source:'LAUNCHPAD_ENTRY'});db.exec('COMMIT');}}
 const options={store:{db},auth(){},owned:()=>({agent:{...agent}}),now:()=>time,receipt:()=>{if(currentReceipt instanceof Error)throw currentReceipt;return currentReceipt;},readLaunchpadScope:()=>{if(ledger)return ledger.readLaunchpadScope(agent);if(currentScope instanceof Error)throw currentScope;return currentScope;},market:async m=>{marketCalls++;if(wait)await wait;return quote(m);},discovery:{scan:async()=>{scanCalls++;return {status:'OK',candidates:[]};}},balance:async()=>{throw Error('external disabled');},realMoney:{connection:{},verify:async()=>{throw Error('external disabled');}}};
 let controller=installAgentTrading(app,options);
 const save=s=>db.prepare('INSERT OR REPLACE INTO paper_states VALUES(?,?)').run(agent.id,JSON.stringify(s));
 const get=()=>{const r=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(agent.id);return r?JSON.parse(r.data):null;};
 return {db,save,get,get controller(){return controller;},setScope:s=>currentScope=s,setReceipt:r=>currentReceipt=r,setWait:p=>wait=p,get calls(){return {market:marketCalls,scan:scanCalls};},restart(){controller=installAgentTrading(app,options);},async call(action,body={}){let result;await routes.get('POST /api/agents/:id/trading/'+action)({body,params:{id:agent.id}},{json(value){result=value;return this;}});return result;}};
}
test('pure authority requires trustworthy absence; no request/metadata classification',()=>{
 assert.equal(resolvePolicy({agent,scope:scope(false)}).kind,'GENERAL');
 for(const s of [undefined,null,{},scope(null),{available:false,scoped:false,reason:null}])assert.equal(resolvePolicy({agent,scope:s}).available,false);
 for(const p of [null,'',false,'unknown'])assert.equal(resolvePolicy({agent,scope:scope(false),paperState:state({targetPolicy:p})}).available,false);
 assert.equal(resolvePolicy({agent,scope:scope(true),paperState:state({targetPolicy:'GENERAL'}),receipt:receipt()}).available,false);
 assert.equal(resolvePolicy({agent,scope:scope(false),paperState:state({targetPolicy:'ASSOCIATED_COIN'}),receipt:receipt()}).kind,'ASSOCIATED_COIN');
});
for(const [key,value] of [['agentId','wrong'],['owner','wrong'],['network','solana:103'],['status','Unknown'],['confirmed',false],['confirmed',1],['signature',''],['mint','invalid']])test('pure receipt rejects '+key+'='+value,()=>{
 assert.equal(resolvePolicy({agent,scope:scope(true),receipt:{...receipt(),[key]:value}}).available,false);
});
test('configure is restrictive without enable; start and actual tick use associated mint',async t=>{
 const f=fixture(t);const configured=await f.call('configure',{mode:'paper',strategy:'balanced',tokenMint:mint});assert.equal(configured.enabled,false);assert.equal(configured.paperTargetPolicy.kind,'ASSOCIATED_COIN');assert.equal(f.get().targetPolicy,'ASSOCIATED_COIN');
 await f.call('enable',{mode:'paper',strategy:'balanced',discovery:false});await f.controller.tick();assert.equal(f.get().position.mint,mint);assert.equal(f.calls.scan,0);assert.equal(f.controller.projection(agent).paperTargetPolicy,undefined,'anonymous projection excludes authority');
});
for(const body of [{tokenMint:other},{targetPolicy:'GENERAL'},{targetPolicy:null},{targetPolicy:'unknown'},{discovery:true}])test('configure rejects override/downgrade before market '+JSON.stringify(body),async t=>{
 const f=fixture(t);await assert.rejects(f.call('configure',{strategy:'balanced',tokenMint:mint,...body}));assert.equal(f.calls.market,0);assert.equal(f.get(),null);
});
for(const invalid of [null,Error('journal unavailable'),{...receipt(),owner:'wrong'},{...receipt(),confirmed:false}])test('missing or invalid canonical receipt blocks configure/start/tick',async t=>{
 const f=fixture(t);f.setReceipt(invalid);await assert.rejects(f.call('configure',{strategy:'balanced',tokenMint:mint}));f.save(state());await assert.rejects(f.call('enable',{mode:'paper',strategy:'balanced'}));f.save(state({enabled:true}));await f.controller.tick();assert.equal(f.calls.market,0);assert.equal(f.get().position,undefined);assert.equal(f.get().health,'Unavailable');assert.equal(f.controller.snapshot(agent).paperTargetPolicy.available,false);
});
test('associated start rejects discovery, request overrides and persisted wrong mint/position',async t=>{
 const f=fixture(t);for(const [s,body] of [[state(),{discovery:true}],[state(),{tokenMint:other}],[state(),{targetPolicy:null}],[state({mint:other}),{}],[state({position:{mint:other}}),{}],[state({discoveryMode:true}),{}]]){f.save(s);await assert.rejects(f.call('enable',{mode:'paper',strategy:'balanced',...body}));}assert.equal(f.calls.market,0);
});
test('both tick branches deny associated discovery and wrong persisted mint before reads',async t=>{
 const f=fixture(t);for(const more of [{discoveryMode:true},{mint:other},{position:{mint:other}}]){f.save(state({enabled:true,...more}));await f.controller.tick();assert.equal(f.get().position?.mint??null,more.position?.mint??null);}assert.deepEqual(f.calls,{market:0,scan:0});
});
test('legacy general remains general, configure/start and discovery execute with proven absence',async t=>{
 const f=fixture(t,{scoped:false});f.setReceipt(null);await f.call('configure',{strategy:'balanced',tokenMint:other});assert.equal(f.get().targetPolicy,undefined);await f.call('enable',{mode:'paper',strategy:'balanced',discovery:true});await f.controller.tick();assert.equal(f.calls.scan,1);assert.equal(f.controller.snapshot(agent).paperTargetPolicy.kind,'GENERAL');
});
test('unknown scope/provider errors block execution and are safe in owned snapshots',async t=>{
 const f=fixture(t);for(const s of [undefined,{available:false,scoped:null,reason:'error'},Error('query failure')]){f.setScope(s);await assert.rejects(f.call('configure',{strategy:'balanced',tokenMint:mint}));assert.equal(f.controller.snapshot(agent).paperTargetPolicy.kind,'UNAVAILABLE');}assert.equal(f.calls.market,0);
});
test('guard rejects active/open/malformed state and in-flight configure, without state mutation',async t=>{
 const f=fixture(t);f.controller.assertCanEnterLaunchpadScope(agent.id);
 for(const s of [state({enabled:true}),state({position:{mint}}),state({agentId:'wrong'}),null,{},false]){f.save(s);const before=f.get();assert.throws(()=>f.controller.assertCanEnterLaunchpadScope(agent.id));assert.deepEqual(f.get(),before);}
 f.save(state());let release;f.setWait(new Promise(r=>release=r));const pending=f.call('configure',{strategy:'balanced',tokenMint:mint});assert.throws(()=>f.controller.assertCanEnterLaunchpadScope(agent.id));release();await pending;f.controller.assertCanEnterLaunchpadScope(agent.id);
});
for(const action of ['configure','enable','tick'])test(action+' rechecks receipt and pause revision after awaited quote',async t=>{
 const f=fixture(t);f.save(state({enabled:action==='tick'}));let release;f.setWait(new Promise(r=>release=r));const pending=action==='tick'?f.controller.tick():f.call(action,action==='configure'?{strategy:'balanced',tokenMint:mint}:{mode:'paper',strategy:'balanced'});f.setReceipt({...receipt(),mint:other});release();if(action==='tick')await pending;else await assert.rejects(pending);assert.equal(f.get().position,undefined);assert.equal(f.get().enabled,action==='tick');
 f.setReceipt(receipt());f.save(state({enabled:action==='tick'}));f.setWait(new Promise(r=>release=r));const paused=action==='tick'?f.controller.tick():f.call(action,action==='configure'?{strategy:'balanced',tokenMint:mint}:{mode:'paper',strategy:'balanced'});await f.call('pause');release();if(action==='tick')await paused;else await assert.rejects(paused);assert.equal(f.get().enabled,false);assert.equal(f.get().position,undefined);
});
test('scope transition during general quote cannot commit stale configuration',async t=>{
 const f=fixture(t,{scoped:false});let release;f.setWait(new Promise(r=>release=r));const pending=f.call('configure',{strategy:'balanced',tokenMint:other});f.setScope(scope(true));release();await assert.rejects(pending);assert.equal(f.get(),null);
});
test('restart, pause and strategy changes retain associated policy and immutable position configuration',async t=>{
 const f=fixture(t);await f.call('configure',{strategy:'balanced',tokenMint:mint});await f.call('enable',{mode:'paper',strategy:'balanced'});await f.controller.tick();const original=f.get().position.strategyConfig;await f.call('pause');f.controller.setStrategy(agent.id,'selective');assert.deepEqual(f.get().position.strategyConfig,original);assert.equal(f.get().targetPolicy,'ASSOCIATED_COIN');f.restart();assert.equal(f.get().targetPolicy,'ASSOCIATED_COIN');assert.equal(f.get().enabled,false);assert.throws(()=>f.controller.assertCanEnterLaunchpadScope(agent.id));
});
test('real ledger remains authoritative when Paper policy is omitted/deleted/replaced',async t=>{
 const f=fixture(t,{ledgerAuthority:true});await f.call('configure',{strategy:'balanced',tokenMint:mint});
 for(const policy of [undefined,'GENERAL',null,'unknown']){
  const s=state();if(policy!==undefined)s.targetPolicy=policy;f.save(s);
  await assert.rejects(f.call('configure',{strategy:'balanced',tokenMint:other}));await assert.rejects(f.call('enable',{mode:'paper',strategy:'balanced',tokenMint:other}));f.save({...s,enabled:true,mint:other});await f.controller.tick();assert.equal(f.get().position,undefined);assert.equal(f.get().health,'Unavailable');assert.equal(f.db.prepare('SELECT count(*) AS n FROM launchpad_agent_scopes').get().n,1);
 }
 f.save(state());await f.call('configure',{strategy:'balanced',tokenMint:mint});assert.equal(f.get().targetPolicy,'ASSOCIATED_COIN');
});
test('real ledger absence keeps valid legacy arbitrary-mint configure/start/tick behavior',async t=>{
 const f=fixture(t,{scoped:false,ledgerAuthority:true});f.setReceipt(null);await f.call('configure',{strategy:'balanced',tokenMint:other});await f.call('enable',{mode:'paper',strategy:'balanced',discovery:false});await f.controller.tick();assert.equal(f.get().position.mint,other);assert.equal(f.controller.snapshot(agent).paperTargetPolicy.kind,'GENERAL');assert.equal(f.db.prepare('SELECT count(*) AS n FROM launchpad_agent_scopes').get().n,0);
});
