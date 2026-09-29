import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {evaluateScan} from '../server/opportunity-scanner.js';
import {strategyIntent,executePaper} from '../server/paper-engine.js';
import {decisionSnapshot,createDecisionStore,radarState} from '../server/market-radar.js';
import {discoveryHealth} from '../server/market-health.js';
import {projectTrading} from '../server/trading-projection.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
const time=1800000000000,mint='So11111111111111111111111111111111111111112';
const quote=(more={})=>({mint,network:'solana:101',priceUsd:1,solUsd:150,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:5,observedAt:time,...more});
const state=()=>({agentId:'fixture-only',mint,mode:'paper',discoveryMode:true,strategy:'momentum',strategyConfig:defaultStrategyConfig('momentum'),strategyConfigVersion:0,enabled:true,everStarted:true,initialSol:.1,cashSol:.1,realizedSol:0,initialUsd:15,cashUsd:15,realizedUsd:0,dailySpentSol:0});
function fixture(candidate){const s=state(),db=new DatabaseSync(':memory:'),store=createDecisionStore(db,()=>time),events=[];evaluateScan(s,{universe:{status:'OK',candidates:[candidate]},held:null},time,{capture:(s,d)=>store.capture(s,d),event:(s,e)=>events.push(e)});const decisions=store.list(s.agentId);db.close();return {s,events,decisions};}
test('A market failure: zero evaluation, intents, risks, execution and activity',()=>{
 const {s,events,decisions}=fixture({mint,error:'PROVIDER_UNAVAILABLE'});assert.equal(s.scan.evaluated,0);assert.equal(s.scan.marketHealth,'PROVIDER_UNAVAILABLE');assert.equal(s.scan.opportunities[0].tradeIntent,null);assert.equal(s.scan.opportunities[0].risk,null);assert.equal(s.position,undefined);assert.equal(s.cashSol,.1);assert.deepEqual(events,[]);assert.deepEqual(decisions,[]);
});
test('B signal failure: evaluated SKIPPED with no executable intent or risk',()=>{
 const {s,events,decisions}=fixture({mint,quote:quote({change5m:25})});assert.equal(s.scan.evaluated,1);assert.equal(decisions[0].finalDecision,'SKIPPED');assert.equal(decisions[0].risk,null);assert.ok(!decisions[0].tradeIntent||decisions[0].tradeIntent.action==='HOLD');assert.equal(events[0].type,'SIGNAL_SKIPPED');assert.equal(s.cashSol,.1);assert.equal(s.position,undefined);
});
test('C actual strategy -> intent -> risk allow -> Paper entry, ledger and PnL',()=>{
 const original=state().strategyConfig,{s,events,decisions}=fixture({mint,quote:quote()}),d=decisions[0];assert.ok(d.signalChecks.every(c=>c.passed));assert.equal(d.tradeIntent.action,'BUY');assert.equal(d.risk.allowed,true);assert.equal(d.finalDecision,'BUY');assert.ok(s.position);assert.equal(events.find(e=>e.type==='BUY').signature,null);assert.deepEqual(events.map(e=>e.type),['POSITION_OPENED','BUY']);
 const p=projectTrading({id:s.agentId},s,events,time);assert.equal(p.tradeCount,1);assert.equal(p.openPositions.length,1);assert.ok(Number.isFinite(p.totalPnlSol));assert.ok(p.totalPnlSol<0);assert.equal(p.realizedPnlSol,0);assert.ok(s.cashSol<.1);assert.deepEqual(s.strategyConfig,original);
});
test('D only requested trade size changed: passing signals, actual risk reject, persisted reason',()=>{
 const s=state(),q=quote(),intent=strategyIntent(s,q,time),original=structuredClone(s);assert.equal(intent.side,'BUY');assert.ok(Object.values(intent.signals).every(Boolean));
 intent.sol=s.strategyConfig.risk.maxSolPerTrade*2;intent.requestedSizeSol=intent.sol;
 const result=executePaper(s,intent,q,time),d=decisionSnapshot(s,intent,result,time);assert.equal(result.risk.allowed,false);assert.equal(result.risk.reason,'Maximum trade size');assert.equal(d.risk.checks.maxTrade,false);assert.equal(d.finalDecision,'REJECTED');assert.equal(d.tradeIntent.action,'BUY');assert.ok(d.signalChecks.every(c=>c.passed));assert.equal(result.receipt,undefined);assert.deepEqual(s,original);
 const db=new DatabaseSync(':memory:'),store=createDecisionStore(db,()=>time);store.capture(s,d);assert.equal(store.list(s.agentId,'risk')[0].reason.summary,'Maximum trade size');db.close();
});
test('E stale: blocked before strategy, intent, risk and execution',()=>{
 const {s,events,decisions}=fixture({mint,quote:quote({observedAt:time-30001})});assert.equal(s.scan.evaluated,0);assert.equal(s.scan.marketHealth,'STALE');assert.equal(s.scan.opportunities[0].tradeIntent,null);assert.equal(s.scan.opportunities[0].risk,null);assert.equal(s.cashSol,.1);assert.equal(s.position,undefined);assert.deepEqual(events,[]);assert.deepEqual(decisions,[]);
});
test('23 discovered / 13 usable quotes / 10 unavailable is partial degradation',()=>{
 const candidates=Array.from({length:23},(_,i)=>i<13?{mint,quote:quote()}:{mint,error:'PROVIDER_UNAVAILABLE'}),h=discoveryHealth({status:'OK',candidates},null,time);assert.deepEqual(h,{marketHealth:'DEGRADED',coverage:{discovered:23,quoted:13,unavailable:10}});
 assert.equal(discoveryHealth({status:'RATE_LIMITED',candidates:[]},null,time).marketHealth,'RATE_LIMITED');assert.equal(discoveryHealth({status:'OK',candidates:[{mint,quote:quote({liquidityUsd:100})}]},null,time).marketHealth,'HEALTHY');
});
for(const enabled of [true,false])for(const marketHealth of ['HEALTHY','DEGRADED'])test(`${enabled?'WORKING':'PAUSED'} + ${marketHealth} remain independent`,()=>{
 const s=state();s.enabled=enabled;s.scan={status:'SCANNING',marketHealth,lastChecked:time,coverage:{discovered:23,quoted:13,unavailable:10}};const r=radarState({id:s.agentId},s,time);assert.equal(r.agentStatus,enabled?'WORKING':'PAUSED');assert.equal(r.marketHealth,marketHealth);assert.equal(r.dataStale,false);const old=radarState({id:s.agentId},s,time+31000);assert.equal(old.dataStale,true);assert.equal(old.marketHealth,marketHealth==='HEALTHY'?'STALE':'DEGRADED');
});
