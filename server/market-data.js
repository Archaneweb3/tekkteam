import {PublicKey} from '@solana/web3.js';
export const SOL_MINT='So11111111111111111111111111111111111111112';
const venues=new Set(['pumpfun','pumpswap','raydium','orca']);
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const optionalNumber=n=>n!==undefined&&n!==null&&Number.isFinite(Number(n))?Number(n):null;
// Official read-only API: https://docs.dexscreener.com/api/reference
// Aggregated indicative prices are NOT executable quotes or guaranteed fills.
export function createMarketFeed({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 async function pairs(mint){
  new PublicKey(mint);const prior=cache.get(mint);if(prior&&now()-prior.time<15000)return prior;
  if(pending.has(mint))return pending.get(mint);
  const request=(async()=>{
  const r=await fetcher('https://api.dexscreener.com/token-pairs/v1/solana/'+encodeURIComponent(mint),{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Mainnet market data HTTP '+r.status);
  const data=await r.json();if(!Array.isArray(data))throw Error('Invalid market response');
  const entry={time:now(),data};cache.set(mint,entry);return entry;
  })();pending.set(mint,request);
  try{return await request;}finally{pending.delete(mint);}
 }
 function choose(data,mint){return data.filter(p=>p.chainId==='solana'&&p.baseToken?.address===mint&&venues.has(p.dexId)&&positive(p.priceUsd)&&positive(p.liquidity?.usd)).sort((a,b)=>b.liquidity.usd-a.liquidity.usd)[0];}
 return async mint=>{
  const [tokens,sol]=await Promise.all([pairs(mint),pairs(SOL_MINT)]);const p=choose(tokens.data,mint),s=choose(sol.data,SOL_MINT);
  if(!p||!s)throw Error('No eligible liquid Mainnet market found. Paper trading waits; no fabricated prices.');
  const observedAt=Math.min(tokens.time,sol.time),buys5m=Number(p.txns?.m5?.buys??0),sells5m=Number(p.txns?.m5?.sells??0),priceUsd=Number(p.priceUsd),volume5m=Number(p.volume?.m5??0),change5m=Number(p.priceChange?.m5??0);
  return {mint,tokenMint:mint,tokenSymbol:p.baseToken?.symbol??null,symbol:p.baseToken?.symbol??null,network:'solana:101',source:'Dexscreener',pair:p.pairAddress,venue:p.dexId,priceUsd,price:priceUsd,solUsd:Number(s.priceUsd),liquidityUsd:Number(p.liquidity.usd),change5m,priceChange:change5m,priceChange5m:optionalNumber(p.priceChange?.m5),priceChange1h:optionalNumber(p.priceChange?.h1),volume5m,volume:volume5m,volume1h:optionalNumber(p.volume?.h1),buys5m,sells5m,buySellRatio:sells5m>0?buys5m/sells5m:null,observedAt,timestamp:observedAt,snapshotId:`dexscreener:${mint}:${p.pairAddress}:${tokens.time}:${sol.time}`,stale:now()-observedAt>30000,timestampKind:'API retrieval time; source trade timestamp unavailable'};
 };
}
