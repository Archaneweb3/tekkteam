import {integer,DEFAULT_RISK_POLICY} from './intent.js';

// Read-only arithmetic for the observed canonical two-ATA native route. This
// does not select a minimum trade size or grant execution/funding authorization.
export function observeCapitalRequirement(snapshot,{hypotheticalInputLamports=null}={}){
 if(snapshot?.network!=='solana:mainnet'||snapshot.tokenAccountsVerified!==true||!Array.isArray(snapshot.accounts)||snapshot.accounts.length!==2||new Set(snapshot.accounts.map(a=>a.address)).size!==2||snapshot.accounts.some(a=>typeof a.exists!=='boolean'))throw Error('UNVERIFIED_ACCOUNT_COST');
 const balance=integer(snapshot.solBalanceLamports,{zero:true}),rentEach=integer(snapshot.rentPerAccountLamports),missing=snapshot.accounts.filter(a=>!a.exists).length;
 const rent=BigInt(missing)*rentEach;if(rent!==integer(snapshot.ataRentLamports,{zero:true}))throw Error('PEAK_RENT_MISMATCH');
 const p=DEFAULT_RISK_POLICY,protectedReserve=integer(p.minReserveLamports)+integer(p.futureSellFeeLamports)+integer(p.reconciliationMarginLamports),feeCap=integer(p.maxNetworkFeeLamports),base=protectedReserve+rent+feeCap;
 const input=hypotheticalInputLamports===null?null:integer(hypotheticalInputLamports);
 const capacity=balance>base?balance-base:0n,cap=integer(p.maxBuyLamports);
 return {observationOnly:true,executionAllowed:false,routeProven:false,currentAgentBalanceLamports:balance.toString(),protectedReserveLamports:protectedReserve.toString(),safetyMarginIncludedLamports:p.reconciliationMarginLamports,missingAtaCount:missing,accountCreationCostLamports:rent.toString(),maxNetworkCostLamports:feeCap.toString(),capitalBeforeInputLamports:base.toString(),maximumPolicyInputLamports:(capacity>cap?cap:capacity).toString(),minimumSafeTestInputLamports:null,minimumRequiredAgentBalanceLamports:null,additionalSolRequiredLamports:null,reason:'NO_PROVEN_ROUTE_OR_MINIMUM_EXECUTABLE_INPUT',hypothetical:input===null?null:{inputLamports:input.toString(),conditionalRequiredBalanceLamports:(base+input).toString(),conditionalAdditionalLamports:(base+input>balance?base+input-balance:0n).toString(),isSafeInputClaim:false}};
}
