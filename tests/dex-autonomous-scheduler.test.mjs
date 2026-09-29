import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAutonomousScheduler} from '../server/dex/autonomous-scheduler.js';

function harness({pending=[],work,flags,networkVerified=true,vaultVerified=true,balanceVerified=true,health}={}){
 const db=new DatabaseSync(':memory:');let ticks=0,reconciles=0,now=1000;
 const dependencies={
  orchestrator:{async tick(){ticks++;return work?work():{action:'WAIT'};}},
  executions:{list:()=>pending},
  executionPort:{async reconcile(id){reconciles++;return {id,status:'CONFIRMED'};}},
  flags:()=>flags??({liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:false}),
  network:{verify:async()=>({network:'solana:mainnet',verified:networkVerified})},
  vault:{verify:async()=>vaultVerified},balance:{verify:async()=>balanceVerified},health,now:()=>now++
 };
 const scheduler=createAutonomousScheduler(db,dependencies);
 return {db,scheduler,dependencies,counts:()=>({ticks,reconciles}),close:()=>db.close()};
}

test('owner lifecycle is separate from Paper; restart requires explicit resume',async()=>{
 const h=harness();try{
  assert.equal((await h.scheduler.tickOne('agent')).reason,'AGENT_NOT_LIVE');
  await h.scheduler.ownerStart('agent');assert.equal((await h.scheduler.tickOne('agent')).action,'WAIT');
  h.scheduler.ownerPause('agent');assert.equal((await h.scheduler.tickOne('agent')).reason,'AGENT_NOT_LIVE');
  const restarted=createAutonomousScheduler(h.db,h.dependencies);
  assert.equal(restarted.read('agent').paused,true);
  await restarted.ownerResume('agent');assert.equal((await restarted.tickOne('agent')).action,'WAIT');
 }finally{h.close();}
});

test('unresolved execution reconciles the same ID even when owner paused; no new decision',async()=>{
 const h=harness({pending:[{id:'old',status:'UNKNOWN',intent:{mode:'LIVE_AUTONOMOUS'}}]});try{
  const result=await h.scheduler.tickOne('agent');assert.deepEqual(result,{action:'RECONCILE',executionId:'old',status:'CONFIRMED'});
  assert.deepEqual(h.counts(),{ticks:0,reconciles:1});
  await assert.rejects(h.scheduler.ownerStart('agent'),{code:'UNRESOLVED_EXECUTION'});
 }finally{h.close();}
});

test('overlapping ticks coalesce and cannot start a second decision',async()=>{
 let release;const h=harness({work:()=>new Promise(resolve=>{release=()=>resolve({action:'WAIT'});})});try{
  await h.scheduler.ownerStart('agent');const first=h.scheduler.tickOne('agent');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await h.scheduler.tickOne('agent')).reason,'TICK_ALREADY_RUNNING');
  release();await first;assert.equal(h.counts().ticks,1);
 }finally{h.close();}
});

test('kill switch and vault failure fail closed before lifecycle start',async()=>{
 const h=harness();try{
  h.dependencies.flags=()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true});
  // New instance takes the updated dependency, never an old cached flag.
  const closed=createAutonomousScheduler(h.db,h.dependencies);
  await assert.rejects(closed.ownerStart('agent'),{code:'AUTONOMOUS_TRADING_STOP'});
  assert.equal(closed.read('agent').enabled,false);
 }finally{h.close();}
});

for(const [name,options,code] of [
 ['live disabled',{flags:{liveAutonomousEnabled:false,autonomousKillSwitch:false,realMoneyEmergencyStop:false}},'AUTONOMOUS_TRADING_STOP'],
 ['autonomous kill switch',{flags:{liveAutonomousEnabled:true,autonomousKillSwitch:true,realMoneyEmergencyStop:false}},'AUTONOMOUS_TRADING_STOP'],
 ['real-money emergency stop',{flags:{liveAutonomousEnabled:true,autonomousKillSwitch:false,realMoneyEmergencyStop:true}},'AUTONOMOUS_TRADING_STOP'],
 ['Mainnet mismatch',{networkVerified:false},'MAINNET_NOT_VERIFIED'],
 ['vault mismatch',{vaultVerified:false},'VAULT_OR_OWNERSHIP_UNVERIFIED'],
 ['insufficient safe balance/protected reserve',{balanceVerified:false},'LIVE_CAPITAL_POLICY_FAILED']
])test(`scheduler ${name} denies owner start before any decision`,async()=>{
 const h=harness(options);try{await assert.rejects(h.scheduler.ownerStart('agent'),{code});assert.equal(h.counts().ticks,0);assert.equal(h.scheduler.read('agent').enabled,false);}finally{h.close();}
});

test('owner resume fails unresolved preflight, then succeeds only after resolution and verified balance',async()=>{
 const pending=[];const h=harness({pending});try{
  await h.scheduler.ownerStart('agent');h.scheduler.ownerPause('agent');
  pending.push({id:'signed',status:'SIGNED',intent:{mode:'LIVE_AUTONOMOUS'}});
  await assert.rejects(h.scheduler.ownerResume('agent'),{code:'UNRESOLVED_EXECUTION'});
  assert.equal(h.scheduler.read('agent').paused,true);
  pending.length=0;await h.scheduler.ownerResume('agent');
  assert.equal(h.scheduler.read('agent').enabled,true);
 }finally{h.close();}
});

test('owner pause blocks new decisions but keeps submitted reconciliation running',async()=>{
 const pending=[];const h=harness({pending});try{
  await h.scheduler.ownerStart('agent');h.scheduler.ownerPause('agent');
  assert.equal((await h.scheduler.tickOne('agent')).reason,'AGENT_NOT_LIVE');
  pending.push({id:'submitted',status:'SUBMITTED',intent:{mode:'LIVE_AUTONOMOUS'}});
  assert.equal((await h.scheduler.tickOne('agent')).executionId,'submitted');
  assert.deepEqual(h.counts(),{ticks:0,reconciles:1});
 }finally{h.close();}
});
