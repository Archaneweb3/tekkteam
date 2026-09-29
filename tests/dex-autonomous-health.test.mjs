import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAutonomousHealth} from '../server/dex/autonomous-health.js';

test('three real execution failures persist auto-pause across service recreation',()=>{
 const db=new DatabaseSync(':memory:');let time=100;
 const health=createAutonomousHealth(db,{now:()=>time++});
 assert.equal(health.failure('agent','REJECTED_BEFORE_SIGNING').consecutiveFailures,1);
 assert.equal(health.failure('agent','FAILED_ON_CHAIN').consecutiveFailures,2);
 assert.equal(health.failure('agent','SIMULATION_REJECTED').pausedByBreaker,true);
 const restarted=createAutonomousHealth(db,{now:()=>time++});
 assert.equal(restarted.read('agent').pauseReason,'THREE_EXECUTION_FAILURES');
 assert.equal(restarted.confirmed('agent').pausedByBreaker,true);
 assert.throws(()=>restarted.ownerResume('agent',{ownerAuthenticated:true,ownershipVerified:true,noUnresolvedExecution:false,networkVerified:true,vaultVerified:true}),e=>e.code==='AUTONOMOUS_RESUME_DENIED');
 assert.equal(restarted.ownerResume('agent',{ownerAuthenticated:true,ownershipVerified:true,noUnresolvedExecution:true,networkVerified:true,vaultVerified:true}).pausedByBreaker,false);
 assert.equal(restarted.read('agent').consecutiveFailures,0);
 db.close();
});
test('UNKNOWN and security failures force persistent pause, never automatic resume',()=>{
 const db=new DatabaseSync(':memory:');const h=createAutonomousHealth(db);
 h.pause('agent','UNRESOLVED_UNKNOWN');
 assert.equal(createAutonomousHealth(db).read('agent').pauseReason,'UNRESOLVED_UNKNOWN');
 h.confirmed('agent');assert.equal(h.read('agent').pausedByBreaker,true);
 db.close();
});
