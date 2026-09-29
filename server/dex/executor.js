import bs58 from 'bs58';
import {canonicalIntent,digest,evaluateControlledRisk,integer,signedInteger,reject,DEFAULT_RISK_POLICY} from './intent.js';
import {assertQuoteFresh} from './quote.js';
import {validateDexTransaction} from './transaction-validator.js';
import {authorizeRealExecution,issueConfirmationCapability,EXECUTION_MODES} from './authorization.js';
import {classifyQuoteFailure} from './quote-diagnostics.js';

// Dependency boundary: production supplies NO route adapter/signer/broadcaster.
// Fixture adapters exercise this orchestration, but cannot certify a Jupiter ABI.
export function createControlledExecutor({ledger,provider,adapter,authorize,flags,oneShot,now=Date.now,riskPolicy=DEFAULT_RISK_POLICY,requireSimulation=false,reviewLifetimeMs=30000}){
 const context=async actor=>{const c=await authorize(actor);if(!c?.authenticated||!c.owner||!c.agentWallet)reject('OWNER_AUTH_REQUIRED');return c;};
 const owned=async(actor,id)=>{const c=await context(actor),r=ledger.get(id);if(!r||r.intent.owner!==c.owner||r.intent.agentId!==c.agentId||r.intent.agentWallet!==c.agentWallet)reject('EXECUTION_OWNERSHIP_MISMATCH');return {c,r};};
 const gate=(c,r,phase='PREPARE',approval)=>{if(!adapter)reject('UNVERIFIED_ROUTE_ADAPTER');return authorizeRealExecution({mode:EXECUTION_MODES.CONTROLLED_REAL,flags:flags(),context:c,record:r,phase,confirmation:approval,reservation:phase==='CONFIRM'?ledger.reservation(r.id):undefined,now});};
 const quoteMatches=(r)=>{assertQuoteFresh(r.quote,now());if(r.intent.expiresAt<=now())reject('INTENT_EXPIRED');if(r.quoteDigest!==digest(r.quote))reject('QUOTE_MUTATION');for(const k of ['inputMint','outputMint','inputAmount','slippageBps'])if(r.quote[k]!==r.intent[k])reject('QUOTE_INTENT_MISMATCH');if(integer(r.quote.minimumOutput)>integer(r.quote.estimatedOutput)||integer(r.quote.minimumOutput)<integer(r.quote.estimatedOutput)*BigInt(10000-r.intent.slippageBps)/10000n)reject('SLIPPAGE_VIOLATION');};
 const policy=async(r)=>({...await adapter.validationPolicy(r),intent:r.intent,quote:r.quote,blockhash:r.blockhash,expectedMessageHash:r.messageHash});
 const armChecks=async(actor,id)=>{
  if(!oneShot)reject('ONE_SHOT_ARMING_UNAVAILABLE');
  const {c,r}=await owned(actor,id);gate(c,r);
  if(r.status!=='PREPARED'||r.signature||r.broadcastAttemptedAt)reject('ONE_SHOT_RECORD_INVALID');
  if(requireSimulation&&(!r.simulation?.success||r.simulation.messageHash!==r.messageHash))reject('UNSIMULATED_MESSAGE');
  quoteMatches(r);
  if(r.capabilityExpiresAt<=now()||r.risk?.expiresAt<=now())reject('CONFIRMATION_EXPIRED');
  if(await adapter.blockHeight()>r.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
  const reservation=ledger.reservation(id);
  if(reservation?.operationId!==`dex:${id}`||reservation.status!=='PREPARED'||reservation.intentHash!==r.fingerprint||reservation.signature||reservation.resources?.length!==1||reservation.resources[0].wallet!==r.intent.agentWallet)reject('ONE_SHOT_RESERVATION_MISMATCH');
  const snapshot=await adapter.snapshot(r),risk=evaluateControlledRisk(r.intent,snapshot,riskPolicy,now());
  if(risk.policyVersion!==r.risk.policyVersion||snapshot.networkFeeLamports!==r.review.networkFeeLamports||snapshot.ataRentLamports!==r.review.ataRentLamports||(snapshot.netRentLamports??snapshot.ataRentLamports)!==r.review.netRentLamports||risk.reserveAfterLamports!==r.review.reserveAfterLamports)reject('REVIEW_ECONOMICS_CHANGED');
  const decoded=validateDexTransaction(r.transaction,await policy(r));
  if(decoded.messageBytes.toString('base64')!==r.message||decoded.messageHash!==r.messageHash||r.risk.intentHash!==digest(r.intent))reject('MESSAGE_OR_RISK_MUTATION');
  await adapter.assertCustody(r.intent);await owned(actor,id);gate(c,r);quoteMatches(r);
  if(r.capabilityExpiresAt<=now()||risk.expiresAt<=now()||await adapter.blockHeight()>r.lastValidBlockHeight)reject('ARMING_EXPIRED');
  return {r,reservation};
 };
 return {
  async quote(actor,body){
   const c=await context(actor),canonical=canonicalIntent(body,c,now(),reviewLifetimeMs);
   const reservation=ledger.reserve(canonical);if(reservation.existing)return reservation.record;
   const r=reservation.record;
   try{const q=await provider.quote(r.intent);const candidate={...r,quote:q,quoteDigest:digest(q)};quoteMatches(candidate);return ledger.transition(r.id,['QUOTED'],'QUOTED',{quote:q,quoteDigest:candidate.quoteDigest});}
   catch(e){ledger.transition(r.id,['QUOTED'],'REJECTED_BEFORE_SIGNING',{reason:'QUOTE_UNAVAILABLE',quoteDiagnostic:{...classifyQuoteFailure(e),pool:r.intent.pool??'7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny',inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAmount:r.intent.inputAmount,observedAt:now()}});throw e;}
  },
  async prepare(actor,id){
   const {c,r}=await owned(actor,id);gate(c,r);if(r.status!=='QUOTED')return r;
   ledger.transition(id,['QUOTED'],'PREPARING',{preparingAt:now()});
   try{
    quoteMatches(r);
    let pre=null;
    if(typeof adapter.reservePlan==='function'){
     if(typeof adapter.buildReserved!=='function')reject('RESERVED_BUILD_UNAVAILABLE');
     pre=await adapter.reservePlan(r);
     const preRisk=evaluateControlledRisk(r.intent,pre.snapshot,riskPolicy,now());
     ledger.transition(id,['PREPARING'],'PREPARING',{risk:preRisk,review:{networkFeeLamports:pre.snapshot.networkFeeLamports,ataRentLamports:pre.snapshot.ataRentLamports,netRentLamports:pre.snapshot.netRentLamports??pre.snapshot.ataRentLamports,reserveAfterLamports:preRisk.reserveAfterLamports}});
     const hold=ledger.reservation(id);
     if(hold?.operationId!==`dex:${id}`||hold.intentHash!==r.fingerprint||hold.status!=='PREPARING')reject('RESERVATION_MISMATCH');
    }
    const plan=pre?await adapter.buildReserved(r,pre):await adapter.build(r);
    if(!plan?.transaction||!Number.isSafeInteger(plan.lastValidBlockHeight)||!plan.blockhash)reject('INVALID_PLAN');
    const pending={...r,blockhash:plan.blockhash,lastValidBlockHeight:plan.lastValidBlockHeight,validationPolicy:plan.validationPolicy,stateDigest:plan.stateDigest,transaction:plan.transaction};
    const snapshot=await adapter.snapshot(pending),risk=evaluateControlledRisk(r.intent,snapshot,riskPolicy,now());
    // Production already holds the fee cap before build; this transition
    // records the actual fee without reducing the immutable held amount.
    ledger.transition(id,['PREPARING'],'PREPARING',{risk,review:{networkFeeLamports:snapshot.networkFeeLamports,ataRentLamports:snapshot.ataRentLamports,netRentLamports:snapshot.netRentLamports??snapshot.ataRentLamports,reserveAfterLamports:risk.reserveAfterLamports}});
    const decoded=validateDexTransaction(plan.transaction,await policy(pending));
    let simulation=null;
    if(requireSimulation){
     if(typeof adapter.simulateUnsigned!=='function')reject('UNSIGNED_SIMULATION_REQUIRED');
     if(await adapter.blockHeight()>plan.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
     simulation=await adapter.simulateUnsigned(pending,decoded);
     if(simulation?.success!==true||simulation.messageHash!==decoded.messageHash)reject('UNSIGNED_SIMULATION_FAILED');
     if(await adapter.blockHeight()>plan.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
     const after=validateDexTransaction(plan.transaction,await policy(pending));
     if(after.messageHash!==simulation.messageHash||!after.messageBytes.equals(decoded.messageBytes))reject('SIMULATED_MESSAGE_CHANGED');
    }
    await owned(actor,id);gate(c,r);quoteMatches(r);if(risk.expiresAt<=now())reject('RISK_EXPIRED');
    const prepared={...r,transaction:plan.transaction,blockhash:plan.blockhash,lastValidBlockHeight:plan.lastValidBlockHeight,validationPolicy:plan.validationPolicy,stateDigest:plan.stateDigest,snapshotSlot:plan.snapshotSlot,message:decoded.messageBytes.toString('base64'),messageHash:decoded.messageHash,pool:plan.pool,routePolicyVersion:plan.routePolicyVersion,risk,simulation,review:{networkFeeLamports:snapshot.networkFeeLamports,ataRentLamports:snapshot.ataRentLamports,netRentLamports:snapshot.netRentLamports??snapshot.ataRentLamports,reserveAfterLamports:risk.reserveAfterLamports},preparedAt:now()};
    const {token,...capability}=issueConfirmationCapability(prepared,{now,lifetimeMs:reviewLifetimeMs});
    const persisted=ledger.transition(id,['PREPARING'],'PREPARED',{transaction:prepared.transaction,blockhash:prepared.blockhash,lastValidBlockHeight:prepared.lastValidBlockHeight,validationPolicy:prepared.validationPolicy,stateDigest:prepared.stateDigest,snapshotSlot:prepared.snapshotSlot,message:prepared.message,messageHash:prepared.messageHash,pool:prepared.pool,routePolicyVersion:prepared.routePolicyVersion,risk,simulation,review:prepared.review,preparedAt:prepared.preparedAt,...capability});
    return {...persisted,confirmationToken:token};
   }catch(e){if(ledger.get(id)?.status==='PREPARING')ledger.transition(id,['PREPARING'],'REJECTED_BEFORE_SIGNING',{reason:'PREPARATION_REJECTED'});throw e;}
  },
  async arm(actor,id){
   const {r,reservation}=await armChecks(actor,id);
   return oneShot.stage(r,reservation);
  },
  async armEligibility(actor,id){
   try{await armChecks(actor,id);const armed=oneShot.status();if(armed?.status==='ARMED'||armed?.consumed)return {executionId:id,eligible:false,reason:'ONE_SHOT_UNAVAILABLE'};return {executionId:id,eligible:true,reason:null};}
   catch(e){return {executionId:id,eligible:false,reason:e.code??'ARM_UNAVAILABLE'};}
  },
  async confirm(actor,id,approval){
   const {c,r}=await owned(actor,id);gate(c,r);
   if(r.status!=='PREPARED')return r; // Never resend SIGNED, SUBMITTED or UNKNOWN.
   if(r.capabilityExpiresAt<=now()||r.quote?.expiresAt<=now()||r.intent.expiresAt<=now()){
    const expired=ledger.transition(id,['PREPARED'],'EXPIRED',{reason:'CONFIRMATION_EXPIRED'});oneShot?.settle(expired);
    reject('CONFIRMATION_EXPIRED');
   }
   gate(c,r,'CONFIRM',{token:approval?.confirmationToken});
   if(approval?.confirm!==true||approval.messageHash!==r.messageHash||approval.quoteReference!==r.quote.reference)reject('MANUAL_CONFIRMATION_REQUIRED');
   try{
    if(requireSimulation&&(!r.simulation?.success||r.simulation.messageHash!==r.messageHash))reject('UNSIMULATED_MESSAGE');
    quoteMatches(r);
    const snapshot=await adapter.snapshot(r),risk=evaluateControlledRisk(r.intent,snapshot,riskPolicy,now());
    if(risk.policyVersion!==r.risk.policyVersion||snapshot.networkFeeLamports!==r.review.networkFeeLamports||snapshot.ataRentLamports!==r.review.ataRentLamports||(snapshot.netRentLamports??snapshot.ataRentLamports)!==r.review.netRentLamports||risk.reserveAfterLamports!==r.review.reserveAfterLamports)reject('REVIEW_ECONOMICS_CHANGED');
    if(await adapter.blockHeight()>r.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
    const p=await policy(r),decoded=validateDexTransaction(r.transaction,p);
    if(decoded.messageBytes.toString('base64')!==r.message||r.risk.intentHash!==digest(r.intent))reject('MESSAGE_OR_RISK_MUTATION');
    await adapter.assertCustody(r.intent);await owned(actor,id);gate(c,r,'CONFIRM',{token:approval?.confirmationToken});quoteMatches(r);
    if(risk.expiresAt<=now())reject('RISK_EXPIRED');
    oneShot?.claim(r,ledger.reservation(id),approval);
    // Durable claim BEFORE the first signing boundary. Crash here remains UNKNOWN
    // and requires operator diagnosis; it never unlocks another submission.
    ledger.transition(id,['PREPARED'],'UNKNOWN',{reason:'SIGNING_CLAIMED',authorizedMessageHash:r.messageHash});
    let signed;
    try{
     signed=await adapter.signExactMessage(r,decoded);
     const verified=validateDexTransaction(signed,{...p,requireSignature:true});
     if(verified.messageBytes.toString('base64')!==r.message)reject('SIGNED_MESSAGE_MUTATION');
     const signature=bs58.encode(verified.transaction.signatures[0]);
     ledger.transition(id,['UNKNOWN'],'SIGNED',{signature,reason:null});
    }catch(e){const failed=ledger.transition(id,['UNKNOWN'],'FAILED',{reason:'SIGNATURE_OR_CUSTODY_REJECTED_BEFORE_BROADCAST'});oneShot?.settle(failed);throw e;}
    const current=ledger.get(id);
    // Signing does not authorize submission after revocation/expiry. Preserve the
    // signed intent for reconciliation, never sign or send a replacement.
    try{if(await adapter.blockHeight()>r.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');await owned(actor,id);gate(c,r);quoteMatches(r);if(risk.expiresAt<=now())reject('RISK_EXPIRED');}
    catch{ledger.transition(id,['SIGNED'],'UNKNOWN',{reason:'SIGNED_NOT_BROADCAST'});return ledger.get(id);}
    oneShot?.assertClaimed(r);
    ledger.transition(id,['SIGNED'],'SUBMITTED',{broadcastAttemptedAt:now()});
    try{const signature=await adapter.broadcastOnce(signed,{maxRetries:0,skipPreflight:false},r);if(signature!==current.signature)reject('BROADCAST_SIGNATURE_MISMATCH');}
    catch{ledger.transition(id,['SUBMITTED'],'UNKNOWN',{reason:'BROADCAST_OUTCOME_UNKNOWN'});}
    return ledger.get(id);
   }catch(e){if(ledger.get(id)?.status==='PREPARED'){const rejected=ledger.transition(id,['PREPARED'],'REJECTED_BEFORE_SIGNING',{reason:'PRE_BROADCAST_VALIDATION_REJECTED'});oneShot?.settle(rejected);}throw e;}
  },
  async reconcile(actor,id){
   const {r}=await owned(actor,id);if(!r.signature||!['SIGNED','SUBMITTED','UNKNOWN'].includes(r.status))return r;
   if(!adapter)reject('UNVERIFIED_ROUTE_ADAPTER');
   const chain=await adapter.readFinalized(r.signature,r);if(!chain)return r;
   if(chain.signature!==r.signature||chain.finalized!==true)reject('CHAIN_IDENTITY_MISMATCH');
   const decoded=validateDexTransaction(chain.transaction,{...await policy(r),requireSignature:true});
   if(bs58.encode(decoded.transaction.signatures[0])!==r.signature)reject('CHAIN_SIGNATURE_MISMATCH');
   if(chain.error){const fee=integer(chain.networkFeeLamports,{zero:true});if(fee>integer(r.review.networkFeeLamports)||!Number.isSafeInteger(chain.slot))reject('FAILED_RECEIPT_INVALID');const failed=ledger.recordFailure(id,{executionId:id,signature:r.signature,messageHash:decoded.messageHash,finalized:true,slot:chain.slot,networkFeeLamports:fee.toString(),failureReason:JSON.stringify(chain.error).slice(0,300),confirmedAt:now()});oneShot?.settle(failed);return failed;}
   const effects=await adapter.verifiedEffects(r,chain); // Must use RPC meta, not provider success.
   const input=integer(effects.actualInput),output=integer(effects.actualOutput),fee=integer(effects.networkFeeLamports,{zero:true}),rent=signedInteger(effects.rentLamports);
   if(input!==integer(r.intent.inputAmount)||output<integer(r.quote.minimumOutput)||fee!==integer(r.review.networkFeeLamports,{zero:true})||rent!==signedInteger(r.review.netRentLamports))reject('CHAIN_ECONOMICS_MISMATCH');
   const expectedSol=r.intent.direction==='BUY'?-input-fee-rent:output-fee-rent;
   const expectedToken=r.intent.direction==='BUY'?output:-input;
   if(effects.agentSolDelta!==expectedSol.toString()||effects.agentTokenDelta!==expectedToken.toString())reject('CHAIN_BALANCE_MISMATCH');
   if(!Number.isSafeInteger(chain.slot)||chain.slot<0)reject('INVALID_SLOT');
   const verifiedEffects=Object.fromEntries(['actualInput','actualOutput','networkFeeLamports','rentLamports','agentSolDelta','agentTokenDelta'].map(k=>[k,effects[k]]));
   const confirmed=ledger.confirm(id,{...verifiedEffects,executionId:id,signature:r.signature,finalized:true,messageHash:decoded.messageHash,slot:chain.slot,confirmedAt:now()});oneShot?.settle(confirmed);return confirmed;
  },
  async cancel(actor,id){const {r}=await owned(actor,id);if(!['QUOTED','PREPARED'].includes(r.status)||r.signature)reject('CANNOT_CANCEL_SIGNED_EXECUTION');const cancelled=ledger.transition(id,['QUOTED','PREPARED'],'FAILED',{reason:'Cancelled before signing'});oneShot?.settle(cancelled);return cancelled;},
  async expire(actor,id){
   const {r}=await owned(actor,id);
   if(!['QUOTED','PREPARING','PREPARED'].includes(r.status)||r.signature)return r;
   const expired=now()>=r.intent.expiresAt||now()>=r.quote?.expiresAt||now()>=r.capabilityExpiresAt||(r.lastValidBlockHeight!=null&&await adapter.blockHeight()>r.lastValidBlockHeight);
   if(!expired)return r;const next=ledger.transition(id,[r.status],'EXPIRED',{reason:'PREPARATION_EXPIRED'});oneShot?.settle(next);return next;
  }
 };
}
