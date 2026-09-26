import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Keypair,Connection,PublicKey} from '@solana/web3.js';
import {GENESIS} from '../src/pump-readiness.js';
import {createMarketFeed} from './market-data.js';
import {LIMITS,PROFILES,strategyIntent,executePaper} from './paper-engine.js';
import {installFunding} from './agent-funding.js';
import {randomUUID} from 'node:crypto';
import {canonicalEvent,projectTrading,aggregateTrading,rankTraders} from './trading-projection.js';

const fail=message=>{throw Object.assign(Error(message),{status:409});};
const checkQuote=(q,mint,now)=>{if(q.network!=='solana:101'||q.mint!==mint||![q.priceUsd,q.solUsd,q.liquidityUsd].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(q.observedAt)||now-q.observedAt>30000||q.observedAt>now+1000)fail('Invalid or stale Mainnet market data');};
export function launchReceipt(agent,journal=resolve(process.env.DATA_DIR||'server/data','pump-agent-launches.json')){
 let data;try{data=JSON.parse(readFileSync(journal,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const r=data.version===2?data.receipts?.[agent.id]:null;
 if(!r||r.agentId!==agent.id||r.owner!==agent.creator||r.network!=='solana:101'||!r.confirmed||r.status!=='Success'||!r.signature||!r.mint)return null;
 new PublicKey(r.mint);return r;
}
export function installAgentTrading(app,{store,auth,owned,now=Date.now,market=createMarketFeed({now}),receipt=launchReceipt,balance}={}){
 const {db}=store;const locks=new Set();let ticking=false;
 const connection=new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 const readBalance=balance??(async address=>{if(await connection.getGenesisHash()!==GENESIS)fail('Mainnet assertion failed');return connection.getBalance(new PublicKey(address),'confirmed');});
 db.exec(`CREATE TABLE IF NOT EXISTS agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS paper_states(agent_id TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS paper_history(id INTEGER PRIMARY KEY AUTOINCREMENT,agent_id TEXT NOT NULL,data TEXT NOT NULL);`);
 // A process restart requires explicit resume. An in-flight market read cannot
 // bypass PAUSE: state and receipt are checked again immediately before execution.
 for(const row of db.prepare('SELECT * FROM paper_states').all()){const s=JSON.parse(row.data);if(s.enabled){s.enabled=false;s.everStarted=true;s.updatedAt=now();db.prepare('UPDATE paper_states SET data=? WHERE agent_id=?').run(JSON.stringify(s),row.agent_id);db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run(row.agent_id,JSON.stringify({eventId:randomUUID(),agentId:row.agent_id,mode:'paper',type:'PAUSED',timestamp:now(),reason:'Service restarted; resume explicitly'}));}}
 const get=id=>{const row=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id);return row?JSON.parse(row.data):null;};
 const save=s=>{s.updatedAt=now();db.prepare('INSERT OR REPLACE INTO paper_states VALUES(?,?)').run(s.agentId,JSON.stringify(s));};
 const log=(id,data)=>db.prepare('INSERT INTO paper_history(agent_id,data) VALUES(?,?)').run(id,JSON.stringify(data));
 const history=id=>db.prepare('SELECT id,data FROM paper_history WHERE agent_id=? ORDER BY id DESC').all(id).map(x=>({...JSON.parse(x.data),id:'paper:'+x.id}));
 const record=(a,s,data)=>{const event={...data,eventId:randomUUID(),timestamp:now(),tokenSymbol:s.tokenSymbol??s.market?.tokenSymbol??null,strategy:s.strategy,marketSnapshotId:s.market?.snapshotId??null};log(a.id,{...data,...canonicalEvent(a,s,event)});};
 const projection=a=>{let tokenLive=null;try{tokenLive=!!receipt(a);}catch{}return {...projectTrading(a,get(a.id),history(a.id),now()),createdAt:a.createdAt??null,tokenLive,launchToken:{name:a.coin?.name??null,symbol:a.coin?.ticker??null}};};
 const configured=(a,s)=>{const mint=s?.mint??receipt(a)?.mint;if(!mint)fail('Configure a Mainnet market mint first');try{new PublicKey(mint);}catch{fail('Invalid market mint');}return mint;};
 const valid=a=>{const r=receipt(a);if(!r)fail('A confirmed Mainnet token launch is required');return r;};
 installFunding(app,{db,auth,owned,connection,valid,now});
 function snapshot(a){
  const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id),s=get(a.id),r=receipt(a);
  const position=s?.position?{...s.position,marketValueUsd:s.position.quantity*(s.market?.priceUsd??s.position.entryPriceUsd)}:null;
  return {...projection(a),mode:'paper',liveLocked:true,fundingLocked:process.env.FUNDING_ENABLED!=='true',tokenLive:!!r,agentId:a.id,wallet:wallet?{address:wallet.address,balanceLamports:s?.walletBalanceLamports??null,balanceCheckedAt:s?.balanceCheckedAt??null}:null,enabled:s?.enabled??false,strategy:s?.strategy??a.strategy,limits:LIMITS,profiles:Object.keys(PROFILES),paperCashUsd:s?.cashUsd??null,paperCapitalUsd:s?.initialUsd??null,realizedPnlUsd:s?.realizedUsd??0,totalPnlUsd:s?.initialUsd!=null?s.cashUsd+(position?.marketValueUsd??0)-s.initialUsd:0,position,market:s?.market??null,health:s?.health??'Not checked',decision:s?.decision??null,defaultTokenMint:r?.mint??null};
 }
 const all=()=>db.prepare('SELECT data FROM agents ORDER BY no DESC').all().map(row=>projection(JSON.parse(row.data)));
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
  if(!PROFILES[req.body.strategy])fail('Choose a valid strategy');
  let mint;try{mint=new PublicKey(req.body.tokenMint).toBase58();}catch{fail('Enter a valid Mainnet market mint');}
  if(old?.position&&old.mint!==mint)fail('Cannot change market while a position remains open');
  const revision=old?.revision??0;locks.add(a.id);
  try{const quote=await market(mint);checkQuote(quote,mint,now());owned(req);const current=get(a.id);if(current?.enabled||(current?.revision??0)!==revision)fail('Trading state changed during configuration');
   const s={...current,agentId:a.id,mode:'paper',enabled:false,strategy:req.body.strategy,mint,tokenSymbol:quote.tokenSymbol??quote.symbol??null,market:quote,revision:revision+1,health:'Healthy',decision:'Configured for Paper Trading'};
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
  if(!PROFILES[req.body.strategy])fail('Choose Balanced, Selective or Momentum');
  if(locks.has(a.id))fail('Trading operation in progress');
  const prior=get(a.id),revision=prior?.revision??0,mint=configured(a,prior);if(prior?.enabled)fail('Paper trading already working');locks.add(a.id);
  try{
   const quote=await market(mint);
   checkQuote(quote,mint,now());
   const current=get(a.id);if((current?.revision??0)!==revision)fail('Trading was paused during preparation');owned(req);
   const s=current?.initialUsd!=null?current:{...current,agentId:a.id,mode:'paper',initialSol:LIMITS.paperCapitalSol,cashSol:LIMITS.paperCapitalSol,realizedSol:0,initialSolUsd:quote.solUsd,cashUsd:LIMITS.paperCapitalSol*quote.solUsd,initialUsd:LIMITS.paperCapitalSol*quote.solUsd,realizedUsd:0,position:null,dailyDate:'',dailySpentSol:0,lastTradeAt:0};
   const available=Number.isFinite(s.cashSol)?s.cashSol:s.cashUsd/quote.solUsd;
   if(available<LIMITS.maxTradeSol*(1+LIMITS.feeBps/10000)+LIMITS.networkFeeSol&&!s.position)fail('Insufficient paper balance');
   if(s.mint&&s.mint!==mint)fail('Token identity changed');
   const resumed=!!s.everStarted||prior?.initialUsd!=null;
   Object.assign(s,{enabled:true,everStarted:true,startedAt:s.startedAt??now(),revision:revision+1,strategy:req.body.strategy,mint,tokenSymbol:quote.tokenSymbol??quote.symbol??null,market:quote,health:'Healthy',decision:'Waiting for next market tick'});save(s);record(a,s,{type:resumed?'RESUMED':'TRADING_STARTED',reason:resumed?'Resumed by owner':'Paper trading started by owner'});res.json(snapshot(a));
  }finally{locks.delete(a.id);}
 });
 app.post('/api/agents/:id/trading/pause',auth,(req,res)=>{
  const a=owned(req).agent,s=get(a.id)??{agentId:a.id,mode:'paper'},wasEnabled=s.enabled;s.enabled=false;s.revision=(s.revision??0)+1;s.decision='Paused by owner';save(s);if(wasEnabled)record(a,s,{type:'PAUSED',reason:'Paused by owner'});res.json(snapshot(a));
 });
 app.post('/api/agents/:id/trading/fund',auth,(req,res)=>{owned(req);fail('Real funding is locked during paper mode. Use simulated buying power; do not deposit real SOL.');});
 async function tick(){
  if(ticking)return;ticking=true;
  try{for(const row of db.prepare('SELECT * FROM paper_states').all()){
   const initial=JSON.parse(row.data);if(!initial.enabled||locks.has(row.agent_id))continue;
   locks.add(row.agent_id);
   try{
    const agentRow=db.prepare('SELECT data FROM agents WHERE id=?').get(row.agent_id);if(!agentRow)continue;const a=JSON.parse(agentRow.data),mint=configured(a,initial),quote=await market(mint);
    const s=get(a.id);if(!s?.enabled)continue;if(s.mint!==mint)fail('Token identity changed');
    checkQuote(quote,mint,now());
    const intent=strategyIntent(s,quote,now());s.market=quote;s.tokenSymbol=quote.tokenSymbol??quote.symbol??null;s.health='Healthy';s.decision=intent.reason;s.paperKillSwitch=process.env.PAPER_TRADING_KILL_SWITCH==='true';
    if(intent.side!=='HOLD'){
     const result=executePaper(s,intent,quote,now());s.decision=result.risk.allowed?intent.reason:result.risk.reason;
     db.exec('BEGIN IMMEDIATE');try{save(s);record(a,s,{...intent,type:'SIGNAL_DETECTED'});if(result.receipt){const r=result.receipt;if(r.side==='BUY')record(a,s,{...r,type:'POSITION_OPENED'});if(r.positionClosed)record(a,s,{...r,type:'POSITION_CLOSED',pnlSol:r.closedPositionPnlSol});record(a,s,{...r,type:r.side});}else record(a,s,{type:'RISK_REJECTED',requestedSizeSol:intent.sol,reason:result.risk.reason});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }else{if(s.lastSkipReason!==intent.reason||!s.lastSkipAt||now()-s.lastSkipAt>=60000){record(a,s,{type:'SIGNAL_SKIPPED',reason:intent.reason});s.lastSkipReason=intent.reason;s.lastSkipAt=now();}save(s);}
   }catch(e){const s=get(row.agent_id);if(s){s.health='Unavailable';s.decision='Market data or trading state unavailable; no execution';const rowAgent=db.prepare('SELECT data FROM agents WHERE id=?').get(row.agent_id);if(rowAgent&&(!s.lastErrorAt||now()-s.lastErrorAt>=60000)){record(JSON.parse(rowAgent.data),s,{type:'SIGNAL_SKIPPED',reason:s.decision});s.lastErrorAt=now();}save(s);}}
   finally{locks.delete(row.agent_id);}
  }}finally{ticking=false;}
 }
 return {tick,snapshot,projection,setStrategy:(id,strategy)=>{if(!PROFILES[strategy])fail('Invalid paper strategy');const s=get(id);if(locks.has(id)||s?.enabled)fail('Pause trading before changing strategy');if(s){s.strategy=strategy;s.revision=(s.revision??0)+1;save(s);}},removeDraft:id=>{if(locks.has(id)||get(id)?.enabled)fail('Pause trading before deleting draft');if(db.prepare('SELECT 1 FROM agent_wallets WHERE agent_id=?').get(id))fail('Agent wallet exists; normal draft deletion is blocked');db.prepare('DELETE FROM paper_states WHERE agent_id=?').run(id);db.prepare('DELETE FROM paper_history WHERE agent_id=?').run(id);}};
}
