import {quotePumpVenue} from './pump-quote.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {buildOfflinePumpEnvelope,validateOfflinePumpEnvelope} from './pump-offline-envelope.js';
import {reject} from './intent.js';
import {decodedPumpState} from './pump-account-decoder.js';
import {createPumpCurveEffectPolicy} from './pump-finalized-effects.js';

// All chain I/O/effect qualification must be supplied explicitly. No send ports.
export function createPumpRuntimeAdapter({readSnapshot,simulateUnsigned,readFinalized,verifyFinalizedEffects,source='LOCAL_FIXTURE',qualification=()=>false,now=Date.now}={}){
 if(!['LOCAL_FIXTURE','ON_CHAIN'].includes(source)||typeof qualification!=='function')reject('PUMP_RUNTIME_ADAPTER_SOURCE');
 const readSource=source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE';
 const qualified=()=>{if(source==='ON_CHAIN'&&qualification()!==true)reject('PUMP_RUNTIME_VENUE_NOT_QUALIFIED');};
 const checked=async(action,detach=value=>value)=>{qualified();const result=detach(await action());qualified();return result;};
 const detachSnapshot=supplied=>{const {venue,...raw}=supplied,snapshot={...structuredClone(raw),venue};for(const [role,account]of Object.entries(supplied.accounts??{}))if(Buffer.isBuffer(account.data))snapshot.accounts[role].data=Buffer.from(account.data);return snapshot;};
 const prepared=new Map();
 return {
  qualification:()=>source==='ON_CHAIN'&&qualification()===true,
  async prepare(intent,context,assertCurrent){
   qualified();
   if(typeof assertCurrent!=='function'||typeof simulateUnsigned!=='function')reject('PUMP_RUNTIME_SIMULATION_DEPENDENCY');
   const snapshot=await checked(()=>readSnapshot(intent),detachSnapshot),{venue}=snapshot;
   if(venue.source!==readSource||decodedPumpState(venue).context.source!==readSource)reject('PUMP_RUNTIME_READ_SOURCE');
   const options={...snapshot,intent:structuredClone(intent),executionWallet:intent.agentWallet,now:now()};
   await checked(assertCurrent);
   const quote=quotePumpVenue(options),wallet=inspectOfflinePumpWalletAccounts(options),envelope=await checked(()=>buildOfflinePumpEnvelope(options));
   await checked(assertCurrent);
   const simulation=await checked(()=>simulateUnsigned({unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,sigVerify:false,replaceRecentBlockhash:false}),structuredClone);await checked(assertCurrent);
   if(simulation?.source!==snapshot.venue.source||simulation.messageHash!==envelope.messageHash||simulation.success!==true||simulation.err!==null)reject('PUMP_RUNTIME_SIMULATION_FAILED');
   // Only the execution namespace maps. Read/quote/simulation/policy retain provenance.
   const plan={source,observedAt:decodedPumpState(snapshot.venue).context.observedAt,venueKind:snapshot.venue.kind,quote,unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,simulation:{source:simulation.source,messageHash:simulation.messageHash,success:true,notReceipt:true},balances:{native:wallet.solBalance,token:wallet.baseBalance,wsol:wallet.wsolBalance??'0'},feeCapLamports:snapshot.feeCapLamports??'10000',rentCapLamports:snapshot.rentCapLamports??'0',refundCapLamports:snapshot.refundCapLamports??'0',snapshotSlot:snapshot.venue.slot,proofHash:snapshot.venue.proofHash};
   if(snapshot.venue.kind==='PUMP_BONDING_CURVE')plan.effectPolicy=await checked(()=>createPumpCurveEffectPolicy(options));
   qualified();
   prepared.set(plan.messageHash,options);if(prepared.size>128)prepared.delete(prepared.keys().next().value);return plan;
  },
  async verifyPrepared(r){qualified();if(r.plan.source!==source)reject('PUMP_RUNTIME_READ_SOURCE');const options=prepared.get(r.plan.messageHash);if(!options)reject('PUMP_RUNTIME_PREPARE_OPTIONS_MISSING');const proof=await checked(()=>validateOfflinePumpEnvelope(r.plan.unsignedTransaction,{...options,now:now()}));return proof.messageHash===r.plan.messageHash&&proof.abiMatched===true;},
  readFinalized(signature,r){if(typeof readFinalized!=='function')reject('PUMP_RUNTIME_FINALITY_READER_UNAVAILABLE');return readFinalized(signature,r);},
  verifyFinalizedEffects(r,observation){if(typeof verifyFinalizedEffects!=='function')reject('PUMP_RUNTIME_EFFECT_VERIFIER_UNAVAILABLE');return verifyFinalizedEffects(r,observation);}
 };
}
