import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {createServer} from '../server/app.js';
import {defaultStrategyConfig as preset,validateStrategyConfig,configEqual,isCustom} from '../public/app/strategy-config.js';
import {strategyIntent,riskCheck,executePaper} from '../server/paper-engine.js';
test('presets, custom isolation, reset and strict bounded validation',()=>{
 for(const id of ['balanced','momentum','selective'])assert.deepEqual(validateStrategyConfig(preset(id)),preset(id));
 const a=preset('balanced'),b=preset('balanced');a.signal.minVolume5mUsd=2000;assert.equal(isCustom(a),true);assert.equal(isCustom(b),false);assert.equal(configEqual(a,b),false);assert.equal(configEqual(preset('balanced'),b),true);
 for(const mutate of [c=>c.risk.maxSolPerTrade=1,c=>c.risk.maxOpenPositions=2,c=>c.execution.cooldownSeconds=0,c=>c.execution.maxSlippageBps=101,c=>c.signal.minVolume5mUsd=NaN,c=>c.signal.minConfidence=.5,c=>c.risk.maxDailySpendSol=.00002,c=>c.position.stopLossPercent=-1,c=>c.strategy='toString']){const c=preset();mutate(c);assert.throws(()=>validateStrategyConfig(c));}
});
test('configured intent, risk rejection and existing position retain entry configuration',()=>{
 const now=1800000000000,mint='test',q={mint,network:'solana:101',priceUsd:1,solUsd:150,liquidityUsd:50000,change5m:2,buys5m:20,sells5m:5,volume5m:2000,observedAt:now};
 const c=preset('momentum');c.risk.maxSolPerTrade=.0005;
 const s={agentId:'a',mode:'paper',enabled:true,mint,strategyConfig:c,strategyConfigVersion:3,cashUsd:15,realizedUsd:0,dailySpentSol:0};
 const i=strategyIntent(s,q,now);assert.equal(i.sol,.0005);assert.equal(i.strategyConfigVersion,3);assert.equal(i.signals.volumePassed,true);
 assert.equal(riskCheck(s,{...i,sol:.001},q,now).allowed,false);
 assert.equal(executePaper(s,i,q,now).risk.allowed,true);
 s.strategyConfig=preset('selective');s.strategyConfig.position.stopLossPercent=20;s.strategyConfigVersion=4;
 const exit=strategyIntent(s,{...q,priceUsd:.9,observedAt:now+61000},now+61000);assert.equal(exit.side,'SELL');assert.equal(exit.strategyConfigVersion,3);assert.equal(exit.strategy,'momentum');assert.equal(exit.strategyConfig.position.stopLossPercent,4);
});
test('all custom filters and risk controls affect the deterministic engine',()=>{
 const now=1800000000000,mint='test',q={mint,network:'solana:101',priceUsd:1,solUsd:150,liquidityUsd:50000,change5m:2,buys5m:20,sells5m:5,volume5m:2000,observedAt:now};
 const state=()=>({mode:'paper',enabled:true,mint,strategyConfig:preset(),cashUsd:15,realizedUsd:0,dailySpentSol:0});
 for(const [field,value] of [['minLiquidityUsd',60000],['minVolume5mUsd',3000],['minPriceChange5mPercent',3]]){const s=state();s.strategyConfig.signal[field]=value;assert.equal(strategyIntent(s,q,now).side,'HOLD');}
 for(const [mutate,reason] of [[s=>s.strategyConfig.risk.maxPositionPercent=.1,/position size/],[s=>{s.strategyConfig.risk.maxDailySpendSol=.0011;s.dailyDate=new Date(now).toISOString().slice(0,10);s.dailySpentSol=.001;},/Daily/],[s=>{s.strategyConfig.execution.cooldownSeconds=120;s.lastTradeAt=now-61000;},/cooldown/],[s=>s.strategyConfig.execution.maxSlippageBps=25,/Slippage/],[s=>s.strategyConfig.signal.minLiquidityUsd=60000,/liquidity/]]){const s=state(),i=strategyIntent(s,q,now);mutate(s);assert.match(riskCheck(s,i,q,now).reason,reason);}
});
test('owned persistence, re-fetch, version conflicts, working updates, lifecycle and decision snapshots',async t=>{
 let time=1800000000000;const owner=Keypair.generate().publicKey.toBase58(),mint=Keypair.generate().publicKey.toBase58();
 const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tekk-strategy-')),'db.sqlite'),now:()=>time,tradingOptions:{receipt:()=>null,market:async()=>({mint,network:'solana:101',priceUsd:1,solUsd:150,liquidityUsd:50000,change5m:2,buys5m:20,sells5m:5,volume5m:2000,observedAt:time})}});
 const db=instance.store.db,server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('strategy-cookie').digest('hex'),owner,time+3600000);
 for(const id of ['a','b','foreign'])db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run(id,id==='foreign'?'another-owner':owner,JSON.stringify({id,creator:owner,strategy:'balanced',status:'DRAFT'}),'unused');
 const call=async(id,path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/${id}/trading${path?'/'+path:''}`,{method:body?'POST':'GET',headers:{origin:'http://127.0.0.1:5188',cookie:'tw_session=strategy-cookie','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const c=preset('momentum');c.risk.maxSolPerTrade=.0005;
 assert.equal((await call('a','strategy-config')).data.version,0);
 assert.equal((await call('a','strategy-config',{config:c,version:0})).status,200);
 assert.deepEqual((await call('a','strategy-config')).data.config,c);
 assert.deepEqual((await call('b','strategy-config')).data.config,preset('balanced'));
 assert.equal((await call('foreign','strategy-config',{config:c,version:0})).status,404);
 assert.equal((await call('a','strategy-config',{config:c,version:0})).status,409);
 assert.equal((await call('a','strategy-config',{config:{...c,risk:{...c.risk,maxSolPerTrade:1}},version:1})).status,400);
 assert.equal((await call('a','configure',{strategy:'momentum',tokenMint:mint})).status,200);
 assert.equal((await call('a','enable',{strategy:'momentum',mode:'paper'})).status,200);
 await instance.paperTick();let s=(await call('a','')).data;assert.equal(s.status,'WORKING');assert.equal(s.position.strategyConfigVersion,1);
 const next=preset('selective');assert.equal((await call('a','strategy-config',{config:next,version:1})).status,200);
 s=(await call('a','')).data;assert.equal(s.enabled,true);assert.equal(s.position.strategyConfig.strategy,'momentum');assert.equal(s.position.strategyConfigVersion,1);
 const events=s.activity;assert.equal(events.filter(e=>e.type==='STRATEGY_CHANGED').length,2);const buy=events.find(e=>e.type==='BUY');assert.equal(buy.strategyConfigVersion,1);assert.equal(buy.strategyConfig.risk.maxSolPerTrade,.0005);assert.equal(buy.risk.allowed,true);assert.equal(buy.signals.liquidityPassed,true);
 assert.equal((await call('a','strategy-config',{config:next,version:2})).status,200);assert.equal((await call('a','')).data.activity.filter(e=>e.type==='STRATEGY_CHANGED').length,2);
 assert.equal((await call('a','pause',{})).data.enabled,false);assert.equal((await call('a','enable',{mode:'paper',strategy:'selective'})).data.enabled,true);assert.equal((await call('a','enable',{mode:'live',strategy:'selective'})).status,409);
 assert.equal((await call('a','')).data.activity.some(e=>e.type==='RESUMED'),true);
 const stored=JSON.parse(db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get('a').data);assert.deepEqual(stored.strategyConfig,next);assert.equal(stored.strategyConfigVersion,2);
});
