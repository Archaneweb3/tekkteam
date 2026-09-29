// Shares the existing Paper worker interval. This module never owns a timer.
// Lifecycle state is independent of Paper and defaults to stopped on startup.
export function createAutonomousScheduler(db,{orchestrator,executions,executionPort,now=Date.now,flags,network,vault,balance,health}={}){
 if(!orchestrator?.tick||!executions?.list||!executionPort?.reconcile||!flags||!network?.verify||!vault?.verify)throw Error('AUTONOMOUS_SCHEDULER_DEPENDENCY_MISSING');
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_lifecycle(agent_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 const read=id=>{const row=db.prepare('SELECT data FROM dex_autonomous_lifecycle WHERE agent_id=?').get(id);return row?JSON.parse(row.data):{agentId:id,mode:'PAPER',enabled:false,paused:true,lastTick:null,lastDecision:null};};
 const save=state=>{db.prepare('INSERT INTO dex_autonomous_lifecycle(agent_id,data) VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET data=excluded.data').run(state.agentId,JSON.stringify(state));return state;};
 const active=new Set();
 const unresolved=id=>executions.list(id).filter(r=>r.intent?.mode==='LIVE_AUTONOMOUS'&&['SIGNED','SUBMITTED','UNKNOWN'].includes(r.status));
 // A restart cannot grant authority merely because an old row said enabled.
 db.prepare('UPDATE dex_autonomous_lifecycle SET data=json_set(data,\'$.enabled\',json(\'false\'),\'$.paused\',json(\'true\'),\'$.pauseReason\',\'RESTART_REQUIRES_OWNER_RESUME\') WHERE json_extract(data,\'$.enabled\')=1').run();
 async function verify(agentId){
  const f=flags(),n=await network.verify();
  if(f.liveAutonomousEnabled!==true||f.autonomousKillSwitch!==false||f.realMoneyEmergencyStop!==false)throw Object.assign(Error('AUTONOMOUS_TRADING_STOP'),{code:'AUTONOMOUS_TRADING_STOP'});
  if(n.network!=='solana:mainnet'||n.verified!==true)throw Object.assign(Error('MAINNET_NOT_VERIFIED'),{code:'MAINNET_NOT_VERIFIED'});
  if(await vault.verify(agentId)!==true)throw Object.assign(Error('VAULT_OR_OWNERSHIP_UNVERIFIED'),{code:'VAULT_OR_OWNERSHIP_UNVERIFIED'});
  if(unresolved(agentId).length)throw Object.assign(Error('UNRESOLVED_EXECUTION'),{code:'UNRESOLVED_EXECUTION'});
  if(executions.list(agentId).some(r=>r.intent?.mode==='LIVE_AUTONOMOUS'&&['QUOTED','PREPARING','PREPARED'].includes(r.status)))throw Object.assign(Error('ACTIVE_EXECUTION_REQUIRES_RECONCILIATION'),{code:'ACTIVE_EXECUTION_REQUIRES_RECONCILIATION'});
  if(balance&&await balance.verify(agentId)!==true)throw Object.assign(Error('LIVE_CAPITAL_POLICY_FAILED'),{code:'LIVE_CAPITAL_POLICY_FAILED'});
 }
 async function tickOne(agentId){
  if(active.has(agentId))return {action:'SKIP',reason:'TICK_ALREADY_RUNNING'};
  active.add(agentId);
  try{
   const pending=unresolved(agentId);
   if(pending.length){
    if(pending.length!==1)return {action:'SKIP',reason:'MULTIPLE_UNRESOLVED_EXECUTIONS'};
    const result=await executionPort.reconcile(pending[0].id);
    const outcome={action:'RECONCILE',executionId:pending[0].id,status:result?.status??'UNKNOWN'};
    save({...read(agentId),lastTick:now(),lastDecision:outcome});
    // Never discover or initiate value movement on the reconciliation tick.
    return outcome;
   }
   const state=read(agentId);
   if(state.mode!=='LIVE_AUTONOMOUS'||!state.enabled||state.paused)return {action:'SKIP',reason:'AGENT_NOT_LIVE'};
   try{await verify(agentId);}catch(e){return {action:'SKIP',reason:e.code??'AUTONOMOUS_PRECHECK_FAILED'};}
   try{const result=await orchestrator.tick(agentId);save({...read(agentId),lastTick:now(),lastDecision:result});return result;}
   catch(e){const result={action:'SKIP',reason:e.code??'AUTONOMOUS_TICK_FAILED'};save({...read(agentId),lastTick:now(),lastDecision:result});return result;}
  }finally{active.delete(agentId);}
 }
 return Object.freeze({read,unresolved,
  async ownerStart(agentId){await verify(agentId);if(health?.read(agentId).pausedByBreaker)throw Object.assign(Error('AUTONOMOUS_CIRCUIT_OPEN'),{code:'AUTONOMOUS_CIRCUIT_OPEN'});const state=read(agentId);if(state.mode==='LIVE_AUTONOMOUS'&&state.enabled&&!state.paused)return state;return save({...state,mode:'LIVE_AUTONOMOUS',enabled:true,paused:false,pauseReason:null,updatedAt:now()});},
  ownerPause(agentId){const state=read(agentId);return save({...state,enabled:false,paused:true,pauseReason:'OWNER_PAUSED',updatedAt:now()});},
  async ownerResume(agentId){await verify(agentId);const state=read(agentId);if(state.mode!=='LIVE_AUTONOMOUS')throw Object.assign(Error('LIVE_NOT_STARTED'),{code:'LIVE_NOT_STARTED'});health?.ownerResume(agentId,{ownerAuthenticated:true,ownershipVerified:true,noUnresolvedExecution:true,networkVerified:true,vaultVerified:true});return save({...state,enabled:true,paused:false,pauseReason:null,updatedAt:now()});},
  tickOne,
  async tick(){const ids=db.prepare("SELECT agent_id FROM dex_autonomous_lifecycle WHERE json_extract(data,'$.mode')='LIVE_AUTONOMOUS'").all().map(r=>r.agent_id);return Promise.allSettled(ids.map(id=>tickOne(id)));}
 });
}
