import {reject} from './intent.js';
import {createRealBalanceReservations} from '../real-balance-reservations.js';

// Custody-facing durable claim. No caller-supplied boolean or browser token
// can authorize signing. The ledger transition must exist before this check.
export function createAutonomousClaim({db,ledger,flags,acceptance,readBudgetAuthority,now=Date.now}){
 if(!db)reject('AUTONOMOUS_CLAIM_STORAGE_REQUIRED');
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_sign_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS dex_autonomous_broadcast_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL)');
 const holds=createRealBalanceReservations(db,{readBudgetAuthority,now});
 const armed=r=>{if(r?.intent?.mode==='AUTONOMOUS_ACCEPTANCE_TEST'){if(!acceptance)reject('AUTONOMOUS_ACCEPTANCE_DISARMED');const cycle=acceptance.assertClaim(r),hold=ledger.reservation(r.id);if(!hold||hold.intentHash!==r.fingerprint||!['UNKNOWN','SUBMITTED'].includes(hold.status)||hold.resources?.length!==1||hold.resources[0]?.wallet!==r.intent.agentWallet||hold.resources[0].lamports!==cycle.execution.reservedLamports)reject('ACCEPTANCE_RESERVATION_INVALID');return;}const f=flags();if(f.liveAutonomousEnabled!==true||f.autonomousKillSwitch!==false||f.realMoneyEmergencyStop!==false)reject('AUTONOMOUS_TRADING_STOP');};
 const same=(r,x)=>x?.id===r?.id&&['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(x?.intent?.mode)&&x.fingerprint===r.fingerprint&&x.messageHash===r.messageHash&&x.message===r.message&&x.intent.agentWallet===r.intent.agentWallet;
 const budget=(r)=>{const h=holds.get('dex:'+r.id);if(!h?.budget)return false;const b=h.budget.request,i=r.intent;if(h.intentHash!==r.fingerprint||b.owner!==i.owner||b.agentId!==i.agentId||b.wallet!==i.agentWallet||b.mint!==(i.direction==='BUY'?i.outputMint:i.inputMint)||b.network!=='solana:101'||i.network!=='solana:mainnet'||b.messageHash!==r.messageHash||b.tradeInputLamports!==(i.direction==='BUY'?i.inputAmount:'0'))reject('AUTONOMOUS_BUDGET_SCOPE');return true;};
 return Object.freeze({
  acceptanceEnabled:!!acceptance,
  assertSigningClaim(r){return holds.atomic(()=>{armed(r);const x=ledger.get(r?.id);if(!same(r,x)||x.status!=='UNKNOWN'||x.reason!=='SIGNING_CLAIMED'||x.authorizedMessageHash!==r.messageHash||x.signature||x.broadcastAttemptedAt)reject('AUTONOMOUS_SIGNING_CLAIM_MISSING');if(budget(x))return holds.claimBudget('dex:'+r.id,r.messageHash,r.id);try{db.prepare('INSERT INTO dex_autonomous_sign_claim VALUES(?,?)').run(r.id,r.messageHash);}catch{reject('AUTONOMOUS_SIGN_ALREADY_CLAIMED');}return true;});},
  assertBroadcastClaim(r){return holds.atomic(()=>{armed(r);const x=ledger.get(r?.id);if(!same(r,x)||x.status!=='SUBMITTED'||!x.signature||!Number.isSafeInteger(x.broadcastAttemptedAt)||x.authorizedMessageHash!==r.messageHash)reject('AUTONOMOUS_BROADCAST_CLAIM_MISSING');if(budget(x)){holds.assertBudgetBroadcast('dex:'+r.id,r.messageHash);if(db.prepare('SELECT message_hash FROM dex_autonomous_sign_claim WHERE execution_id=?').get(r.id)?.message_hash!==r.messageHash)reject('AUTONOMOUS_SIGNING_CLAIM_MISSING');}try{db.prepare('INSERT INTO dex_autonomous_broadcast_claim VALUES(?,?)').run(r.id,r.messageHash);}catch{reject('AUTONOMOUS_BROADCAST_ALREADY_CLAIMED');}return true;});}
 });
}
