// Unmounted non-financial orchestration only. The observer continues to use its
// read-only product DB. No signer/broadcaster/activation port is accepted here.
export function createPumpPreparationCoordinator({ledger,executor,readDecision,now=Date.now}={}){
 const running=new Set();
 return Object.freeze({async tick(actor,agentId){
  if(typeof agentId!=='string'||!agentId)throw Error('PUMP_COORDINATOR_AGENT_REQUIRED');
  if(running.has(agentId))return {state:'BUSY',executionAllowed:false};running.add(agentId);
  try{
   // Always reconcile the same persisted signature first, even after expiry,
   // Pause, revocation or venue qualification loss. UNKNOWN without a signature
   // is never canceled/replaced merely because its preparation expired.
   const records=ledger.list(agentId),pending=records.filter(r=>r.status==='UNKNOWN');
   if(pending.length){
    const results=[];for(const r of pending){const {record}=await executor.read(actor,r.id);results.push(record.status==='UNKNOWN'&&record.signature?await executor.reconcile(actor,record.id):record);}
    return {state:results.some(r=>r.status==='UNKNOWN')?'RECONCILIATION_REQUIRED':'RECONCILED',executionIds:results.map(r=>r.id),executionAllowed:false};
   }
   const prepared=records.filter(r=>r.status==='PREPARED');
   if(prepared.length){
    for(const r of prepared){
     // read() validates ownership and immutable evidence before a time-based
     // cancellation. Only an unsigned, unclaimed PREPARED may be canceled.
     const {record}=await executor.read(actor,r.id);
     if(now()>=record.intent.expiresAt||now()>=record.plan.quote.expiresAt)await executor.cancel(actor,r.id);
    }
    return {state:'PREPARATION_ALREADY_EXISTS',executionIds:prepared.map(r=>r.id),executionAllowed:false};
   }
   const decision=structuredClone(await readDecision(actor,agentId));
   if(decision?.state!=='PREPARE')return {state:'WAIT',reason:decision?.reason??'NO_QUALIFIED_DECISION',executionAllowed:false};
   if(decision.intent?.agentId!==agentId)throw Error('PUMP_COORDINATOR_AGENT_MISMATCH');
   const preparedRecord=await executor.prepare(actor,decision.intent);
   const {record,reservation}=await executor.read(actor,preparedRecord.id);
   const unsigned=record.status==='PREPARED'&&!record.signature&&reservation?.status==='PREPARED'&&!reservation.signature&&(!reservation.budget||reservation.budget.claimedAt===null);
   return {state:unsigned?'PREPARED_UNSIGNED':record.status==='UNKNOWN'?'RECONCILIATION_REQUIRED':'EXISTING_EXECUTION',executionId:record.id,executionAllowed:false};
  }finally{running.delete(agentId);}
 }});
}
