import test from 'node:test';
import assert from 'node:assert/strict';
import {PERSONALITIES,personalitySizeLamports} from '../public/app/agent-personalities.js';
import {defaultStrategyConfig,validateStrategyConfig} from '../public/app/strategy-config.js';
import {strategyIntent,riskCheck,executePaper} from '../server/paper-engine.js';
import {candidateQueue} from '../server/market-discovery.js';
const now=1800000000000;
const market={mint:'test',network:'solana:101',priceUsd:1,solUsd:100,liquidityUsd:100000,volume5m:5000,change5m:2,buys5m:30,sells5m:10,observedAt:now};
const state=id=>({agentId:id,mint:'test',strategy:id,strategyConfig:defaultStrategyConfig(id),mode:'paper',enabled:true,cashSol:.0005,cashUsd:.05,initialSol:.01,realizedSol:0,realizedUsd:0,dailySpentSol:0,dailyDate:new Date(now).toISOString().slice(0,10)});
test('five personalities pass distinct discovery tiers and all WAIT on invalid market evidence',()=>{
 const mint='So11111111111111111111111111111111111111112',ids=Object.keys(PERSONALITIES);
 const decide=(id,quote)=>{const s={...state(id),mint,signalOnly:true};return candidateQueue(s,{candidates:[{mint:quote.mint,quote}]},now).rows[0]?.eligible&&strategyIntent(s,quote,now).side==='BUY'?'BUY':'WAIT';};
 const rows=[[.3,550,11000,11,'00001'],[.6,650,13000,12,'00011'],[.8,800,16000,13,'00111'],[1.1,1100,26000,16,'01111'],[1.6,1600,31000,19,'11111']];
 for(const [change5m,volume5m,liquidityUsd,buys5m,expected] of rows)assert.equal(ids.map(id=>decide(id,{...market,mint,change5m,volume5m,liquidityUsd,buys5m})==='BUY'?'1':'0').join(''),expected);
 for(const patch of [{change5m:-1},{volume5m:NaN},{volume5m:Infinity},{sells5m:undefined},{observedAt:now-30001},{mint:'invalid'}])for(const id of ids)assert.equal(decide(id,{...market,mint,...patch}),'WAIT',id);
});
test('five exact profiles affect signals, requested sizing and bounded execution independently',()=>{
 const sizes=[];
 for(const [id,p] of Object.entries(PERSONALITIES)){
  const s=state(id),c=validateStrategyConfig(s.strategyConfig);assert.equal(c.execution.cooldownSeconds,p.cooldownSeconds);
  const signal=strategyIntent(s,market,now);assert.equal(signal.side,'BUY',id);sizes.push(signal.sol);
  const result=executePaper(s,signal,market,now);assert.equal(result.risk.allowed,true,id);assert.equal(s.position.strategyConfig.strategy,id);
  assert.equal(s.position.strategyConfig.position.takeProfitPercent,p.takeProfit*100);
  assert.equal(riskCheck({...s,position:null,lastTradeAt:now},signal,market,now+1).reason,'Trade cooldown');
  const stopped=riskCheck({...s,paperKillSwitch:true},signal,market,now);assert.equal(stopped.allowed,false);
 }
 assert.equal(new Set(sizes).size,5);assert.deepEqual(sizes,[...sizes].sort((a,b)=>a-b));
 const weak={...market,change5m:.6,buys5m:12,volume5m:800,liquidityUsd:20000};
 assert.deepEqual(Object.keys(PERSONALITIES).map(id=>strategyIntent(state(id),weak,now).side),['HOLD','HOLD','HOLD','BUY','BUY']);
 assert.ok(Object.keys(PERSONALITIES).every(id=>strategyIntent(state(id),{...market,change5m:-1},now).side==='HOLD'));
});
test('integer tradable sizing requires proof, respects independent caps and reserve',()=>{
 const sizes=Object.keys(PERSONALITIES).map(id=>personalitySizeLamports({id,balanceLamports:'1000000',reserveLamports:'100000',ceilingLamports:'999999'}).effectiveLamports);
 assert.deepEqual(sizes,['45000','67500','90000','135000','180000']);
 assert.equal(personalitySizeLamports({id:'berserker',balanceLamports:'1000000000',reserveLamports:'100000',ceilingLamports:'100000'}).effectiveLamports,'100000');
 assert.equal(personalitySizeLamports({id:'guardian',balanceLamports:'10',reserveLamports:'11',ceilingLamports:'100'}).effectiveLamports,'0');
 for(const v of [undefined,-1,1.1,Number.MAX_SAFE_INTEGER+1,'-1','1e3'])assert.throws(()=>personalitySizeLamports({id:'operator',balanceLamports:v,reserveLamports:'10',ceilingLamports:'100'}));
});
test('legacy presets and entry-time exit policy remain unchanged',()=>{
 assert.equal(defaultStrategyConfig('balanced').execution.cooldownSeconds,60);assert.equal(defaultStrategyConfig('balanced').position.stopLossPercent,3.5);
 const s=state('guardian');executePaper(s,strategyIntent(s,market,now),market,now);s.strategy='berserker';s.strategyConfig=defaultStrategyConfig('berserker');
 const exit=strategyIntent(s,{...market,priceUsd:1.05,observedAt:now+1},now+1);
 assert.equal(exit.side,'SELL');assert.equal(exit.strategyConfig.strategy,'guardian');assert.equal(riskCheck(s,exit,{...market,priceUsd:1.05,observedAt:now+1},now+1).allowed,true);
});
