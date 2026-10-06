import {quotePumpVenue} from './pump-quote.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {buildOfflinePumpEnvelope,validateOfflinePumpEnvelope} from './pump-offline-envelope.js';
import {reject} from './intent.js';
import {decodedPumpState} from './pump-account-decoder.js';
import {createPumpCurveEffectPolicy} from './pump-finalized-effects.js';
import {preservePumpPreparation,restorePumpPreparation} from './pump-prepare-evidence.js';
import {checkPumpNativeValidity} from './pump-native-validity.js';
import {digest} from './intent.js';

// All chain I/O/effect qualification must be supplied explicitly. No send ports.
export function createPumpRuntimeAdapter({readSnapshot,readNativeValidity,simulateUnsigned,readFinalized,verifyFinalizedEffects,source='LOCAL_FIXTURE',qualification=()=>false,now=Date.now}={}){
 if(!['LOCAL_FIXTURE','ON_CHAIN'].includes(source)||typeof qualification!=='function')reject('PUMP_RUNTIME_ADAPTER_SOURCE');
 const readSource=source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE';
 const qualified=()=>{if(source==='ON_CHAIN'&&qualification()!==true)reject('PUMP_RUNTIME_VENUE_NOT_QUALIFIED');};
 const checked=async(action,detach=value=>value)=>{qualified();const result=detach(await action());qualified();return result;};
 const detachSnapshot=supplied=>{const {venue,...raw}=supplied,snapshot={...structuredClone(raw),venue};for(const [role,account]of Object.entries(supplied.accounts??{}))if(Buffer.isBuffer(account.data))snapshot.accounts[role].data=Buffer.from(account.data);return snapshot;};
 // Transient freshness only: restart revalidates persisted evidence. This cache
 // never supplies construction inputs, authority, a replacement hash or a send.
 const nativeChecks=new Map();
 const nativeKey=plan=>digest({messageHash:plan.messageHash,evidenceHash:plan.preparationEvidence?.evidenceHash});
 const native=async(options,{initial=false}={})=>{
  if(source==='LOCAL_FIXTURE'&&!options.nativeValidity)return;
  const args={source,blockhash:options.blockhash,snapshotSlot:options.venue.slot,now:now()};
  if(initial){checkPumpNativeValidity(options.nativeValidity,args);return;}
  if(typeof readNativeValidity!=='function'||!options.nativeValidity)reject('PUMP_NATIVE_HEIGHT_READER_REQUIRED');
  const current=await checked(()=>readNativeValidity({blockhash:options.blockhash,commitment:'finalized',minContextSlot:options.nativeValidity.minContextSlot}),structuredClone);
  checkPumpNativeValidity(options.nativeValidity,{...args,now:now(),current});
  return current;
 };
 return {
  qualification:()=>source==='ON_CHAIN'&&qualification()===true,
  async prepare(intent,context,assertCurrent){
   qualified();
   if(typeof assertCurrent!=='function'||typeof simulateUnsigned!=='function')reject('PUMP_RUNTIME_SIMULATION_DEPENDENCY');
   const snapshot=await checked(()=>readSnapshot(intent),detachSnapshot),{venue}=snapshot;
   if(venue.source!==readSource||decodedPumpState(venue).context.source!==readSource)reject('PUMP_RUNTIME_READ_SOURCE');
   const options={...snapshot,intent:structuredClone(intent),executionWallet:intent.agentWallet,now:now()};
   await native(options,{initial:true});
   await checked(assertCurrent);
   const quote=quotePumpVenue(options),wallet=inspectOfflinePumpWalletAccounts(options),envelope=await checked(()=>buildOfflinePumpEnvelope(options));
   await checked(assertCurrent);
   const simulation=await checked(()=>simulateUnsigned({unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,sigVerify:false,replaceRecentBlockhash:false}),structuredClone);await checked(assertCurrent);
   if(simulation?.source!==snapshot.venue.source||simulation.messageHash!==envelope.messageHash||simulation.success!==true||simulation.err!==null)reject('PUMP_RUNTIME_SIMULATION_FAILED');
   await native(options);
   // Only the execution namespace maps. Read/quote/simulation/policy retain provenance.
   const plan={source,observedAt:decodedPumpState(snapshot.venue).context.observedAt,venueKind:snapshot.venue.kind,quote,unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,simulation:{source:simulation.source,messageHash:simulation.messageHash,success:true,notReceipt:true},balances:{native:wallet.solBalance,token:wallet.baseBalance,wsol:wallet.wsolBalance??'0'},feeCapLamports:snapshot.feeCapLamports??'10000',rentCapLamports:snapshot.rentCapLamports??'0',refundCapLamports:snapshot.refundCapLamports??'0',snapshotSlot:snapshot.venue.slot,proofHash:snapshot.venue.proofHash};
   if(snapshot.venue.kind==='PUMP_BONDING_CURVE')plan.effectPolicy=await checked(()=>createPumpCurveEffectPolicy(options));
   qualified();
   plan.preparationEvidence=preservePumpPreparation(options,source);return plan;
  },
  async verifyPrepared(r){
   r=structuredClone(r);
   qualified();if(r.plan.source!==source)reject('PUMP_RUNTIME_READ_SOURCE');
   const options=restorePumpPreparation(r.plan.preparationEvidence,{source,now:now(),intent:r.intent});
   const quote=quotePumpVenue(options),wallet=inspectOfflinePumpWalletAccounts(options);
   const expected={observedAt:decodedPumpState(options.venue).context.observedAt,venueKind:options.venue.kind,quote,balances:{native:wallet.solBalance,token:wallet.baseBalance,wsol:wallet.wsolBalance??'0'},feeCapLamports:options.feeCapLamports,rentCapLamports:options.rentCapLamports,refundCapLamports:options.refundCapLamports,snapshotSlot:options.venue.slot,proofHash:options.venue.proofHash};
   if(Object.entries(expected).some(([key,value])=>digest(value)!==digest(r.plan[key]))||r.plan.simulation?.source!==readSource||r.plan.simulation.messageHash!==r.plan.messageHash||r.plan.simulation.success!==true||r.plan.simulation.notReceipt!==true)reject('PUMP_PREPARE_PLAN_BINDING');
   if(options.venue.kind==='PUMP_BONDING_CURVE'&&digest(await checked(()=>createPumpCurveEffectPolicy(options)))!==digest(r.plan.effectPolicy))reject('PUMP_PREPARE_EFFECT_POLICY_BINDING');
   const proof=await checked(()=>validateOfflinePumpEnvelope(r.plan.unsignedTransaction,options));
   const current=await native(options);qualified();
   if(current){nativeChecks.set(nativeKey(r.plan),{options:structuredClone({source,blockhash:options.blockhash,snapshotSlot:options.venue.slot,validity:options.nativeValidity}),current:structuredClone(current)});if(nativeChecks.size>128)nativeChecks.delete(nativeChecks.keys().next().value);}
   return proof.messageHash===r.plan.messageHash&&proof.abiMatched===true;
  },
  assertPreparedCurrent(r){
   qualified();if(source==='LOCAL_FIXTURE'&&!r.plan.preparationEvidence?.nativeValidity)return;
   const checked=nativeChecks.get(nativeKey(r.plan));if(!checked)reject('PUMP_NATIVE_RECHECK_REQUIRED');
   checkPumpNativeValidity(checked.options.validity,{...checked.options,now:now(),current:checked.current});
  },
  readFinalized(signature,r){if(typeof readFinalized!=='function')reject('PUMP_RUNTIME_FINALITY_READER_UNAVAILABLE');return readFinalized(signature,r);},
  verifyFinalizedEffects(r,observation){if(typeof verifyFinalizedEffects!=='function')reject('PUMP_RUNTIME_EFFECT_VERIFIER_UNAVAILABLE');return verifyFinalizedEffects(r,observation);}
 };
}
