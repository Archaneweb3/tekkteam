import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {createMarketTicker} from '../server/market-ticker.js';
import {createServer} from '../server/app.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const mint=(n=1)=>Array.from({length:n},()=>Keypair.generate().publicKey.toBase58());
const pair=(tokenMint,{dexId='pumpfun',symbol='PEPE',priceUsd='0.0012',h24=12.5,liq=80000}={})=>({
  chainId:'solana',dexId,url:`https://dexscreener.com/solana/pair-${tokenMint.slice(0,8)}`,pairAddress:`pair-${tokenMint.slice(0,16)}`,
  baseToken:{address:tokenMint,name:symbol,symbol},quoteToken:{address:'So11111111111111111111111111111111111111112',name:'SOL',symbol:'SOL'},
  priceUsd,liquidity:{usd:liq},priceChange:{h24,m5:1,h1:2}
});

function fixtureFetcher({boosts,pairsByMint,status=200}={}){
  return async url=>{
    if(String(url).includes('/token-boosts/')){
      if(status!==200)return {ok:false,status};
      return {ok:true,json:async()=>boosts};
    }
    if(String(url).includes('/latest/dex/tokens/')){
      const ids=decodeURIComponent(String(url).split('/').at(-1)).split(',');
      const pairs=ids.flatMap(id=>pairsByMint[id]??[]);
      return {ok:true,json:async()=>({pairs})};
    }
    throw Error('unexpected url '+url);
  };
}

test('ticker maps Solana boosts to symbol, USD price and 24h change; prefers pumpfun',async()=>{
  const [a,b,eth]=mint(3);
  const ticker=createMarketTicker({now:()=>1_800_000_000_000,fetcher:fixtureFetcher({
    boosts:[{chainId:'solana',tokenAddress:a},{chainId:'ethereum',tokenAddress:eth},{chainId:'solana',tokenAddress:b},{chainId:'solana',tokenAddress:'not-a-mint'}],
    pairsByMint:{
      [a]:[pair(a,{dexId:'raydium',symbol:'AAA',priceUsd:'1',h24:1,liq:1e6}),pair(a,{dexId:'pumpfun',symbol:'AAA',priceUsd:'0.5',h24:25,liq:50_000})],
      [b]:[pair(b,{dexId:'pumpswap',symbol:'BBB',priceUsd:'2',h24:-3.2,liq:90_000})]
    }
  })});
  const snap=await ticker();
  assert.equal(snap.status,'OK');
  assert.equal(snap.source,'Dexscreener');
  assert.equal(snap.provenance,'BACKEND VERIFIED');
  assert.equal(snap.changeWindow,'24h');
  assert.equal(snap.items.length,2);
  assert.deepEqual(snap.items[0],{
    mint:a,symbol:'AAA',priceUsd:0.5,change24h:25,venue:'pumpfun',pair:`pair-${a.slice(0,16)}`,
    url:`https://dexscreener.com/solana/pair-${a.slice(0,8)}`,provenance:'BACKEND VERIFIED'
  });
  assert.equal(snap.items[1].symbol,'BBB');
  assert.equal(snap.items[1].change24h,-3.2);
  assert.equal(snap.items[1].venue,'pumpswap');
});

test('ticker cache avoids refetch inside TTL; after TTL 429 returns stale snapshot',async()=>{
  let time=1_800_000_000_000,calls=0;
  const [a]=mint(1);
  const ok=fixtureFetcher({boosts:[{chainId:'solana',tokenAddress:a}],pairsByMint:{[a]:[pair(a)]}});
  const ticker=createMarketTicker({now:()=>time,fetcher:async url=>{
    calls++;
    if(calls<=2)return ok(url);
    return {ok:false,status:429};
  }});
  assert.equal((await ticker()).status,'OK');
  assert.equal(calls,2);
  assert.equal((await ticker()).status,'OK');
  assert.equal(calls,2);
  time+=46_000;
  const stale=await ticker();
  assert.equal(stale.status,'RATE_LIMITED');
  assert.equal(stale.stale,true);
  assert.equal(stale.items.length,1);
  assert.equal(stale.items[0].symbol,'PEPE');
});

test('hard provider failure with empty cache does not invent rows',async()=>{
  const ticker=createMarketTicker({fetcher:async()=>({ok:false,status:503})});
  const snap=await ticker();
  assert.equal(snap.status,'PROVIDER_UNAVAILABLE');
  assert.deepEqual(snap.items,[]);
  assert.equal(snap.provenance,'UNAVAILABLE');
});

test('GET /api/market/ticker serves injected ticker snapshot',async t=>{
  const [a]=mint(1);
  const snapshot={status:'OK',source:'Dexscreener',provenance:'BACKEND VERIFIED',changeWindow:'24h',network:'solana:101',observedAt:1,stale:false,scope:'test',items:[{mint:a,symbol:'ZZZ',priceUsd:0.1,change24h:4,venue:'pumpfun',pair:'x',url:'https://dexscreener.com/solana/x',provenance:'BACKEND VERIFIED'}]};
  const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tw-ticker-')),'db.sqlite'),marketTicker:async()=>snapshot});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();instance.close();});
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/market/ticker`);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),snapshot);
});
