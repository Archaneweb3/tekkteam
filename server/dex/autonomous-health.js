import {reject} from './intent.js';

// Durable per-agent breaker. This deliberately does not change the Paper
// scheduler's state or grant Live authority after a process restart.
export function createAutonomousHealth(db,{now=Date.now}={}){
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_health(agent_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const initial=agentId=>({agentId,consecutiveFailures:0,lastFailure:null,pausedByBreaker:false,pauseReason:null,updatedAt:null});
 const read=agentId=>{const row=db.prepare('SELECT data FROM dex_autonomous_health WHERE agent_id=?').get(agentId);return row?JSON.parse(row.data):initial(agentId);};
 const write=(agentId,fn)=>{
  db.exec('BEGIN IMMEDIATE');
  try{const current=read(agentId),next={...fn(current),agentId,updatedAt:now()};db.prepare('INSERT INTO dex_autonomous_health(agent_id,data) VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET data=excluded.data').run(agentId,JSON.stringify(next));db.exec('COMMIT');return next;}
  catch(e){db.exec('ROLLBACK');throw e;}
 };
 return Object.freeze({
  read,
  failure:(agentId,reason)=>write(agentId,s=>{const count=s.consecutiveFailures+1;return {...s,consecutiveFailures:count,lastFailure:{reason,at:now()},pausedByBreaker:s.pausedByBreaker||count>=3,pauseReason:count>=3?'THREE_EXECUTION_FAILURES':s.pauseReason};}),
  confirmed:agentId=>write(agentId,s=>s.pausedByBreaker?s:{...s,consecutiveFailures:0,lastFailure:null}),
  pause:(agentId,reason)=>write(agentId,s=>({...s,pausedByBreaker:true,pauseReason:reason})),
  ownerResume:(agentId,{ownerAuthenticated,ownershipVerified,noUnresolvedExecution,networkVerified,vaultVerified})=>{
   if(!ownerAuthenticated||!ownershipVerified||!noUnresolvedExecution||!networkVerified||!vaultVerified)reject('AUTONOMOUS_RESUME_DENIED');
   return write(agentId,s=>({...s,consecutiveFailures:0,pausedByBreaker:false,pauseReason:null}));
  }
 });
}
