import {randomUUID} from 'node:crypto';
import {SOL_MINT,integer,reject} from './intent.js';

export const ENGINE_ACCEPTANCE=Object.freeze({mode:'AUTONOMOUS_ACCEPTANCE_TEST',agentId:'0f406135-35ea-437d-a27c-29052d279c3b',agentWallet:'7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe',owner:'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',tokenMint:'Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk',pool:'Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp',venue:'RAYDIUM_CPMM',policyVersion:'one-shot-cpmm-v1',maxBuyLamports:'100000',maxSlippageBps:100,maxOpenPositions:1,maxHoldMs:180000});
export const RECOVERY_CYCLE_ID='0186e473-af2d-47df-8206-a97110d44f46';
export const RECOVERY_BUY_EXECUTION_ID='8c8ee5f7-b5fc-4394-869b-f732fa7b6b4b';
export const RECOVERY_BUY_SIGNATURE='48BowkG1stfKK1Pphij9CKQRmKWHdBWUmuZGLCzPMZS2Dc3mkYjJgssDbadjYgvtq76BrbhmYcstA4qDrKTCbqEP';

export function createAutonomousAcceptance(db,{activationConfigured=false,now=Date.now,candidate=ENGINE_ACCEPTANCE,recoveryCycleId=RECOVERY_CYCLE_ID,recoveryBuyExecutionId=RECOVERY_BUY_EXECUTION_ID,recoveryBuySignature=RECOVERY_BUY_SIGNATURE,recoveryQuantity='45962'}={}){
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_acceptance(agent_id TEXT PRIMARY KEY,data TEXT NOT NULL)');
 db.exec(`CREATE TABLE IF NOT EXISTS dex_autonomous_acceptance_history(cycle_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS dex_acceptance_history_no_update BEFORE UPDATE ON dex_autonomous_acceptance_history BEGIN SELECT RAISE(ABORT,'Immutable acceptance history'); END;
 CREATE TRIGGER IF NOT EXISTS dex_acceptance_history_no_delete BEFORE DELETE ON dex_autonomous_acceptance_history BEGIN SELECT RAISE(ABORT,'Immutable acceptance history'); END;`);
 const read=()=>{const row=db.prepare('SELECT data FROM dex_autonomous_acceptance WHERE agent_id=?').get(candidate.agentId);return row?JSON.parse(row.data):null;};
 const write=state=>{db.prepare('INSERT INTO dex_autonomous_acceptance(agent_id,data) VALUES(?,?) ON CONFLICT(agent_id) DO UPDATE SET data=excluded.data').run(candidate.agentId,JSON.stringify(state));return state;};
 const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const identity=c=>c?.ownerAuthenticated===true&&c.ownershipVerified===true&&c.vaultVerified===true&&c.networkVerified===true&&c.owner===candidate.owner&&c.agentId===candidate.agentId&&c.agentWallet===candidate.agentWallet;
 const permission=(state,flags,direction)=>state?.emergencyPermission===true&&state.emergencyStopped!==true&&flags?.acceptanceEmergencyStop!==true||direction==='SELL'&&state?.recoveryExit===true&&state?.emergencyStopped===true&&state?.emergencyPermission===false&&flags?.acceptanceEmergencyStop!==true;
 // A terminal, unsigned attempt may be superseded only after every durable
 // custody/broadcast/reservation artifact is checked. The old cycle is then
 // copied into immutable history before the owner creates another one.
 const retryEligible=()=>{
  const s=read();if(!s)return true;
  if(s.status!=='FAILED'||s.emergencyPermission!==false||s.execution||s.buySignature||s.sellSignature||s.buyExecutionId||s.sellExecutionId)return false;
  const required=['dex_executions','dex_receipts','dex_autonomous_sign_claim','dex_autonomous_broadcast_claim','real_reserved_accounts'];
  if(required.some(name=>!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',name)))return false;
  const records=db.prepare('SELECT data FROM dex_executions WHERE agent_id=?').all(candidate.agentId).map(row=>JSON.parse(row.data)).filter(r=>r.intent?.acceptanceCycleId===s.cycleId);
  for(const r of records){
   const neverBroadcast=r.status==='EXPIRED'&&r.reason==='EXPIRED_BEFORE_BROADCAST'&&!!r.signature&&r.noBroadcastProof?.broadcastClaimAbsent===true&&r.noBroadcastProof?.signatureAbsent===true&&r.noBroadcastProof?.transactionAbsent===true;
   if(!['REJECTED_BEFORE_SIGNING','EXPIRED'].includes(r.status)||r.signature&&!neverBroadcast||r.broadcastAttemptedAt||db.prepare('SELECT 1 FROM dex_receipts WHERE execution_id=?').get(r.id)||!neverBroadcast&&db.prepare('SELECT 1 FROM dex_autonomous_sign_claim WHERE execution_id=?').get(r.id)||db.prepare('SELECT 1 FROM dex_autonomous_broadcast_claim WHERE execution_id=?').get(r.id)||db.prepare('SELECT 1 FROM real_reserved_accounts WHERE operation_id=?').get('dex:'+r.id))return false;
  }
  return true;
 };
 const checkIntent=(intent,direction,state)=>{
  if(intent?.mode!==candidate.mode||intent.acceptanceCycleId!==state?.cycleId||intent.network!=='solana:mainnet'||intent.agentId!==candidate.agentId||intent.owner!==candidate.owner||intent.agentWallet!==candidate.agentWallet||intent.direction!==direction||intent.pool!==candidate.pool||intent.venue!==candidate.venue||!Number.isSafeInteger(intent.slippageBps)||intent.slippageBps<0||intent.slippageBps>candidate.maxSlippageBps||intent.inputMint!==(direction==='BUY'?SOL_MINT:candidate.tokenMint)||intent.outputMint!==(direction==='BUY'?candidate.tokenMint:SOL_MINT))reject('ACCEPTANCE_INTENT_MISMATCH');
  const amount=integer(intent.inputAmount);if(direction==='BUY'&&amount>integer(candidate.maxBuyLamports))reject('ACCEPTANCE_TRADE_LIMIT');return amount;
 };
 const bound=(s,r)=>s?.cycleId===r?.intent?.acceptanceCycleId&&s.execution?.id===r.id&&s.execution.intentHash===r.fingerprint&&s.execution.messageHash===r.messageHash&&s.execution.direction===r.intent.direction&&s.execution.amount===r.intent.inputAmount&&s.execution.reservationId===`dex:${r.id}`&&s.execution.expiresAt===r.intent.expiresAt&&r.pool===candidate.pool;
 const safeHistoricalSell=r=>r?.intent?.direction==='SELL'&&r.status==='REJECTED_BEFORE_SIGNING'&&!r.signature&&!r.broadcastAttemptedAt&&!db.prepare('SELECT 1 FROM dex_autonomous_sign_claim WHERE execution_id=?').get(r.id)&&!db.prepare('SELECT 1 FROM dex_autonomous_broadcast_claim WHERE execution_id=?').get(r.id)&&!db.prepare('SELECT 1 FROM dex_receipts WHERE execution_id=?').get(r.id)&&!db.prepare('SELECT 1 FROM real_reserved_accounts WHERE operation_id=?').get('dex:'+r.id);
 const recoveryEligibility=(context,{position,buy,receipt,activeExecution=false,activeReservation=false}={})=>{
  const s=read();if(!identity(context))return {eligible:false,reason:'OWNER_OR_VAULT_UNVERIFIED'};
  if(s?.cycleId!==recoveryCycleId||s.status!=='FAILED'||s.emergencyPermission!==false||s.execution||s.recoveryExit||s.recoveryAuthorizedAt||s.sellExecutionId||s.sellSignature)return {eligible:false,reason:'RECOVERY_CYCLE_NOT_ELIGIBLE'};
  if(activeExecution||activeReservation)return {eligible:false,reason:'ACTIVE_EXECUTION_OR_RESERVATION'};
  if(s.buyExecutionId!==recoveryBuyExecutionId||s.buySignature!==recoveryBuySignature||!Number.isSafeInteger(s.boughtAt)||now()-s.boughtAt<candidate.maxHoldMs||!buy||buy.id!==s.buyExecutionId||buy.status!=='CONFIRMED'||buy.signature!==s.buySignature||buy.intent?.acceptanceCycleId!==s.cycleId||buy.intent?.direction!=='BUY'||buy.intent?.outputMint!==candidate.tokenMint||buy.pool!==candidate.pool||!receipt||receipt.signature!==s.buySignature||receipt.finalized!==true)return {eligible:false,reason:'CONFIRMED_BUY_MISMATCH'};
  if(!position||position.acceptanceCycleId!==s.cycleId||position.agentId!==candidate.agentId||position.mint!==candidate.tokenMint||position.pool!==candidate.pool||position.buySignature!==s.buySignature||position.quantity!==recoveryQuantity)return {eligible:false,reason:'OPEN_POSITION_MISMATCH'};
  const sells=db.prepare('SELECT data FROM dex_executions WHERE agent_id=?').all(candidate.agentId).map(row=>JSON.parse(row.data)).filter(r=>r.intent?.acceptanceCycleId===s.cycleId&&r.intent.direction==='SELL');
  if(sells.some(r=>!safeHistoricalSell(r)))return {eligible:false,reason:'UNRESOLVED_SELL_EXECUTION'};
  return {eligible:true,reason:null};
 };
 return Object.freeze({read,candidate,retryEligible,recoveryEligibility,safeHistoricalSell,
  ownerEnable(context,flags,{activePosition=false,activeExecution=false,activeReservation=false}={}){return atomic(()=>{
   if(!activationConfigured||!identity(context)||!retryEligible()||activePosition||activeExecution||activeReservation||flags?.acceptanceEmergencyStop===true||flags?.acceptanceOverrideConfigured!==true)reject('ACCEPTANCE_NOT_ARMABLE');
   const prior=read();if(prior)db.prepare('INSERT INTO dex_autonomous_acceptance_history VALUES(?,?,?)').run(prior.cycleId,candidate.agentId,JSON.stringify(prior));
   return write({mode:candidate.mode,cycleId:randomUUID(),status:'ARMED',candidate,emergencyPermission:true,emergencyStopped:false,enabledAt:now(),execution:null,buyExecutionId:null,buySignature:null,sellExecutionId:null,sellSignature:null});
  });},
  ownerEmergencyStop(){return atomic(()=>{const s=read();if(!s||s.emergencyStopped===true&&!s.recoveryExit)return s;return write({...s,emergencyStopped:true,emergencyPermission:false,recoveryExit:false,status:['BUYING','SELLING','UNKNOWN'].includes(s.status)?'UNKNOWN':'STOPPED',stoppedAt:now()});});},
  ownerRecoverExit(context,{position,buy,receipt,activeExecution=false,activeReservation=false}={}){return atomic(()=>{
   if(!recoveryEligibility(context,{position,buy,receipt,activeExecution,activeReservation}).eligible)reject('ACCEPTANCE_RECOVERY_LOCKED');const s=read();
   return write({...s,status:'POSITION_OPEN',recoveryExit:true,emergencyStopped:true,emergencyPermission:false,recoveryAuthorizedAt:now(),failureReason:null});
  });},
  recordStrategy(result){return atomic(()=>{const s=read();if(s?.status!=='ARMED'||s.strategyResult)return s;if(!['BUY','HOLD','SKIP'].includes(result?.side))reject('ACCEPTANCE_STRATEGY_INVALID');return write({...s,strategyResult:{side:result.side,reason:String(result.reason??'').slice(0,160),evaluatedAt:now()}});});},
  recordStateAcquisition(stage,attempts){return atomic(()=>{const s=read();if(!s||!['ARMED','POSITION_OPEN'].includes(s.status)||s.execution||!Array.isArray(attempts)||attempts.length>3)return s;return write({...s,stateAcquisition:[...(s.stateAcquisition??[]),{stage,attempts}].slice(-12)});});},
  terminalBeforeExecution(reason,attempts){return atomic(()=>{const s=read();if(!s||!['ARMED','POSITION_OPEN'].includes(s.status)||s.execution)reject('ACCEPTANCE_FAILURE_UNVERIFIED');if(s.status==='POSITION_OPEN'&&s.buyExecutionId&&s.buySignature){return write({...s,monitorUnavailableReason:String(reason).slice(0,100),monitorUnavailableAt:now(),...(attempts?{stateAcquisition:[...(s.stateAcquisition??[]),{stage:'MONITOR_READ_UNAVAILABLE',attempts}].slice(-12)}:{})});}return write({...s,status:'FAILED',emergencyPermission:false,failureReason:String(reason).slice(0,100),...(attempts?{stateAcquisition:[...(s.stateAcquisition??[]),{stage:'FAILED_PRE_EXECUTION',attempts}].slice(-12)}:{}),disabledAt:now()});});},
  assertBuy(intent,{context,flags,riskPass,openPositions,executionId}={}){
   const s=read();if(!identity(context)||!permission(s,flags)||riskPass!==true||openPositions!==0||!['ARMED','BUYING'].includes(s?.status)||s.status==='BUYING'&&s.execution?.id!==executionId)reject('ACCEPTANCE_BUY_LOCKED');checkIntent(intent,'BUY',s);return s;
  },
  assertSell(intent,{context,flags,riskPass,position,exitReason,executionId}={}){
   const s=read();if(!identity(context)||!permission(s,flags,'SELL')||riskPass!==true||!['POSITION_OPEN','SELLING'].includes(s?.status)||s.status==='SELLING'&&s.execution?.id!==executionId||!position||position.mint!==candidate.tokenMint||position.pool!==candidate.pool||position.buySignature!==s.buySignature||!['TAKE_PROFIT','STOP_LOSS','MAX_HOLD'].includes(exitReason))reject('ACCEPTANCE_SELL_LOCKED');
   const amount=checkIntent(intent,'SELL',s);if(amount!==integer(position.quantity)||exitReason==='MAX_HOLD'&&now()-s.boughtAt<candidate.maxHoldMs)reject('ACCEPTANCE_SELL_LOCKED');return s;
  },
  bindExecution(r,{reservation,riskPass,simulationPass}={}){return atomic(()=>{
   const s=read(),direction=r?.intent?.direction,expected=direction==='BUY'?'ARMED':'POSITION_OPEN';
   if(s?.status!==expected||!permission(s,{},direction)||!['BUY','SELL'].includes(direction)||r.status!=='PREPARED'||!r.messageHash||r.simulation?.success!==true||riskPass!==true||simulationPass!==true||reservation?.operationId!==`dex:${r.id}`||reservation?.intentHash!==r.fingerprint||!['PREPARED','PREPARING'].includes(reservation.status)||reservation.resources?.length!==1||reservation.resources[0]?.wallet!==candidate.agentWallet||BigInt(reservation.resources[0]?.lamports??'0')<=0n)reject('ACCEPTANCE_BINDING_INVALID');
   checkIntent(r.intent,direction,s);
   const execution={id:r.id,direction,intentHash:r.fingerprint,messageHash:r.messageHash,reservationId:reservation.operationId,reservedLamports:reservation.resources[0].lamports,expiresAt:r.intent.expiresAt,amount:r.intent.inputAmount,claimedAt:now()};
   return write({...s,status:direction==='BUY'?'BUYING':'SELLING',execution,exitReason:r.intent.exitReason??null});
  });},
  assertClaim(r){const s=read();if(!permission(s,{},r?.intent?.direction)||!bound(s,r)||now()>=s.execution.expiresAt||s.status!==(r.intent.direction==='BUY'?'BUYING':'SELLING')||!['UNKNOWN','SUBMITTED'].includes(r.status)||r.authorizedMessageHash!==r.messageHash)reject('ACCEPTANCE_CLAIM_INVALID');checkIntent(r.intent,r.intent.direction,s);return s;},
  confirmedBuy(r,receipt,position){return atomic(()=>{const s=read();if(!['BUYING','UNKNOWN'].includes(s?.status)||!bound(s,r)||r.status!=='CONFIRMED'||receipt?.signature!==r.signature||receipt.finalized!==true||!position||position.buySignature!==r.signature||position.quantity!==receipt.actualOutput)reject('ACCEPTANCE_BUY_RECEIPT_INVALID');return write({...s,status:'POSITION_OPEN',buyExecutionId:r.id,buySignature:r.signature,boughtAt:receipt.confirmedAt,entrySlot:receipt.slot,execution:null,lastReconciliationAt:now()});});},
  confirmedSell(r,receipt,position){return atomic(()=>{const s=read();if(!['SELLING','UNKNOWN'].includes(s?.status)||!bound(s,r)||r.status!=='CONFIRMED'||receipt?.signature!==r.signature||receipt.finalized!==true||!position||position.quantity!=='0'||position.sellSignature!==r.signature)reject('ACCEPTANCE_SELL_RECEIPT_INVALID');return write({...s,status:'COMPLETED',emergencyPermission:false,recoveryExit:false,emergencyStopped:s.emergencyStopped===true,sellExecutionId:r.id,sellSignature:r.signature,execution:null,disabledAt:now(),lastReconciliationAt:now()});});},
  terminalFailure(r){return atomic(()=>{const s=read();if(!s||!bound(s,r)||!['REJECTED_BEFORE_SIGNING','FAILED','EXPIRED'].includes(r.status)||r.status==='REJECTED_BEFORE_SIGNING'&&(r.signature||r.broadcastAttemptedAt))reject('ACCEPTANCE_FAILURE_UNVERIFIED');return write({...s,status:'FAILED',emergencyPermission:false,recoveryExit:false,failureReason:r.reason??r.status,execution:null,disabledAt:now()});});},
  failUnbound(r){return atomic(()=>{const s=read();if(!s||r?.intent?.acceptanceCycleId!==s.cycleId||s.execution||!['ARMED','POSITION_OPEN'].includes(s.status)||!['REJECTED_BEFORE_SIGNING','EXPIRED'].includes(r.status)||r.signature||r.broadcastAttemptedAt)reject('ACCEPTANCE_FAILURE_UNVERIFIED');return write({...s,status:'FAILED',emergencyPermission:false,recoveryExit:false,failureReason:r.reason??r.status,disabledAt:now()});});},
  markUnknown(r){return atomic(()=>{const s=read();if(!bound(s,r)||!['BUYING','SELLING','UNKNOWN'].includes(s.status))reject('ACCEPTANCE_STATE_CONFLICT');return write({...s,status:'UNKNOWN',unknownExecutionId:r.id,lastReconciliationAt:now()});});}
 });
}
