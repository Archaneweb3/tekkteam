import {createHash} from 'node:crypto';
import {portfolioMetrics,buildAnalytics} from './paper-analytics.js';
export const PORTFOLIO_CADENCE=300000,PORTFOLIO_LIMIT=8640,PORTFOLIO_MAX_AGE=30*86400000;
const epochFor=s=>createHash('sha256').update(JSON.stringify([s.startedAt??null,s.initialSol??null,s.initialUsd??null,s.initialSolUsd??null])).digest('hex').slice(0,24);

export function createAnalyticsStore(db,now=Date.now){
 db.exec(`CREATE TABLE IF NOT EXISTS paper_portfolio_history(agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,epoch TEXT NOT NULL,timestamp INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(agent_id,timestamp));
 CREATE INDEX IF NOT EXISTS paper_portfolio_epoch ON paper_portfolio_history(agent_id,epoch,timestamp);`);
 const state=id=>{const row=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id);return row?JSON.parse(row.data):null;};
 function recordAll(){
  const time=now();
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const row of db.prepare('SELECT s.agent_id,s.data FROM paper_states s JOIN agents a ON a.id=s.agent_id').all()){
    const s=JSON.parse(row.data);if(s.mode==='live'||(!Number.isFinite(s.initialSol)&&!Number.isFinite(s.initialUsd)))continue;
    const epoch=epochFor(s),previous=db.prepare('SELECT timestamp FROM paper_portfolio_history WHERE agent_id=? AND epoch=? ORDER BY timestamp DESC LIMIT 1').get(row.agent_id,epoch);
    if(previous&&time-previous.timestamp<PORTFOLIO_CADENCE)continue;
    const m=portfolioMetrics(s),q=s.market,stale=m.openPositions.length>0&&(!Number.isFinite(q?.observedAt)||time-q.observedAt>30000||q.observedAt>time+1000||q.stale===true);
    const data={timestamp:time,portfolioValueSol:stale?null:m.portfolioValueSol,paperCashSol:m.paperCashSol,realizedPnlSol:m.realizedPnlSol,unrealizedPnlSol:stale?null:m.unrealizedPnlSol,valuationAsOf:m.openPositions.length?q?.observedAt??null:time,reason:stale?'STALE_VALUATION':m.portfolioValueSol===null?'UNAVAILABLE':null};
    db.prepare('INSERT OR IGNORE INTO paper_portfolio_history VALUES(?,?,?,?)').run(row.agent_id,epoch,time,JSON.stringify(data));
   }
   db.prepare('DELETE FROM paper_portfolio_history WHERE timestamp<?').run(time-PORTFOLIO_MAX_AGE);
   for(const row of db.prepare('SELECT DISTINCT agent_id FROM paper_portfolio_history').all())db.prepare('DELETE FROM paper_portfolio_history WHERE agent_id=? AND timestamp IN (SELECT timestamp FROM paper_portfolio_history WHERE agent_id=? ORDER BY timestamp DESC LIMIT -1 OFFSET ?)').run(row.agent_id,row.agent_id,PORTFOLIO_LIMIT);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function read(agent){
  const s=state(agent.id),epoch=s?epochFor(s):null;
  const ledger=db.prepare('SELECT id,data FROM paper_history WHERE agent_id=? ORDER BY id').all(agent.id).map(r=>({...JSON.parse(r.data),id:'paper:'+r.id}));
  const decisions=db.prepare('SELECT data FROM paper_decisions WHERE agent_id=? AND created_at>=? ORDER BY created_at DESC,rowid DESC LIMIT 500').all(agent.id,now()-PORTFOLIO_MAX_AGE).map(r=>JSON.parse(r.data));
  const history=epoch?db.prepare('SELECT data FROM paper_portfolio_history WHERE agent_id=? AND epoch=? AND timestamp>=? ORDER BY timestamp').all(agent.id,epoch,now()-PORTFOLIO_MAX_AGE).map(r=>JSON.parse(r.data)):[];
  return {...buildAnalytics(agent,s,ledger,decisions,history,now()),portfolioEpoch:epoch,epochNote:'Curve and drawdown use the current capital epoch only. Closed trades cover the preserved lifetime ledger. No reset endpoint currently exists.'};
 }
 return {recordAll,read};
}
