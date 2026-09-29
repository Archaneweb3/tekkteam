import {PublicKey} from '@solana/web3.js';
import {quoteProblem} from './market-radar.js';
import {strategyConfigFor,PROFILES} from '../public/app/strategy-config.js';
export const SCANNER_LIMITS=Object.freeze({universe:24,discoveryMs:120000,snapshotMs:15000,maxRadarCandidates:8,maxActiveEvaluations:3,concurrency:3});
export const DISCOVERY_SCOPE='Dexscreener latest token profiles · up to 24 Solana mints · supported liquid pairs only. Not all Solana markets, trending tokens or all new launches.';
export function validMint(value){try{return typeof value==='string'&&new PublicKey(value).toBase58()===value;}catch{return false;}}
export const providerCode=e=>['RATE_LIMITED','MARKET_UNAVAILABLE'].includes(e?.code)?e.code:'PROVIDER_UNAVAILABLE';
// A single service instance is shared by all agents. Reads of Radar never scan.
export function createMarketDiscovery({market,fetcher=fetch,now=Date.now}={}){
 let discovery=null,discoveryDue=0,scan=null,scanDue=0,pending=null;
 async function refresh(){
  if(now()>=discoveryDue){
   discoveryDue=now()+SCANNER_LIMITS.discoveryMs;
   try{const response=await fetcher('https://api.dexscreener.com/token-profiles/latest/v1',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(Error('Discovery unavailable'),{code:response.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE'});
    const data=await response.json();if(!Array.isArray(data))throw Error('Invalid discovery response');
    const mints=[...new Set(data.slice(0,500).filter(p=>p.chainId==='solana'&&validMint(p.tokenAddress)).map(p=>p.tokenAddress))].slice(0,SCANNER_LIMITS.universe).sort();
    discovery={status:'OK',mints,discoveredAt:now()};
   }catch(e){discovery={status:providerCode(e),mints:[],discoveredAt:now()};}
  }
  if(discovery.status!=='OK')return {...discovery,candidates:[],checkedAt:now()};
  const candidates=new Array(discovery.mints.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(SCANNER_LIMITS.concurrency,candidates.length)},async()=>{while(cursor<candidates.length){const index=cursor++,mint=discovery.mints[index];try{candidates[index]={mint,quote:await market(mint),error:null};}catch(e){candidates[index]={mint,quote:null,error:providerCode(e)};}}}));
  return {...discovery,candidates,checkedAt:now()};
 }
 return {async scan(){if(pending)return pending;if(scan&&now()<scanDue)return structuredClone(scan);pending=refresh();try{scan=await pending;scanDue=now()+SCANNER_LIMITS.snapshotMs;return structuredClone(scan);}finally{pending=null;}},limits:SCANNER_LIMITS};
}
// No confidence score: eligible first, then count of actual entry filters passed,
// then liquidity descending and mint ascending. Held position is managed first.
export function candidateQueue(state,universe,now){
 const config=strategyConfigFor(state),profile=PROFILES[config.strategy];
 const rows=[...new Map(universe.candidates.map(c=>[c.mint,c])).values()].slice(0,SCANNER_LIMITS.universe).map(c=>{
  const q=c.quote;let reason=c.error??(!validMint(c.mint)?'INVALID_MINT':quoteProblem(q,c.mint,now));
  if(!reason&&q.liquidityUsd<config.signal.minLiquidityUsd)reason='MINIMUM_LIQUIDITY';
  if(!reason&&q.volume5m<config.signal.minVolume5mUsd)reason='MINIMUM_VOLUME';
  const eligible=!reason;
  const signals=eligible?{liquidityPassed:true,volumePassed:true,momentumPassed:q.change5m>=config.signal.minPriceChange5mPercent&&q.change5m<=profile.maxChange,ratioPassed:q.buys5m>=Math.max(1,q.sells5m)*profile.minRatio}:null;
  return {...c,eligible,reason,signals,passCount:signals?Object.values(signals).filter(Boolean).length:0};
 });
 rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.passCount-a.passCount||(b.quote?.liquidityUsd??0)-(a.quote?.liquidityUsd??0)||a.mint.localeCompare(b.mint));
 return {scanned:rows.length,eligible:rows.filter(c=>c.eligible).length,rejections:rows.filter(c=>!c.eligible).map(c=>({mint:c.mint,reason:c.reason})),rows:rows.slice(0,SCANNER_LIMITS.maxRadarCandidates)};
}
