import {PublicKey} from '@solana/web3.js';

export const TICKER_LIMITS=Object.freeze({universe:24,cacheMs:45_000,batchSize:30});
export const TICKER_SCOPE='Dexscreener latest boosted Solana tokens · liquid pumpfun/pumpswap/raydium/orca pairs · 24h change. Indicative prices only; not executable quotes.';
const VENUES=new Set(['pumpfun','pumpswap','raydium','orca']);
const venueRank=id=>id==='pumpfun'?0:id==='pumpswap'?1:2;
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
const optionalNumber=n=>n!==undefined&&n!==null&&Number.isFinite(Number(n))?Number(n):null;
const validMint=value=>{try{return typeof value==='string'&&new PublicKey(value).toBase58()===value;}catch{return false;}};
const providerCode=status=>status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE';

function empty(status,observedAt){
  return {status,source:'Dexscreener',provenance:'UNAVAILABLE',changeWindow:'24h',network:'solana:101',observedAt,stale:false,scope:TICKER_SCOPE,items:[]};
}

function choosePair(pairs,mint){
  return pairs
    .filter(p=>p.chainId==='solana'&&VENUES.has(p.dexId)&&p.baseToken?.address===mint&&positive(p.priceUsd)&&optionalNumber(p.priceChange?.h24)!=null&&positive(p.liquidity?.usd))
    .sort((a,b)=>venueRank(a.dexId)-venueRank(b.dexId)||(b.liquidity?.usd??0)-(a.liquidity?.usd??0))[0]??null;
}

function mapItem(mint,p){
  const url=typeof p.url==='string'&&p.url.startsWith('https://dexscreener.com/')?p.url:`https://dexscreener.com/solana/${p.pairAddress}`;
  return {
    mint,
    symbol:String(p.baseToken?.symbol||'').slice(0,16)||mint.slice(0,4),
    priceUsd:Number(p.priceUsd),
    change24h:Number(p.priceChange.h24),
    venue:p.dexId,
    pair:p.pairAddress,
    url,
    provenance:'BACKEND VERIFIED'
  };
}

export function createMarketTicker({fetcher=fetch,now=Date.now}={}){
  let cache=null,pending=null;
  async function refresh(){
    const observedAt=now();
    try{
      const boostsRes=await fetcher('https://api.dexscreener.com/token-boosts/latest/v1',{signal:AbortSignal.timeout(10_000)});
      if(!boostsRes.ok)throw Object.assign(Error('Ticker boosts unavailable'),{code:providerCode(boostsRes.status)});
      const boosts=await boostsRes.json();
      if(!Array.isArray(boosts))throw Object.assign(Error('Invalid ticker boosts'),{code:'PROVIDER_UNAVAILABLE'});
      const mints=[...new Set(boosts.filter(p=>p?.chainId==='solana'&&validMint(p.tokenAddress)).map(p=>p.tokenAddress))].slice(0,TICKER_LIMITS.universe);
      if(!mints.length)return empty('UNAVAILABLE',observedAt);
      const pairs=[];
      for(let i=0;i<mints.length;i+=TICKER_LIMITS.batchSize){
        const batch=mints.slice(i,i+TICKER_LIMITS.batchSize);
        const tokensRes=await fetcher('https://api.dexscreener.com/latest/dex/tokens/'+batch.map(encodeURIComponent).join(','),{signal:AbortSignal.timeout(10_000)});
        if(!tokensRes.ok)throw Object.assign(Error('Ticker pairs unavailable'),{code:providerCode(tokensRes.status)});
        const body=await tokensRes.json();
        if(Array.isArray(body?.pairs))pairs.push(...body.pairs);
      }
      const items=[];
      for(const mint of mints){
        const p=choosePair(pairs,mint);
        if(p)items.push(mapItem(mint,p));
      }
      if(!items.length)return empty('UNAVAILABLE',observedAt);
      return {status:'OK',source:'Dexscreener',provenance:'BACKEND VERIFIED',changeWindow:'24h',network:'solana:101',observedAt,stale:false,scope:TICKER_SCOPE,items};
    }catch(e){
      const status=e?.code==='RATE_LIMITED'||e?.code==='PROVIDER_UNAVAILABLE'?e.code:'PROVIDER_UNAVAILABLE';
      if(cache?.snap?.items?.length)return {...cache.snap,status,stale:true,observedAt:cache.snap.observedAt};
      return empty(status,observedAt);
    }
  }
  return async()=>{
    if(cache&&now()-cache.fetchedAt<TICKER_LIMITS.cacheMs)return {...cache.snap,stale:cache.snap.stale===true};
    if(pending)return pending;
    pending=refresh().then(snap=>{cache={snap,fetchedAt:now()};return snap;}).finally(()=>{pending=null;});
    return pending;
  };
}

export function installMarketTicker(app,{ticker}={}){
  const read=typeof ticker==='function'?ticker:createMarketTicker();
  app.get('/api/market/ticker',async(_req,res)=>{
    try{res.json(await read());}
    catch{res.status(503).json(empty('PROVIDER_UNAVAILABLE',Date.now()));}
  });
}
