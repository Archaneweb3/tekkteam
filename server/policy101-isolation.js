// One explicitly approved operation; immutable history remains an input, never a writer.
import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readReceiptJournal,validateReceiptJournal} from './launch-receipt-journal.js';
import {loadLegacyQuarantine} from './legacy-launch-quarantine.js';
import {M4_TARGET} from './pump-m4-guard.js';

export const POLICY101_ID='policy101-20261007-ret-3ed';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const file=path=>{const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('POLICY101_UNSAFE_FILE');return readFileSync(path);};
const tables=['launch_isolation_grants','launch_isolation_claims','canonical_launch_receipts'];
function install(db){
 db.exec(`CREATE TABLE IF NOT EXISTS launch_isolation_grants(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS launch_isolation_claims(grant_id TEXT PRIMARY KEY REFERENCES launch_isolation_grants(id),execution_id TEXT UNIQUE NOT NULL,idempotency_key TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS canonical_launch_receipts(agent_id TEXT PRIMARY KEY,execution_id TEXT UNIQUE NOT NULL,signature TEXT UNIQUE NOT NULL,mint TEXT UNIQUE NOT NULL,payload TEXT NOT NULL);`);
 for(const table of tables)for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable launch isolation'); END`);
 // REPLACE must not evade immutability even if recursive_triggers is off.
 for(const [table,keys] of [['launch_isolation_grants',['id']],['launch_isolation_claims',['grant_id','execution_id','idempotency_key']],['canonical_launch_receipts',['agent_id','execution_id','signature','mint']]])db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_replace BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM ${table} WHERE ${keys.map(key=>key+'=NEW.'+key).join(' OR ')}) BEGIN SELECT RAISE(ABORT,'Immutable launch isolation'); END`);
}
export function loadPolicy101Approval({path,sha256}){
 const bytes=file(path);if(hash(bytes)!==sha256)fail('POLICY101_APPROVAL_HASH');
 const grant=JSON.parse(bytes);
 if(grant.id!==POLICY101_ID||grant.policy!==101||grant.classification!=='LEGACY_UNKNOWN_QUARANTINED'||grant.origin!=='https://tekkteam.tech'||grant.network!=='solana:101'||grant.maximumAttempts!==1||!same(grant.target,M4_TARGET))fail('POLICY101_APPROVAL_SCOPE');
 return grant;
}
export function createPolicy101Authority(options){
 const {db,approval}=options;if(!approval)return authority(options);
 db.exec('BEGIN IMMEDIATE');try{const result=authority(options);db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
function authority({db,journalPath,approval=null,now=Date.now}){
 const has=table=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
 if(approval){install(db);const old=db.prepare('SELECT payload FROM launch_isolation_grants WHERE id=?').get(approval.id);if(old&&!same(JSON.parse(old.payload),approval))fail('POLICY101_GRANT_CHANGED');if(!old)db.prepare('INSERT INTO launch_isolation_grants VALUES(?,?)').run(approval.id,JSON.stringify(approval));}
 const installed=has(tables[0]);
 if(installed&&tables.some(t=>!has(t)))fail('POLICY101_STORE_INCOMPLETE');
 const persisted=installed?db.prepare('SELECT payload FROM launch_isolation_grants').all():[];
 if(persisted.length>1)fail('POLICY101_MULTIPLE_GRANTS');
 const grant=persisted[0]?JSON.parse(persisted[0].payload):null;
 if(installed&&!grant)fail('POLICY101_GRANT_MISSING');
 const quarantine=grant?loadLegacyQuarantine(journalPath,{required:true}):null;
 const claim=()=>grant?db.prepare('SELECT * FROM launch_isolation_claims WHERE grant_id=?').get(grant.id):null;
 function assertPins(){
  const legacy=readReceiptJournal(journalPath);
  if(!grant)return legacy;
  if(db.prepare('SELECT payload FROM launch_isolation_grants WHERE id=?').get(grant.id)?.payload!==JSON.stringify(grant))fail('POLICY101_GRANT_CHANGED');
  quarantine.read();
  for(const [path,digest] of [[journalPath,grant.journalSha256],[journalPath+'.quarantine.json',grant.quarantineSha256],[grant.evidencePath,grant.evidenceSha256],[grant.retiredEntrypoint,grant.retiredEntrypointSha256]])if(hash(file(path))!==digest)fail('POLICY101_HISTORY_CHANGED');
  const token=db.prepare('SELECT owner,version,token_json FROM launchpad_first_tokens WHERE agent_id=?').get(grant.target.agentId);
  if(token?.owner!==grant.target.owner||token.version!==1||hash(token.token_json)!==grant.tokenSha256)fail('POLICY101_DRAFT_CHANGED');
  return legacy;
 }
 function assertHistory(){
  assertPins();
  const history=db.prepare('SELECT execution_id,payload FROM m4_execution_history ORDER BY execution_id').all(),active=db.prepare('SELECT payload FROM m4_execution WHERE id=1').get();
  if(!active)fail('POLICY101_PRIOR_STATE_MISSING');
  const state=JSON.parse(active.payload),c=claim(),expected=[...grant.history];
  if(c&&state.executionId===c.execution_id)expected.push(grant.prior);
  else if(state.executionId!==grant.prior.id||hash(active.payload)!==grant.prior.sha256)fail('POLICY101_PRIOR_STATE_CHANGED');
  expected.sort((a,b)=>a.id.localeCompare(b.id));
  if(!same(history.map(r=>({id:r.execution_id,sha256:hash(r.payload)})),expected))fail('POLICY101_ARCHIVE_CHANGED');
  return state;
 }
 const identifiers=records=>records.flatMap(r=>[r.agentId,r.owner,r.id,r.executionId,r.mint,r.blockhash,r.recentBlockhash,r.signature,r.transactionSha256,r.executionReview?.digest,r.result?.mint,r.result?.recentBlockhash,r.result?.transactionSha256,r.result?.executionReview?.digest].filter(Boolean));
 function read(){
  const legacy=assertPins(),merged={...legacy.receipts};if(!grant)return legacy;
  const seen=new Set(identifiers(Object.values(merged)));
  for(const row of db.prepare('SELECT * FROM canonical_launch_receipts').all()){
   const r=JSON.parse(row.payload),c=claim();validateReceiptJournal({version:2,receipts:{[r.agentId]:r}});
   if(!c||r.agentId!==grant.target.agentId||r.owner!==grant.target.owner||r.executionId!==c.execution_id||row.agent_id!==r.agentId||row.execution_id!==r.executionId||row.mint!==r.mint||row.signature!==r.signature||r.status!=='Success'||r.confirmed!==true)fail('POLICY101_RECEIPT_BINDING');
   for(const value of [r.agentId,r.id,r.mint,r.signature]){if(seen.has(value))fail('POLICY101_RECEIPT_COLLISION');seen.add(value);}
   merged[r.agentId]=r;
  }
  return validateReceiptJournal({version:2,receipts:merged});
 }
 const requireApproval=()=>{if(!approval||!grant||!same(approval,grant))fail('POLICY101_NOT_ARMED');};
 function assertExecution(id){requireApproval();assertHistory();if(claim()?.execution_id!==id)fail('POLICY101_OPERATION_NOT_CLAIMED');}
 function assertFresh(result){
  assertExecution(result.id);
  const old=[...Object.values(readReceiptJournal(journalPath).receipts),...db.prepare('SELECT payload FROM m4_execution_history').all().map(r=>JSON.parse(r.payload))];
  const active=JSON.parse(db.prepare('SELECT payload FROM m4_execution WHERE id=1').get().payload);if(active.executionId!==result.id)old.push(active);
  const values=new Set(identifiers(old));
  for(const v of [result.id,result.mint,result.recentBlockhash,result.transactionSha256,result.executionReview?.digest])if(!v||values.has(v))fail('POLICY101_LEGACY_IDENTIFIER_REUSED');
  if(result.launch?.initialBuyLamports!==0||result.policy?.estimatedPayerDebitLamports>grant.target.ceilingLamports||result.network!=='solana:101')fail('POLICY101_REVIEW_SCOPE');
 }
 const isolation=grant?{
  available(){requireApproval();assertHistory();return !claim()&&db.prepare('SELECT COUNT(*) n FROM canonical_launch_receipts').get().n===0;},
  beforePrepare(id,previousId){requireApproval();const s=assertHistory();if(claim())fail('POLICY101_ATTEMPT_CONSUMED');if(previousId!==grant.prior.id||s.executionId!==previousId||identifiers([s,...Object.values(readReceiptJournal(journalPath).receipts)]).includes(id)||db.prepare('SELECT 1 FROM m4_execution_history WHERE execution_id=?').get(id))fail('POLICY101_NEW_OPERATION_REQUIRED');
   // Durable before any asynchronous build. A crash/build failure consumes this grant.
   db.prepare('INSERT INTO launch_isolation_claims VALUES(?,?,?,?)').run(grant.id,id,id,now());
  },assertExecution,assertFresh,
  state(){const c=claim();return {policy:101,maximumAttempts:1,attemptConsumed:!!c,executionId:c?.execution_id??null};}
 }:null;
 function commit(receipt,state){
  assertExecution(receipt.executionId);assertFresh(state.result);
  if(state.status!=='LAUNCHED'||state.confirmation?.status!=='LAUNCHED'||state.confirmation.pumpProvenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'||state.signature!==receipt.signature||state.result.mint!==receipt.mint||state.executionId!==receipt.executionId||state.confirmation.confirmedSlot!==receipt.confirmedSlot)fail('POLICY101_FINALIZED_RECEIPT_REQUIRED');
  validateReceiptJournal({version:2,receipts:{[receipt.agentId]:receipt}});read();
  const old=db.prepare('SELECT payload FROM canonical_launch_receipts WHERE agent_id=?').get(receipt.agentId);if(old){if(old.payload!==JSON.stringify(receipt))fail('POLICY101_RECEIPT_CONFLICT');return;}
  if(readReceiptJournal(journalPath).receipts[receipt.agentId])fail('POLICY101_RECEIPT_COLLISION');
  db.prepare('INSERT INTO canonical_launch_receipts VALUES(?,?,?,?,?)').run(receipt.agentId,receipt.executionId,receipt.signature,receipt.mint,JSON.stringify(receipt));read();
 }
 assertPins();
 return Object.freeze({read,isolation,commit,policyPresent:!!grant});
}
