import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {DatabaseSync} from 'node:sqlite';
import {createMarketDiscovery,candidateQueue,SCANNER_LIMITS} from '../server/market-discovery.js';
import {evaluateScan,scanAgent} from '../server/opportunity-scanner.js';
import {createDecisionStore,radarState} from '../server/market-radar.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {createMarketFeed,SOL_MINT} from '../server/market-data.js';
import {createServer} from '../server/app.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const mints=Array.from({length:40},()=>Keypair.generate().publicKey.toBase58());
const q=(mint,t,more={})=>({mint,network:'solana:101',tokenSymbol:mint.slice(0,4),source:'Isolated fixture',priceUsd:1,solUsd:150,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:5,observedAt:t,...more});
const state=id=>({agentId:id,mode:'paper',discoveryMode:true,strategy:'balanced',strategyConfig:defaultStrategyConfig(),strategyConfigVersion:1,enabled:true,everStarted:true,initialSol:.1,cashSol:.1,realizedSol:0,initialUsd:15,cashUsd:15,realizedUsd:0,dailySpentSol:0});
test('bounded deduplicated Solana discovery; separate cadence, concurrency and shared snapshots',async()=>{
 let time=1800000000000,fetches=0,reads=0,active=0,peak=0;
 const d=createMarketDiscovery({now:()=>time,fetcher:async()=>{fetches++;return {ok:true,json:async()=>[...mints,mints[0]].map(tokenAddress=>({chainId:'solana',tokenAddress})).concat([{chainId:'solana',tokenAddress:'invalid'},{chainId:'ethereum',tokenAddress:mints[0]}])};},market:async mint=>{reads++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return q(mint,time);}});
 const [a,b]=await Promise.all([d.scan(),d.scan()]);assert.equal(a.candidates.length,24);assert.deepEqual(a,b);assert.equal(fetches,1);assert.equal(reads,24);assert.ok(peak<=3);
 await d.scan();assert.equal(reads,24);time+=15001;await d.scan();assert.equal(reads,48);assert.equal(fetches,1);time+=120000;await d.scan();assert.equal(fetches,2);
});
test('failure and 429 remain explicit with backoff, never empty success',async()=>{
 for(const status of [429,503]){let calls=0;const d=createMarketDiscovery({fetcher:async()=>{calls++;return {ok:false,status};},market:()=>{throw Error('must not quote');}});const a=await d.scan();assert.equal(a.status,status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE');await d.scan();assert.equal(calls,1);}
 const d=createMarketDiscovery({fetcher:async()=>({ok:true,json:async()=>[{chainId:'solana',tokenAddress:mints[0]}]}),market:async()=>{throw Object.assign(Error(),{code:'RATE_LIMITED'});}});assert.equal((await d.scan()).candidates[0].error,'RATE_LIMITED');
});
test('eligibility, null/stale data, strategy thresholds, deterministic order and queue bounds',()=>{
 const t=1800000000000,s=state('a'),candidates=mints.map(mint=>({mint,quote:q(mint,t)}));
 candidates[0].quote.liquidityUsd=100;candidates[1].quote.volume5m=null;candidates[2].quote.observedAt=t-31000;candidates[3].quote.volume5m=100;
 const a=candidateQueue(s,{candidates},t);assert.equal(a.scanned,24);assert.equal(a.rows.length,8);assert.equal(a.eligible,20);assert.deepEqual(a.rejections.map(x=>x.reason).sort(),['ERROR','MINIMUM_LIQUIDITY','MINIMUM_VOLUME','STALE_DATA']);
 const unique=candidates.slice(4,12);assert.deepEqual(candidateQueue(s,{candidates:unique},t).rows.map(c=>c.mint),candidateQueue(s,{candidates:[...unique].reverse()},t).rows.map(c=>c.mint));
 assert.equal(candidateQueue(s,{candidates:[unique[0],unique[0]]},t).scanned,1);
 s.strategyConfig.signal.minVolume5mUsd=3000;assert.equal(candidateQueue(s,{candidates},t).eligible,0);
});
test('one-position execution, held valuation, waiting capacity, retention dedup, versions and isolation',async()=>{
 let t=1800000000000;const db=new DatabaseSync(':memory:'),store=createDecisionStore(db,()=>t),events=[],s=state('a');
 const universe={status:'OK',discoveredAt:t,candidates:mints.slice(0,12).map(mint=>({mint,quote:q(mint,t)}))},hooks={capture:(s,d)=>store.capture(s,d),event:(s,e)=>events.push(e)};
 evaluateScan(s,{universe,held:null},t,hooks);assert.equal(events.filter(e=>e.type==='BUY').length,1);assert.equal(s.scan.opportunities.length,8);assert.ok(s.scan.opportunities.some(d=>d.opportunityState==='WAITING_FOR_CAPACITY'&&!d.tradeIntent));assert.ok(s.scan.evaluated<=3);const held=s.position.mint;
 t+=1000;const input=await scanAgent(s,{discovery:{scan:async()=>universe},market:async mint=>q(mint,t)});evaluateScan(s,input,t,hooks);assert.equal(s.mint,held);assert.equal(s.market.mint,held);assert.equal(events.filter(e=>e.type==='BUY').length,1);
 const count=store.list('a').length;t++;evaluateScan(s,input,t,hooks);assert.equal(store.list('a').length,count);assert.equal(store.list('b').length,0);assert.ok(Object.keys(s.radarFingerprints).length<=8);
 s.strategyConfigVersion=2;s.strategyConfig.signal.minVolume5mUsd=2500;evaluateScan(s,input,t,hooks);assert.ok(s.scan.opportunities.filter(d=>d.market.mint!==held).every(d=>d.configVersion===2));assert.equal(store.list('a').find(d=>d.finalDecision==='BUY').configVersion,1);
 const agent={id:'a'};assert.equal(radarState(agent,s,t+31001).status,'STALE_DATA');s.enabled=false;assert.equal(radarState(agent,s,t+31001).status,'PAUSED');db.close();
});
test('three-evaluation ceiling, stale cannot produce intent, provider state remains distinct',()=>{
 const t=1800000000000,s=state('a');s.strategyConfig.risk.maxPositionPercent=.1;
 const candidates=mints.slice(0,20).map(mint=>({mint,quote:q(mint,t)})),events=[];
 evaluateScan(s,{universe:{status:'OK',candidates},held:null},t,{capture:()=>true,event:(s,e)=>events.push(e)});assert.equal(s.scan.evaluated,3);assert.equal(s.position,undefined);assert.equal(events.length,3);
 for(const c of candidates)c.quote.observedAt=t-31000;
 evaluateScan(s,{universe:{status:'OK',candidates},held:null},t,{capture:()=>{throw Error('stale persisted');},event:()=>{throw Error('stale trade');}});assert.equal(s.scan.status,'STALE_DATA');assert.ok(s.scan.opportunities.every(d=>!d.tradeIntent));
 evaluateScan(s,{universe:{status:'RATE_LIMITED',candidates:[]},held:null},t,{capture:()=>false,event:()=>{}});assert.equal(s.scan.status,'RATE_LIMITED');
});
test('shared quote transport budgets requests and backs off provider 429',async()=>{
 let calls=0;const feed=createMarketFeed({fetcher:async()=>{calls++;return {ok:false,status:429};}});
 await assert.rejects(feed(SOL_MINT),e=>e.code==='RATE_LIMITED');await assert.rejects(feed(mints[0]),e=>e.code==='RATE_LIMITED');assert.equal(calls,1);
});
test('shared transport enforces 120 requests/minute and reopens on next window',async()=>{
 let time=1800000000000,calls=0;
 const feed=createMarketFeed({now:()=>time,fetcher:async url=>{calls++;const mint=decodeURIComponent(url.split('/').at(-1));return {ok:true,json:async()=>[{chainId:'solana',dexId:'raydium',baseToken:{address:mint},priceUsd:'1',liquidity:{usd:50000},volume:{m5:2000},priceChange:{m5:2},txns:{m5:{buys:20,sells:5}}}]};}});
 const tokens=Array.from({length:121},()=>Keypair.generate().publicKey.toBase58());
 for(const mint of tokens.slice(0,119))await feed(mint);
 assert.equal(calls,120);await feed(tokens[0]);assert.equal(calls,120);
 await assert.rejects(feed(tokens[119]),e=>e.code==='RATE_LIMITED');assert.equal(calls,120);
 time+=60000;await feed(tokens[119]);assert.equal(calls,122);
});
test('owner starts discovery without mint, actual loop rechecks pause, persists multi-market and never signs',async t=>{
 let time=1800000000000,gate=null;const owner=mints[30],candidates=mints.slice(0,5).map(mint=>({mint,quote:q(mint,time,{change5m:0})}));
 const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tw-scanner-')),'db.sqlite'),now:()=>time,tradingOptions:{receipt:()=>null,market:async mint=>q(mint,time),discovery:{scan:async()=>{if(gate)await gate;return {status:'OK',candidates,discoveredAt:time};}}}});
 const db=instance.store.db,server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('scanner-cookie').digest('hex'),owner,time+86400000);
 for(const id of ['a','b'])db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run(id,owner,JSON.stringify({id,creator:owner,name:id,strategy:'balanced',status:'DRAFT'}),'unused');
 const call=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/a/trading${path}`,{method:body?'POST':'GET',headers:{origin:'http://127.0.0.1:5188',cookie:'tw_session=scanner-cookie','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 let r=await call('/enable',{mode:'paper',strategy:'balanced',discovery:true});assert.equal(r.status,200);assert.equal(r.data.discoveryMode,true);assert.equal(r.data.liveLocked,true);
 await instance.paperTick();r=await call('/radar');assert.equal(r.data.counts.scanned,5);assert.equal(r.data.counts.evaluated,3);assert.equal(r.data.opportunities.length,5);assert.equal((await call('/decisions')).data.decisions.length,3);
 await instance.paperTick();assert.equal((await call('/decisions')).data.decisions.length,3);assert.equal(db.prepare("SELECT count(*) n FROM paper_decisions WHERE agent_id='b'").get().n,0);
 const cfg=await call('/strategy-config'),config=cfg.data.config;config.signal.minPriceChange5mPercent=0;await call('/strategy-config',{config,version:cfg.data.version});
 let release;gate=new Promise(r=>release=r);const tick=instance.paperTick();await new Promise(r=>setTimeout(r,5));await call('/pause',{});release();await tick;gate=null;
 assert.equal((await call('/radar')).data.status,'PAUSED');assert.equal((await call('/decisions?filter=trades')).data.decisions.length,0);
 assert.equal((await call('/enable',{mode:'live',strategy:'balanced',discovery:true})).status,409);
});
