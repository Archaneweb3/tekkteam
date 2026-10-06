import bs58 from 'bs58';
import {authorizeAutonomousV1,resolveAutonomousVenue} from './autonomous-v1.js';
import {digest,evaluateAutonomousRisk,evaluateAcceptanceRisk,integer,signedInteger,reject,DEFAULT_RISK_POLICY} from './intent.js';
import {assertQuoteFresh} from './quote.js';
import {validateDexTransaction} from './transaction-validator.js';
import {assertMarketBinding} from './market-provenance.js';

const uncertain=new Set(['SIGNED','SUBMITTED','UNKNOWN']);
const canonical=i=>Object.fromEntries(['mode','network','agentId','owner','agentWallet','direction','inputMint','outputMint','inputAmount','slippageBps','pool','venue','acceptanceCycleId','exitReason','strategyResult','marketBinding','strategyVersion','strategyConfig'].filter(k=>i[k]!==undefined).map(k=>[k,i[k]]));

// Shared CPMM adapter owns RPC provenance, local math, envelope construction,
// exact simulation, custody signing, single sending and chain effect reading.
// This port supplies an independent autonomous authorization and durable state
// machine; it never accepts an owner-browser capability.
export function createAutonomousExecutionPort({ledger,adapter,flags,network,currentAgent,acceptance,assertTarget=()=>reject('REAL_TARGET_AUTHORITY_UNAVAILABLE'),now=Date.now,riskPolicy=DEFAULT_RISK_POLICY}){
 if(!ledger||!adapter||!flags||!network?.verify)throw Error('AUTONOMOUS_PORT_DEPENDENCY_MISSING');
 const requireAdapter=()=>{if(adapter.kind!=='CPMM_CLASSIC_WSOL_USDC_V1'||adapter.autonomousCustodyBound!==true)reject('AUTONOMOUS_EXECUTION_PORT_UNAVAILABLE');};
 const target=intent=>{const result=assertTarget(intent);if(result?.available!==true||result?.then)reject('REAL_TARGET_AUTHORITY_UNAVAILABLE');};
 const policy=async r=>({...await adapter.validationPolicy(r),intent:r.intent,quote:r.quote,blockhash:r.blockhash,expectedMessageHash:r.messageHash});
 const quoteValid=r=>{assertQuoteFresh(r.quote,now());if(now()>=r.intent.expiresAt)reject('INTENT_EXPIRED');if(r.quoteDigest!==digest(r.quote)||r.quote.pool!==r.intent.pool||r.quote.inputAmount!==r.intent.inputAmount||r.quote.inputMint!==r.intent.inputMint||r.quote.outputMint!==r.intent.outputMint)reject('QUOTE_INTENT_MISMATCH');};
 const authorize=async({agent,intent,marketQuote,ledgerState,risk,executionId})=>{
  target(intent);
  if(intent.mode!=='AUTONOMOUS_ACCEPTANCE_TEST')return authorizeAutonomousV1({flags:flags(),network:await network.verify(),agent:currentAgent?await currentAgent(intent.agentId):agent,intent,market:marketQuote,ledger:{...ledgerState,riskPass:risk?.allowed===true},now:now()});
  if(!acceptance)reject('ACCEPTANCE_PORT_DISARMED');
  const n=await network.verify(),a=currentAgent?await currentAgent(intent.agentId):agent;
  const context={ownerAuthenticated:true,ownershipVerified:a?.owner===intent.owner,vaultVerified:a?.vaultVerified===true,networkVerified:n?.network==='solana:mainnet'&&n.verified===true,owner:a?.owner,agentId:a?.agentId,agentWallet:a?.agentWallet};
  const args={context,flags:flags(),riskPass:risk?.allowed===true,openPositions:ledgerState?.openPositions,executionId};
  if(ledgerState?.unknown||ledgerState?.unresolved||ledgerState?.reservationConflict)reject('ACCEPTANCE_LEDGER_LOCKED');
  const state=intent.direction==='BUY'?acceptance.assertBuy(intent,args):acceptance.assertSell(intent,{...args,position:ledger.activePosition(intent.agentId),exitReason:intent.exitReason});
  return {authorized:true,venue:resolveAutonomousVenue({mint:intent.direction==='BUY'?intent.outputMint:intent.inputMint,direction:intent.direction,pool:intent.pool}),cycleId:state.cycleId};
 };
 const evaluate=(intent,snapshot)=>intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'?evaluateAcceptanceRisk(intent,snapshot,riskPolicy,now()):evaluateAutonomousRisk(intent,snapshot,riskPolicy,now());
 const outcome=r=>r?.status==='CONFIRMED'?{...r,finalized:true,receipt:ledger.receipt(r.id)}:r;
 const readReceipt=async id=>{
  const r=ledger.get(id);if(!r||!['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(r.intent.mode)||!r.signature)return outcome(r);
  if(r.intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&r.status==='CONFIRMED'&&acceptance?.read()?.execution?.id===id){const receipt=ledger.receipt(id),position=ledger.position(r.intent.agentId,r.intent.direction==='BUY'?r.intent.outputMint:r.intent.inputMint);if(r.intent.direction==='BUY')acceptance.confirmedBuy(r,receipt,position);else acceptance.confirmedSell(r,receipt,position);}
  if(r.intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&['FAILED','REJECTED_BEFORE_SIGNING','EXPIRED'].includes(r.status)&&acceptance?.read()?.execution?.id===id)acceptance.terminalFailure(r);
  if(!uncertain.has(r.status))return outcome(r);
  const chain=await adapter.readFinalized(r.signature,r);if(!chain)return r;
  if(chain.signature!==r.signature||chain.finalized!==true||!Number.isSafeInteger(chain.slot))reject('CHAIN_IDENTITY_MISMATCH');
  const decoded=validateDexTransaction(chain.transaction,{...await policy(r),requireSignature:true});
  if(bs58.encode(decoded.transaction.signatures[0])!==r.signature||decoded.messageHash!==r.messageHash)reject('CHAIN_SIGNATURE_MISMATCH');
  if(chain.error){const fee=integer(chain.networkFeeLamports,{zero:true});if(fee>integer(r.review.networkFeeLamports,{zero:true}))reject('FAILED_RECEIPT_INVALID');const failed=ledger.recordFailure(id,{executionId:id,signature:r.signature,messageHash:r.messageHash,finalized:true,slot:chain.slot,networkFeeLamports:fee.toString(),failureReason:JSON.stringify(chain.error).slice(0,300),confirmedAt:now()});if(r.intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.terminalFailure(failed);return failed;}
  const effects=await adapter.verifiedEffects(r,chain),input=integer(effects.actualInput),output=integer(effects.actualOutput),fee=integer(effects.networkFeeLamports,{zero:true}),rent=signedInteger(effects.rentLamports);
  if(input!==integer(r.intent.inputAmount)||output<integer(r.quote.minimumOutput)||fee!==integer(r.review.networkFeeLamports,{zero:true})||rent!==signedInteger(r.review.netRentLamports))reject('CHAIN_ECONOMICS_MISMATCH');
  const expectedSol=r.intent.direction==='BUY'?-input-fee-rent:output-fee-rent,expectedToken=r.intent.direction==='BUY'?output:-input;
  if(effects.agentSolDelta!==expectedSol.toString()||effects.agentTokenDelta!==expectedToken.toString())reject('CHAIN_BALANCE_MISMATCH');
  const confirmed=ledger.confirm(id,{executionId:id,signature:r.signature,finalized:true,messageHash:r.messageHash,slot:chain.slot,chainBlockTime:chain.chainBlockTime??null,confirmedAt:now(),...Object.fromEntries(['actualInput','actualOutput','networkFeeLamports','rentLamports','agentSolDelta','agentTokenDelta'].map(k=>[k,effects[k]]))});
  if(r.intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'){
   const receipt=ledger.receipt(id),position=ledger.position(r.intent.agentId,r.intent.direction==='BUY'?r.intent.outputMint:r.intent.inputMint);
   if(r.intent.direction==='BUY')acceptance.confirmedBuy(confirmed,receipt,position);else acceptance.confirmedSell(confirmed,receipt,position);
  }
  return outcome(confirmed);
 };
 return Object.freeze({
  provenProductionBoundary:true,
  reconcile:readReceipt,
  async execute({agent,intent,venue,risk,marketQuote,ledgerState}){
   target(intent);requireAdapter();
   const resolved=resolveAutonomousVenue({mint:intent.direction==='BUY'?intent.outputMint:intent.inputMint,direction:intent.direction,pool:intent.pool});
   if(!['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(intent.mode)||intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&!acceptance||venue?.kind!==resolved.kind||venue?.pool!==resolved.pool||!risk?.allowed)reject('AUTONOMOUS_INTENT_OR_RISK_INVALID');
   if(intent.direction==='BUY')assertMarketBinding(intent.marketBinding,marketQuote,intent);
   await authorize({agent,intent,marketQuote,ledgerState,risk});
   target(intent);await adapter.assertCustody(intent);target(intent);
   const core=canonical(intent),fingerprint=digest(core);
   if(typeof intent.requestKey!=='string'||intent.requestKey.length<16||intent.requestKey.length>100)reject('INVALID_IDEMPOTENCY_KEY');
   const started=now(),fullIntent={...core,createdAt:started,expiresAt:started+30000};
   const held=ledger.reserve({intent:fullIntent,fingerprint,requestKey:intent.requestKey});
   if(held.existing)return uncertain.has(held.record.status)?readReceipt(held.record.id):outcome(held.record);
   const id=held.record.id;
   let r=held.record;
   try{
    const readRetry=intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&!ledger.reservation(id)&&!r.signature&&!r.broadcastAttemptedAt;
    const quote=await adapter.quote(fullIntent,{retryMinContextSlot:readRetry});assertQuoteFresh(quote,now());
    if(quote.pool!==intent.pool||quote.inputMint!==intent.inputMint||quote.outputMint!==intent.outputMint||quote.inputAmount!==intent.inputAmount||quote.slippageBps!==intent.slippageBps)reject('QUOTE_INTENT_MISMATCH');
    r=ledger.transition(id,['QUOTED'],'QUOTED',{quote,quoteDigest:digest(quote)});
    r=ledger.transition(id,['QUOTED'],'PREPARING',{preparingAt:now()});
    quoteValid(r);
    if(typeof adapter.reservePlan!=='function'||typeof adapter.buildReserved!=='function')reject('ATOMIC_RESERVATION_PATH_REQUIRED');
    const plannedRecord=r,pre=await adapter.reservePlan(plannedRecord,{retryMinContextSlot:readRetry&&!ledger.reservation(id)}),preRisk=evaluate(r.intent,pre.snapshot);
    r=ledger.transition(id,['PREPARING'],'PREPARING',{risk:preRisk,stateReadAttempts:pre.collected?.retryDiagnostics??[],review:{networkFeeLamports:pre.snapshot.networkFeeLamports,ataRentLamports:pre.snapshot.ataRentLamports,netRentLamports:pre.snapshot.netRentLamports??pre.snapshot.ataRentLamports,reserveAfterLamports:preRisk.reserveAfterLamports}});
    const reservation=ledger.reservation(id);
    if(reservation?.operationId!==`dex:${id}`||reservation.status!=='PREPARING'||reservation.intentHash!==fingerprint)reject('RESERVATION_MISMATCH');
    const plan=await adapter.buildReserved(plannedRecord,pre);
    if(!plan?.transaction||!plan.blockhash||!Number.isSafeInteger(plan.lastValidBlockHeight))reject('INVALID_PLAN');
    const pending={...r,transaction:plan.transaction,blockhash:plan.blockhash,lastValidBlockHeight:plan.lastValidBlockHeight,validationPolicy:plan.validationPolicy,stateDigest:plan.stateDigest};
    const snapshot=await adapter.snapshot(pending),freshRisk=evaluate(r.intent,snapshot);
    if(snapshot.ataRentLamports!==pre.snapshot.ataRentLamports||BigInt(snapshot.networkFeeLamports)>BigInt(pre.snapshot.networkFeeLamports))reject('RESERVED_ECONOMICS_CHANGED');
    const decoded=validateDexTransaction(plan.transaction,await policy(pending));
    if(decoded.status!=='SUPPORTED_BY_VALIDATOR'||decoded.unexplainedWritableAccounts!==0)reject('AUTONOMOUS_VALIDATOR_REJECTED');
    if(await adapter.blockHeight()>plan.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
    const simulation=await adapter.simulateUnsigned(pending,decoded);
    if(simulation?.success!==true||simulation.messageHash!==decoded.messageHash)reject('UNSIGNED_SIMULATION_FAILED');
    quoteValid(r);if(await adapter.blockHeight()>plan.lastValidBlockHeight||freshRisk.expiresAt<=now())reject('PREPARATION_EXPIRED');
    r=ledger.transition(id,['PREPARING'],'PREPARED',{transaction:plan.transaction,blockhash:plan.blockhash,lastValidBlockHeight:plan.lastValidBlockHeight,validationPolicy:plan.validationPolicy,stateDigest:plan.stateDigest,snapshotSlot:plan.snapshotSlot,message:decoded.messageBytes.toString('base64'),messageHash:decoded.messageHash,pool:plan.pool,routePolicyVersion:plan.routePolicyVersion,risk:freshRisk,simulation,review:{networkFeeLamports:snapshot.networkFeeLamports,ataRentLamports:snapshot.ataRentLamports,netRentLamports:snapshot.netRentLamports??snapshot.ataRentLamports,reserveAfterLamports:freshRisk.reserveAfterLamports},preparedAt:now()});
    if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.bindExecution(r,{reservation:ledger.reservation(id),riskPass:freshRisk.allowed,simulationPass:simulation.success});
    await authorize({agent,intent,marketQuote,ledgerState,risk,executionId:id});await adapter.assertCustody(r.intent);quoteValid(r);
    if(await adapter.blockHeight()>r.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');
    const before=validateDexTransaction(r.transaction,await policy(r));
    if(before.messageBytes.toString('base64')!==r.message||before.messageHash!==r.messageHash||r.simulation.messageHash!==r.messageHash)reject('MESSAGE_OR_SIMULATION_MISMATCH');
    r=ledger.transition(id,['PREPARED'],'UNKNOWN',{reason:'SIGNING_CLAIMED',authorizedMessageHash:r.messageHash});
    let signed,signature;
    try{target(r.intent);signed=await adapter.signExactMessage(r,before);const verified=validateDexTransaction(signed,{...await policy(r),requireSignature:true});if(verified.messageBytes.toString('base64')!==r.message)reject('SIGNED_MESSAGE_MUTATION');signature=bs58.encode(verified.transaction.signatures[0]);r=ledger.transition(id,['UNKNOWN'],'SIGNED',{signature,reason:null});}
    catch(e){const failed=ledger.transition(id,['UNKNOWN'],'FAILED',{reason:'SIGNATURE_OR_CUSTODY_REJECTED_BEFORE_BROADCAST'});if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.terminalFailure(failed);throw e;}
    try{await authorize({agent,intent,marketQuote,ledgerState,risk,executionId:id});quoteValid(r);if(await adapter.blockHeight()>r.lastValidBlockHeight)reject('BLOCKHASH_EXPIRED');}
    catch{const unknown=ledger.transition(id,['SIGNED'],'UNKNOWN',{reason:'SIGNED_NOT_BROADCAST'});if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.markUnknown(unknown);return unknown;}
    r=ledger.transition(id,['SIGNED'],'SUBMITTED',{broadcastAttemptedAt:now()});
    try{target(r.intent);const sent=await adapter.broadcastOnce(signed,{maxRetries:0,skipPreflight:false},r);if(sent!==signature)reject('BROADCAST_SIGNATURE_MISMATCH');}
    catch{const unknown=ledger.transition(id,['SUBMITTED'],'UNKNOWN',{reason:'BROADCAST_OUTCOME_UNKNOWN'});if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.markUnknown(unknown);return unknown;}
    return await readReceipt(id);
   }catch(e){const latest=ledger.get(id);if(['QUOTED','PREPARING','PREPARED'].includes(latest?.status)){const failed=ledger.transition(id,[latest.status],'REJECTED_BEFORE_SIGNING',{reason:e.code??'PRE_BROADCAST_REJECTED',...(e.snapshotDiagnostic?{snapshotDiagnostic:e.snapshotDiagnostic}:{}),...(e.retryDiagnostics?{stateReadAttempts:e.retryDiagnostics}:{})});if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST'){if(acceptance.read()?.execution?.id===id)acceptance.terminalFailure(failed);else acceptance.failUnbound(failed);}}else if(['SIGNED','SUBMITTED'].includes(latest?.status)){const unknown=ledger.transition(id,[latest.status],'UNKNOWN',{reason:'RECONCILIATION_UNCERTAIN'});if(intent.mode==='AUTONOMOUS_ACCEPTANCE_TEST')acceptance.markUnknown(unknown);return unknown;}else if(latest?.status==='UNKNOWN')return latest;throw e;}
  }
 });
}
