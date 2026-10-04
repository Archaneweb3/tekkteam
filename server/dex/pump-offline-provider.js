import {createHash} from 'node:crypto';
import {decodePumpVenueBundle} from './pump-account-decoder.js';
import {quotePumpVenue} from './pump-quote.js';
import {rejectPump} from './pump-sdk-boundary.js';

// Existing executor quote contract only. This supplies no execution adapter.
export function createPumpOfflineQuoteProvider({readBundle,now=Date.now}={}){
 if(typeof readBundle!=='function')rejectPump('PUMP_QUOTE_READER_REQUIRED');
 return Object.freeze({async quote(input){
  const intent=Object.freeze(Object.fromEntries(['network','direction','agentId','owner','agentWallet','inputMint','outputMint','inputAmount','slippageBps','expiresAt'].map(key=>[key,input?.[key]])));
  if(intent?.network!=='solana:mainnet'||!['BUY','SELL'].includes(intent.direction))rejectPump('PUMP_QUOTE_INTENT_INVALID');
  const venue=decodePumpVenueBundle(await readBundle(intent)),createdAt=now();
  const quote=quotePumpVenue({venue,now:createdAt,intent:{...intent,network:'solana:101',side:intent.direction}});
  const result={...quote,provider:'PUMP_OFFLINE_SDK',network:'solana:mainnet',createdAt,route:Object.freeze([Object.freeze({ammKey:venue.venue,label:venue.kind,inputMint:intent.inputMint,outputMint:intent.outputMint,percent:100})]),priceImpactPct:null};
  result.reference=createHash('sha256').update(JSON.stringify({...result,agentWallet:intent.agentWallet})).digest('hex');return Object.freeze(result);
 }});
}
