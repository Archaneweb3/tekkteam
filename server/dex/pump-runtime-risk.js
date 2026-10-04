import {DEFAULT_RISK_POLICY,integer,reject,digest} from './intent.js';

export function evaluatePumpRuntimeRisk(intent,plan,policy=DEFAULT_RISK_POLICY,now=Date.now()){
 if(!Number.isSafeInteger(plan.observedAt)||plan.observedAt>now||now-plan.observedAt>policy.maxSnapshotAgeMs||intent.expiresAt<=now)reject('PUMP_RUNTIME_STALE_RISK');
 if(intent.slippageBps>policy.maxSlippageBps||integer(plan.feeCapLamports,{zero:true})>integer(policy.maxNetworkFeeLamports))reject('PUMP_RUNTIME_RISK_LIMIT');
 const amount=integer(intent.inputAmount),native=integer(plan.balances.native,{zero:true}),fee=integer(plan.feeCapLamports,{zero:true}),rent=integer(plan.rentCapLamports,{zero:true}),buy=intent.side==='BUY',swap=plan.venueKind==='PUMPSWAP';
 if(buy&&amount>integer(policy.maxBuyLamports))reject('PUMP_RUNTIME_TRADE_LIMIT');
 const protectedLamports=integer(policy.minReserveLamports)+integer(policy.futureSellFeeLamports)+integer(policy.reconciliationMarginLamports);
 const nativeDebit=fee+rent+(buy&&!swap?amount:0n);
 if(native<nativeDebit+protectedLamports)reject('PUMP_RUNTIME_NATIVE_RESERVE');
 if(buy&&swap&&integer(plan.balances.wsol,{zero:true})<amount||!buy&&integer(plan.balances.token,{zero:true})<amount)reject('PUMP_RUNTIME_ASSET_RESERVE');
 return {policyVersion:policy.version,reference:digest({intent,plan,policy}),checkedAt:now,expiresAt:Math.min(intent.expiresAt,plan.observedAt+policy.maxSnapshotAgeMs),protectedLamports:protectedLamports.toString(),nativeDebit:nativeDebit.toString(),nativeReserveAfter:(native-nativeDebit).toString(),source:plan.source,authorizationGranted:false};
}
