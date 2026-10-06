import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAutonomousHealth} from '../server/dex/autonomous-health.js';
import {createAutonomousOrchestrator} from '../server/dex/autonomous-orchestrator.js';
import {createAutonomousScheduler} from '../server/dex/autonomous-scheduler.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {fixtureMarket,fixtureProvenance} from './market-provenance-fixture.mjs';

const clock=1_800_000_000_000;
function harness({sellOutput='120000',openedAt=clock-1000,unsupported=false,unknown=false,live=true,executionPortAvailable=true,staleMarket=false,staleValuation=false,riskAllowed=true,positionOpen=false,resultStatus=null,strategy='momentum',positionSizing}={}){
 const db=new DatabaseSync(':memory:'),health=createAutonomousHealth(db,{now:()=>clock});let position=positionOpen?{mint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL,quantity:'12000',costBasisLamports:'100000',openedAt,buySignature:'old-buy',strategyVersion:0}:null,quantity='12000',calls=[],active=unknown?[{status:'UNKNOWN'}]:[];
 const quote={...fixtureMarket(clock,'snapshot-1'),pair:unsupported?'unverified':CONTROLLED_CPMM_POOL,observedAt:clock-(staleMarket?60000:1000)};
 const port={provenProductionBoundary:true,async reconcile(id){return {id,status:'UNKNOWN'};},async execute({intent}){calls.push(intent);if(resultStatus)return {id:'attempt',status:resultStatus,reason:resultStatus};if(intent.direction==='BUY'){position={mint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL,quantity,costBasisLamports:'100000',openedAt,buySignature:'buy-signature',strategyVersion:0};return {id:'buy',status:'CONFIRMED',finalized:true,receipt:{signature:'buy-signature'}};}position=null;return {id:'sell',status:'CONFIRMED',finalized:true,receipt:{signature:'sell-signature'}};}};
 const orchestrator=createAutonomousOrchestrator({
  discovery:{scan:async()=>({candidates:[{mint:CONTROLLED_USDC_MINT,quote}],status:'OK',discoveredAt:clock})},
  market:{sellQuote:async p=>({verified:true,network:'solana:mainnet',direction:'SELL',inputMint:p.mint,outputMint:SOL_MINT,pool:p.pool,inputAmount:p.quantity,estimatedOutput:sellOutput,observedAt:clock-(staleValuation?60000:1000)})},
  positions:{read:()=>position,actualTokenBalance:async()=>quantity,riskState:async()=>({unknown:false,unresolved:false,reservationConflict:false,cooldownUntil:0,dailyTurnoverLamports:'0'})},
  executions:{list:()=>active},health,executionPort:executionPortAvailable?port:null,
  network:{verify:async()=>({network:'solana:mainnet',verified:true})},
  agentContext:async()=>({agentId:'agent',owner:'owner',agentWallet:SOL_MINT,mode:'LIVE_AUTONOMOUS',enabled:true,paused:false,vaultVerified:true,strategy}),positionSizing,
  flags:()=>({liveAutonomousEnabled:live,autonomousKillSwitch:false,realMoneyEmergencyStop:false}),risk:{evaluate:async()=>({allowed:riskAllowed})},now:()=>clock
  ,resolveProvenance:args=>fixtureProvenance(args.snapshot,args.agentWallet,clock)
 });
 return {db,orchestrator,port,active,calls,health,close:()=>db.close(),get position(){return position;}};
}

test('Real personality sizing is fresh, bounded and independently requoted by execution',async()=>{
 for(const [strategy,expected] of [['guardian','45000'],['scout','67500'],['operator','90000'],['hunter','100000'],['berserker','100000']]){
  const h=harness({strategy,positionSizing:async()=>({balanceLamports:'1000000',reserveLamports:'100000',observedAt:clock})});
  try{const out=await h.orchestrator.tick('agent');assert.equal(out.action,'BUY',strategy+': '+out.reason);assert.equal(h.calls[0].inputAmount,expected);}finally{h.close();}
 }
 for(const positionSizing of [undefined,async()=>({balanceLamports:'1000000',reserveLamports:'100000',observedAt:clock-10001}),async()=>({balanceLamports:'1000000',observedAt:clock})]){
  const h=harness({strategy:'operator',positionSizing});try{assert.equal((await h.orchestrator.tick('agent')).action,'SKIP');assert.equal(h.calls.length,0);}finally{h.close();}
 }
});

for(const [name,options] of [['take profit',{sellOutput:'120000'}],['stop loss',{sellOutput:'95000'}],['max hold',{sellOutput:'100000',openedAt:clock-900001}]])test(`same decision orchestration selects ${name} after a confirmed buy`,async()=>{
 const h=harness(options);
 try{assert.equal((await h.orchestrator.tick('agent')).action,'BUY');assert.equal(h.position.quantity,'12000');
  const exit=await h.orchestrator.tick('agent');assert.equal(exit.action,'SELL');assert.equal(h.position,null);assert.equal(h.calls.length,2);assert.equal(h.calls[1].direction,'SELL');assert.equal(h.health.read('agent').consecutiveFailures,0);
 }finally{h.close();}
});
test('unsupported venue, disabled live and UNKNOWN never reach execution port',async()=>{
 for(const [options,reason] of [[{unsupported:true},'UNSUPPORTED_EXECUTION_VENUE'],[{live:false},'AUTONOMOUS_TRADING_STOP'],[{unknown:true},'UNRESOLVED_EXECUTION']]){
  const h=harness(options);try{assert.equal((await h.orchestrator.tick('agent')).reason,reason);assert.equal(h.calls.length,0);}finally{h.close();}
 }
});
test('production boundary cannot be inferred from a strategy signal',async()=>{
 const h=harness({executionPortAvailable:false});
 try{const result=await h.orchestrator.tick('agent');assert.equal(result.reason,'AUTONOMOUS_EXECUTION_PORT_UNAVAILABLE');assert.equal(h.calls.length,0);assert.equal(h.position,null);}finally{h.close();}
});
test('stale discovery, Risk rejection and stale valuation do not reach a value-moving port',async()=>{
 for(const [options,reason] of [[{staleMarket:true},'NO_ELIGIBLE_MARKET'],[{riskAllowed:false},'RISK_REJECTED'],[{positionOpen:true,staleValuation:true},'STALE_OR_UNVERIFIED_PRICE']]){
  const h=harness(options);try{assert.equal((await h.orchestrator.tick('agent')).reason,reason);assert.equal(h.calls.length,0);}finally{h.close();}
 }
});
test('an existing Real Position is monitored; discovery cannot open a second BUY',async()=>{
 const h=harness({positionOpen:true,sellOutput:'101000'});try{const result=await h.orchestrator.tick('agent');assert.equal(result.action,'WAIT');assert.equal(h.calls.length,0);}finally{h.close();}
});
for(const [direction,status] of [['BUY','REJECTED_BEFORE_SIGNING'],['BUY','FAILED'],['BUY','UNKNOWN'],['SELL','REJECTED_BEFORE_SIGNING'],['SELL','FAILED'],['SELL','UNKNOWN']])test(`${direction} ${status} does not create a false confirmed position`,async()=>{
 const h=harness({positionOpen:direction==='SELL',resultStatus:status});try{const result=await h.orchestrator.tick('agent');assert.notEqual(result.status,'CONFIRMED');assert.equal(h.calls.length,1);assert.equal(h.calls[0].direction,direction);if(direction==='SELL')assert.equal(h.position.quantity,'12000');else assert.equal(h.position,null);if(status==='UNKNOWN')assert.equal(h.health.read('agent').pausedByBreaker,true);}finally{h.close();}
});
test('three execution failures auto-pause scheduler persistently; owner resume requires verified preflight',async()=>{
 const h=harness({resultStatus:'FAILED'});try{
  const deps={orchestrator:h.orchestrator,executions:{list:()=>h.active},executionPort:h.port,flags:()=>({liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:false}),network:{verify:async()=>({network:'solana:mainnet',verified:true})},vault:{verify:async()=>true},health:h.health,now:()=>clock};
  const scheduler=createAutonomousScheduler(h.db,deps);await scheduler.ownerStart('agent');
  for(let i=0;i<3;i++)assert.equal((await scheduler.tickOne('agent')).reason,'FAILED');
  assert.equal(h.health.read('agent').pausedByBreaker,true);
  const restarted=createAutonomousScheduler(h.db,deps);assert.equal(restarted.read('agent').paused,true);
  await restarted.ownerResume('agent');assert.equal(h.health.read('agent').pausedByBreaker,false);
  assert.equal((await restarted.tickOne('agent')).reason,'FAILED');
 }finally{h.close();}
});
