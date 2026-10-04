import {randomUUID} from 'node:crypto';
import {integer,signedInteger,reject} from './intent.js';
import {createRealBalanceReservations} from '../real-balance-reservations.js';
export {createPumpFixtureLedger} from './pump-fixture-ledger.js';

export const ACTIVE_DEX_STATES=['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN'];
const transitions={QUOTED:['QUOTED','PREPARING','REJECTED_BEFORE_SIGNING','FAILED','EXPIRED'],PREPARING:['PREPARING','PREPARED','REJECTED_BEFORE_SIGNING','EXPIRED'],PREPARED:['UNKNOWN','REJECTED_BEFORE_SIGNING','FAILED','EXPIRED'],UNKNOWN:['SIGNED','FAILED','EXPIRED'],SIGNED:['SUBMITTED','UNKNOWN','FAILED'],SUBMITTED:['UNKNOWN','FAILED']};
export function createDexLedger(db){
 const realReservations=createRealBalanceReservations(db);
 db.exec(`CREATE TABLE IF NOT EXISTS dex_executions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,agent_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(owner,request_key));
 CREATE TABLE IF NOT EXISTS dex_receipts(execution_id TEXT PRIMARY KEY,signature TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS dex_positions(agent_id TEXT NOT NULL,mint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(agent_id,mint));
 CREATE TABLE IF NOT EXISTS dex_real_expenses(execution_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,fee_lamports TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS dex_execution_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,execution_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS dex_expense_no_update BEFORE UPDATE ON dex_real_expenses BEGIN SELECT RAISE(ABORT,'Immutable real expense'); END;
 CREATE TRIGGER IF NOT EXISTS dex_expense_no_delete BEFORE DELETE ON dex_real_expenses BEGIN SELECT RAISE(ABORT,'Immutable real expense'); END;
 CREATE TRIGGER IF NOT EXISTS dex_event_no_update BEFORE UPDATE ON dex_execution_events BEGIN SELECT RAISE(ABORT,'Immutable execution event'); END;
 CREATE TRIGGER IF NOT EXISTS dex_event_no_delete BEFORE DELETE ON dex_execution_events BEGIN SELECT RAISE(ABORT,'Immutable execution event'); END;
 CREATE TRIGGER IF NOT EXISTS dex_receipt_no_update BEFORE UPDATE ON dex_receipts BEGIN SELECT RAISE(ABORT,'Immutable execution receipt'); END;
 CREATE TRIGGER IF NOT EXISTS dex_receipt_no_delete BEFORE DELETE ON dex_receipts BEGIN SELECT RAISE(ABORT,'Immutable execution receipt'); END;`);
 const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const get=id=>{const row=db.prepare('SELECT data FROM dex_executions WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
 const event=r=>db.prepare('INSERT INTO dex_execution_events(execution_id,status,data) VALUES(?,?,?)').run(r.id,r.status,JSON.stringify(r));
 const put=r=>realReservations.syncDexRecord(r,()=>{db.prepare('UPDATE dex_executions SET status=?,data=? WHERE id=?').run(r.status,JSON.stringify(r),r.id);event(r);});
 const position=(agentId,mint)=>{const row=db.prepare('SELECT data FROM dex_positions WHERE agent_id=? AND mint=?').get(agentId,mint);return row?JSON.parse(row.data):{agentId,mint,mode:'REAL',quantity:'0',costBasisLamports:'0',realizedPnlLamports:'0',rentPaidLamports:'0'};};
 const activePosition=agentId=>{const rows=db.prepare('SELECT data FROM dex_positions WHERE agent_id=?').all(agentId).map(row=>JSON.parse(row.data)).filter(p=>BigInt(p.quantity)>0n);if(rows.length>1)reject('POSITION_LIMIT');return rows[0]??null;};
 return {
  get,position,activePosition,reservation:id=>realReservations.get('dex:'+id),
  list:agentId=>db.prepare('SELECT data FROM dex_executions WHERE agent_id=? ORDER BY rowid DESC').all(agentId).map(r=>JSON.parse(r.data)),
  acceptanceHistory:agentId=>db.prepare('SELECT data FROM dex_executions WHERE agent_id=? ORDER BY rowid DESC').all(agentId).map(row=>{
   const record=JSON.parse(row.data),operationId='dex:'+record.id;
   const reservation=realReservations.get(operationId);
   const events=db.prepare('SELECT status,data FROM dex_execution_events WHERE execution_id=? ORDER BY seq').all(record.id).map(e=>({status:e.status,record:JSON.parse(e.data)}));
   const receipt=db.prepare('SELECT 1 FROM dex_receipts WHERE execution_id=?').get(record.id);
   const activeReservation=!!db.prepare('SELECT 1 FROM real_reserved_accounts WHERE operation_id=?').get(operationId);
   return {record,reservation,events,hasReceipt:!!receipt,activeReservation};
  }),
  receipt:id=>{const row=db.prepare('SELECT data FROM dex_receipts WHERE execution_id=?').get(id);return row?JSON.parse(row.data):null;},
  recordFailure(id,receipt){return atomic(()=>{
   const r=get(id);if(!r)reject('EXECUTION_NOT_FOUND');
   const existing=db.prepare('SELECT data FROM dex_receipts WHERE execution_id=?').get(id);if(existing){if(JSON.parse(existing.data).signature!==receipt.signature)reject('RECEIPT_CONFLICT');return r;}
   if(!['SIGNED','SUBMITTED','UNKNOWN'].includes(r.status)||receipt.executionId!==id||r.signature!==receipt.signature||r.messageHash!==receipt.messageHash||receipt.finalized!==true||!Number.isSafeInteger(receipt.slot)||receipt.slot<0)reject('UNVERIFIED_FAILED_RECEIPT');
   const fee=integer(receipt.networkFeeLamports,{zero:true});
   db.prepare('INSERT INTO dex_receipts VALUES(?,?,?)').run(id,receipt.signature,JSON.stringify({...receipt,status:'FAILED',mode:'REAL',intent:r.intent}));
   db.prepare('INSERT INTO dex_real_expenses VALUES(?,?,?,?)').run(id,r.intent.agentId,fee.toString(),JSON.stringify({reason:'FINALIZED_ONCHAIN_ERROR',slot:receipt.slot,signature:receipt.signature}));
   const next={...r,status:'FAILED',reason:'FINALIZED_ONCHAIN_ERROR',failedNetworkFeeLamports:fee.toString(),failedSlot:receipt.slot};put(next);return next;
  });},
  reserve({intent,fingerprint,requestKey}){return atomic(()=>{
   const row=db.prepare('SELECT data,fingerprint FROM dex_executions WHERE owner=? AND request_key=?').get(intent.owner,requestKey);
   if(row){if(row.fingerprint!==fingerprint)reject('IDEMPOTENCY_CONFLICT');return {existing:true,record:JSON.parse(row.data)};}
   const active=db.prepare('SELECT status FROM dex_executions WHERE agent_id=?').all(intent.agentId).some(r=>ACTIVE_DEX_STATES.includes(r.status));if(active)reject('ACTIVE_EXECUTION_REQUIRES_RECONCILIATION');
   const record={id:randomUUID(),intent,fingerprint,requestKey,status:'QUOTED',createdAt:intent.createdAt};
   db.prepare('INSERT INTO dex_executions VALUES(?,?,?,?,?,?,?)').run(record.id,intent.owner,requestKey,fingerprint,intent.agentId,record.status,JSON.stringify(record));event(record);return {existing:false,record};
  });},
  transition(id,from,to,patch={}){return atomic(()=>{const r=get(id);if(!r||!from.includes(r.status)||!transitions[r.status]?.includes(to)||r.status==='UNKNOWN'&&to==='EXPIRED')reject('EXECUTION_STATE_CONFLICT');if(Object.keys(patch).some(k=>['id','intent','fingerprint','requestKey','status'].includes(k)))reject('IMMUTABLE_INTENT');const next={...r,...patch,status:to};put(next);return next;});},
  expireNeverBroadcast(id,proof){return atomic(()=>{
   const r=get(id),claim=db.prepare('SELECT 1 FROM dex_autonomous_broadcast_claim WHERE execution_id=?').get(id),signClaim=db.prepare('SELECT 1 FROM dex_autonomous_sign_claim WHERE execution_id=?').get(id),receipt=db.prepare('SELECT 1 FROM dex_receipts WHERE execution_id=?').get(id);
   if(!r||r.status!=='UNKNOWN'||r.reason!=='SIGNED_NOT_BROADCAST'||r.intent?.mode!=='AUTONOMOUS_ACCEPTANCE_TEST'||!r.signature||!r.messageHash||!signClaim||r.broadcastAttemptedAt||claim||receipt||proof?.network!=='solana:mainnet'||proof?.genesis!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'||proof?.signature!==r.signature||proof?.signatureStatus!==null||proof?.transaction!==null||!Number.isSafeInteger(proof.currentBlockHeight)||proof.currentBlockHeight<=r.lastValidBlockHeight||!Number.isSafeInteger(proof.checkedAt)||Math.abs(Date.now()-proof.checkedAt)>30000||proof.agentBalanceLamports!==r.risk?.snapshot?.solBalanceLamports||proof.tokenBalanceRaw!=='0'||proof.tokenAccountExists!==false)reject('NEVER_BROADCAST_PROOF_INCOMPLETE');
   const next={...r,status:'EXPIRED',reason:'EXPIRED_BEFORE_BROADCAST',noBroadcastProof:{genesis:proof.genesis,currentBlockHeight:proof.currentBlockHeight,checkedAt:proof.checkedAt,signatureAbsent:true,transactionAbsent:true,agentBalanceLamports:proof.agentBalanceLamports,tokenBalanceRaw:'0',broadcastClaimAbsent:true}};
   put(next);return next;
  });},
  confirm(id,receipt){return atomic(()=>{
   const r=get(id);if(!r)reject('EXECUTION_NOT_FOUND');const existing=db.prepare('SELECT data FROM dex_receipts WHERE execution_id=?').get(id);if(existing){if(JSON.parse(existing.data).signature!==receipt.signature)reject('RECEIPT_CONFLICT');return get(id);}
   if(!['SIGNED','SUBMITTED','UNKNOWN'].includes(r.status)||r.signature!==receipt.signature||receipt.executionId!==id||receipt.finalized!==true||receipt.messageHash!==r.messageHash)reject('UNVERIFIED_RECEIPT');
   const intent=r.intent,mint=intent.direction==='BUY'?intent.outputMint:intent.inputMint,p=position(intent.agentId,mint),input=integer(receipt.actualInput),output=integer(receipt.actualOutput),fee=integer(receipt.networkFeeLamports,{zero:true}),rent=signedInteger(receipt.rentLamports);
   if(input!==integer(intent.inputAmount)||output<integer(r.quote.minimumOutput))reject('RECEIPT_ECONOMICS_MISMATCH');
   if(intent.direction==='BUY'){p.quantity=(BigInt(p.quantity)+output).toString();p.costBasisLamports=(BigInt(p.costBasisLamports)+input+fee+(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'?rent:0n)).toString();if(['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(intent.mode))Object.assign(p,{venue:'RAYDIUM_CPMM',pool:r.pool,buySignature:receipt.signature,openedAt:receipt.confirmedAt,entrySlot:receipt.slot,strategyVersion:intent.strategyVersion??0,strategyConfig:intent.strategyConfig??null,strategyResult:intent.strategyResult??null,acceptanceCycleId:intent.acceptanceCycleId??null,buyNetworkFeeLamports:fee.toString(),riskSnapshot:r.risk?.snapshot??null});}
   else{const quantity=BigInt(p.quantity);if(quantity<input)reject('UNTRACKED_REAL_POSITION');const basis=input===quantity?BigInt(p.costBasisLamports):BigInt(p.costBasisLamports)*input/quantity;p.quantity=(quantity-input).toString();p.costBasisLamports=(BigInt(p.costBasisLamports)-basis).toString();const net=output-fee-basis-(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'?rent:0n);p.realizedPnlLamports=(BigInt(p.realizedPnlLamports)+net).toString();if(['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(intent.mode))Object.assign(p,{sellSignature:receipt.signature,closedAt:receipt.confirmedAt,exitSlot:receipt.slot,sellNetworkFeeLamports:fee.toString(),holdingMs:Math.max(0,receipt.confirmedAt-(p.openedAt??receipt.confirmedAt)),lastRealizedPnlLamports:net.toString(),lastRealizedPnlBps:basis>0n?(net*10000n/basis).toString():null});}
   if(rent>=0n)p.rentPaidLamports=(BigInt(p.rentPaidLamports)+rent).toString();else p.rentRecoveredLamports=(BigInt(p.rentRecoveredLamports??'0')-rent).toString();p.updatedAt=receipt.confirmedAt;
   db.prepare('INSERT INTO dex_receipts VALUES(?,?,?)').run(id,receipt.signature,JSON.stringify({...receipt,intent,quoteReference:r.quote.reference,provider:r.quote.provider,mode:'REAL'}));
   db.prepare('INSERT INTO dex_positions VALUES(?,?,?) ON CONFLICT(agent_id,mint) DO UPDATE SET data=excluded.data').run(intent.agentId,mint,JSON.stringify(p));
   const next={...r,status:'CONFIRMED',confirmedAt:receipt.confirmedAt,confirmedEffects:{agentSolDelta:receipt.agentSolDelta,agentTokenDelta:receipt.agentTokenDelta,networkFeeLamports:receipt.networkFeeLamports,rentLamports:receipt.rentLamports}};put(next);return next;
  });}
 };
}
