import {reject,SOL_MINT} from './intent.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from './cpmm-mainnet-state.js';

export const FIRST_BUY=Object.freeze({
 agentId:'0f406135-35ea-437d-a27c-29052d279c3b',
 agentWallet:'7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe',
 owner:'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',
 direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,
 inputAmount:'100000',pool:CONTROLLED_CPMM_POOL,venue:'CPMM_CLASSIC_WSOL_USDC_V1'
});

const SAFE_TERMINAL=new Set(['REJECTED_BEFORE_SIGNING','EXPIRED','CANCELLED']);
const VALUE_SENSITIVE=new Set(['UNKNOWN','SIGNED','SUBMITTED','CONFIRMED']);
const safeHistoryEntry=({record:r,reservation,events,hasReceipt,activeReservation})=>{
 if(!r||!Array.isArray(events)||!events.length||hasReceipt||activeReservation||r.signature||r.broadcastAttemptedAt||r.authorizedMessageHash)return false;
 if(!SAFE_TERMINAL.has(r.status)&&!(r.status==='FAILED'&&r.reason==='Cancelled before signing'))return false;
 if(reservation&&(reservation.signature||!SAFE_TERMINAL.has(reservation.status)&&!(reservation.status==='FAILED'&&r.reason==='Cancelled before signing')))return false;
 if(events.some(({status,record})=>VALUE_SENSITIVE.has(status)||record?.signature||record?.broadcastAttemptedAt||record?.authorizedMessageHash))return false;
 return true;
};

// A terminal label alone never proves that signing/broadcast was not reached.
// Immutable event history, receipts and reservation state must all agree.
export function firstBuyAcceptanceAvailable(history=[],requestKey){
 return history.every(entry=>entry.record?.requestKey===requestKey||safeHistoryEntry(entry));
}

// Temporary one-intent acceptance boundary. Frontend fields are compared,
// never used as authority for the wallet, pool or custody identity.
export function assertFirstBuyAcceptance(body,context,{adapterKind=FIRST_BUY.venue,history=[]}={}){
 if(context?.agentId!==FIRST_BUY.agentId||context.owner!==FIRST_BUY.owner||context.agentWallet!==FIRST_BUY.agentWallet||
  body?.direction!==FIRST_BUY.direction||body.inputMint!==FIRST_BUY.inputMint||body.outputMint!==FIRST_BUY.outputMint||body.inputAmount!==FIRST_BUY.inputAmount||
  !Number.isSafeInteger(body.slippageBps)||body.slippageBps<0||body.slippageBps>100||adapterKind!==FIRST_BUY.venue||
  (body.pool!==undefined&&body.pool!==FIRST_BUY.pool)||(body.venue!==undefined&&body.venue!==FIRST_BUY.venue)||
  !firstBuyAcceptanceAvailable(history,body.requestKey))reject('REJECT_ACCEPTANCE_POLICY');
 return true;
}
