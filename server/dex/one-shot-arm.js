import {createHash,timingSafeEqual} from 'node:crypto';
import {FIRST_BUY} from './first-buy-acceptance.js';
import {capabilityBinding} from './authorization.js';
import {digest} from './intent.js';

const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
const hash=x=>createHash('sha256').update(x).digest();
const equalHash=(a,b)=>{const x=Buffer.from(a??'','hex'),y=Buffer.from(b??'','hex');return x.length===32&&y.length===32&&timingSafeEqual(x,y);};
const terminal=new Set(['EXPIRED','CONFIRMED','FAILED','CANCELLED','REJECTED_BEFORE_SIGNING']);
const binding=r=>digest({id:r.id,owner:r.intent.owner,agentId:r.intent.agentId,wallet:r.intent.agentWallet,intentHash:digest(r.intent),messageHash:r.messageHash,capabilityHash:r.capabilityHash,capabilityBindingHash:r.capabilityBindingHash,quoteReference:r.quote?.reference,reservationId:`dex:${r.id}`,reservationIntentHash:r.fingerprint,blockhash:r.blockhash,lastValidBlockHeight:r.lastValidBlockHeight,expiresAt:Math.min(r.quote?.expiresAt??0,r.capabilityExpiresAt??0,r.intent.expiresAt)});
const check=(r,reservation,now,acceptance)=>{
 if(!r||r.status!=='PREPARED'||r.signature||r.broadcastAttemptedAt||!r.messageHash||!r.message||!r.simulation?.success||r.simulation.messageHash!==r.messageHash)fail('ONE_SHOT_RECORD_INVALID');
 const i=r.intent;
 if(i.mode!=='CONTROLLED_REAL'||i.network!=='solana:mainnet'||i.owner!==acceptance.owner||i.agentId!==acceptance.agentId||i.agentWallet!==acceptance.agentWallet||i.direction!=='BUY'||i.inputMint!==acceptance.inputMint||i.outputMint!==acceptance.outputMint||i.inputAmount!==acceptance.inputAmount||i.slippageBps>100||r.pool!==acceptance.pool)fail('ONE_SHOT_INTENT_MISMATCH');
 if(!reservation||reservation.operationId!==`dex:${r.id}`||reservation.status!=='PREPARED'||reservation.intentHash!==r.fingerprint||reservation.signature||reservation.resources?.length!==1||reservation.resources[0].wallet!==i.agentWallet)fail('ONE_SHOT_RESERVATION_MISMATCH');
 if(!equalHash(r.capabilityBindingHash,digest(capabilityBinding(r)))||!r.capabilityHash)fail('ONE_SHOT_CAPABILITY_MISMATCH');
 const expiresAt=Math.min(r.quote.expiresAt,r.capabilityExpiresAt,i.expiresAt);
 if(now>=expiresAt)fail('ONE_SHOT_EXPIRED');
 return expiresAt;
};

// No HTTP arming endpoint. An explicit future owner/operator workflow must
// stage an already-persisted PREPARED ID; flags cannot stage or claim it.
export function createOneShotArm(db,{now=Date.now,acceptance=FIRST_BUY}={}){
 db.exec("CREATE TABLE IF NOT EXISTS dex_one_shot_arm(id INTEGER PRIMARY KEY CHECK(id=1),execution_id TEXT NOT NULL,binding TEXT NOT NULL,status TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0)");
 const row=()=>db.prepare('SELECT execution_id,binding,status,expires_at,consumed FROM dex_one_shot_arm WHERE id=1').get()??null;
 const atomic=fn=>{db.exec('SAVEPOINT one_shot_arm');try{const out=fn();db.exec('RELEASE one_shot_arm');return out;}catch(e){db.exec('ROLLBACK TO one_shot_arm');db.exec('RELEASE one_shot_arm');throw e;}};
 const disarmExpired=()=>{const arm=row();if(arm&&arm.status==='ARMED'&&now()>=arm.expires_at){db.prepare("UPDATE dex_one_shot_arm SET status='DISARMED' WHERE id=1 AND status='ARMED'").run();return row();}return arm;};
 return {
  status:()=>disarmExpired(),
  stage(r,reservation){return atomic(()=>{
   const old=disarmExpired();if(old?.consumed)fail('ONE_SHOT_CONSUMED');if(old&&old.status!=='DISARMED')fail('ONE_SHOT_ALREADY_ACTIVE');
   const expiresAt=check(r,reservation,now(),acceptance),value=binding(r);
   db.prepare("INSERT INTO dex_one_shot_arm(id,execution_id,binding,status,expires_at,consumed) VALUES(1,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET execution_id=excluded.execution_id,binding=excluded.binding,status=excluded.status,expires_at=excluded.expires_at,consumed=0").run(r.id,value,'ARMED',expiresAt);
   return {executionId:r.id,status:'ARMED',expiresAt};
  });},
  claim(r,reservation,approval){return atomic(()=>{
   const arm=disarmExpired();if(!arm||arm.status!=='ARMED'||arm.execution_id!==r?.id)fail('ONE_SHOT_NOT_ARMED_FOR_EXECUTION');
   check(r,reservation,now(),acceptance);if(arm.binding!==binding(r)||arm.expires_at!==Math.min(r.quote.expiresAt,r.capabilityExpiresAt,r.intent.expiresAt))fail('ONE_SHOT_BINDING_MISMATCH');
   if(approval?.confirm!==true||typeof approval.confirmationToken!=='string'||!equalHash(hash(approval.confirmationToken).toString('hex'),r.capabilityHash)||approval.messageHash!==r.messageHash||approval.quoteReference!==r.quote.reference)fail('ONE_SHOT_OWNER_CONFIRMATION_REQUIRED');
   db.prepare("UPDATE dex_one_shot_arm SET status='CLAIMED',consumed=1 WHERE id=1 AND status='ARMED'").run();return {executionId:r.id,status:'CLAIMED'};
  });},
  assertClaimed(r){const arm=row();if(!arm||arm.status!=='CLAIMED'||arm.execution_id!==r?.id||arm.binding!==binding(r))fail('ONE_SHOT_CLAIM_MISMATCH');return true;},
  settle(r){if(!terminal.has(r?.status))return false;return atomic(()=>{const arm=row();if(!arm||arm.execution_id!==r.id||arm.status==='DISARMED')return false;db.prepare("UPDATE dex_one_shot_arm SET status='DISARMED' WHERE id=1").run();return true;});}
 };
}
