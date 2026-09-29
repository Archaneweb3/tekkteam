import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {snapshot as poolSnapshot} from './cpmm-envelope-fixture.mjs';
import {fixtureMarket,fixturePoolVerification} from './market-provenance-fixture.mjs';
import {marketIdentity,resolveMarketProvenance,assertMarketBinding} from '../server/dex/market-provenance.js';
import {inspectCpmmSnapshot} from '../server/dex/concrete-cpmm-proof.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {createPairMarketFeed} from '../server/market-data.js';
import {strategyIntent} from '../server/paper-engine.js';

const now=1_800_000_000_000,wallet=SOL_MINT;
const resolve=(snapshot,verifyPool=fixturePoolVerification)=>resolveMarketProvenance({snapshot,mint:CONTROLLED_USDC_MINT,agentWallet:wallet,now:()=>now,verifyPool});
const intent={direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL};
test('supported identity binds the same discovery pair to independently inspected CPMM account',async()=>{
 const market=fixtureMarket(now),result=await resolve(market,async()=>{inspectCpmmSnapshot(poolSnapshot);return fixturePoolVerification();});
 assert.equal(result.status,'SUPPORTED_RAYDIUM_CPMM');assert.equal(result.binding.identity.market,market.pair);assert.equal(result.binding.identity.baseMint,SOL_MINT);assert.equal(result.binding.identity.quoteMint,CONTROLLED_USDC_MINT);assert.equal(result.binding.pool,CONTROLLED_CPMM_POOL);assert.equal(assertMarketBinding(result.binding,market,intent),true);
 assert.throws(()=>assertMarketBinding(result.binding,{...market,pair:'11111111111111111111111111111111'},intent),/MARKET_PROVENANCE_MISMATCH/);
 assert.throws(()=>assertMarketBinding(result.binding,market,{...intent,outputMint:SOL_MINT}),/MARKET_PROVENANCE_MISMATCH/);
});
test('real loader policy.snapshot shape and non-USDC classic CPMM pair bind correctly',async()=>{
 const pool='Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp',mint='Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
 const chain=JSON.parse(readFileSync(new URL('./fixtures/useless-cpmm-mainnet.json',import.meta.url)));
 const market={...fixtureMarket(now),mint,tokenMint:mint,baseMint:mint,quoteMint:SOL_MINT,pair:pool,snapshotId:'candidate-snapshot'};
 const result=await resolveMarketProvenance({snapshot:market,mint,agentWallet:wallet,now:()=>now,verifyPool:async()=>{inspectCpmmSnapshot(chain,pool);return {pool,slot:chain.slot,policy:{snapshot:chain}};}});
 assert.equal(result.status,'SUPPORTED_RAYDIUM_CPMM');assert.equal(result.binding.pool,pool);
 assert.equal(assertMarketBinding(result.binding,market,{direction:'BUY',inputMint:SOL_MINT,outputMint:mint,pool}),true);
});
test('provider hint mismatches and stale discovery fail before pool read',async()=>{
 const m=fixtureMarket(now),mutations=[
  {pair:'11111111111111111111111111111111'},
  {mint:SOL_MINT},{tokenMint:SOL_MINT},{quoteMint:SOL_MINT},
  {venue:'pumpfun'},{network:'solana:devnet'},{observedAt:now-31000},
  {source:'Unverified'},{pair:null}
 ];
 for(const patch of mutations){let reads=0;const result=await resolve({...m,...patch},async()=>{reads++;return fixturePoolVerification();});assert.equal(result.status,'UNSUPPORTED_EXECUTION_VENUE',JSON.stringify(patch));assert.equal(reads,patch.pair&&patch.pair!==m.pair?1:0);}
 const secondMarket={...m,pair:'11111111111111111111111111111111',snapshotId:'different-pair'};
 assert.notDeepEqual(marketIdentity(m),marketIdentity(secondMarket));
});
test('on-chain pool, program, mint and vault provenance fail closed',async()=>{
 const m=fixtureMarket(now);
 for(const [index,mutate] of [
  x=>{x.pool='11111111111111111111111111111111';},
  x=>{x.snapshot.accounts.find(a=>a.address===CONTROLLED_CPMM_POOL).owner='11111111111111111111111111111111';},
  x=>{x.snapshot.accounts.find(a=>a.address===CONTROLLED_CPMM_POOL).data='AAAA';},
  x=>{const pool=x.snapshot.accounts.find(a=>a.address===CONTROLLED_CPMM_POOL),b=Buffer.from(pool.data,'base64');Buffer.alloc(32).copy(b,8+32*5);pool.data=b.toString('base64');},
  x=>{const vault=x.snapshot.accounts.find(a=>a.address===inspectCpmmSnapshot(x.snapshot).vault0),b=Buffer.from(vault.data,'base64');Buffer.alloc(32).copy(b,0);vault.data=b.toString('base64');},
  x=>{x.snapshot.genesis='devnet';}
 ].entries()){
  const x=structuredClone(await fixturePoolVerification());mutate(x);
  const r=await resolve(m,async()=>{inspectCpmmSnapshot(x.snapshot);return x;});
  assert.equal(r.status,'UNSUPPORTED_EXECUTION_VENUE',`mutation ${index}`);
 }
});
test('named WSOL/USDC pair is represented as a strategy-compatible USDC snapshot without another pool',async()=>{
 const pair={chainId:'solana',pairAddress:CONTROLLED_CPMM_POOL,dexId:'raydium',baseToken:{address:SOL_MINT,symbol:'SOL'},quoteToken:{address:CONTROLLED_USDC_MINT,symbol:'USDC'},priceUsd:'120',priceNative:'120',liquidity:{usd:100000},volume:{m5:10000},priceChange:{m5:-2},txns:{m5:{buys:2,sells:10}}};
 const feed=createPairMarketFeed({now:()=>now,fetcher:async()=>({ok:true,json:async()=>({pairs:[pair]})})}),market=await feed({mint:CONTROLLED_USDC_MINT,pair:CONTROLLED_CPMM_POOL});
 assert.equal(market.mint,CONTROLLED_USDC_MINT);assert.equal(market.pair,CONTROLLED_CPMM_POOL);assert.equal(market.priceUsd,1);assert.equal(market.buys5m,10);assert.equal(market.sells5m,2);assert.ok(market.change5m>2);
 const signal=strategyIntent({agentId:'fixture-agent',mint:CONTROLLED_USDC_MINT,strategy:'momentum',position:null},market,now);assert.equal(signal.side,'BUY');assert.equal(signal.tokenMint,market.mint);
 assert.equal((await resolve(market)).status,'SUPPORTED_RAYDIUM_CPMM');
});
