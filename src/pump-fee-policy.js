import {ComputeBudgetProgram} from '@solana/web3.js';

// M4 immutable-message policy. The mint secret is wiped before owner approval;
// adding a fee instruction afterwards would invalidate its stored signature.
export const M4_FEE_POLICY=Object.freeze({model:'DAPP_EXPLICIT_IMMUTABLE_V1',computeUnitLimit:200000,maximumPriorityFeeLamports:100000});
export const COMPUTE_BUDGET=ComputeBudgetProgram.programId.toBase58();
const invalid=()=>{throw Error('M4_FEE_POLICY_INVALID');};
export function priorityLamports(limit,price){
 if(!Number.isSafeInteger(limit)||limit<1||limit>1400000||!Number.isSafeInteger(price)||price<0)invalid();
 const value=(BigInt(limit)*BigInt(price)+999999n)/1000000n;
 if(value>BigInt(Number.MAX_SAFE_INTEGER))invalid();return Number(value);
}
export function assertFeePolicy(policy){
 if(!policy||Object.keys(policy).sort().join(',')!=='computeUnitLimit,computeUnitPriceMicroLamports,maximumPriorityFeeLamports,model,quoteSlot'||policy.model!==M4_FEE_POLICY.model||policy.computeUnitLimit!==M4_FEE_POLICY.computeUnitLimit||policy.maximumPriorityFeeLamports!==M4_FEE_POLICY.maximumPriorityFeeLamports||!Number.isSafeInteger(policy.quoteSlot)||policy.quoteSlot<0||priorityLamports(policy.computeUnitLimit,policy.computeUnitPriceMicroLamports)>policy.maximumPriorityFeeLamports)invalid();
 return policy;
}
export function selectFeePolicy(samples,minimumSlot){
 if(!Number.isSafeInteger(minimumSlot)||minimumSlot<0||!Array.isArray(samples)||!samples.length||samples.length>150)invalid();
 if(samples.some(s=>!Number.isSafeInteger(s?.slot)||s.slot<0||!Number.isSafeInteger(s.prioritizationFee)||s.prioritizationFee<0)||new Set(samples.map(s=>s.slot)).size!==samples.length)invalid();
 const latest=Math.max(...samples.map(s=>s.slot));if(latest<minimumSlot)throw Error('M4_PRIORITY_QUOTE_STALE');
 // Use the recent 20-slot window's 75th percentile, not Phantom's old UI number.
 const recent=samples.filter(s=>s.slot>=Math.max(minimumSlot,latest-19)).map(s=>s.prioritizationFee).sort((a,b)=>a-b);
 return assertFeePolicy({...M4_FEE_POLICY,computeUnitPriceMicroLamports:recent[Math.ceil(recent.length*.75)-1],quoteSlot:latest});
}
export function feeInstructions(policy){
 if(!policy)return [];assertFeePolicy(policy);
 return [ComputeBudgetProgram.setComputeUnitLimit({units:policy.computeUnitLimit}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:policy.computeUnitPriceMicroLamports})];
}
export function feeComponents(structure,networkFee){
 if(!Number.isSafeInteger(networkFee)||networkFee<0)invalid();
 const priority=structure.priorityFeeLamports??0,base=networkFee-priority;
 // This launch has exactly two signatures and no precompile instructions.
 if(structure.feePolicy&&base!==10000)throw Error('M4_RPC_FEE_COMPONENT_MISMATCH');
 if(base<0)invalid();return {networkFeeLamports:networkFee,baseFeeLamports:base,priorityFeeLamports:priority};
}
