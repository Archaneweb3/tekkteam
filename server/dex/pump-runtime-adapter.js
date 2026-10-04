import {quotePumpVenue} from './pump-quote.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {buildOfflinePumpEnvelope,validateOfflinePumpEnvelope} from './pump-offline-envelope.js';
import {reject} from './intent.js';
import {decodedPumpState} from './pump-account-decoder.js';

// All chain I/O/effect qualification must be supplied explicitly. No send ports.
export function createPumpRuntimeAdapter({readSnapshot,simulateUnsigned,readFinalized,verifyFinalizedEffects,qualification=()=>false,now=Date.now}={}){
 const prepared=new Map();
 return {
  qualification,
  async prepare(intent,context,assertCurrent){
   if(typeof assertCurrent!=='function'||typeof simulateUnsigned!=='function')reject('PUMP_RUNTIME_SIMULATION_DEPENDENCY');
   const supplied=await readSnapshot(intent),{venue,...raw}=supplied,snapshot={...structuredClone(raw),venue};
   for(const [role,account] of Object.entries(supplied.accounts??{}))if(Buffer.isBuffer(account.data))snapshot.accounts[role].data=Buffer.from(account.data);
   const options={...snapshot,intent:structuredClone(intent),executionWallet:intent.agentWallet,now:now()};
   await assertCurrent();
   const quote=quotePumpVenue(options),wallet=inspectOfflinePumpWalletAccounts(options),envelope=await buildOfflinePumpEnvelope(options);
   await assertCurrent();
   const simulation=structuredClone(await simulateUnsigned({unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,sigVerify:false,replaceRecentBlockhash:false}));await assertCurrent();
   if(simulation?.source!==snapshot.venue.source||simulation.messageHash!==envelope.messageHash||simulation.success!==true||simulation.err!==null)reject('PUMP_RUNTIME_SIMULATION_FAILED');
   const plan={source:snapshot.venue.source,observedAt:decodedPumpState(snapshot.venue).context.observedAt,venueKind:snapshot.venue.kind,quote,unsignedTransaction:envelope.unsignedTransaction,messageHash:envelope.messageHash,simulation:{source:simulation.source,messageHash:simulation.messageHash,success:true,notReceipt:true},balances:{native:wallet.solBalance,token:wallet.baseBalance,wsol:wallet.wsolBalance??'0'},feeCapLamports:snapshot.feeCapLamports??'10000',rentCapLamports:snapshot.rentCapLamports??'0',refundCapLamports:snapshot.refundCapLamports??'0',snapshotSlot:snapshot.venue.slot,proofHash:snapshot.venue.proofHash};
   prepared.set(plan.messageHash,options);if(prepared.size>128)prepared.delete(prepared.keys().next().value);return plan;
  },
  async verifyPrepared(r){const options=prepared.get(r.plan.messageHash);if(!options)reject('PUMP_RUNTIME_PREPARE_OPTIONS_MISSING');const proof=await validateOfflinePumpEnvelope(r.plan.unsignedTransaction,{...options,now:now()});return proof.messageHash===r.plan.messageHash&&proof.abiMatched===true;},
  readFinalized(signature,r){if(typeof readFinalized!=='function')reject('PUMP_RUNTIME_FINALITY_READER_UNAVAILABLE');return readFinalized(signature,r);},
  verifyFinalizedEffects(r,observation){if(typeof verifyFinalizedEffects!=='function')reject('PUMP_RUNTIME_EFFECT_VERIFIER_UNAVAILABLE');return verifyFinalizedEffects(r,observation);}
 };
}
