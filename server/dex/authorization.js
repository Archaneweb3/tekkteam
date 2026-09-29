import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {reject} from './intent.js';

export const EXECUTION_MODES=Object.freeze({PAPER:'PAPER',CONTROLLED_REAL:'CONTROLLED_REAL',LIVE_AUTONOMOUS:'LIVE_AUTONOMOUS'});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');

// This is an authorization boundary, not a routing hint. In particular the
// autonomous kill switch never doubles as an owner-confirmation override.
export function authorizeRealExecution({mode,flags,context,record,confirmation,reservation,phase='PREPARE',now=Date.now}){
 if(mode===EXECUTION_MODES.PAPER)reject('PAPER_CANNOT_EXECUTE_REAL');
 if(flags.realMoneyEmergencyStop!==false)reject('REAL_MONEY_EMERGENCY_STOP');
 if(mode===EXECUTION_MODES.LIVE_AUTONOMOUS){
  if(flags.killSwitch!==false||flags.liveEnabled!==true)reject('AUTONOMOUS_TRADING_STOP');
  reject('LIVE_AUTONOMOUS_EXECUTOR_UNAVAILABLE');
 }
 if(mode!==EXECUTION_MODES.CONTROLLED_REAL||record?.intent?.mode!==EXECUTION_MODES.CONTROLLED_REAL)reject('EXECUTION_MODE_MISMATCH');
 if(flags.controlledEnabled!==true||flags.liveEnabled!==false)reject('CONTROLLED_REAL_DISABLED');
 if(!context?.authenticated||!context.owner||!context.agentId||!context.agentWallet)reject('OWNER_AUTH_REQUIRED');
 if(record.intent.owner!==context.owner||record.intent.agentId!==context.agentId||record.intent.agentWallet!==context.agentWallet)reject('EXECUTION_OWNERSHIP_MISMATCH');
 if(phase==='CONFIRM'){
  if(record.status!=='PREPARED'||!confirmation?.token||typeof confirmation.token!=='string')reject('MANUAL_CONFIRMATION_REQUIRED');
  if(!reservation||reservation.operationId!==`dex:${record.id}`||reservation.status!=='PREPARED'||reservation.intentHash!==record.fingerprint)reject('RESERVATION_MISMATCH');
  if(record.capabilityExpiresAt<=now())reject('CONFIRMATION_EXPIRED');
  const expected=Buffer.from(record.capabilityHash||'','hex'),actual=Buffer.from(hash(confirmation.token),'hex');
  if(expected.length!==32||actual.length!==32||!timingSafeEqual(expected,actual))reject('MANUAL_CONFIRMATION_REQUIRED');
  if(record.capabilityBindingHash!==hash(capabilityBinding(record)))reject('CONFIRMATION_BINDING_MISMATCH');
 }
 return true;
}

export function capabilityBinding(record){
 const i=record.intent;
 return {executionId:record.id,owner:i.owner,agentId:i.agentId,agentWallet:i.agentWallet,mode:i.mode,direction:i.direction,inputMint:i.inputMint,outputMint:i.outputMint,inputAmount:i.inputAmount,minimumOutput:record.quote?.minimumOutput,pool:record.pool,slippageBps:i.slippageBps,routePolicyVersion:record.routePolicyVersion,messageHash:record.messageHash,reservationId:`dex:${record.id}`,expiresAt:record.capabilityExpiresAt};
}

export function issueConfirmationCapability(record,{now=Date.now,bytes=randomBytes,lifetimeMs=30000}={}){
 if(!record.pool||!record.routePolicyVersion||!record.messageHash||!record.quote?.minimumOutput||!record.risk?.expiresAt)reject('INCOMPLETE_CONFIRMATION_BINDING');
 const token=bytes(32).toString('hex');
 const capabilityExpiresAt=Math.min(record.risk.expiresAt,record.intent.expiresAt,now()+lifetimeMs);
 const bound={...record,capabilityExpiresAt};
 return {token,capabilityHash:hash(token),capabilityBindingHash:hash(capabilityBinding(bound)),capabilityExpiresAt};
}
