import {DEFAULT_RISK_POLICY,reject} from './intent.js';
import {cpmmReviewFromExecution,CONTROLLED_USDC_MINT} from './cpmm-mainnet-state.js';

// Pure projection of persisted state. It never refreshes a quote, extends an
// expiry, builds a transaction, or changes an execution/reservation.
export function formatControlledExecution(r){
 const review=r.status!=='EXPIRED'&&r.validationPolicy?.envelope&&r.risk?cpmmReviewFromExecution(r):null;
 const mint=r.validationPolicy?.snapshot?.accounts?.find(a=>a.address===CONTROLLED_USDC_MINT);
 const decimals=mint?Buffer.from(mint.data,'base64')[44]:null;
 if(review&&decimals!==6)reject('USDC_DECIMALS_UNVERIFIED');
 return {id:r.id,requestKey:r.requestKey,status:r.status,reason:r.reason??null,quoteDiagnostic:r.quoteDiagnostic??null,agentId:r.intent.agentId,mode:r.intent.mode,direction:r.intent.direction,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAmount:r.intent.inputAmount,slippageBps:r.intent.slippageBps,pool:r.pool??null,estimatedOutput:r.quote?.estimatedOutput??null,minimumOutput:r.quote?.minimumOutput??null,usdcDecimals:decimals,quoteReference:r.quote?.reference??null,messageHash:r.messageHash??null,preparedAt:r.preparedAt??null,expiresAt:Math.min(r.capabilityExpiresAt??Infinity,r.quote?.expiresAt??Infinity,r.intent.expiresAt),blockhash:r.blockhash??null,lastValidBlockHeight:r.lastValidBlockHeight??null,networkFeeLamports:r.review?.networkFeeLamports??null,networkFeeCapLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports,ataRentLamports:r.review?.ataRentLamports??null,protectedReserveLamports:r.risk?DEFAULT_RISK_POLICY.minReserveLamports:null,futureSellFeeReserveLamports:DEFAULT_RISK_POLICY.futureSellFeeLamports,safetyMarginLamports:DEFAULT_RISK_POLICY.reconciliationMarginLamports,expectedPeakRemainingLamports:r.review?.reserveAfterLamports??null,signature:r.signature??null,review};
}
