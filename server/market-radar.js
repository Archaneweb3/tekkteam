import {createHash,randomUUID} from 'node:crypto';
import {PROFILES,strategyConfigFor} from '../public/app/strategy-config.js';
import {RISK_LABELS,SIGNAL_LABELS} from '../public/app/decision-fields.js';
import {radarHealth} from './market-health.js';
export const DECISION_LIMIT=500,DECISION_MAX_AGE=30*86400000;
const num=v=>Number.isFinite(v)?v:null;
const str=v=>typeof v==='string'?v:null;
export function marketFacts(q){if(!q)return null;return {mint:str(q.mint),quoteMint:str(q.quoteMint),symbol:str(q.tokenSymbol??q.symbol),name:str(q.tokenName),network:str(q.network),source:str(q.source),pair:str(q.pair),venue:str(q.venue),verifiedVenue:str(q.marketBinding?.status==='SUPPORTED_RAYDIUM_CPMM'?'RAYDIUM_CPMM':null),verifiedPool:str(q.marketBinding?.pool),executionSupport:q.marketBinding?.status==='SUPPORTED_RAYDIUM_CPMM'?'SUPPORTED':'UNSUPPORTED',priceUsd:num(q.priceUsd),solUsd:num(q.solUsd),liquidityUsd:num(q.liquidityUsd),volume5m:num(q.volume5m),change5m:num(q.change5m),buys5m:num(q.buys5m),sells5m:num(q.sells5m),observedAt:num(q.observedAt),snapshotId:str(q.snapshotId),timestampKind:str(q.timestampKind)};}
export function quoteProblem(q,mint,now){
 if(!q||q.network!=='solana:101'||q.mint!==mint||![q.priceUsd,q.solUsd,q.liquidityUsd].every(n=>Number.isFinite(n)&&n>0))return 'ERROR';
 if(![q.volume5m,q.change5m,q.buys5m,q.sells5m].every(Number.isFinite)||q.volume5m<0||q.buys5m<0||q.sells5m<0)return 'ERROR';
 if(!Number.isFinite(q.observedAt)||now-q.observedAt>30000||q.observedAt>now+1000||q.stale===true)return 'STALE_DATA';
 return null;
}
export function entryChecks(q,c,signals){const p=PROFILES[c.strategy];return Object.entries(signals).map(([key,passed])=>({key,passed,actual:num(({liquidityPassed:q.liquidityUsd,volumePassed:q.volume5m,momentumPassed:q.change5m,ratioPassed:q.buys5m/Math.max(1,q.sells5m)})[key]),minimum:({liquidityPassed:c.signal.minLiquidityUsd,volumePassed:c.signal.minVolume5mUsd,momentumPassed:c.signal.minPriceChange5mPercent,ratioPassed:p.minRatio})[key],maximum:key==='momentumPassed'?p.maxChange:null}));}
export function decisionSnapshot(s,intent,result,now){
 const c=intent.strategyConfig,q=intent.marketSnapshot;
 const checks=entryChecks(q,c,intent.signals);
 const risk=result?.risk?{allowed:result.risk.allowed,reason:str(result.risk.reason),reasons:(result.risk.reasons??[]).filter(v=>typeof v==='string'),checks:Object.fromEntries(Object.keys(RISK_LABELS).map(k=>[k,typeof result.risk.checks?.[k]==='boolean'?result.risk.checks[k]:null])),impactBps:num(result.risk.impactBps),adjustedSizeSol:num(result.risk.adjustedSizeSol)}:null;
 const filterReason=checks.filter(c=>!c.passed).map(c=>`${SIGNAL_LABELS[c.key]} ${c.actual} is ${c.maximum!=null&&c.actual>c.maximum?'above '+c.maximum:'below '+c.minimum}`).join('; ');
 const finalDecision=result?.receipt?result.receipt.side:risk&&!risk.allowed?'REJECTED':s.position?'WATCH':'SKIPPED';
 return {id:randomUUID(),agentId:s.agentId,mode:'paper',timestamp:now,market:marketFacts(q),strategy:c.strategy,configVersion:intent.strategyConfigVersion,config:structuredClone(c),signalChecks:checks,signalContext:intent.side==='SELL'||(intent.side==='HOLD'&&s.position)?'Entry filters; exits use position rules':'Entry filters',tradeIntent:{id:intent.intentId,action:intent.side,tokenMint:intent.tokenMint,requestedSizeSol:num(intent.requestedSizeSol),reason:intent.reason},risk,finalDecision,positionState:result?.receipt?.positionClosed?'POSITION_CLOSED':s.position?'POSITION_OPEN':null,reason:{code:finalDecision==='REJECTED'?'RISK_REJECTED':intent.side==='HOLD'?(s.position?'WITHIN_EXIT_THRESHOLDS':'ENTRY_FILTERS_NOT_MET'):intent.side,summary:risk&&!risk.allowed?risk.reason:intent.side==='HOLD'&&!s.position&&filterReason?filterReason:intent.reason,failedSignals:checks.filter(c=>!c.passed).map(c=>c.key)},executedSizeSol:num(result?.receipt?.solNotional)};
}
export function unavailableSnapshot(s,q,status,now){const c=strategyConfigFor(s.position?.strategyConfig?{strategyConfig:s.position.strategyConfig}:s);return {id:randomUUID(),agentId:s.agentId,mode:'paper',timestamp:now,market:marketFacts(q),strategy:c.strategy,configVersion:s.position?.strategyConfigVersion??s.strategyConfigVersion??0,config:c,signalChecks:[],tradeIntent:null,risk:null,finalDecision:'SKIPPED',positionState:s.position?'POSITION_OPEN':null,reason:{code:status,summary:status==='STALE_DATA'?'Market data is stale; no strategy evaluation or execution':'Market data unavailable or invalid; no strategy evaluation or execution',failedSignals:[]}};}
export function createDecisionStore(db,now=Date.now){
 db.exec('CREATE TABLE IF NOT EXISTS paper_decisions(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,created_at INTEGER NOT NULL,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS paper_decisions_agent_time ON paper_decisions(agent_id,created_at DESC)');
 const prune=id=>{db.prepare('DELETE FROM paper_decisions WHERE agent_id=? AND (created_at<? OR id IN (SELECT id FROM paper_decisions WHERE agent_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?))').run(id,now()-DECISION_MAX_AGE,id,DECISION_LIMIT);};
 return {capture(s,snapshot){
  const fingerprint=createHash('sha256').update(JSON.stringify([snapshot.market?.mint,snapshot.configVersion,snapshot.strategy,snapshot.signalChecks.map(c=>[c.key,c.passed]),snapshot.finalDecision,snapshot.positionState,snapshot.risk?.reason,snapshot.reason.code])).digest('hex');
  const mint=snapshot.market?.mint??'unavailable';
  const meaningful=['BUY','SELL'].includes(snapshot.finalDecision)||(s.discoveryMode?s.radarFingerprints?.[mint]:s.radarFingerprint)!==fingerprint;
  if(s.discoveryMode){s.radarFingerprints??={};s.radarFingerprints[mint]=fingerprint;}
  s.radarFingerprint=fingerprint;s.radar={status:snapshot.reason.code==='STALE_DATA'?'STALE_DATA':snapshot.reason.code==='ERROR'?'ERROR':'WATCHING',lastEvaluated:snapshot.tradeIntent?now():null,lastChecked:now(),snapshot};
  if(meaningful)db.prepare('INSERT INTO paper_decisions VALUES(?,?,?,?)').run(snapshot.id,s.agentId,snapshot.timestamp,JSON.stringify(snapshot));prune(s.agentId);return meaningful;
 },list(id,filter='all'){prune(id);const rows=db.prepare('SELECT data FROM paper_decisions WHERE agent_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?').all(id,DECISION_LIMIT).map(r=>JSON.parse(r.data));return rows.filter(d=>filter==='all'||(filter==='trades'?['BUY','SELL'].includes(d.finalDecision):filter==='risk'?d.finalDecision==='REJECTED':d.finalDecision==='SKIPPED'||d.finalDecision==='WATCH'));},remove(id){db.prepare('DELETE FROM paper_decisions WHERE agent_id=?').run(id);}};
}
export function radarState(agent,s,now,scanning=false){
 const agentStatus=s?.enabled?'WORKING':s?.everStarted||s?.startedAt||s?.initialUsd!=null?'PAUSED':'READY';
 if(s?.discoveryMode){
  const scan=s.scan??{},opportunities=(scan.opportunities??[]).map(d=>({...d,opportunityState:d.market&&quoteProblem(d.market,d.market.mint,now)==='STALE_DATA'?'STALE':d.opportunityState}));
  let status=!s.everStarted?'OFFLINE':!s.enabled?'PAUSED':scanning?'SCANNING':scan.status??'SCANNING';
  if(s.enabled&&!['PROVIDER_UNAVAILABLE','RATE_LIMITED'].includes(status)&&(opportunities.some(d=>d.opportunityState==='STALE')||(Number.isFinite(scan.lastChecked)&&now-scan.lastChecked>30000)))status='STALE_DATA';
  return {agentId:agent.id,mode:'paper',liveLocked:true,status,agentStatus,...radarHealth(scan,now),coverage:scan.coverage??null,serverTime:now,configVersion:s.strategyConfigVersion??0,strategy:s.strategy,lastEvaluated:scan.lastEvaluated??null,lastChecked:scan.lastChecked??null,opportunities,counts:{scanned:scan.scanned??0,eligible:scan.eligible??0,watching:scan.watching??0,evaluated:scan.evaluated??0},rejections:scan.rejections??[],scope:'Dexscreener latest token profiles · up to 24 Solana mints; not all markets or trending tokens.',limits:{maxRadarCandidates:8,maxActiveEvaluations:3},freshnessMs:30000};
 }
 const started=!!(s?.everStarted||s?.startedAt||s?.initialUsd!=null),last=s?.radar??null;
 let status=!started?'OFFLINE':!s?.enabled?'PAUSED':scanning?'SCANNING':last?.status??'SCANNING';
 if(s?.enabled&&last?.snapshot&&quoteProblem(last.snapshot.market,s.mint,now)==='STALE_DATA')status='STALE_DATA';
 return {agentId:agent.id,mode:'paper',liveLocked:true,status,agentStatus,...radarHealth(last??{},now),serverTime:now,configuredMint:s?.mint??null,configVersion:s?.strategyConfigVersion??0,strategy:s?.strategy??agent.strategy,lastEvaluated:last?.lastEvaluated??null,lastChecked:last?.lastChecked??null,opportunities:last?.snapshot?.market?.mint&&last.snapshot.market.mint===s?.mint?[last.snapshot]:[],scope:'One configured Mainnet market per agent; not a market-wide scanner',freshnessMs:30000};
}
