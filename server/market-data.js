import {PublicKey} from '@solana/web3.js';
export const SOL_MINT='So11111111111111111111111111111111111111112';
const venues=new Set(['pumpfun','pumpswap','raydium','orca']);
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const optionalNumber=n=>n!==undefined&&n!==null&&Number.isFinite(Number(n))?Number(n):null;
// Official read-only API: https://docs.dexscreener.com/api/reference
// Aggregated indicative prices are NOT executable quotes or guaranteed fills.
export function createMarketFeed({fetcher=fetch,now=Date.now,pairAddress=null}={}){
 const cache=new Map(),pending=new Map();let blockedUntil=0,windowStart=now(),requests=0;
 async function pairs(mint){
  new PublicKey(mint);const prior=cache.get(mint);if(prior&&now()-prior.time<15000)return prior;
  if(pending.has(mint))return pending.get(mint);
  if(now()-windowStart>=60000){windowStart=now();requests=0;}
  if(now()<blockedUntil||requests>=120)throw Object.assign(Error('Market provider rate limited'),{code:'RATE_LIMITED'});
  requests++;
  const request=(async()=>{
  const r=await fetcher('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(mint),{signal:AbortSignal.timeout(10000)});
  if(!r.ok){if(r.status===429)blockedUntil=now()+60000;throw Object.assign(Error('Mainnet market data HTTP '+r.status),{code:r.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE'});}
  const data=await r.json();if(!Array.isArray(data))throw Error('Invalid market response');
  const entry={time:now(),data:data.slice(0,200)};cache.delete(mint);cache.set(mint,entry);while(cache.size>128)cache.delete(cache.keys().next().value);return entry;
  })();pending.set(mint,request);
  try{return await request;}finally{pending.delete(mint);}
 }
 function choose(data,mint,requiredPair=null){return data.filter(p=>p.chainId==='solana'&&p.baseToken?.address===mint&&(!requiredPair||p.pairAddress===requiredPair)&&venues.has(p.dexId)&&positive(p.priceUsd)&&positive(p.liquidity?.usd)).sort((a,b)=>b.liquidity.usd-a.liquidity.usd)[0];}
 return async mint=>{
  const [tokens,sol]=await Promise.all([pairs(mint),pairs(SOL_MINT)]);const p=choose(tokens.data,mint,pairAddress),s=choose(sol.data,SOL_MINT);
  if(!p||!s)throw Object.assign(Error('No eligible liquid Mainnet market found. Paper trading waits; no fabricated prices.'),{code:'MARKET_UNAVAILABLE'});
  const observedAt=Math.min(tokens.time,sol.time),buys5m=optionalNumber(p.txns?.m5?.buys),sells5m=optionalNumber(p.txns?.m5?.sells),priceUsd=Number(p.priceUsd),volume5m=optionalNumber(p.volume?.m5),change5m=optionalNumber(p.priceChange?.m5);
  return {mint,tokenMint:mint,baseMint:p.baseToken?.address??null,quoteMint:p.quoteToken?.address??null,tokenName:p.baseToken?.name??null,tokenSymbol:p.baseToken?.symbol??null,symbol:p.baseToken?.symbol??null,network:'solana:101',source:'Dexscreener',pair:p.pairAddress,venue:p.dexId,priceUsd,price:priceUsd,solUsd:Number(s.priceUsd),liquidityUsd:Number(p.liquidity.usd),change5m,priceChange:change5m,priceChange5m:optionalNumber(p.priceChange?.m5),priceChange1h:optionalNumber(p.priceChange?.h1),volume5m,volume:volume5m,volume1h:optionalNumber(p.volume?.h1),buys5m,sells5m,buySellRatio:sells5m>0?buys5m/sells5m:null,observedAt,timestamp:observedAt,snapshotId:`dexscreener:${mint}:${p.pairAddress}:${tokens.time}:${sol.time}`,stale:now()-observedAt>30000,timestampKind:'API retrieval time; source trade timestamp unavailable'};
 };
}

// Read a named market without pretending that a token-level top-pairs query
// includes every pool. The USD price of the quote token is derived from this
// SAME pair's base USD/native prices, never from an unrelated market.
export function createPairMarketFeed({fetcher=fetch,now=Date.now}={}){
 return async({mint,pair})=>{
  new PublicKey(mint);new PublicKey(pair);
  const response=await fetcher('https://api.dexscreener.com/latest/dex/pairs/solana/'+encodeURIComponent(pair),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(Error('Market pair unavailable'),{code:'PROVIDER_UNAVAILABLE'});
  const body=await response.json(),p=body?.pairs?.find(x=>x.chainId==='solana'&&x.pairAddress===pair);
  if(!p||p.dexId!=='raydium'||p.baseToken?.address!==SOL_MINT||p.quoteToken?.address!==mint||!positive(p.priceUsd)||!positive(p.priceNative)||!positive(p.liquidity?.usd))throw Object.assign(Error('Pair identity unavailable'),{code:'MARKET_UNAVAILABLE'});
  const observedAt=now(),priceUsd=Number(p.priceUsd)/Number(p.priceNative),solUsd=Number(p.priceUsd),buys5m=optionalNumber(p.txns?.m5?.sells),sells5m=optionalNumber(p.txns?.m5?.buys),baseChange=optionalNumber(p.priceChange?.m5),change5m=baseChange!=null&&baseChange>-100?-baseChange/(1+baseChange/100):null;
  return {mint,tokenMint:mint,baseMint:SOL_MINT,quoteMint:mint,tokenName:p.quoteToken.name??null,tokenSymbol:p.quoteToken.symbol??null,network:'solana:101',source:'Dexscreener',pair:p.pairAddress,venue:p.dexId,priceUsd,solUsd,liquidityUsd:Number(p.liquidity.usd),volume5m:optionalNumber(p.volume?.m5),change5m,buys5m,sells5m,observedAt,snapshotId:`dexscreener:pair:${pair}:${observedAt}`,timestampKind:'API retrieval time; quote-token USD price derived from same pair',priceDerivation:'baseUsdDividedByBaseNative'};
 };
}
