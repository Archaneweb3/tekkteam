import {reject} from './intent.js';

// Custody-facing durable claim. No caller-supplied boolean or browser token
// can authorize signing. The ledger transition must exist before this check.
export function createAutonomousClaim({db,ledger,flags,acceptance}){
 if(!db)reject('AUTONOMOUS_CLAIM_STORAGE_REQUIRED');
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_sign_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS dex_autonomous_broadcast_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL)');
 const armed=r=>{if(r?.intent?.mode==='AUTONOMOUS_ACCEPTANCE_TEST'){if(!acceptance)reject('AUTONOMOUS_ACCEPTANCE_DISARMED');const cycle=acceptance.assertClaim(r),hold=ledger.reservation(r.id);if(!hold||hold.intentHash!==r.fingerprint||!['UNKNOWN','SUBMITTED'].includes(hold.status)||hold.resources?.length!==1||hold.resources[0]?.wallet!==r.intent.agentWallet||hold.resources[0].lamports!==cycle.execution.reservedLamports)reject('ACCEPTANCE_RESERVATION_INVALID');return;}const f=flags();if(f.liveAutonomousEnabled!==true||f.autonomousKillSwitch!==false||f.realMoneyEmergencyStop!==false)reject('AUTONOMOUS_TRADING_STOP');};
 const same=(r,x)=>x?.id===r?.id&&['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(x?.intent?.mode)&&x.fingerprint===r.fingerprint&&x.messageHash===r.messageHash&&x.message===r.message&&x.intent.agentWallet===r.intent.agentWallet;
 return Object.freeze({
  acceptanceEnabled:!!acceptance,
  assertSigningClaim(r){armed(r);const x=ledger.get(r?.id);if(!same(r,x)||x.status!=='UNKNOWN'||x.reason!=='SIGNING_CLAIMED'||x.authorizedMessageHash!==r.messageHash||x.signature||x.broadcastAttemptedAt)reject('AUTONOMOUS_SIGNING_CLAIM_MISSING');try{db.prepare('INSERT INTO dex_autonomous_sign_claim VALUES(?,?)').run(r.id,r.messageHash);}catch{reject('AUTONOMOUS_SIGN_ALREADY_CLAIMED');}return true;},
  assertBroadcastClaim(r){armed(r);const x=ledger.get(r?.id);if(!same(r,x)||x.status!=='SUBMITTED'||!x.signature||!Number.isSafeInteger(x.broadcastAttemptedAt)||x.authorizedMessageHash!==r.messageHash)reject('AUTONOMOUS_BROADCAST_CLAIM_MISSING');try{db.prepare('INSERT INTO dex_autonomous_broadcast_claim VALUES(?,?)').run(r.id,r.messageHash);}catch{reject('AUTONOMOUS_BROADCAST_ALREADY_CLAIMED');}return true;}
 });
}
