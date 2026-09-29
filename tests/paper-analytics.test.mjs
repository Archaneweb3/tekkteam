import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {analyticsFixture} from './analytics-fixture-data.mjs';
import {buildAnalytics,closedPaperTrades,drawdown,tradeStatistics} from '../server/paper-analytics.js';
import {createAnalyticsStore,PORTFOLIO_CADENCE,PORTFOLIO_LIMIT,PORTFOLIO_MAX_AGE} from '../server/analytics-store.js';
import {projectTrading} from '../server/trading-projection.js';
import {createServer} from '../server/app.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('real engine fixture: closed win/loss, open excluded, all native accounting and version attribution',()=>{
 const {populated:a,state:s}=analyticsFixture(),m=a.summary;assert.equal(m.closedPositionCount,2);assert.equal(m.wins,1);assert.equal(m.losses,1);assert.equal(m.winRate,50);assert.equal(m.openPositions.length,1);assert.equal(a.tradeHistory[0].tokenSymbol,'BETA');
 near(m.realizedPnlSol,s.realizedSol);near(m.unrealizedPnlSol,s.position.quantity*s.market.priceUsd/s.market.solUsd-s.position.costSol);near(m.totalPnlSol,m.realizedPnlSol+m.unrealizedPnlSol);near(m.roiPercent,m.totalPnlSol/.1*100);near(m.portfolioValueSol,m.paperCashSol+s.position.quantity*s.market.priceUsd/s.market.solUsd);
 const win=a.tradeHistory.find(t=>t.pnlSol>0),loss=a.tradeHistory.find(t=>t.pnlSol<0);near(m.averageWinSol,win.pnlSol);near(m.largestWinSol,win.pnlSol);near(m.averageLossSol,loss.pnlSol);near(m.largestLossSol,loss.pnlSol);assert.ok(win.holdingMs>0);assert.ok(win.exitPriceUsd>win.entryPriceUsd);near(win.returnPercent,win.pnlSol/win.costSol*100);
 assert.deepEqual(a.strategyPerformance.map(t=>[t.strategy,t.configVersion]).sort(),[['balanced',1],['momentum',0]]);assert.equal(a.configVersion,2);assert.equal(a.contributors.top[0].tokenSymbol,'ALPHA');assert.equal(a.contributors.bottom[0].tokenSymbol,'BETA');
});
test('drawdown uses recorded peaks, gaps/current unavailable and insufficient history',()=>{
 const points=[100,120,90,108].map((portfolioValueSol,timestamp)=>({timestamp,portfolioValueSol}));const d=drawdown(points);near(d.currentDrawdownPercent,-10);near(d.maxDrawdownPercent,-25);assert.equal(drawdown([]).maxDrawdownPercent,null);assert.equal(drawdown(points.slice(0,1)).maxDrawdownPercent,null);assert.equal(drawdown([...points,{timestamp:5,portfolioValueSol:null}]).currentDrawdownPercent,null);
});
test('decision funnel is retained meaningful evaluations, entry-only passes, not discovery polls',()=>{
 const f=analyticsFixture(),before=f.decisions.length;f.decisions.push({id:'unavailable',mode:'paper',timestamp:f.time,tradeIntent:null,signalChecks:[],finalDecision:'SKIPPED'});const entry=f.decisions.find(d=>d.finalDecision==='BUY');f.decisions.push({...entry,id:'risk',finalDecision:'REJECTED',risk:{allowed:false}});f.decisions.push(entry);
 const a=buildAnalytics(f.agent,f.state,f.ledger,f.decisions,[],f.time);assert.equal(a.decisionFunnel.marketsEvaluated,before+1);assert.equal(a.decisionFunnel.riskRejected,1);assert.equal(a.decisionFunnel.paperEntries,3);assert.equal(a.decisionFunnel.signalsPassed,4);assert.equal(a.decisionFunnel.closedTrades,2);
});
test('empty history, missing legacy facts and unknown versions are never fabricated',()=>{
 const {empty}=analyticsFixture();assert.equal(empty.summary.totalPnlSol,0);assert.equal(empty.summary.winRate,null);assert.equal(empty.summary.averageWinSol,null);assert.equal(empty.summary.maxDrawdownPercent,null);assert.deepEqual(empty.tradeHistory,[]);
 const trades=closedPaperTrades([{type:'POSITION_CLOSED',positionId:'old',pnlSol:null,createdAt:100}]);assert.equal(trades[0].configVersion,null);assert.equal(trades[0].entryPriceUsd,null);assert.equal(trades[0].returnPercent,null);assert.equal(tradeStatistics(trades).winRate,null);assert.equal(tradeStatistics(trades).unknownOutcomes,1);
});
test('position-close receipt and summary are deduplicated; partial exits are not closed trades',()=>{
 const f=analyticsFixture();assert.equal(closedPaperTrades(f.ledger.concat(f.ledger)).length,2);assert.equal(closedPaperTrades([{type:'SELL',positionId:'open',realizedSol:.01}]).length,0);
});
test('canonical projection matches analytics, including payroll/leaderboard fields',()=>{
 const f=analyticsFixture(),p=projectTrading(f.agent,f.state,f.ledger,f.time),s=f.populated.summary;
 for(const key of ['portfolioValueSol','totalPnlSol','roiPercent','closedPositionCount','winRate','wins','losses','realizedPnlSol','unrealizedPnlSol'])assert.equal(p[key],s[key],key);
});
test('bounded passive snapshots: no backfill, cadence, staleness gap, epochs and untouched ledger/state',()=>{
 let time=1800000000000;const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE agents(id TEXT PRIMARY KEY); CREATE TABLE paper_states(agent_id TEXT PRIMARY KEY,data TEXT); CREATE TABLE paper_history(id INTEGER PRIMARY KEY,agent_id TEXT,data TEXT); CREATE TABLE paper_decisions(agent_id TEXT,created_at INTEGER,data TEXT)');db.prepare('INSERT INTO agents VALUES(?)').run('a');
 const s={agentId:'a',mode:'paper',initialSol:.1,initialUsd:15,initialSolUsd:150,cashSol:.1,realizedSol:0,startedAt:time};const save=()=>db.prepare('INSERT OR REPLACE INTO paper_states VALUES(?,?)').run('a',JSON.stringify(s));save();const store=createAnalyticsStore(db,()=>time),original=JSON.stringify(s);
 assert.equal(store.read({id:'a'}).portfolioHistory.length,0);store.recordAll();store.recordAll();assert.equal(store.read({id:'a'}).portfolioHistory.length,1);assert.equal(db.prepare('SELECT data FROM paper_states').get().data,original);
 time+=PORTFOLIO_CADENCE;store.recordAll();assert.equal(store.read({id:'a'}).portfolioHistory.length,2);s.strategyConfigVersion=5;save();time+=PORTFOLIO_CADENCE;store.recordAll();assert.equal(store.read({id:'a'}).portfolioHistory.length,3);
 s.position={mint:'m',quantity:1,costSol:.001};s.market={mint:'m',priceUsd:1,solUsd:150,observedAt:time-31000};save();time+=PORTFOLIO_CADENCE;store.recordAll();assert.equal(store.read({id:'a'}).portfolioHistory.at(-1).portfolioValueSol,null);
 s.startedAt=time;s.initialSol=.2;save();time+=PORTFOLIO_CADENCE;store.recordAll();assert.equal(store.read({id:'a'}).portfolioHistory.length,1);assert.equal(db.prepare('SELECT count(DISTINCT epoch) n FROM paper_portfolio_history').get().n,2);
 const insert=db.prepare('INSERT OR IGNORE INTO paper_portfolio_history VALUES(?,?,?,?)');for(let i=1;i<=PORTFOLIO_LIMIT+2;i++)insert.run('a','old',time-i,JSON.stringify({timestamp:time-i,portfolioValueSol:.1}));store.recordAll();assert.equal(db.prepare('SELECT count(*) n FROM paper_portfolio_history').get().n,PORTFOLIO_LIMIT);
 time+=PORTFOLIO_MAX_AGE+1;store.recordAll();assert.equal(db.prepare('SELECT count(*) n FROM paper_portfolio_history').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM paper_history').get().n,0);db.close();
});
test('owned analytics endpoint, independent recorder and canonical Leaderboard/Payroll integration',async t=>{
 const f=analyticsFixture(),owner=Keypair.generate().publicKey.toBase58(),other=Keypair.generate().publicKey.toBase58();const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'tw-analytics-')),'db.sqlite'),now:()=>f.time,tradingOptions:{receipt:()=>null}}),db=instance.store.db;
 for(const [cookie,address] of [['owner',owner],['other',other]])db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(cookie).digest('hex'),address,f.time+86400000);
 db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run(f.agent.id,owner,JSON.stringify({...f.agent,creator:owner}),'fixture-secret');db.prepare('INSERT INTO paper_states VALUES(?,?)').run(f.agent.id,JSON.stringify({...f.state,enabled:false}));for(const e of f.ledger)db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run(f.agent.id,JSON.stringify(e));
 const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});const call=async(path,session='owner')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{headers:session?{cookie:'tw_session='+session}:{}});return {status:r.status,data:await r.json()};};
 const path='/agents/'+f.agent.id+'/analytics';assert.equal((await call(path,null)).status,401);assert.equal((await call(path,'other')).status,404);const a=await call(path);assert.equal(a.status,200);assert.doesNotMatch(JSON.stringify(a.data),/fixture-secret|privateKey|creator/);assert.equal(a.data.portfolioHistory.length,0);instance.analyticsTick();assert.equal((await call(path)).data.portfolioHistory.length,1);
 for(const route of ['/trading/leaderboard','/trading/payroll']){const p=(await call(route)).data.agents[0];for(const key of ['portfolioValueSol','totalPnlSol','roiPercent','closedPositionCount','winRate'])assert.equal(p[key],a.data.summary[key],route+key);}assert.equal((await call('/trading/payroll','other')).data.agents.length,0);
});
