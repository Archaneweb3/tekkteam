import {createPumpDryRunInspector} from './pump-dry-run.js';
import {quotePumpVenue} from './pump-quote.js';
import {inspectOfflinePumpWalletAccounts} from './pump-wallet-accounts.js';
import {rejectPump} from './pump-sdk-boundary.js';

// Local adapter has no sign/send/RPC reconciliation ports and is never mounted.
export function createPumpLocalExecutor({ledger,readContext,simulateUnsigned,now=Date.now}={}){
 const inspector=createPumpDryRunInspector({readContext,simulateUnsigned,now}),issued=new WeakMap();
 function guard(r){const c=readContext(r.intent.agentId);if(!c||c.authenticated!==true||c.owner!==r.intent.owner||c.agentId!==r.intent.agentId||c.agentWallet!==r.executionWallet||c.associatedMint!==(r.intent.side==='BUY'?r.intent.outputMint:r.intent.inputMint)||c.network!=='solana:101'||c.paused!==false||c.liveEnabled!==false||c.broadcastEnabled!==false||!Number.isSafeInteger(c.revision)||c.revision<0)rejectPump('PUMP_LOCAL_AUTHORITY_OR_PAUSE');return c.revision;}
 return {
  prepare(input){const options={...input,intent:Object.freeze({...input.intent}),now:now()};if(options.venue.source!=='LOCAL_FIXTURE')rejectPump('PUMP_LOCAL_FIXTURE_ONLY');guard(options);const quote=quotePumpVenue(options),wallet=inspectOfflinePumpWalletAccounts(options);return ledger.prepare({intent:options.intent,quote,venueKind:options.venue.kind,executionWallet:options.executionWallet,wallet,networkFeeLamports:options.networkFeeLamports,requestKey:options.requestKey});},
  async inspect(id,input){const r=ledger.get(id);if(r?.status!=='PREPARED_LOCAL')rejectPump('PUMP_LOCAL_NOT_PREPARED');const revision=guard(r);if(JSON.stringify(input.intent)!==JSON.stringify(r.intent)||input.executionWallet!==r.executionWallet||input.venue.kind!==r.venueKind||input.venue.proofHash!==r.quote.proofHash||input.networkFeeLamports!==r.networkFeeLamports)rejectPump('PUMP_LOCAL_INSPECTION_BINDING');const report=await inspector.inspect(input);if(guard(r)!==revision)rejectPump('PUMP_LOCAL_CONTEXT_CHANGED');const result=Object.freeze({...report,fixtureExecutionId:id});issued.set(result,{id,revision,effects:structuredClone(report.localEconomicInspection)});return result;},
  applyFixture(id,report){const proof=issued.get(report),r=ledger.get(id);if(!proof||proof.id!==id||r?.status!=='PREPARED_LOCAL'||guard(r)!==proof.revision)rejectPump('PUMP_LOCAL_ISSUED_INSPECTION_REQUIRED');if(now()>=r.intent.expiresAt||now()>=r.quote.expiresAt)rejectPump('PUMP_LOCAL_EXPIRED');const result=ledger.applyHypothetical(id,proof.effects);issued.delete(report);return result;},
  markPending(id){const r=ledger.get(id);guard(r);return ledger.markPending(id);},
  recover(id){const result=ledger.recover(id),r=result.record,c=readContext(r.intent.agentId);if(c?.authenticated!==true||c.owner!==r.intent.owner||c.agentId!==r.intent.agentId||c.agentWallet!==r.executionWallet)rejectPump('PUMP_LOCAL_RECOVERY_OWNER');return result;},
  cancel(id){guard(ledger.get(id));return ledger.cancel(id);}
 };
}
