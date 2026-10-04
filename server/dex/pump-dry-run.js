import {buildOfflinePumpEnvelope,validateOfflinePumpEnvelope} from './pump-offline-envelope.js';
import {rejectPump} from './pump-sdk-boundary.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {inspectOfflinePumpAccountInventory} from './pump-account-inventory.js';
import {inspectRoleBoundPumpSimulation} from './pump-simulation-effects.js';
import {quotePumpVenue} from './pump-quote.js';

// Dependency-injected local inspection. Deliberately no signer/broadcaster port.
export function createPumpDryRunInspector({readContext,simulateUnsigned,now=Date.now}={}){
 if(typeof readContext!=='function'||typeof simulateUnsigned!=='function')rejectPump('PUMP_DRY_RUN_DEPENDENCY_UNAVAILABLE');
 function guard(options){
  const context=readContext(options.intent.agentId);
  if(!context||context.owner!==options.intent.owner||context.agentId!==options.intent.agentId||context.agentWallet!==options.executionWallet||context.associatedMint!==options.venue.mint||context.network!=='solana:101'||context.authenticated!==true)rejectPump('PUMP_DRY_RUN_AUTHORITY_UNAVAILABLE');
  if(context.paused!==false||context.liveEnabled!==false||context.broadcastEnabled!==false)rejectPump('PUMP_DRY_RUN_PAUSED_OR_UNSAFE');
  if(!Number.isSafeInteger(context.revision)||context.revision<0)rejectPump('PUMP_DRY_RUN_CONTEXT_INVALID');
  quotePumpVenue({venue:options.venue,intent:options.intent,now:now()});return context.revision;
 }
 return {async inspect(input){
  const accounts=Object.fromEntries(Object.entries(input?.accounts??{}).map(([key,value])=>[key,{...value,data:Buffer.isBuffer(value?.data)?Buffer.from(value.data):value?.data}]));
  const instructionAccounts=Array.isArray(input?.instructionAccounts)?input.instructionAccounts.map(a=>({...a,data:Buffer.isBuffer(a?.data)?Buffer.from(a.data):a?.data})):input?.instructionAccounts??[];
  const options={venue:input?.venue,intent:Object.freeze({...input?.intent}),executionWallet:input?.executionWallet,blockhash:input?.blockhash,accounts,instructionAccounts,networkFeeLamports:input?.networkFeeLamports};
  guard(options);const walletInspection=inspectOfflinePumpWalletAccounts({...options,now:now()});
  const revision=guard(options),accountInventory=await inspectOfflinePumpAccountInventory({...options,walletAccounts:accounts,now:now()});
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  const built=await buildOfflinePumpEnvelope({...options,now:now()});
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  await validateOfflinePumpEnvelope(built.unsignedTransaction,{...options,now:now()});
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  const response=await simulateUnsigned(Object.freeze({unsignedTransaction:built.unsignedTransaction,messageHash:built.messageHash,sigVerify:false,replaceRecentBlockhash:false}));
  const simulation=Object.freeze({source:response?.source,messageHash:response?.messageHash,success:response?.success,err:response?.err,balanceFixture:response?.balanceFixture});
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  const copy=values=>Object.fromEntries(Object.entries(values??{}).map(([role,a])=>[role,{...a,data:Buffer.isBuffer(a?.data)?Buffer.from(a.data):a?.data}]));
  const balanceFixture=simulation?.balanceFixture?{meta:structuredClone(simulation.balanceFixture.meta),afterAccounts:copy(simulation.balanceFixture.afterAccounts),postInstructionAccounts:Array.isArray(simulation.balanceFixture.postInstructionAccounts)?simulation.balanceFixture.postInstructionAccounts.map(a=>({...a,data:Buffer.isBuffer(a?.data)?Buffer.from(a.data):a?.data})):simulation.balanceFixture.postInstructionAccounts}:null;
  await validateOfflinePumpEnvelope(built.unsignedTransaction,{...options,now:now()});
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  if(simulation?.source!=='LOCAL_FIXTURE'||simulation.messageHash!==built.messageHash||simulation.success!==true||simulation.err!==null)rejectPump('PUMP_DRY_RUN_SIMULATION_REJECTED');
  const localEconomicInspection=balanceFixture?await inspectRoleBoundPumpSimulation({options:{...options,now:now()},unsignedTransaction:built.unsignedTransaction,beforeAccounts:accounts,preInstructionAccounts:instructionAccounts,...balanceFixture}):null;
  if(guard(options)!==revision)rejectPump('PUMP_DRY_RUN_CONTEXT_CHANGED');
  return {schema:'PUMP_LOCAL_DRY_RUN_V1',messageHash:built.messageHash,quote:built.quote,walletInspection,accountInventory,localEconomicInspection,venueExecutionQualified:false,localSimulationPassed:true,simulationProvenance:'LOCAL_FIXTURE',onChainSimulationVerified:false,positionEffect:null,pnlEffect:null,executable:false,authorizationGranted:false,notSigned:true,notBroadcast:true};
 }};
}
