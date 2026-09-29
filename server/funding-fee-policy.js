// Conservative deterministic policy: explicit zero priority bid; no fee oracle fallback.
// Changes to these values require a new reviewed preparation, never a wallet override.
export const FUNDING_BUDGET=Object.freeze({fundingMessageVersion:1,computeUnitLimit:10000,computeUnitPrice:0});
export const FUNDING_CEILINGS=Object.freeze({computeUnitLimit:10000,computeUnitPrice:100000,priorityFeeLamports:1000,totalFeeLamports:10000});
export function fundingFees(r,totalFeeLamports){
 const {computeUnitLimit:units,computeUnitPrice:price}=r,c=FUNDING_CEILINGS;
 if(r.fundingMessageVersion!==1||!Number.isSafeInteger(units)||units<=0||units>c.computeUnitLimit||!Number.isSafeInteger(price)||price<0||price>c.computeUnitPrice)throw Error('Funding compute budget exceeds policy');
 const priorityFeeLamports=Number((BigInt(units)*BigInt(price)+999999n)/1000000n);
 if(priorityFeeLamports>c.priorityFeeLamports||!Number.isSafeInteger(totalFeeLamports)||totalFeeLamports<=priorityFeeLamports||totalFeeLamports>c.totalFeeLamports)throw Error('Funding fee unavailable or excessive');
 return {baseFeeLamports:totalFeeLamports-priorityFeeLamports,priorityFeeLamports,maxPriorityFeeLamports:priorityFeeLamports,feeLamports:totalFeeLamports,maxNetworkFeeLamports:totalFeeLamports};
}
