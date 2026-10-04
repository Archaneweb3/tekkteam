import {createAnalyticsStore} from './analytics-store.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Keypair,Connection,PublicKey} from '@solana/web3.js';
import {GENESIS} from '../src/pump-readiness.js';
import {createMarketFeed,SOL_MINT} from './market-data.js';
import {createMarketDiscovery} from './market-discovery.js';
import {scanAgent,evaluateScan} from './opportunity-scanner.js';
import {LIMITS,PROFILES,strategyIntent,executePaper} from './paper-engine.js';
import {installFunding} from './agent-funding.js';
import {randomUUID} from 'node:crypto';
import {createDecisionStore,decisionSnapshot,unavailableSnapshot,radarState,quoteProblem} from './market-radar.js';
import {canonicalEvent,projectTrading,aggregateTrading,rankTraders} from './trading-projection.js';
import {defaultStrategyConfig,strategyConfigFor,validateStrategyConfig,configEqual} from '../public/app/strategy-config.js';
import {resolveAssociatedCoinPaperPolicy} from './associated-coin-paper-policy.js';

const fail=message=>{throw Object.assign(Error(message),{status:409});};
const checkQuote=(q,mint,now)=>{if(q.network!=='solana:101'||q.mint!==mint||![q.priceUsd,q.solUsd,q.liquidityUsd].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(q.observedAt)||now-q.observedAt>30000||q.observedAt>now+1000)fail('Invalid or stale Mainnet market data');};
export function launchReceipt(agent,journal=resolve(process.env.DATA_DIR||'server/data','pump-agent-launches.json')){
 let data;try{data=JSON.parse(readFileSync(journal,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const r=data.version===2?data.receipts?.[agent.id]:null;
 if(!r||r.agentId!==agent.id||r.owner!==agent.creator||r.network!=='solana:101'||!r.confirmed||r.status!=='Success'||!r.signature||!r.mint)return null;
 new PublicKey(r.mint);return r;
}
export function installAgentTrading(app,{store,auth,owned,now=Date.now,market=createMarketFeed({now}),discovery=createMarketDiscovery({market,now}),receipt=launchReceipt,readLaunchpadScope,balance,sessionValid,realMoney}={}){
 const {db}=store;const locks=new Set();let ticking=false,autonomousTick=null;
 const connection=realMoney?.connection??new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 const verifyNetwork=realMoney?.verify??(async()=>{if(await connection.getGenesisHash()!==GENESIS)fail('Mainnet assertion failed');});
 const readBalance=balance??(async address=>{await verifyNetwork();return connection.getBalance(new PublicKey(address),'confirmed');});
 db.exec(`CREATE TABLE IF NOT EXISTS agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS paper_states(agent_id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS paper_history(id INTEGER PRIMARY KEY AUTOINCREMENT,agent_id TEXT NOT NULL,data TEXT NOT NULL);`);
 // A process restart requires explicit resume. An in-flight market read cannot
 // bypass PAUSE: state and receipt are checked again immediately before execution.
 for(const row of db.prepare('SELECT * FROM paper_states').all()){const s=JSON.parse(row.data);if(s.enabled){s.enabled=false;s.everStarted=true;s.updatedAt=now();db.prepare('UPDATE paper_states SET data=? WHERE agent_id=?').run(JSON.stringify(s),row.agent_id);db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run(row.agent_id,JSON.stringify({eventId:randomUUID(),agentId:row.agent_id,mode:'paper',type:'PAUSED',timestamp:now(),reason:'Service restarted; resume explicitly'}));}}
 const decisions=createDecisionStore(db,now);
 const analytics=createAnalyticsStore(db,now);
 app.get('/api/agents/:id/analytics',auth,(req,res)=>res.json(analytics.read(owned(req).agent)));
 const get=id=>{const row=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id);return row?JSON.parse(row.data):null;};
 const paperPolicy=(a,s)=>{try{const scope=readLaunchpadScope?.(a);let r=null;if(scope?.scoped===true||s?.targetPolicy==='ASSOCIATED_COIN')r=receipt(a);return resolveAssociatedCoinPaperPolicy({agent:a,paperState:s,receipt:r,scope});}catch{return {kind:'UNAVAILABLE',mint:null,available:false,reason:'PAPER_AUTHORITY_UNAVAILABLE'};}};
 const enforce=(a,s,{body=null,mint=null,discoveryMode=false,configuredState=false}={})=>{
  const p=paperPolicy(a,s);if(!p.available)fail(p.reason);
  if(body&&Object.hasOwn(body,'targetPolicy')&&body.targetPolicy!==p.kind)fail('Paper target policy cannot be changed through trading requests');
  if(p.kind==='ASSOCIATED_COIN'){
   if(discoveryMode||s?.discoveryMode===true||body?.discovery===true)fail('Associated coin Paper cannot use discovery');
   if((mint!==null&&mint!==p.mint)||(body&&Object.hasOwn(body,'tokenMint')&&body.tokenMint!==p.mint)||(configuredState&&s?.mint!==p.mint))fail('Paper mint must match the confirmed associated coin');
  }
  return p;
 };
 const samePolicy=(before,after)=>{if(before.kind!==after.kind||before.mint!==after.mint)fail('Paper authority changed during market read');};
 const assertCanEnterLaunchpadScope=id=>{
  if(typeof id!=='string'||!id||locks.has(id))fail('Paper operation in progress or unavailable');
  let s;try{s=get(id);if(db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id)&&!s)fail('Paper state unavailable');}catch{fail('Paper state unavailable');}
  if(s&&(typeof s!=='object'||Array.isArray(s)||s.agentId!==id||s.mode!=='paper'||typeof s.enabled!=='boolean'||s.enabled||s.position!=null||(s.targetPolicy!==undefined&&!['GENERAL','ASSOCIATED_COIN'].includes(s.targetPolicy))))fail('Pause Paper and resolve any open position before Launchpad entry');
 };
 const save=s=>{s.updatedAt=now();db.prepare('INSERT OR REPLACE INTO paper_states VALUES(?,?)').run(s.agentId,JSON.stringify(s));};
 const log=(id,data)=>{db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run(id,JSON.stringify(data));db.prepare("DELETE FROM paper_history WHERE agent_id=? AND id IN (SELECT id FROM paper_history WHERE agent_id=? AND json_extract(data,'$.type') IN ('SIGNAL_DETECTED','SIGNAL_SKIPPED','RISK_REJECTED') ORDER BY id DESC LIMIT -1 OFFSET 200)").run(id,id);};
 const history=id=>db.prepare('SELECT id,data FROM paper_history WHERE agent_id=? ORDER BY id DESC').all(id).map(x=>({...JSON.parse(x.data),id:'paper:'+x.id}));
 const record=(a,s,data)=>{const event={...data,eventId:randomUUID(),timestamp:now(),tokenSymbol:s.tokenSymbol??s.market?.tokenSymbol??null,strategy:data.strategy??s.strategy,strategyConfig:data.strategyConfig??strategyConfigFor(s),strategyConfigVersion:data.strategyConfigVersion??s.strategyConfigVersion??0,marketSnapshotId:s.market?.snapshotId??null};log(a.id,{...data,...canonicalEvent(a,s,event)});};
 const projection=a=>{let tokenLive=null;try{tokenLive=!!receipt(a);}catch{}return {...projectTrading(a,get(a.id),history(a.id),now()),createdAt:a.createdAt??null,tokenLive,launchToken:{name:a.coin?.name??null,symbol:a.coin?.ticker??null}};};
 const configured=(a,s)=>{const mint=s?.mint??receipt(a)?.mint;if(!mint)fail('Configure a Mainnet market mint first');try{new PublicKey(mint);}catch{fail('Invalid market mint');}return mint;};
 const valid=a=>{const r=receipt(a);if(!r)fail('A confirmed Mainnet token launch is required');return r;};
 const transfers=installFunding(app,{db,store,auth,owned,connection,verifyNetwork,now,sessionValid});
 function snapshot(a){
  const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id),s=get(a.id),paperTargetPolicy=paperPolicy(a,s);let r=null;try{r=receipt(a);}catch{}
  const position=s?.position?{...s.position,marketValueUsd:s.position.quantity*(s.market?.priceUsd??s.position.entryPriceUsd)}:null;
  return {...projection(a),paperTargetPolicy,discoveryMode:s?.discoveryMode??false,mode:'paper',liveLocked:true,fundingLocked:process.env.FUNDING_ENABLED!=='true',tokenLive:!!r,agentId:a.id,wallet:wallet?{address:wallet.address,balanceLamports:s?.walletBalanceLamports??null,balanceCheckedAt:s?.balanceCheckedAt??null}:null,enabled:s?.enabled??false,strategy:s?.strategy??a.strategy,limits:LIMITS,profiles:Object.keys(PROFILES),paperCashUsd:s?.cashUsd??null,paperCapitalUsd:s?.initialUsd??null,realizedPnlUsd:s?.realizedUsd??0,totalPnlUsd:s?.initialUsd!=null?s.cashUsd+(position?.marketValueUsd??0)-s.initialUsd:0,position,market:s?.market??null,health:s?.health??'Not checked',decision:s?.decision??null,defaultTokenMint:r?.mint??null};
 }
 app.get('/api/agents/:id/trading/radar',auth,(req,res)=>{const a=owned(req).agent;res.json(radarState(a,get(a.id),now(),locks.has(a.id)));});
 app.get('/api/agents/:id/trading/decisions',auth,(req,res)=>{const a=owned(req).agent,filter=req.query.filter??'all';if(!['all','trades','skipped','risk'].includes(filter))return res.status(400).json({error:'Invalid decision filter'});res.json({agentId:a.id,mode:'paper',decisions:decisions.list(a.id,filter),retention:{maximum:500,days:30}});});
 const all=()=>db.prepare('SELECT data FROM agents ORDER BY no DESC').all().map(row=>projection(JSON.parse(row.data)));
 const configState=a=>{const s=get(a.id);return {agentId:a.id,config:strategyConfigFor(s??a),version:s?.strategyConfigVersion??0,updatedAt:s?.strategyConfigUpdatedAt??null};};
 app.get('/api/agents/:id/trading/strategy-config',auth,(req,res)=>res.json(configState(owned(req).agent)));
 app.post('/api/agents/:id/trading/strategy-config',auth,(req,res)=>{
  const a=owned(req).agent;if(locks.has(a.id))fail('Paper decision in progress. Save again after it completes.');
  let config;try{config=validateStrategyConfig(req.body.config);}catch(e){return res.status(400).json({error:e.message});}
  const s=get(a.id)??{agentId:a.id,mode:'paper',enabled:false,strategy:a.strategy},version=s.strategyConfigVersion??0;
  if(req.body.version!==version)fail('Strategy changed elsewhere. Reload before saving.');
  if(configEqual(config,strategyConfigFor(s)))return res.json(configState(a));
  // Legacy positions retain the defaults/settings in force before this edit.
  if(s.position&&!s.position.strategyConfig){s.position.strategyConfig=strategyConfigFor(s);s.position.strategyConfigVersion=version;}
  s.strategyConfig=config;s.strategy=config.strategy;s.strategyConfigVersion=version+1;s.strategyConfigUpdatedAt=now();s.revision=(s.revision??0)+1;
  a.strategy=config.strategy;
  db.exec('BEGIN IMMEDIATE');try{save(s);db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(a),a.id);record(a,s,{type:'STRATEGY_CHANGED',reason:'Paper configuration saved; existing position keeps its entry configuration'});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  res.json(configState(a));
 });
 const paperOnly=(req,res,next)=>{if(req.query.mode&&req.query.mode!=='paper')return res.status(409).json({error:'Live trading is locked'});next();};
 app.get('/api/trading/network',paperOnly,(req,res)=>{const agents=all();res.json({mode:'paper',liveLocked:true,agents,...aggregateTrading(agents,now())});});
 app.get('/api/trading/activity',paperOnly,(req,res)=>res.json({mode:'paper',events:aggregateTrading(all(),now()).activity.slice(0,200)}));
 app.get('/api/trading/leaderboard',paperOnly,(req,res)=>res.json({mode:'paper',liveLocked:true,agents:rankTraders(all().filter(p=>p.paperStartingCapitalSol!==null||p.status==='WORKING'||p.status==='PAUSED'),req.query.sort)}));
 app.get('/api/trading/payroll',auth,paperOnly,(req,res)=>{const agents=db.prepare('SELECT data FROM agents WHERE owner=?').all(req.session.address).map(row=>projection(JSON.parse(row.data))).filter(p=>['WORKING','PAUSED'].includes(p.status));res.json({mode:'paper',agents});});
 app.get('/api/trading/agents/:id',paperOnly,(req,res)=>{const row=db.prepare('SELECT data FROM agents WHERE id=?').get(req.params.id);if(!row)return res.status(404).json({error:'Agent not found'});res.json(projection(JSON.parse(row.data)));});
 app.get('/api/agents/:id/positions',auth,(req,res)=>res.json({mode:'paper',positions:projection(owned(req).agent).openPositions}));
 app.get('/api/agents/:id/activity',auth,(req,res)=>res.json({mode:'paper',events:projection(owned(req).agent).activity.slice(0,200)}));
 app.get('/api/agents/:id/trading',auth,(req,res)=>res.json(snapshot(owned(req).agent)));
 app.post('/api/agents/:id/trading/configure',auth,async(req,res)=>{
  const a=owned(req).agent,old=get(a.id);if(old?.enabled||locks.has(a.id))fail('Pause before changing trading configuration');
  if(req.body.mode&&req.body.mode!=='paper')fail('Live trading is locked');
  const policy=enforce(a,old,{body:req.body});
  if(!Object.hasOwn(PROFILES,req.body.strategy))fail('Choose a valid strategy');
  let mint;try{mint=new PublicKey(req.body.tokenMint).toBase58();}catch{fail('Enter a valid Mainnet market mint');}
  enforce(a,old,{body:req.body,mint});
  if(old?.position&&old.mint!==mint)fail('Cannot change market while a position remains open');
  const revision=old?.revision??0;locks.add(a.id);
  try{const quote=await market(mint);checkQuote(quote,mint,now());owned(req);const current=get(a.id);if(current?.enabled||(current?.revision??0)!==revision)fail('Trading state changed during configuration');
   samePolicy(policy,enforce(owned(req).agent,current,{body:req.body,mint}));
   if(current?.position&&!current.position.strategyConfig){current.position.strategyConfig=strategyConfigFor(current);current.position.strategyConfigVersion=current.strategyConfigVersion??0;}
   const s={...current,agentId:a.id,mode:'paper',enabled:false,strategyConfig:current?.strategy===req.body.strategy?strategyConfigFor(current):defaultStrategyConfig(req.body.strategy),strategyConfigVersion:(current?.strategyConfigVersion??0)+(current?.strategy===req.body.strategy?0:1),strategy:req.body.strategy,mint,tokenSymbol:quote.tokenSymbol??quote.symbol??null,market:quote,revision:revision+1,health:'Healthy',decision:'Configured for Paper Trading'};
   s.discoveryMode=false;s.scan=null;
   if(policy.kind==='ASSOCIATED_COIN')s.targetPolicy='ASSOCIATED_COIN';
   if(current?.mint!==mint){s.radar=null;s.radarFingerprint=null;}
   save(s);a.strategy=s.strategy;db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(a),a.id);res.json(snapshot(a));
  }finally{locks.delete(a.id);}
 });
 app.post('/api/agents/:id/trading/wallet',auth,(req,res)=>{
  const a=owned(req).agent;
  if(!db.prepare('SELECT 1 FROM agent_wallets WHERE agent_id=?').get(a.id)){
   const key=Keypair.generate();db.exec('BEGIN IMMEDIATE');
   try{db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(a.id,key.publicKey.toBase58(),store.seal(key.secretKey,'trading:'+a.id));a.tradingWallet=key.publicKey.toBase58();db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(a),a.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{key.secretKey.fill(0);}
  }
  res.json(snapshot(a));
 });
 app.post('/api/agents/:id/trading/balance',auth,async(req,res)=>{
  const a=owned(req).agent;const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id);if(!wallet)fail('Create the agent wallet first');
  const n=await readBalance(wallet.address);if(!Number.isSafeInteger(n)||n<0)fail('Wallet balance unavailable');
  const s=get(a.id)??{agentId:a.id,mode:'paper',enabled:false,strategy:a.strategy};s.walletBalanceLamports=n;s.balanceCheckedAt=now();save(s);res.json(snapshot(a));
 });
 app.post('/api/agents/:id/trading/enable',auth,async(req,res)=>{
  const a=owned(req).agent;if(req.body.mode!=='paper')fail('Live trading is locked');
  const policy=enforce(a,get(a.id),{body:req.body});
  if(!Object.hasOwn(PROFILES,req.body.strategy))fail('Choose Balanced, Selective or Momentum');
  if(locks.has(a.id))fail('Trading operation in progress');
  const prior=get(a.id);if(prior?.strategyConfig&&req.body.strategy!==prior.strategyConfig.strategy)fail('Save the selected strategy before starting');const discoveryMode=req.body.discovery===true||prior?.discoveryMode===true;const revision=prior?.revision??0,mint=discoveryMode?(prior?.position?.mint??SOL_MINT):configured(a,prior);if(prior?.enabled)fail('Paper trading already working');locks.add(a.id);
  try{
   enforce(a,prior,{body:req.body,mint,discoveryMode,configuredState:policy.kind==='ASSOCIATED_COIN'});
   const quote=await market(mint);
   checkQuote(quote,mint,now());
   const current=get(a.id);if((current?.revision??0)!==revision)fail('Trading was paused during preparation');owned(req);
   samePolicy(policy,enforce(owned(req).agent,current,{body:req.body,mint,discoveryMode,configuredState:policy.kind==='ASSOCIATED_COIN'}));
   const s=current?.initialUsd!=null?current:{...current,agentId:a.id,mode:'paper',initialSol:LIMITS.paperCapitalSol,cashSol:LIMITS.paperCapitalSol,realizedSol:0,initialSolUsd:quote.solUsd,cashUsd:LIMITS.paperCapitalSol*quote.solUsd,initialUsd:LIMITS.paperCapitalSol*quote.solUsd,realizedUsd:0,position:null,dailyDate:'',dailySpentSol:0,lastTradeAt:0};
   const available=Number.isFinite(s.cashSol)?s.cashSol:s.cashUsd/quote.solUsd;
   if(available<strategyConfigFor({...s,strategy:req.body.strategy}).risk.maxSolPerTrade*(1+LIMITS.feeBps/10000)+LIMITS.networkFeeSol&&!s.position)fail('Insufficient paper balance');
   if(!discoveryMode&&s.mint&&s.mint!==mint)fail('Token identity changed');
   s.discoveryMode=discoveryMode;
   if(policy.kind==='ASSOCIATED_COIN')s.targetPolicy='ASSOCIATED_COIN';
   const resumed=!!s.everStarted||prior?.initialUsd!=null;
   Object.assign(s,{enabled:true,everStarted:true,startedAt:s.startedAt??now(),revision:revision+1,strategy:req.body.strategy,mint,tokenSymbol:quote.tokenSymbol??quote.symbol??null,market:quote,health:'Healthy',decision:'Waiting for next market tick'});save(s);record(a,s,{type:resumed?'RESUMED':'TRADING_STARTED',reason:resumed?'Resumed by owner':'Paper trading started by owner'});res.json(snapshot(a));
  }finally{locks.delete(a.id);}
 });
 app.post('/api/agents/:id/trading/pause',auth,(req,res)=>{
  const a=owned(req).agent,s=get(a.id)??{agentId:a.id,mode:'paper',strategy:a.strategy},wasEnabled=s.enabled;s.enabled=false;s.revision=(s.revision??0)+1;s.decision='Paused by owner';save(s);if(wasEnabled)record(a,s,{type:'PAUSED',reason:'Paused by owner'});res.json(snapshot(a));
 });
 app.post('/api/agents/:id/trading/fund',auth,(req,res)=>{owned(req);fail('Real funding is locked during paper mode. Use simulated buying power; do not deposit real SOL.');});
 async function tick(){
  if(ticking)return;ticking=true;
  try{if(autonomousTick)try{await autonomousTick();}catch{}for(const row of db.prepare('SELECT * FROM paper_states').all()){
   const initial=JSON.parse(row.data);if(!initial.enabled||locks.has(row.agent_id))continue;
   locks.add(row.agent_id);
   try{
    const agentRow=db.prepare('SELECT data FROM agents WHERE id=?').get(row.agent_id);if(!agentRow)continue;const a=JSON.parse(agentRow.data);
    const policy=enforce(a,initial,{discoveryMode:initial.discoveryMode===true,configuredState:true});
    if(initial.discoveryMode){
     const inputs=await scanAgent(initial,{discovery,market,now});const s=get(a.id);
     if(!s?.enabled||s.revision!==initial.revision)continue;
     samePolicy(policy,enforce(a,s,{discoveryMode:true,configuredState:true}));
     s.paperKillSwitch=process.env.PAPER_TRADING_KILL_SWITCH==='true';
     db.exec('BEGIN IMMEDIATE');try{evaluateScan(s,inputs,now(),{capture:(state,d)=>decisions.capture(state,d),event:(state,e)=>record(a,state,e)});save(s);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}continue;
    }
    const mint=configured(a,initial),quote=await market(mint);
    const s=get(a.id);if(!s?.enabled||s.revision!==initial.revision)continue;if(s.mint!==mint)fail('Token identity changed');
    samePolicy(policy,enforce(a,s,{mint,configuredState:true}));
    const problem=quoteProblem(quote,mint,now());if(problem){s.health='Unavailable';const snap=unavailableSnapshot(s,quote,problem,now());s.decision=snap.reason.summary;db.exec('BEGIN IMMEDIATE');try{const changed=decisions.capture(s,snap);save(s);if(changed)record(a,s,{type:'SIGNAL_SKIPPED',reason:s.decision,decisionId:snap.id});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}continue;}
    checkQuote(quote,mint,now());
    const intent=strategyIntent(s,quote,now());s.market=quote;s.tokenSymbol=quote.tokenSymbol??quote.symbol??null;s.health='Healthy';s.decision=intent.reason;s.paperKillSwitch=process.env.PAPER_TRADING_KILL_SWITCH==='true';
    if(intent.side!=='HOLD')samePolicy(policy,enforce(a,s,{mint:intent.mint,configuredState:true}));
    if(intent.side!=='HOLD'){
     const result=executePaper(s,intent,quote,now());s.decision=result.risk.allowed?intent.reason:result.risk.reason;
     db.exec('BEGIN IMMEDIATE');try{const snap=decisionSnapshot(s,intent,result,now()),changed=decisions.capture(s,snap);save(s);if(changed)record(a,s,{...intent,riskResult:result.risk,type:'SIGNAL_DETECTED'});if(result.receipt){const r=result.receipt;if(r.side==='BUY')record(a,s,{...r,strategy:intent.strategy,strategyConfig:intent.strategyConfig,strategyConfigVersion:intent.strategyConfigVersion,signals:intent.signals,riskResult:result.risk,type:'POSITION_OPENED'});if(r.positionClosed)record(a,s,{...r,strategy:intent.strategy,strategyConfig:intent.strategyConfig,strategyConfigVersion:intent.strategyConfigVersion,signals:intent.signals,riskResult:result.risk,type:'POSITION_CLOSED',pnlSol:r.closedPositionPnlSol});record(a,s,{...r,strategy:intent.strategy,strategyConfig:intent.strategyConfig,strategyConfigVersion:intent.strategyConfigVersion,signals:intent.signals,riskResult:result.risk,type:r.side});}else if(changed)record(a,s,{...intent,type:'RISK_REJECTED',riskResult:result.risk,requestedSizeSol:intent.sol,reason:result.risk.reason});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }else{db.exec('BEGIN IMMEDIATE');try{const snap=decisionSnapshot(s,intent,null,now()),changed=decisions.capture(s,snap);if(changed)record(a,s,{...intent,type:'SIGNAL_SKIPPED',reason:intent.reason});save(s);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
   }catch(e){const s=get(row.agent_id);if(s?.enabled){s.health='Unavailable';if(s.discoveryMode)s.scan={...s.scan,status:'PROVIDER_UNAVAILABLE',marketHealth:'PROVIDER_UNAVAILABLE',coverage:null,lastChecked:now()};s.decision='Market data or trading state unavailable; no execution';const rowAgent=db.prepare('SELECT data FROM agents WHERE id=?').get(row.agent_id);try{const snap=unavailableSnapshot(s,null,'ERROR',now()),changed=decisions.capture(s,snap);if(rowAgent&&changed)record(JSON.parse(rowAgent.data),s,{type:'SIGNAL_SKIPPED',reason:s.decision});}catch{s.radar={status:'ERROR',lastEvaluated:now(),snapshot:null};}save(s);}}
   finally{locks.delete(row.agent_id);}
  }}finally{ticking=false;}
 }
 tick.setAutonomousTick=fn=>{if(autonomousTick||typeof fn!=='function')throw Error('AUTONOMOUS_WORKER_ALREADY_BOUND');autonomousTick=fn;};
 return {tick,snapshot,projection,assertCanEnterLaunchpadScope,walletReconcile:transfers.reconcilePending,analyticsTick:analytics.recordAll,setStrategy:(id,strategy)=>{if(!Object.hasOwn(PROFILES,strategy))fail('Invalid paper strategy');const s=get(id);if(locks.has(id)||s?.enabled)fail('Pause trading before changing strategy');if(s){if(s.position&&!s.position.strategyConfig){s.position.strategyConfig=strategyConfigFor(s);s.position.strategyConfigVersion=s.strategyConfigVersion??0;}s.strategyConfig=defaultStrategyConfig(strategy);s.strategyConfigVersion=(s.strategyConfigVersion??0)+1;s.strategy=strategy;s.revision=(s.revision??0)+1;save(s);}},removeDraft:id=>{if(locks.has(id)||get(id)?.enabled)fail('Pause trading before deleting draft');if(db.prepare('SELECT 1 FROM agent_wallets WHERE agent_id=?').get(id))fail('Agent wallet exists; normal draft deletion is blocked');decisions.remove(id);db.prepare('DELETE FROM paper_states WHERE agent_id=?').run(id);db.prepare('DELETE FROM paper_history WHERE agent_id=?').run(id);}};
}
