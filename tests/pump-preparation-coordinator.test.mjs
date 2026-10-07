import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpPreparationCoordinator} from '../server/dex/pump-preparation-coordinator.js';
test('existing UNKNOWN is reconciled before any decision; no-signature UNKNOWN stays blocked',async()=>{
 let decisions=0;const calls=[];
 const rows=[{id:'old',status:'UNKNOWN',signature:'existing'},{id:'claimed',status:'UNKNOWN',signature:null}];
 const c=createPumpPreparationCoordinator({ledger:{list:()=>rows},executor:{read:async(_,id)=>({record:rows.find(r=>r.id===id)}),reconcile:async(_,id)=>{calls.push(id);return {id,status:'CONFIRMED'};}},readDecision:()=>{decisions++;throw Error('MUST_NOT_PREPARE');}});
 assert.deepEqual(await c.tick({},'agent'),{state:'RECONCILIATION_REQUIRED',executionIds:['old','claimed'],executionAllowed:false});assert.deepEqual(calls,['old']);assert.equal(decisions,0);
});
test('expiry cancels only an owned unsigned preparation; does not replace it on the same tick',async()=>{
 const r={id:'prepared',status:'PREPARED',intent:{expiresAt:10},plan:{quote:{expiresAt:10}}},calls=[];
 const c=createPumpPreparationCoordinator({ledger:{list:()=>[r]},executor:{read:async()=>{calls.push('read');return {record:r};},cancel:async()=>calls.push('cancel')},readDecision:()=>{throw Error('MUST_NOT_PREPARE');},now:()=>10});
 assert.equal((await c.tick({},'agent')).state,'PREPARATION_ALREADY_EXISTS');assert.deepEqual(calls,['read','cancel']);
});
test('disarmed coordinator has no execution ports; one local tick and existing ledger idempotency own preparation',async()=>{
 let release;const gate=new Promise(r=>release=r);let calls=0;
 const c=createPumpPreparationCoordinator({ledger:{list:()=>[]},executor:{read:async()=>({record:{id:'one',status:'PREPARED',signature:null},reservation:{status:'PREPARED',signature:null}}),prepare:async()=>{calls++;return {id:'one',status:'PREPARED'};}},readDecision:async()=>{await gate;return {state:'PREPARE',intent:{agentId:'agent'}};}});
 const a=c.tick({},'agent');assert.equal((await c.tick({},'agent')).state,'BUSY');release();assert.equal((await a).state,'PREPARED_UNSIGNED');assert.equal(calls,1);assert.deepEqual(Object.keys(c),['tick']);
});
test('claimed UNKNOWN cannot bypass ownership or immutable record checks',async()=>{
 const c=createPumpPreparationCoordinator({ledger:{list:()=>[{id:'claimed',status:'UNKNOWN',signature:null}]},executor:{read:async()=>{throw Error('OWNER_AUTH_REQUIRED');}},readDecision:()=>{throw Error('MUST_NOT_DECIDE');}});
 await assert.rejects(c.tick({},'agent'),/OWNER_AUTH_REQUIRED/);
});
test('idempotent preparation advanced by another process is not reported unsigned',async()=>{
 for(const status of ['UNKNOWN','CONFIRMED']){const r={id:'race',status,signature:'existing'},c=createPumpPreparationCoordinator({ledger:{list:()=>[]},executor:{prepare:async()=>r,read:async()=>({record:r,reservation:{status:'UNKNOWN',budget:{claimedAt:1}}})},readDecision:()=>({state:'PREPARE',intent:{agentId:'agent'}})});
 assert.equal((await c.tick({},'agent')).state,status==='UNKNOWN'?'RECONCILIATION_REQUIRED':'EXISTING_EXECUTION');}
});
