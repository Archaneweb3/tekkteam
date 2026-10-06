import {createHash} from 'node:crypto';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';
import {installFirstTokenStore} from '../server/launchpad-token-store.js';
import {validateReceiptJournal} from '../server/launch-receipt-journal.js';
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const fail=s=>{throw Error('CANONICAL_IMPORT_'+s);};
const table=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
// Caller freezes writers and takes consistent backups first. Never imports
// authentication, vault material, wallet keys, or inferred launch associations.
export function importCanonicalAgent({source,destination,agentId,owner,legacyJournal,stagingJournal}){
 validateReceiptJournal(legacyJournal);validateReceiptJournal(stagingJournal);
 for(const db of [source,destination]){
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare("SELECT value FROM settings WHERE key='network_binding'").get()?.value!=='mainnet')fail('DATABASE_INVALID');
 }
 if(legacyJournal?.version!==2||!legacyJournal.receipts||stagingJournal?.version!==2||Object.keys(stagingJournal.receipts??{}).length)fail('JOURNAL_CONFLICT');
 if(legacyJournal.receipts[agentId])fail('TARGET_RECEIPT_EXISTS');
 const row=source.prepare('SELECT id,owner,data,secret FROM agents WHERE id=?').get(agentId);
 if(!row||row.owner!==owner||row.secret!==null)fail('IDENTITY');
 const agent=JSON.parse(row.data);
 if(agent.id!==agentId||agent.creator!==owner||agent.launch!=null||agent.token!=null||agent.coin?.mint!=null||agent.tokenDraftRevision!==1)fail('TARGET_NOT_UNLAUNCHED');
 if(table(source,'agent_wallets')&&source.prepare('SELECT count(*) n FROM agent_wallets WHERE agent_id=?').get(agentId).n)fail('TARGET_WALLET_EXISTS');
 const sourceScope=installLaunchpadScopeLedger(source),sourceTokens=installFirstTokenStore(source,{readLaunchpadScope:sourceScope.readLaunchpadScope,readReceiptAuthority:()=>{throw Error('Read-only import');}});
 if(sourceScope.readLaunchpadScope(agent).scoped!==true||sourceTokens.readTokenBinding(agentId,owner).bound!==true)fail('SOURCE_BINDING');
 const scope=source.prepare('SELECT * FROM launchpad_agent_scopes WHERE agent_id=?').get(agentId),token=source.prepare('SELECT * FROM launchpad_first_tokens WHERE agent_id=?').get(agentId);
 const active=source.prepare('SELECT payload FROM m4_execution WHERE id=1').get();
 const histories=source.prepare('SELECT execution_id,payload FROM m4_execution_history ORDER BY execution_id').all();
 const current=active&&JSON.parse(active.payload);
 if(!current||current.target?.agentId!==agentId||current.target.owner!==owner||current.status!=='TRANSACTION_EXPIRED'||current.signature||current.broadcastAttempted!==false)fail('ACTIVE_EXECUTION');
 // Preserve signed historical attempts byte-for-byte; never erase consumed attempts.
 for(const h of histories){const r=JSON.parse(h.payload);if(r.executionId!==h.execution_id||r.target?.agentId!==agentId||r.target.owner!==owner||r.broadcastAttempted!==false)fail('HISTORY_CONFLICT');}
 const requests=source.prepare('SELECT * FROM requests WHERE agent_id=? ORDER BY owner,key').all(agentId);
 if(requests.some(r=>r.owner!==owner))fail('REQUEST_OWNER');
 const record={version:1,agentId,owner,sourceAgentHash:digest(row),scopeHash:digest(scope),tokenHash:digest(token),activeExecutionHash:digest(active.payload),history:histories.map(h=>({executionId:h.execution_id,hash:digest(h.payload)})),requestsHash:digest(requests),legacyJournalHash:digest(legacyJournal),image:agent.coin.image,authImported:false,walletImported:false};
 const fingerprint=digest(record),old=destination.prepare('SELECT id,owner,data,secret FROM agents WHERE id=?').get(agentId);
 if(old){
  if(digest(old)!==digest(row)||!table(destination,'canonical_imports')||destination.prepare('SELECT fingerprint FROM canonical_imports WHERE agent_id=?').get(agentId)?.fingerprint!==fingerprint)fail('DESTINATION_COLLISION');
  if(destination.prepare('SELECT payload FROM m4_execution WHERE id=1').get()?.payload!==active.payload||histories.some(h=>destination.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(h.execution_id)?.payload!==h.payload))fail('REPLAY_DIVERGED');
  if(digest(destination.prepare('SELECT * FROM launchpad_agent_scopes WHERE agent_id=?').get(agentId))!==record.scopeHash||digest(destination.prepare('SELECT * FROM launchpad_first_tokens WHERE agent_id=?').get(agentId))!==record.tokenHash||digest(destination.prepare('SELECT * FROM requests WHERE agent_id=? ORDER BY owner,key').all(agentId))!==record.requestsHash||digest(destination.prepare('SELECT execution_id,payload FROM m4_execution_history ORDER BY execution_id').all())!==digest(histories))fail('REPLAY_DIVERGED');
  return {...record,fingerprint,replayed:true};
 }
 if(table(destination,'m4_execution')&&destination.prepare('SELECT count(*) n FROM m4_execution').get().n||table(destination,'m4_execution_history')&&destination.prepare('SELECT count(*) n FROM m4_execution_history').get().n)fail('DESTINATION_EXECUTION_EXISTS');
 const targetScope=installLaunchpadScopeLedger(destination);
 installFirstTokenStore(destination,{readLaunchpadScope:targetScope.readLaunchpadScope,readReceiptAuthority:()=>{throw Error('Import never binds a new draft');}});
 destination.exec("CREATE TABLE IF NOT EXISTS m4_execution(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS m4_execution_history(execution_id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TRIGGER IF NOT EXISTS m4_history_no_update BEFORE UPDATE ON m4_execution_history BEGIN SELECT RAISE(ABORT,'Immutable M4 history'); END;CREATE TRIGGER IF NOT EXISTS m4_history_no_delete BEFORE DELETE ON m4_execution_history BEGIN SELECT RAISE(ABORT,'Immutable M4 history'); END;CREATE TABLE IF NOT EXISTS canonical_imports(agent_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,manifest TEXT NOT NULL);CREATE TRIGGER IF NOT EXISTS canonical_import_no_update BEFORE UPDATE ON canonical_imports BEGIN SELECT RAISE(ABORT,'Immutable canonical import'); END;CREATE TRIGGER IF NOT EXISTS canonical_import_no_delete BEFORE DELETE ON canonical_imports BEGIN SELECT RAISE(ABORT,'Immutable canonical import'); END;");
 destination.exec('BEGIN IMMEDIATE');
 try{
  destination.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run(row.id,row.owner,row.data);
  destination.prepare('INSERT INTO launchpad_agent_scopes VALUES(?,?,?,?,?,?)').run(scope.agent_id,scope.owner,scope.version,scope.kind,scope.created_at,scope.source);
  destination.prepare('INSERT INTO launchpad_first_tokens VALUES(?,?,?,?,?)').run(token.agent_id,token.owner,token.version,token.token_json,token.created_at);
  for(const r of requests)destination.prepare('INSERT INTO requests(owner,key,fingerprint,agent_id) VALUES(?,?,?,?)').run(r.owner,r.key,r.fingerprint,r.agent_id);
  destination.prepare('INSERT INTO m4_execution VALUES(1,?)').run(active.payload);
  for(const h of histories)destination.prepare('INSERT INTO m4_execution_history VALUES(?,?)').run(h.execution_id,h.payload);
  destination.prepare('INSERT INTO canonical_imports VALUES(?,?,?)').run(agentId,fingerprint,JSON.stringify(record));
  destination.exec('COMMIT');
 }catch(e){destination.exec('ROLLBACK');throw e;}
 return {...record,fingerprint,replayed:false};
}
