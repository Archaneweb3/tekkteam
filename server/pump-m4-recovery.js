import {GENESIS} from '../src/pump-readiness.js';
import {assertExecutionReview,contextSlot} from './pump-execution-review.js';
import {verifyM4Signed,m4Fail} from './pump-m4-guard.js';
// Exact separately authorized recovery; never a generic one-shot reset.
export const M4_EXPIRED_RECOVERY_ID='ee8dae70-e05c-4b06-a63e-d8b09a84b52f';
export async function proveM4ExpiredRecovery(record,identity,{transport,now=Date.now,unsigned=false}){
 const unsignedState=unsigned&&record.status==='AWAITING_WALLET_APPROVAL'&&!record.signature&&!record.signedTransactionBase64&&!record.signedDigest;
 if((!unsignedState&&(record.status!=='SIGNED_NOT_BROADCAST'||record.error!=='EXECUTION_REVIEW_EXPIRED'||!record.signature||!record.signedTransactionBase64))||record.broadcastAttempted!==false||record.submittedAt!=null||record.confirmation!=null||!record.walletApprovalOpened)throw m4Fail('M4_RECOVERY_STATE_DENIED');
 const r=record.result;assertExecutionReview(r,identity,{now:r.executionReview.startedAt});
 if(now()<r.executionReview.expiresAt)throw m4Fail('M4_RECOVERY_REVIEW_STILL_VALID');
 if(unsignedState)verifyM4Signed(record.walletTransactionBase64,record,false);
 else{const signed=verifyM4Signed(record.signedTransactionBase64,record,true);if(signed.signature!==record.signature||signed.signedDigest!==record.signedDigest)throw m4Fail('M4_RECOVERY_SIGNATURE_MISMATCH');}
 if(await transport.rpc('getGenesisHash',[])!==GENESIS)throw m4Fail('M4_WRONG_MAINNET');
 const minimum=r.executionReview.validitySlot;
 const validity=await transport.rpc('isBlockhashValid',[r.recentBlockhash,{commitment:'finalized',minContextSlot:minimum}]);
 const slot=contextSlot(validity,minimum);
 if(validity.value!==false)throw m4Fail('M4_RECOVERY_BLOCKHASH_STILL_VALID');
 const height=await transport.rpc('getBlockHeight',[{commitment:'finalized',minContextSlot:slot}]);
 if(!Number.isSafeInteger(height)||height<=r.lastValidBlockHeight)throw m4Fail('M4_RECOVERY_BLOCKHASH_STILL_VALID');
 if(!unsignedState){
  const statuses=await transport.rpc('getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}]);contextSlot(statuses,slot);
  if(!Array.isArray(statuses.value)||statuses.value.length!==1||statuses.value[0]!==null)throw m4Fail('M4_RECOVERY_SIGNATURE_OBSERVED');
  const landed=await transport.rpc('getTransaction',[record.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(landed!==null)throw m4Fail('M4_RECOVERY_TRANSACTION_OBSERVED');
 }
 // Signature-status context may be processed. Only a proven finalized slot anchors this read.
 const mint=await transport.rpc('getMultipleAccounts',[[r.mint],{encoding:'base64',commitment:'finalized',minContextSlot:slot}]);
 const mintSlot=contextSlot(mint,slot);
 if(!Array.isArray(mint.value)||mint.value.length!==1||mint.value[0]!==null)throw m4Fail('M4_RECOVERY_MINT_OBSERVED');
 return {network:'solana:101',genesis:GENESIS,checkedAt:now(),expiredExecutionId:record.executionId,oldSignature:record.signature??null,unsignedState,blockhash:r.recentBlockhash,lastValidBlockHeight:r.lastValidBlockHeight,finalizedHeight:height,finalizedSlot:mintSlot,signatureAbsent:unsignedState?'NO_SERVER_SIGNATURE':true,transactionAbsent:unsignedState?'EXPIRED_BLOCKHASH_AND_MINT_ABSENT':true,mintAbsent:true};
}
