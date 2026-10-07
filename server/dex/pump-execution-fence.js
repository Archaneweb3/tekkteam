import {randomUUID} from 'node:crypto';
import {reject} from './intent.js';

// Product-DB coordination only. A lease never grants spending or signing.
// Caller must supply the existing reservation transaction, not a second DB.
export function createPumpExecutionFence(db,{atomic,now=Date.now,holder=randomUUID(),ttl=15000}={}){
 if(typeof atomic!=='function'||typeof holder!=='string'||!holder||holder.length>128||!Number.isSafeInteger(ttl)||ttl<1000||ttl>30000)reject('PUMP_FENCE_CONFIG');
 db.exec('CREATE TABLE IF NOT EXISTS pump_runtime_execution_fences(resource TEXT PRIMARY KEY,holder TEXT NOT NULL,generation INTEGER NOT NULL,parent_generation INTEGER,expires_at INTEGER NOT NULL,observed_at INTEGER NOT NULL)');
 const read=resource=>db.prepare('SELECT * FROM pump_runtime_execution_fences WHERE resource=?').get(resource);
 let lastTime=0;
 const time=()=>{const at=now(),last=db.prepare('SELECT max(observed_at) stamp FROM pump_runtime_execution_fences').get()?.stamp??0;if(!Number.isSafeInteger(at)||at<Math.max(last,lastTime))reject('PUMP_FENCE_CLOCK_ROLLBACK');lastTime=at;return at;};
 const valid=(token,at)=>{const row=token&&read(token.resource);if(!row||row.holder!==holder||token.holder!==holder||row.generation!==token.generation||row.parent_generation!==token.parent_generation||row.expires_at<=at)reject('PUMP_FENCE_STALE');return row;};
 const assertAt=(leader,agent,id,at)=>{if(leader?.resource!=='leader')reject('PUMP_FENCE_LEADER_REQUIRED');const l=valid(leader,at);if(agent){const a=valid(agent,at);if(a.resource!=='agent:'+id||a.parent_generation!==l.generation||a.expires_at>l.expires_at)reject('PUMP_FENCE_AGENT_MISMATCH');}return l;};
 const acquire=(resource,parent=null)=>atomic(()=>{
  const at=time(),l=parent?assertAt(parent,null,null,at):null,old=read(resource);
  if(old&&old.expires_at>at){if(old.holder===holder&&old.parent_generation===(l?.generation??null)){db.prepare('UPDATE pump_runtime_execution_fences SET observed_at=? WHERE resource=?').run(at,resource);return {...old,observed_at:at};}return null;}
  const next={resource,holder,generation:(old?.generation??0)+1,parent_generation:l?.generation??null,expires_at:Math.min(at+ttl,l?.expires_at??Infinity),observed_at:at};
  if(!Number.isSafeInteger(next.generation)||!Number.isSafeInteger(next.expires_at))reject('PUMP_FENCE_OVERFLOW');
  db.prepare('INSERT INTO pump_runtime_execution_fences VALUES(?,?,?,?,?,?) ON CONFLICT(resource) DO UPDATE SET holder=excluded.holder,generation=excluded.generation,parent_generation=excluded.parent_generation,expires_at=excluded.expires_at,observed_at=excluded.observed_at').run(...Object.values(next));return next;
 });
 return Object.freeze({
  acquireLeader:()=>acquire('leader'),
  acquireAgent:(leader,id)=>{if(typeof id!=='string'||!id||id.length>128)reject('PUMP_FENCE_AGENT_REQUIRED');return acquire('agent:'+id,leader);},
  assertCurrent:(leader,agent,id)=>atomic(()=>{if(!agent)reject('PUMP_FENCE_AGENT_REQUIRED');const at=time();assertAt(leader,agent,id,at);db.prepare('UPDATE pump_runtime_execution_fences SET observed_at=? WHERE resource IN (?,?)').run(at,'leader','agent:'+id);return true;}),
  renew:(token,leader)=>atomic(()=>{const at=time(),r=valid(token,at),l=r.resource==='leader'?null:assertAt(leader,token,r.resource.slice(6),at);const expires=Math.min(at+ttl,l?.expires_at??Infinity);db.prepare('UPDATE pump_runtime_execution_fences SET expires_at=?,observed_at=? WHERE resource=?').run(expires,at,r.resource);return {...r,expires_at:expires,observed_at:at};}),
  release:token=>atomic(()=>{const at=time(),r=valid(token,at);db.prepare('UPDATE pump_runtime_execution_fences SET expires_at=?,observed_at=? WHERE resource=?').run(at,at,r.resource);})
 });
}
