import {randomUUID} from 'node:crypto';
const reject=()=>{throw Object.assign(Error('Observer lease is stale'),{code:'STALE_OBSERVER_LEASE'});};

// This store contains observation/coordination only, never execution authority.
export function observerState(db,{now=Date.now,runId=randomUUID(),ttl=30000}={}){
 if(!Number.isSafeInteger(ttl)||ttl<1000||ttl>120000)throw Error('Invalid observer TTL');
 db.exec(`PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS observer_leases(resource TEXT PRIMARY KEY,holder TEXT NOT NULL,generation INTEGER NOT NULL,parent_generation INTEGER,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS observer_agents(agent_id TEXT PRIMARY KEY,generation INTEGER NOT NULL,observed_at INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS observer_processes(run_id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,heartbeat_at INTEGER NOT NULL,status TEXT NOT NULL);`);
 let last=0;
 const time=()=>{const stamp=now();if(!Number.isSafeInteger(stamp)||stamp<last)throw Error('OBSERVER_CLOCK_ROLLBACK');last=stamp;return stamp;};
 const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const read=resource=>db.prepare('SELECT * FROM observer_leases WHERE resource=?').get(resource);
 const valid=(token,stamp)=>{const row=token&&read(token.resource);return row&&row.holder===runId&&row.holder===token.holder&&row.generation===token.generation&&row.expires_at>stamp&&row.parent_generation===token.parent_generation;};
 const assert=(leader,agent,stamp)=>{if(leader?.resource!=='leader'||!valid(leader,stamp)||agent&&(!valid(agent,stamp)||agent.parent_generation!==leader.generation||agent.resource==='leader'))reject();};
 const acquire=(resource,parent=null)=>atomic(()=>{const stamp=time();if(parent)assert(parent,null,stamp);const old=read(resource);if(old&&old.expires_at>stamp){if(old.holder===runId&&(!parent||old.parent_generation===parent.generation))return old;return null;}
  const token={resource,holder:runId,generation:(old?.generation??0)+1,parent_generation:parent?.generation??null,expires_at:Math.min(stamp+ttl,parent?read('leader').expires_at:Infinity)};
  db.prepare('INSERT INTO observer_leases VALUES(?,?,?,?,?) ON CONFLICT(resource) DO UPDATE SET holder=excluded.holder,generation=excluded.generation,parent_generation=excluded.parent_generation,expires_at=excluded.expires_at').run(resource,runId,token.generation,token.parent_generation,token.expires_at);return token;
 });
 const started=time();db.prepare('INSERT INTO observer_processes VALUES(?,?,?,?)').run(runId,started,started,'STARTING');
 return {
  runId,leader:()=>acquire('leader'),agent:(leader,id)=>{if(typeof id!=='string'||!id)throw Error('Invalid Agent');return acquire('agent:'+id,leader);},
  renew:leader=>atomic(()=>{const stamp=time();assert(leader,null,stamp);const expires=stamp+ttl;db.prepare('UPDATE observer_leases SET expires_at=? WHERE resource=?').run(expires,'leader');return {...leader,expires_at:expires};}),
  release:token=>atomic(()=>{const stamp=time();if(valid(token,stamp))db.prepare('UPDATE observer_leases SET expires_at=? WHERE resource=?').run(stamp,token.resource);}),
  commit:(leader,lock,observation)=>atomic(()=>{const stamp=time();assert(leader,lock,stamp);if(lock.resource!=='agent:'+observation.agentId||observation.executionAllowed!==false||observation.mode!=='OBSERVER_ONLY')throw Error('Observer cannot authorize execution');
   db.prepare('INSERT INTO observer_agents VALUES(?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET generation=excluded.generation,observed_at=excluded.observed_at,data=excluded.data').run(observation.agentId,leader.generation,stamp,JSON.stringify(observation));
  }),
  heartbeat:status=>{if(!['HEALTHY_OBSERVER_ONLY','STANDBY','DEGRADED','STOPPED'].includes(status))throw Error('Invalid status');db.prepare('UPDATE observer_processes SET heartbeat_at=?,status=? WHERE run_id=?').run(time(),status,runId);},
 };
}
