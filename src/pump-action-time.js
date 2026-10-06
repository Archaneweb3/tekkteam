// Discriminated final package. Informational v1 reviews keep their original TTL.
export const ACTION_TIME_MODE='SOLANA_BLOCKHASH_V2';
export const MIN_WALLET_BLOCKS=50;
export function isActionTimePackage(result){return result?.executionReview?.version===2;}
export function assertActionTimePackage(result,now=Date.now()){
 const r=result?.executionReview;
 if(r?.version!==2||r.status!=='FINAL_WALLET_PREPARATION'||r.freshness!==ACTION_TIME_MODE||r.expiresAt!==null||result.expiresAt!==null||r.recentBlockhash!==result.recentBlockhash||r.lastValidBlockHeight!==result.lastValidBlockHeight||!Number.isSafeInteger(r.lastValidBlockHeight)||r.lastValidBlockHeight<1||!Number.isSafeInteger(r.startedAt)||!Number.isSafeInteger(r.preparedAt)||r.preparedAt<r.startedAt||r.preparedAt-r.startedAt>=30000||!Number.isSafeInteger(now)||now<r.startedAt)throw Object.assign(Error('Invalid action-time transaction package'),{code:'M4_ACTION_TIME_PACKAGE_INVALID',status:409});
 return r;
}
// Only the handoff observation has a short freshness bound. The owner's wallet
// decision is governed by the native blockhash, verified again before sending.
export function assertActionTimeHandoff(result,validity,now=Date.now()){
 const r=assertActionTimePackage(result,now);
 if(validity?.recentBlockhash!==r.recentBlockhash||validity?.lastValidBlockHeight!==r.lastValidBlockHeight||validity?.reviewDigest!==r.digest||validity?.commitment!=='finalized'||!Number.isSafeInteger(validity.height)||!Number.isSafeInteger(validity.checkedAt)||now<validity.checkedAt||now-validity.checkedAt>10000||validity.remainingBlocks!==r.lastValidBlockHeight-validity.height||validity.remainingBlocks<MIN_WALLET_BLOCKS)throw Object.assign(Error('Transaction needs a fresh blockhash check before opening the wallet'),{code:'M4_WALLET_BLOCKHASH_TOO_OLD',status:409});
 return validity.remainingBlocks;
}
