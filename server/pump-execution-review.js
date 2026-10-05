import {createHash} from 'node:crypto';
import {executionReviewBinding} from '../src/pump-execution-binding.js';
import {assertAgentLaunch} from '../src/agent-launch-data.js';
import {NETWORKS} from '../src/networks.js';
import {GENESIS} from '../src/pump-readiness.js';
import {PublicKey,Transaction} from '@solana/web3.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {readAtMinimumContext} from './pump-context-rpc.js';
import {atomicExecutionEffects,canonicalExecutionStructure} from './pump-atomic-effects.js';
import {feeComponents} from '../src/pump-fee-policy.js';
export const EXECUTION_POLICY=Object.freeze({version:1,ceilingLamports:10000000,minimumReserveLamports:NETWORKS.MAINNET.reserveLamports,ttlMs:30000});
const fail=code=>Object.assign(Error(code),{code,status:409});
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const digest=result=>createHash('sha256').update(executionReviewBinding(result)).digest('hex');
export function contextSlot(response,minimum=0){const slot=response?.context?.slot;if(!valid(slot)||slot<minimum)throw fail('EXECUTION_CONTEXT_STALE');return slot;}
// Application budget, never a claim of an absolute Pump/on-chain debit bound.
export function createExecutionReview(result,{before,afterRead,simulation,feeResponse,latestResponse,validity,startedAt,now=Date.now()}){
 const p=result.policy,ceiling=EXECUTION_POLICY.ceilingLamports,reserve=EXECUTION_POLICY.minimumReserveLamports;
 if(!valid(startedAt)||!valid(now)||now<startedAt||now-startedAt>=EXECUTION_POLICY.ttlMs)throw fail('EXECUTION_REVIEW_EXPIRED');
 if(result.launch.initialBuyLamports!==0||p.initialBuyLamports!==0)throw fail('EXECUTION_ZERO_BUY_REQUIRED');
 const latestSlot=contextSlot(latestResponse),feeSlot=contextSlot(feeResponse,latestSlot),balanceSlot=contextSlot(before,feeSlot),simulationSlot=contextSlot(simulation,balanceSlot),postSlot=contextSlot(afterRead,simulationSlot),validitySlot=contextSlot(validity,postSlot);
 if(latestResponse.value?.blockhash!==result.recentBlockhash||latestResponse.value?.lastValidBlockHeight!==result.lastValidBlockHeight)throw fail('EXECUTION_BLOCKHASH_CONTEXT_CHANGED');
 if(validity.value!==true||!valid(result.lastValidBlockHeight))throw fail('EXECUTION_BLOCKHASH_EXPIRED');
 if(!p.allowed||result.simulation.status!=='PASS'||simulation.value?.err!==null||!Array.isArray(simulation.value.innerInstructions))throw fail('EXECUTION_SIMULATION_REJECTED');
 const decodedPolicy=evaluateSimulation(Buffer.from(result.transactionBase64,'base64'),{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch,feePolicy:result.feePolicy??null},{before,afterRead,simulation,fee:feeResponse.value});
 if(!decodedPolicy.allowed||decodedPolicy.validatedOverheadLamports!==p.validatedOverheadLamports||decodedPolicy.estimatedPayerDebitLamports!==p.estimatedPayerDebitLamports)throw fail('EXECUTION_SIMULATION_REJECTED');
 const observed=before.value?.[5]?.lamports,afterObserved=afterRead.value?.[5]?.lamports,post=simulation.value.accounts?.[5]?.lamports;
 const payerBefore=before.value?.[5],payerAfter=afterRead.value?.[5],payerPost=simulation.value.accounts?.[5];
 const payerState=a=>JSON.stringify({owner:a?.owner,executable:a?.executable,data:a?.data});
 if(!valid(observed)||observed!==afterObserved||!valid(post)||[payerBefore,payerAfter,payerPost].some(a=>a?.owner!=='11111111111111111111111111111111'||a.executable!==false)||payerState(payerBefore)!==payerState(payerAfter)||payerState(payerBefore)!==payerState(payerPost))throw fail('EXECUTION_PAYER_CONTEXT_CHANGED');
 const fee=p.baseFeeLamports+(p.priorityFeeLamports??0),decoded=p.validatedOverheadLamports,estimate=p.estimatedPayerDebitLamports;
 if(p.baseFeeLamports!==decodedPolicy.baseFeeLamports||(p.priorityFeeLamports??0)!==decodedPolicy.priorityFeeLamports||result.feePolicy&&p.networkFeeLamports!==fee)throw fail('EXECUTION_FEE_COMPONENTS_CHANGED');
 if(!valid(fee)||feeResponse.value!==fee||!valid(decoded)||decoded!==estimate||observed-post!==decoded)throw fail('EXECUTION_DEBIT_NOT_RECONCILED');
 if(decoded>ceiling)throw fail('EXECUTION_DEBIT_EXCEEDS_CEILING');
 if(!valid(p.minimumRentExemptionLamports)||!Array.isArray(p.rentAccounts)||p.rentAccounts.length===0||p.rentAccounts.some(a=>!valid(a.minimumRentExemptionLamports)||!valid(a.fundedLamports)||a.fundedLamports<a.minimumRentExemptionLamports))throw fail('EXECUTION_RENT_UNPROVEN');
 const atomicEffects=atomicExecutionEffects(result,{simulation,feeResponse,before,afterRead},decodedPolicy);
 const floor=observed-ceiling;if(!valid(floor)||floor<reserve||post<floor)throw fail('EXECUTION_BALANCE_FLOOR_VIOLATION');
 const review={version:1,status:'FRESH_EXECUTION_REVIEW',guaranteeClass:'EXECUTION_GUARDED',authorizationGranted:false,startedAt,expiresAt:startedAt+EXECUTION_POLICY.ttlMs,observedBalanceLamports:observed,balanceContextSlot:balanceSlot,blockhashContextSlot:latestSlot,feeContextSlot:feeSlot,simulationSlot,postReadSlot:postSlot,validitySlot,reviewedDebitLamports:decoded,networkFeeLamports:fee,otherRequiredDebitLamports:decoded-fee,minimumRentExemptionLamports:p.minimumRentExemptionLamports,initialBuyLamports:0,priorityFeeLamports:decodedPolicy.priorityFeeLamports,...(result.feePolicy?{baseFeeLamports:decodedPolicy.baseFeeLamports,feeModel:result.feePolicy.model,maximumPriorityFeeLamports:result.feePolicy.maximumPriorityFeeLamports}:{}),reviewedMaximumDebitLamports:ceiling,ceilingLamports:ceiling,minimumReserveLamports:reserve,requiredRemainingBalanceLamports:floor,expectedRemainingBalanceLamports:observed-decoded,budgetHeadroomLamports:ceiling-decoded,absoluteOnchainMaximumLamports:null,policySource:'M3.1 total ceiling; NETWORKS.MAINNET.reserveLamports',limitations:'Application budget enforced against fresh decoded simulation. Pump has no on-chain maximum debit argument; a new context, message or economic change requires another review.'};
 review.atomicBalanceEvidence={source:'SIMULATION_BANK',slot:simulationSlot,feeLamports:simulation.value.fee,accounts:atomicEffects};
 const bound={...result,executionReview:review};review.digest=digest(bound);return review;
}
export function assertExecutionReview(result,identity,{now=Date.now()}={}){
 const structure=canonicalExecutionStructure(result);
 const r=result.executionReview;assertAgentLaunch(identity,result.launch);
 if(!r||r.guaranteeClass!=='EXECUTION_GUARDED'||r.authorizationGranted!==false||r.status!=='FRESH_EXECUTION_REVIEW'||r.ceilingLamports!==EXECUTION_POLICY.ceilingLamports||r.reviewedMaximumDebitLamports!==r.ceilingLamports||r.minimumReserveLamports!==EXECUTION_POLICY.minimumReserveLamports||r.absoluteOnchainMaximumLamports!==null||!valid(r.reviewedDebitLamports)||r.reviewedDebitLamports>r.ceilingLamports||!valid(r.requiredRemainingBalanceLamports)||r.requiredRemainingBalanceLamports<r.minimumReserveLamports)throw fail('EXECUTION_REVIEW_INVALID');
 if(!valid(now)||!valid(r.startedAt)||!valid(r.expiresAt)||now<r.startedAt||now>=r.expiresAt||r.expiresAt!==r.startedAt+EXECUTION_POLICY.ttlMs)throw fail('EXECUTION_REVIEW_EXPIRED');
 const slots=['blockhashContextSlot','feeContextSlot','balanceContextSlot','simulationSlot','postReadSlot','validitySlot'].map(k=>r[k]);if(slots.some((s,i)=>!valid(s)||(i>0&&s<slots[i-1])))throw fail('EXECUTION_CONTEXT_STALE');
 if(!valid(r.observedBalanceLamports)||r.requiredRemainingBalanceLamports!==r.observedBalanceLamports-r.ceilingLamports||r.expectedRemainingBalanceLamports!==r.observedBalanceLamports-r.reviewedDebitLamports||r.budgetHeadroomLamports!==r.ceilingLamports-r.reviewedDebitLamports||r.networkFeeLamports+r.otherRequiredDebitLamports!==r.reviewedDebitLamports||result.policy.estimatedPayerDebitLamports!==r.reviewedDebitLamports||result.policy.validatedOverheadLamports!==r.reviewedDebitLamports||result.policy.baseFeeLamports+(result.policy.priorityFeeLamports??0)!==r.networkFeeLamports||result.launch.initialBuyLamports!==0)throw fail('EXECUTION_REVIEW_INVALID');
 const components=feeComponents(structure,r.networkFeeLamports);
 if(result.policy.baseFeeLamports!==components.baseFeeLamports||(result.policy.priorityFeeLamports??0)!==components.priorityFeeLamports||r.priorityFeeLamports!==components.priorityFeeLamports||result.feePolicy&&(r.baseFeeLamports!==components.baseFeeLamports||r.feeModel!==result.feePolicy.model||r.maximumPriorityFeeLamports!==result.feePolicy.maximumPriorityFeeLamports||result.policy.networkFeeLamports!==components.networkFeeLamports))throw fail('EXECUTION_FEE_COMPONENTS_CHANGED');
 if(digest(result)!==r.digest)throw fail('EXECUTION_REVIEW_MUTATED');return r;
}
// Future wallet-review boundary must pass the persisted, trusted result and exact
// reviewed request. A client-generated replacement digest is never authoritative.
// Returning this validation still grants NO signing or broadcasting capability.
export function assertReviewedExecutionRequest(result,identity,{requestId,reviewDigest,transactionBase64,now=Date.now()}={}){
 const review=assertExecutionReview(result,identity,{now});
 if(requestId!==result.id||reviewDigest!==review.digest||transactionBase64!==result.transactionBase64)throw fail('EXECUTION_REQUEST_CHANGED_REPREPARE');
 return {requestId,reviewDigest,transactionBase64,authorizationGranted:false};
}
// Revalidate at the immediate wallet-review boundary using the SAME reviewed
// unsigned bytes. No wallet callback exists. Any change requires a new preparation
// and review; caller must never rewrite the accepted digest or swap a blockhash.
export async function revalidateExecutionReview(result,identity,request,{transport,now=Date.now}={}){
 assertReviewedExecutionRequest(result,identity,{...request,now:now()});
 if(typeof transport?.rpc!=='function')throw fail('EXECUTION_TRANSPORT_REQUIRED');
 const startedAt=now(),rpc=(method,params)=>readAtMinimumContext(transport,method,params),bytes=Buffer.from(result.transactionBase64,'base64'),tx=Transaction.from(bytes),addresses=result.structure.accounts.map(a=>a.address),minimum=result.executionReview.validitySlot;
 if(await rpc('getGenesisHash',[])!==GENESIS)throw fail('EXECUTION_WRONG_MAINNET');
 const latestResponse=await rpc('getLatestBlockhash',[{commitment:'finalized',minContextSlot:minimum}]);contextSlot(latestResponse,minimum);
 if(latestResponse.value.blockhash!==result.recentBlockhash||latestResponse.value.lastValidBlockHeight!==result.lastValidBlockHeight)throw fail('EXECUTION_BLOCKHASH_CONTEXT_CHANGED');
 const feeResponse=await rpc('getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized',minContextSlot:contextSlot(latestResponse)}]);
 const before=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:contextSlot(feeResponse,contextSlot(latestResponse))}]);
 const simulation=await rpc('simulateTransaction',[result.transactionBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:contextSlot(before,contextSlot(feeResponse)),innerInstructions:true,accounts:{encoding:'base64',addresses}}]);
 const afterRead=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:contextSlot(simulation,contextSlot(before))}]);
 const policy=evaluateSimulation(bytes,{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch,feePolicy:result.feePolicy??null},{before,afterRead,simulation,fee:feeResponse.value});
 if(!policy.allowed||feeResponse.value!==result.executionReview.networkFeeLamports||policy.validatedOverheadLamports!==result.executionReview.reviewedDebitLamports||policy.estimatedPayerDebitLamports!==result.executionReview.reviewedDebitLamports||before.value[5]?.lamports!==result.executionReview.observedBalanceLamports)throw fail('EXECUTION_COST_CHANGED_REPREPARE');
 for(const account of result.policy.rentAccounts){const rent=await rpc('getMinimumBalanceForRentExemption',[account.dataLength,{commitment:'finalized'}]);if(rent!==account.minimumRentExemptionLamports)throw fail('EXECUTION_RENT_CHANGED_REPREPARE');}
 const validity=await rpc('isBlockhashValid',[result.recentBlockhash,{commitment:'finalized',minContextSlot:contextSlot(afterRead,contextSlot(simulation))}]);
 const fresh={...result,policy:{...result.policy,accountEffects:policy.accountEffects.map(a=>({name:a.name,writable:a.writable,deltaLamports:a.deltaLamports}))},simulation:{...result.simulation,status:simulation.value.err===null?'PASS':'FAIL'}};
 createExecutionReview(fresh,{before,afterRead,simulation,feeResponse,latestResponse,validity,startedAt,now:now()});
 assertReviewedExecutionRequest(result,identity,{...request,now:now()});
 // A still-valid reviewed request passes only after this fresh simulation. This
// result remains unsigned evidence, not economic authorization.
 return {requestId:result.id,reviewDigest:result.executionReview.digest,freshSimulationSlot:simulation.context.slot,checkedAt:now(),authorizationGranted:false};
}
