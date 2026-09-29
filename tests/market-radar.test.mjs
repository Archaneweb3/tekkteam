import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {createServer} from '../server/app.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {strategyIntent,executePaper} from '../server/paper-engine.js';
import {createDecisionStore,decisionSnapshot,radarState,quoteProblem,DECISION_LIMIT,DECISION_MAX_AGE} from '../server/market-radar.js';
import {meaningfulActivity} from '../public/app/activity-policy.js';
import {renderOverviewFeed} from '../public/app/overview-feed.js';
import {paintDevice} from '../public/app/workspace-device.js';
const quote=(mint,time,change=2)=>({mint,tokenSymbol:'MARKET',tokenName:'Test market',network:'solana:101',source:'Isolated test',priceUsd:1,solUsd:150,liquidityUsd:50000,volume5m:2000,change5m:change,buys5m:20,sells5m:5,observedAt:time,snapshotId:'quote-'+time});
test('bounded decision retention, transition deduplication and independent agents',()=>{
 let time=1800000000000;const db=new DatabaseSync(':memory:'),store=createDecisionStore(db,()=>time),s={agentId:'a',strategy:'balanced',strategyConfigVersion:1,mode:'paper',enabled:true,mint:'mint',cashUsd:15,realizedUsd:0,dailySpentSol:0};
 const make=()=>decisionSnapshot(s,strategyIntent(s,quote('mint',time,0),time),null,time);
 assert.equal(store.capture(s,make()),true);time++;assert.equal(store.capture(s,make()),false);assert.equal(store.list('a').length,1);assert.equal(store.list('b').length,0);
 for(let i=0;i<DECISION_LIMIT+20;i++){time++;s.strategyConfigVersion++;store.capture(s,make());}
 assert.equal(store.list('a').length,DECISION_LIMIT);assert.equal(db.prepare('SELECT count(*) n FROM paper_decisions').get().n,DECISION_LIMIT);
 time+=DECISION_MAX_AGE+1;assert.equal(store.list('a').length,0);db.close();
});
test('freshness, missing data, pause and offline status never imply a fresh opportunity',()=>{
 const time=1800000000000,q=quote('mint',time);assert.equal(quoteProblem(q,'mint',time),null);assert.equal(quoteProblem({...q,volume5m:null},'mint',time),'ERROR');assert.equal(quoteProblem(q,'mint',time+31000),'STALE_DATA');assert.equal(quoteProblem({...q,observedAt:time+2000},'mint',time),'STALE_DATA');
 const agent={id:'a',strategy:'balanced'},s={agentId:'a',mint:'mint',strategy:'balanced',mode:'paper',enabled:true,everStarted:true};const snapshot=decisionSnapshot(s,strategyIntent(s,q,time),null,time);s.radar={status:'WATCHING',lastEvaluated:time,snapshot};
 assert.equal(radarState(agent,s,time).status,'WATCHING');assert.equal(radarState(agent,s,time,true).status,'SCANNING');assert.equal(radarState(agent,s,time+31000).status,'STALE_DATA');s.enabled=false;assert.equal(radarState(agent,s,time+31000).status,'PAUSED');assert.equal(radarState(agent,null,time).status,'OFFLINE');
});
test('global activity curates duplicate execution stages and repeated rejection without hiding trades',()=>{
 const events=[{eventId:'b',agentId:'a',type:'BUY',timestamp:4},{eventId:'p',agentId:'a',type:'POSITION_OPENED',timestamp:4},{eventId:'s',agentId:'a',type:'SIGNAL_DETECTED',timestamp:4},{eventId:'r',agentId:'a',type:'RISK_REJECTED',reason:'Daily limit',timestamp:3},{eventId:'r2',agentId:'a',type:'RISK_REJECTED',reason:'Daily limit',timestamp:2},{eventId:'b2',agentId:'a',type:'BUY',timestamp:1}];
 assert.deepEqual(meaningfulActivity([...events,events[0]]).map(e=>e.eventId),['b','r','b2']);
});
test('Trading Desk and existing optional phone consume identical curated event IDs',()=>{
 globalThis.window={TekkworkIcon:()=>'<svg></svg>'};
 const activity=meaningfulActivity([{eventId:'buy',agentId:'a',type:'BUY',tokenSymbol:'MARKET',timestamp:1800000000000},{eventId:'signal',agentId:'a',type:'SIGNAL_DETECTED',tokenSymbol:'MARKET',timestamp:1800000000000}]);
 const agents=[{agentId:'a',name:'Actual agent',character:'frank'}],screen={innerHTML:''};paintDevice({querySelector:()=>screen},{agents,activity});const desk=renderOverviewFeed(activity,agents);
 for(const html of [screen.innerHTML,desk]){assert.match(html,/MARKET/);assert.match(html,/BUY/);assert.doesNotMatch(html,/SIGNAL_DETECTED/);assert.match(html,/Actual agent/);}
});
test('real Paper loop: signal fail/pass, risk, snapshots, version, stale, errors, pause, isolation and one global trade',async t=>{
 let time=1800000000000,change=0,stale=false,broken=false,hold=null,marketEntered=null;const owner=Keypair.generate().publicKey.toBase58(),mint=Keypair.generate().publicKey.toBase58();
 const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tekk-radar-')),'db.sqlite'),now:()=>time,tradingOptions:{receipt:()=>null,market:async()=>{if(hold){marketEntered?.();await hold;}if(broken)throw Error('Unavailable');return quote(mint,stale?time-31000:time,change);}}});
 const db=instance.store.db,server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});
 db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('radar-cookie').digest('hex'),owner,time+86400000);
 for(const id of ['a','b','foreign'])db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run(id,id==='foreign'?'another-owner':owner,JSON.stringify({id,creator:owner,name:id,strategy:'balanced',status:'DRAFT'}),'unused');
 // This fixture tests Paper behavior, not pooled HTTP socket lifetimes under
 // synchronous SQLite writes. Never retry a failed POST to hide transport errors.
 const call=async(path,body)=>{try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:body?'POST':'GET',headers:{connection:'close',origin:'http://127.0.0.1:5188',cookie:'tw_session=radar-cookie','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}catch(e){throw new Error(`Fixture HTTP ${path}: ${e.message}; cause=${e.cause?.code??'unknown'}`,{cause:e});}};
 const base='/agents/a/trading',get=async path=>(await call(base+'/'+path)).data;
 assert.equal((await get('radar')).status,'OFFLINE');assert.equal((await call('/agents/foreign/trading/radar')).status,404);
 await call(base+'/configure',{strategy:'balanced',tokenMint:mint});const initial=(await get('strategy-config')).version,c=defaultStrategyConfig();c.signal.minVolume5mUsd=1500;c.risk.maxPositionPercent=.1;
 await call(base+'/strategy-config',{config:c,version:initial});await call(base+'/enable',{mode:'paper',strategy:'balanced'});
 await instance.paperTick();let radar=await get('radar');assert.equal(radar.opportunities[0].finalDecision,'SKIPPED');assert.equal(radar.opportunities[0].signalChecks.find(c=>c.key==='momentumPassed').passed,false);assert.equal(radar.opportunities[0].config.signal.minVolume5mUsd,1500);assert.equal(radar.opportunities[0].risk,null);
 time+=1000;await instance.paperTick();assert.equal((await get('decisions')).decisions.length,1);
 change=2;time+=1000;await instance.paperTick();let decision=(await get('decisions?filter=risk')).decisions[0];assert.equal(decision.finalDecision,'REJECTED');assert.equal(decision.risk.checks.positionSize,false);assert.equal(decision.risk.checks.balance,null);assert.equal(decision.risk.checks.slippage,true);assert.equal(decision.configVersion,initial+1);assert.equal(decision.tradeIntent.action,'BUY');assert.equal(decision.market.symbol,'MARKET');
 time+=1000;await instance.paperTick();assert.equal((await get('decisions?filter=risk')).decisions.length,1);
 c.risk.maxPositionPercent=10;await call(base+'/strategy-config',{config:c,version:initial+1});time+=1000;await instance.paperTick();decision=(await get('decisions?filter=trades')).decisions[0];assert.equal(decision.finalDecision,'BUY');assert.equal(decision.risk.allowed,true);assert.equal(decision.configVersion,initial+2);
 const network=(await call('/trading/network')).data;assert.equal(network.activity.filter(e=>['BUY','SIGNAL_DETECTED','POSITION_OPENED'].includes(e.type)).length,1);assert.equal(network.activity.find(e=>e.type==='BUY').agentId,'a');assert.equal((await call('/agents/b/trading/decisions')).data.decisions.length,0);
 time+=31000;assert.equal((await get('radar')).status,'STALE_DATA');stale=true;await instance.paperTick();radar=await get('radar');assert.equal(radar.status,'STALE_DATA');assert.equal(radar.opportunities[0].signalChecks.length,0);assert.equal((await get('decisions?filter=trades')).decisions.length,1);
 stale=false;broken=true;time+=1000;await instance.paperTick();assert.equal((await get('radar')).status,'ERROR');broken=false;
 let release;hold=new Promise(r=>release=r);const entered=new Promise(r=>marketEntered=r);const pending=instance.paperTick();await entered;assert.equal((await get('radar')).status,'SCANNING');await call(base+'/pause',{});release();await pending;hold=null;marketEntered=null;assert.equal((await get('radar')).status,'PAUSED');assert.equal((await get('decisions?filter=trades')).decisions.length,1);
 assert.equal((await call(base+'/decisions?filter=invalid')).status,400);assert.doesNotMatch(JSON.stringify(await get('decisions')),/unused|privateKey|secret/);
 for(let i=0;i<220;i++)db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run('a',JSON.stringify({type:'SIGNAL_SKIPPED',timestamp:time,mode:'paper',reason:'Retention test '+i}));
 await call(base+'/enable',{mode:'paper',strategy:'balanced'});await call(base+'/pause',{});
 assert.ok(db.prepare("SELECT COUNT(*) n FROM paper_history WHERE agent_id='a' AND json_extract(data,'$.type') IN ('SIGNAL_DETECTED','SIGNAL_SKIPPED','RISK_REJECTED')").get().n<=200);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_history WHERE agent_id='a' AND json_extract(data,'$.type')='BUY'").get().n,1);
});
