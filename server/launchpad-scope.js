const VERSION=1, SENTINEL='launchpad_scope_ledger_v1';
const TABLE=`CREATE TABLE launchpad_agent_scopes(agent_id TEXT PRIMARY KEY NOT NULL,owner TEXT NOT NULL,version INTEGER NOT NULL CHECK(version=1),kind TEXT NOT NULL CHECK(kind='ASSOCIATED_COIN'),created_at INTEGER NOT NULL,source TEXT NOT NULL CHECK(source IN ('LAUNCHPAD_IDENTITY','LAUNCHPAD_ENTRY')))`;
const GUARDS={launchpad_scope_no_replace:"CREATE TRIGGER launchpad_scope_no_replace BEFORE INSERT ON launchpad_agent_scopes WHEN EXISTS(SELECT 1 FROM launchpad_agent_scopes WHERE agent_id=NEW.agent_id) BEGIN SELECT RAISE(ABORT,'Launchpad scope is immutable'); END",launchpad_scope_no_update:"CREATE TRIGGER launchpad_scope_no_update BEFORE UPDATE ON launchpad_agent_scopes BEGIN SELECT RAISE(ABORT,'Launchpad scope is immutable'); END",launchpad_scope_no_delete:"CREATE TRIGGER launchpad_scope_no_delete BEFORE DELETE ON launchpad_agent_scopes BEGIN SELECT RAISE(ABORT,'Launchpad scope is immutable'); END"};
const normalize=sql=>String(sql??'').replace(/\s+/g,' ').trim();
const fail=message=>Object.assign(Error(message),{status:409});
const binding=agent=>typeof agent?.id==='string'&&!!agent.id.trim()&&typeof agent?.creator==='string'&&!!agent.creator.trim();
export function installLaunchpadScopeLedger(db,{now=Date.now}={}){
 const object=name=>db.prepare('SELECT type,sql FROM sqlite_master WHERE name=?').get(name);
 const sentinel=()=>db.prepare('SELECT value FROM settings WHERE key=?').get(SENTINEL);
 function assertInitialized(){
  if(sentinel()?.value!=='installed'||object('launchpad_agent_scopes')?.type!=='table'||normalize(object('launchpad_agent_scopes')?.sql)!==normalize(TABLE))throw fail('Launchpad scope ledger unavailable');
  for(const [name,sql]of Object.entries(GUARDS))if(object(name)?.type!=='trigger'||normalize(object(name)?.sql)!==normalize(sql))throw fail('Launchpad scope ledger unavailable');
 }
 if(!object('launchpad_agent_scopes')&&!sentinel()){
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(TABLE);for(const sql of Object.values(GUARDS))db.exec(sql);db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(SENTINEL,'installed');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 }
 assertInitialized();
 const valid=(row,agent)=>row?.agent_id===agent.id&&row.owner===agent.creator&&row.version===VERSION&&row.kind==='ASSOCIATED_COIN'&&Number.isSafeInteger(row.created_at)&&row.created_at>=0&&['LAUNCHPAD_IDENTITY','LAUNCHPAD_ENTRY'].includes(row.source);
 function readLaunchpadScope(agent){
  try{if(!binding(agent))throw fail('Scope binding unavailable');assertInitialized();const row=db.prepare('SELECT * FROM launchpad_agent_scopes WHERE agent_id=?').get(agent.id);if(row&&!valid(row,agent))throw fail('Scope binding unavailable');return {available:true,scoped:!!row,reason:null};}
  catch{return {available:false,scoped:null,reason:'LAUNCHPAD_SCOPE_UNAVAILABLE'};}
 }
 // Node22 has no DatabaseSync.isTransaction; a nested-BEGIN probe fails without changing the caller transaction.
 function requireTransaction(){
  try{db.exec('BEGIN IMMEDIATE');}catch(error){if(/within a transaction/i.test(error.message))return;throw fail('Launchpad scope transaction unavailable');}
  db.exec('ROLLBACK');throw fail('Launchpad scope requires an atomic transaction');
 }
 function insertLaunchpadScope(agent,{source}={}){
  if(!binding(agent)||!['LAUNCHPAD_IDENTITY','LAUNCHPAD_ENTRY'].includes(source))throw fail('Invalid Launchpad scope binding');
  requireTransaction();assertInitialized();
  const prior=db.prepare('SELECT * FROM launchpad_agent_scopes WHERE agent_id=?').get(agent.id);
  if(prior){if(!valid(prior,agent)||prior.source!==source)throw fail('Launchpad scope binding conflict');return {available:true,scoped:true,reason:null};}
  const timestamp=now();if(!Number.isSafeInteger(timestamp)||timestamp<0)throw fail('Launchpad scope timestamp unavailable');
  db.prepare('INSERT INTO launchpad_agent_scopes VALUES(?,?,?,?,?,?)').run(agent.id,agent.creator,VERSION,'ASSOCIATED_COIN',timestamp,source);
  return {available:true,scoped:true,reason:null};
 }
 return {readLaunchpadScope,insertLaunchpadScope};
}
