import {readBoundPumpDecision} from './pump-bound-decision.js';
import {digest,integer,reject} from './intent.js';

// DI composition for the existing preparation coordinator and executor. No
// worker loop, execution claim, wallet, signer or sender is exposed here.
export function createBoundPumpDecisionPorts({consents,reservations,readOwnerContext,readInputs,source='BACKEND_RPC_READ',now=Date.now}={}) {
  if(typeof consents?.read!=='function'||typeof reservations?.budgetAvailability!=='function'||typeof readOwnerContext!=='function'||typeof readInputs!=='function')reject('PUMP_DECISION_DEPENDENCIES');
  const decisions=new Map();
  const budgetRequest=(a,extra={})=>({authorizationId:a.id,authorizationRevision:a.revision,authorizationDigest:a.digest,owner:a.owner,agentId:a.agentId,wallet:a.wallet,mint:a.mint,network:a.network,messageHash:'0'.repeat(64),maxDebitLamports:'0',tradeInputLamports:'0',...extra});
  return Object.freeze({
    async readDecision(actor,agentId) {
      const ctx=structuredClone(await readOwnerContext(actor,agentId));
      if(ctx?.authenticated!==true||ctx.agentId!==agentId)reject('PUMP_DECISION_OWNER');
      const a=consents.read(ctx).authorization;
      const inputs=structuredClone(await readInputs(actor,agentId));
      // The read commits the clock checkpoint outside any reservation lock.
      const current=consents.read(ctx).authorization;
      if(current.digest!==a.digest)reject('PUMP_DECISION_CONSENT_CHANGED');
      if(inputs?.binding?.owner!==ctx.owner||inputs.binding.agentId!==agentId)reject('PUMP_DECISION_BINDING');
      const budget=reservations.budgetAvailability(budgetRequest(a));
      const result=readBoundPumpDecision({...inputs,authorization:a,budget},{source,now:now()});
      if(result.state==='PREPARE'){
        const {requestKey,...intent}=result.intent;
        decisions.set(digest(intent),{ownerContext:ctx,authorizationDigest:a.digest,expiresAt:intent.expiresAt,feeCapLamports:inputs.capital.feeCapLamports,rentCapLamports:inputs.capital.rentCapLamports});
        if(decisions.size>128)decisions.delete(decisions.keys().next().value);
      }
      return result;
    },
    deriveBudget({intent,plan,context}) {
      const decision=decisions.get(digest(intent));
      if(!decision||decision.expiresAt<=now())reject('PUMP_DECISION_PROOF_REQUIRED');
      const a=consents.read(decision.ownerContext).authorization;
      if(a.digest!==decision.authorizationDigest||context?.owner!==a.owner||context.agentId!==a.agentId||context.agentWallet!==a.wallet||intent.agentWallet!==a.wallet||intent.owner!==a.owner||intent.agentId!==a.agentId||intent.network!==a.network||!a.actions.includes(intent.side))reject('PUMP_DECISION_CONSENT_CHANGED');
      if(plan.venueKind!=='PUMP_BONDING_CURVE'||a.venue!=='PUMP_BONDING_CURVE_V1'||intent.slippageBps>a.slippageBps||integer(plan.feeCapLamports,{zero:true})>integer(a.networkFeeCapLamports)||integer(plan.feeCapLamports,{zero:true})>integer(decision.feeCapLamports,{zero:true})||integer(plan.rentCapLamports,{zero:true})>integer(decision.rentCapLamports,{zero:true})||integer(plan.risk?.protectedLamports)<integer(a.protectedReserveLamports))reject('PUMP_DECISION_POLICY_CHANGED');
      const input=intent.side==='BUY'?integer(intent.inputAmount):0n;
      return budgetRequest(a,{messageHash:plan.messageHash,maxDebitLamports:(input+integer(plan.feeCapLamports,{zero:true})+integer(plan.rentCapLamports,{zero:true})).toString(),tradeInputLamports:input.toString()});
    }
  });
}
