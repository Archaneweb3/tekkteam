import {GENESIS} from '../../src/pump-readiness.js';
import {reject} from './intent.js';

const height=value=>Number.isSafeInteger(value)&&value>=0;
const fresh=(value,now)=>Number.isSafeInteger(value)&&Number.isSafeInteger(now)&&value<=now&&now-value<=5000;

// getBlockHeight has no response context slot. minContextSlot here is the
// constraint sent to the trusted reader, never an invented response context.
export function checkPumpNativeValidity(validity,{source,blockhash,snapshotSlot,now,current}={}){
 const expected=source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE';
 if(!validity||validity.source!==expected||validity.genesis!==GENESIS||validity.commitment!=='finalized'||validity.blockhash!==blockhash||
  !height(validity.lastValidBlockHeight)||!height(validity.currentBlockHeight)||!height(validity.blockhashContextSlot)||
  validity.blockhashContextSlot<snapshotSlot||validity.minContextSlot!==validity.blockhashContextSlot||!Number.isSafeInteger(validity.checkedAt))reject('PUMP_NATIVE_VALIDITY_INVALID');
 if(validity.currentBlockHeight>validity.lastValidBlockHeight)reject('PUMP_NATIVE_BLOCKHASH_EXPIRED');
 if(!current){if(!fresh(validity.checkedAt,now))reject('PUMP_NATIVE_VALIDITY_STALE');return;}
 if(current.source!==expected||current.genesis!==GENESIS||current.commitment!=='finalized'||current.minContextSlot!==validity.minContextSlot||current.blockhash!==blockhash||!height(current.blockhashValidationSlot)||current.blockhashValidationSlot<validity.minContextSlot||
  !height(current.currentBlockHeight)||current.currentBlockHeight<validity.currentBlockHeight||!fresh(current.checkedAt,now)||current.checkedAt<validity.checkedAt)reject('PUMP_NATIVE_HEIGHT_UNVERIFIED');
 if(current.currentBlockHeight>validity.lastValidBlockHeight)reject('PUMP_NATIVE_BLOCKHASH_EXPIRED');
 if(current.blockhashValid!==true)reject('PUMP_NATIVE_BLOCKHASH_INVALID');
}
