import {quotePumpVenue} from './pump-quote.js';
import {inspectOfflinePumpWalletAccounts,readOfflinePumpWalletBalances} from './pump-wallet-accounts.js';
import {rejectPump} from './pump-sdk-boundary.js';

// Hypothetical local account effects only. Never a finalized receipt or PnL event.
export function inspectPumpFixtureEconomics({venue,intent,executionWallet,beforeAccounts,afterAccounts,networkFeeLamports,now=Date.now()}={}){
 if(venue?.source!=='LOCAL_FIXTURE')rejectPump('PUMP_FIXTURE_ECONOMICS_ONLY');
 const quote=quotePumpVenue({venue,intent,now}),before=inspectOfflinePumpWalletAccounts({venue,intent,executionWallet,accounts:beforeAccounts,networkFeeLamports,now}),after=readOfflinePumpWalletBalances({venue,executionWallet,accounts:afterAccounts});
 const solDelta=BigInt(after.solBalance)-BigInt(before.solBalance),baseDelta=BigInt(after.baseBalance)-BigInt(before.baseBalance),wsolDelta=BigInt(after.wsolBalance)-BigInt(before.wsolBalance),fee=BigInt(networkFeeLamports),buy=intent.side==='BUY';
 let debit,output;
 if(venue.kind==='PUMPSWAP'){
  if(solDelta!==-fee)rejectPump('PUMP_FIXTURE_UNEXPECTED_SOL_OR_RENT_CHANGE');debit=buy?-wsolDelta:-baseDelta;output=buy?baseDelta:wsolDelta;
 }else{debit=buy?-solDelta-fee:-baseDelta;output=buy?baseDelta:solDelta+fee;}
 if(debit<=0n||output<BigInt(quote.minimumOutput)||buy&&debit>BigInt(quote.inputAmount)||!buy&&debit!==BigInt(quote.inputAmount))rejectPump('PUMP_FIXTURE_ECONOMICS_MISMATCH');
 return Object.freeze({schema:'PUMP_FIXTURE_ECONOMIC_EFFECTS_V1',provenance:'DERIVED',source:'LOCAL_FIXTURE',inputSemantics:quote.inputSemantics,fixtureInputDebit:debit.toString(),fixtureOutputCredit:output.toString(),unspentBudget:(BigInt(quote.inputAmount)-debit).toString(),solDelta:solDelta.toString(),baseDelta:baseDelta.toString(),wsolDelta:wsolDelta.toString(),networkFeeLamports,notReceipt:true,positionEffect:null,pnlEffect:null,authorizationGranted:false});
}
