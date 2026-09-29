import {createHash} from 'node:crypto';

const active=new Set(['PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN','Prepared','Confirming']);
const terminal=new Set(['CONFIRMED','FAILED','CANCELLED','EXPIRED','REJECTED_BEFORE_SIGNING']);
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
const uint=x=>{if(typeof x!=='string'||!/^\d+$/.test(x)||BigInt(x)>18446744073709551615n)fail('INVALID_RESERVATION_AMOUNT');return BigInt(x);};
let serial=0;
// SAVEPOINT composes with existing transfer/DEX transactions. The mutex write
// acquires SQLite's writer lock BEFORE checking any competing reservation.
export function createRealBalanceReservations(db){
 db.exec(`CREATE TABLE IF NOT EXISTS real_reservation_mutex(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
 INSERT OR IGNORE INTO real_reservation_mutex VALUES(1,0);
 CREATE TABLE IF NOT EXISTS real_balance_reservations(operation_id TEXT PRIMARY KEY,intent_hash TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS real_reserved_accounts(operation_id TEXT NOT NULL,wallet TEXT NOT NULL,lamports TEXT NOT NULL,PRIMARY KEY(operation_id,wallet));`);
 const atomic=fn=>{const name='reserve_'+(++serial);db.exec('SAVEPOINT '+name);try{db.prepare('UPDATE real_reservation_mutex SET revision=revision+1 WHERE id=1').run();const out=fn();db.exec('RELEASE '+name);return out;}catch(e){db.exec('ROLLBACK TO '+name);db.exec('RELEASE '+name);throw e;}};
 const get=id=>{const r=db.prepare('SELECT data FROM real_balance_reservations WHERE operation_id=?').get(id);return r?JSON.parse(r.data):null;};
 const exists=table=>!!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',table);
 function legacyBarrier(wallets,id){
  // Active pre-upgrade records may lack a reservation. They must still block.
  if(exists('agent_funding'))for(const row of db.prepare('SELECT data FROM agent_funding').all()){const r=JSON.parse(row.data);if('wallet:'+r.id!==id&&active.has(r.status)&&[r.source,r.destination,r.agentWallet,r.owner].some(w=>wallets.includes(w)))fail('ACTIVE_WALLET_REQUEST');}
  if(exists('dex_executions'))for(const row of db.prepare("SELECT data FROM dex_executions WHERE status IN ('PREPARED','SIGNED','SUBMITTED','UNKNOWN')").all()){const r=JSON.parse(row.data);if('dex:'+r.id!==id&&wallets.includes(r.intent.agentWallet))fail('ACTIVE_DEX_REQUEST');}
 }
 function reserveWithin(spec){
  if(!spec.operationId||!spec.intentHash||!active.has(spec.status??'PREPARED')||!Array.isArray(spec.resources)||!spec.resources.length||new Set(spec.resources.map(x=>x.wallet)).size!==spec.resources.length)fail('INVALID_RESERVATION');
  const old=get(spec.operationId);if(old&&old.intentHash!==spec.intentHash)fail('RESERVATION_INTENT_CONFLICT');
  if(old&&terminal.has(old.status))fail('RESERVATION_TERMINAL');
  if(old&&JSON.stringify(old.resources.map(r=>[r.wallet,r.lamports]))!==JSON.stringify(spec.resources.map(r=>[r.wallet,r.lamports])))fail('RESERVATION_RESOURCE_MUTATION');
  if(old&&['SIGNED','SUBMITTED','UNKNOWN'].includes(old.status)&&['PREPARED','Prepared','Confirming'].includes(spec.status))fail('RESERVATION_STATE_DOWNGRADE');
  if(old?.signature&&spec.signature&&old.signature!==spec.signature)fail('RESERVATION_SIGNATURE_MUTATION');
  const wallets=spec.resources.map(x=>x.wallet);legacyBarrier(wallets,spec.operationId);
  for(const resource of spec.resources){
   uint(resource.lamports);if(typeof resource.wallet!=='string'||!resource.wallet)fail('INVALID_RESERVATION_WALLET');
   const rows=db.prepare('SELECT operation_id,lamports FROM real_reserved_accounts WHERE wallet=? AND operation_id<>?').all(resource.wallet,spec.operationId);
   // Deliberately serial per wallet, including incoming funds. An unconfirmed
   // funding credit is NEVER counted as spendable SOL.
   if(rows.length)fail('REAL_BALANCE_RESERVED');
   if(resource.balanceLamports!=null&&uint(resource.balanceLamports)<uint(resource.lamports)+uint(resource.protectedLamports??'0'))fail('INSUFFICIENT_UNRESERVED_BALANCE');
  }
  const r={operationId:spec.operationId,intentHash:spec.intentHash,status:spec.status??'PREPARED',resources:spec.resources,kind:spec.kind,signature:spec.signature??old?.signature??null};
  db.prepare('INSERT INTO real_balance_reservations VALUES(?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET status=excluded.status,data=excluded.data').run(r.operationId,r.intentHash,r.status,JSON.stringify(r));
  for(const resource of spec.resources)db.prepare('INSERT INTO real_reserved_accounts VALUES(?,?,?) ON CONFLICT(operation_id,wallet) DO UPDATE SET lamports=excluded.lamports').run(r.operationId,resource.wallet,resource.lamports);
  return r;
 }
 function finishWithin(id,status,evidence={}){
  const old=get(id);if(!old)return;
  if(terminal.has(old.status)){if(old.status!==status)fail('RESERVATION_TERMINAL');return old;}
  if(!terminal.has(status))fail('RESERVATION_NOT_TERMINAL');
  if(['SIGNED','SUBMITTED','UNKNOWN'].includes(old.status)&&evidence.provenTerminal!==true)fail('UNKNOWN_RESERVATION_REQUIRES_PROOF');
  const r={...old,status,settlement:evidence};db.prepare('UPDATE real_balance_reservations SET status=?,data=? WHERE operation_id=?').run(status,JSON.stringify(r),id);db.prepare('DELETE FROM real_reserved_accounts WHERE operation_id=?').run(id);return r;
 }
 const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
 return {
  get,atomic,
  reserve:spec=>atomic(()=>reserveWithin(spec)),
  finish:(id,status,evidence)=>atomic(()=>finishWithin(id,status,evidence)),
  reserved:wallet=>db.prepare('SELECT lamports FROM real_reserved_accounts WHERE wallet=?').all(wallet).reduce((n,r)=>n+uint(r.lamports),0n).toString(),
  syncWalletRecord(r,write){return atomic(()=>{
   const id='wallet:'+r.id;
   if(active.has(r.status)){
    const debit=(BigInt(r.amountLamports)+10000n).toString();
    const resources=[{wallet:r.source,lamports:debit}];if(r.kind==='FUND')resources.push({wallet:r.agentWallet,lamports:'0'});
    reserveWithin({operationId:id,intentHash:hash([r.agentId,r.kind,r.ownerWallet,r.agentWallet,r.source,r.destination,r.amountLamports,r.network]),kind:r.kind,status:r.status,signature:r.signature,resources});
   }else if(terminal.has(r.status))finishWithin(id,r.status,{provenTerminal:r.status==='CONFIRMED'||r.reason==='Transaction failed on chain'||(!r.signature&&r.reason==='Custody unavailable; nothing was broadcast'),signature:r.signature??null,amountLamports:r.amountLamports,networkFeeLamports:r.feeLamports??null});
   return write();
  });},
  syncDexRecord(r,write){return atomic(()=>{
   const id='dex:'+r.id;
   if(active.has(r.status)&&r.risk){
    const snapshot=r.risk?.snapshot;if(!snapshot)fail('DEX_RESERVATION_SNAPSHOT_REQUIRED');
    // Hold the bounded maximum fee from the capital policy, never the lower
    // post-build estimate; owner review cannot shrink an existing hold.
    const feeCap=uint(r.validationPolicy?.networkFeeCapLamports??'10000');
    if(uint(snapshot.networkFeeLamports)>feeCap)fail('DEX_FEE_EXCEEDS_RESERVATION');
    const debit=(feeCap+uint(snapshot.ataRentLamports)+(r.intent.direction==='BUY'?uint(r.intent.inputAmount):0n)).toString();
    reserveWithin({operationId:id,intentHash:r.fingerprint,kind:'CONTROLLED_DEX',status:r.status,signature:r.signature,resources:[{wallet:r.intent.agentWallet,lamports:debit,balanceLamports:snapshot.solBalanceLamports,protectedLamports:'2020000'}]});
   }else if(terminal.has(r.status))finishWithin(id,r.status,{provenTerminal:r.status==='CONFIRMED'||r.reason==='FINALIZED_ONCHAIN_ERROR'||(!r.signature&&r.reason==='SIGNATURE_OR_CUSTODY_REJECTED_BEFORE_BROADCAST')||(r.status==='EXPIRED'&&r.reason==='EXPIRED_BEFORE_BROADCAST'&&r.noBroadcastProof?.broadcastClaimAbsent===true&&r.noBroadcastProof?.signatureAbsent===true&&r.noBroadcastProof?.transactionAbsent===true&&!r.broadcastAttemptedAt&&!db.prepare('SELECT 1 FROM dex_autonomous_broadcast_claim WHERE execution_id=?').get(r.id)&&!db.prepare('SELECT 1 FROM dex_receipts WHERE execution_id=?').get(r.id)),signature:r.signature??null,networkFeeLamports:r.failedNetworkFeeLamports??r.review?.networkFeeLamports??null,confirmedEffects:r.confirmedEffects??null});
   return write();
  });}
 };
}
