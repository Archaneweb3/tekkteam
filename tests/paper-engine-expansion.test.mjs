import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyIntent,executePaper,riskCheck,LIMITS,PROFILES} from '../server/paper-engine.js';
import {createMarketFeed,SOL_MINT} from '../server/market-data.js';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const now=1800000000000;
const market=(time=now,price=1,sol=150)=>({mint,network:'solana:101',priceUsd:price,solUsd:sol,liquidityUsd:100000,change5m:2,volume5m:2000,buys5m:10,sells5m:2,observedAt:time,snapshotId:'snapshot-1'});
const state=()=>({agentId:'agent-1',mint,mode:'paper',enabled:true,strategy:'balanced',cashUsd:15,realizedUsd:0,initialSol:.1,cashSol:.1,realizedSol:0,dailySpentSol:0});
test('structured deterministic intent and independent paper kill switch',()=>{
 const s=state(),q=market(),intent=strategyIntent(s,q,now);
 assert.ok(PROFILES.balanced);assert.equal(intent.action,'BUY');assert.equal(intent.tokenMint,mint);assert.equal(intent.requestedSizeSol,intent.sol);assert.equal(intent.confidence,null);assert.equal(intent.marketSnapshotId,'snapshot-1');
 assert.equal(riskCheck({...s,paperKillSwitch:true},intent,q,now).allowed,false);
 assert.equal(riskCheck({...s,mode:'live'},intent,q,now).allowed,false);
 assert.equal(riskCheck({...s,initialSol:.001},intent,q,now).allowed,false);
});
test('invalid accounting and daily spending fail closed without state mutation',()=>{
 const q=market();
 for(const patch of [{dailySpentSol:-1},{dailySpentSol:NaN},{cashSol:NaN},{cashSol:-1},{initialSol:0},{realizedSol:NaN},{cashUsd:NaN},{lastTradeAt:NaN}]){
  const s={...state(),...patch},before=structuredClone(s),result=executePaper(s,strategyIntent(s,q,now),q,now);
  assert.equal(result.risk.allowed,false);assert.deepEqual(s,before);
 }
 const s=state();executePaper(s,strategyIntent(s,q,now),q,now);s.position.costSol=null;
 assert.equal(executePaper(s,{side:'SELL',mint,sol:.001},market(now+61000),now+61000).risk.allowed,false);
});
test('native SOL basis survives SOL price movement and partial close counts only once',()=>{
 const s=state(),buy=executePaper(s,strategyIntent(s,market(),now),market(),now);
 assert.equal(buy.receipt.positionClosed,false);const id=s.position.positionId;
 const later=now+LIMITS.cooldownMs+1,q=market(later,2,200);
 const partial=executePaper(s,{side:'SELL',mint,sol:.0006,reason:'test partial'},q,later);
 assert.equal(partial.receipt.positionClosed,false);assert.equal(partial.receipt.closedPositionPnlSol,null);assert.equal(partial.receipt.positionId,id);
 const last=later+LIMITS.cooldownMs+1,close=executePaper(s,{side:'SELL',mint,sol:.001,reason:'test close'},market(last,2,200),last);
 assert.equal(close.receipt.positionClosed,true);assert.equal(s.position,null);assert.equal(close.receipt.positionId,id);
 assert.ok(close.receipt.solNotional<.001);assert.ok(Math.abs(close.receipt.closedPositionPnlSol-s.realizedSol)<1e-12);
 assert.ok(Math.abs(s.cashSol-s.initialSol-s.realizedSol)<1e-12);
});
test('market requests coalesce and cached snapshot observation is not refreshed',async()=>{
 let clock=now,calls=0;
 const feed=createMarketFeed({now:()=>clock,fetcher:async url=>{calls++;await new Promise(r=>setTimeout(r,5));const address=url.split('/').at(-1);return {ok:true,json:async()=>[{chainId:'solana',baseToken:{address,symbol:address===SOL_MINT?'SOL':'TEST'},dexId:'raydium',pairAddress:'pair-'+address,priceUsd:'1',liquidity:{usd:100000},txns:{m5:{buys:3,sells:2}}}]};}});
 const [a,b]=await Promise.all([feed(mint),feed(mint)]);assert.equal(calls,2);assert.equal(a.snapshotId,b.snapshotId);
 clock+=10000;const c=await feed(mint);assert.equal(c.snapshotId,a.snapshotId);assert.equal(c.observedAt,now);assert.equal(c.timestamp,now);assert.equal(c.tokenSymbol,'TEST');
 clock+=6000;const d=await feed(mint);assert.equal(calls,4);assert.notEqual(d.snapshotId,a.snapshotId);
});
