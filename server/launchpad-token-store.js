import {readFileSync} from 'node:fs';
// Unmounted first-token authority. No RPC, journal writes, schema normalizer or custody access.
const SENTINEL='launchpad_first_token_store_v1';
const TABLE="CREATE TABLE launchpad_first_tokens(agent_id TEXT PRIMARY KEY NOT NULL REFERENCES agents(id),owner TEXT NOT NULL,version INTEGER NOT NULL CHECK(version=1),token_json TEXT NOT NULL CHECK(json_valid(token_json) AND json_type(token_json)='object'),created_at INTEGER NOT NULL)";
const GUARDS={
 launchpad_token_no_replace:"CREATE TRIGGER launchpad_token_no_replace BEFORE INSERT ON launchpad_first_tokens WHEN EXISTS(SELECT 1 FROM launchpad_first_tokens WHERE agent_id=NEW.agent_id) BEGIN SELECT RAISE(ABORT,'Launchpad token is immutable'); END",
 launchpad_token_no_update:"CREATE TRIGGER launchpad_token_no_update BEFORE UPDATE ON launchpad_first_tokens BEGIN SELECT RAISE(ABORT,'Launchpad token is immutable'); END",
 launchpad_token_no_delete:"CREATE TRIGGER launchpad_token_no_delete BEFORE DELETE ON launchpad_first_tokens BEGIN SELECT RAISE(ABORT,'Launchpad token is immutable'); END",
 launchpad_token_agent_no_replace:"CREATE TRIGGER launchpad_token_agent_no_replace BEFORE INSERT ON agents WHEN EXISTS(SELECT 1 FROM launchpad_first_tokens WHERE agent_id=NEW.id) BEGIN SELECT RAISE(ABORT,'Launchpad token Agent is immutable'); END",
 launchpad_token_agent_no_delete:"CREATE TRIGGER launchpad_token_agent_no_delete BEFORE DELETE ON agents WHEN EXISTS(SELECT 1 FROM launchpad_first_tokens WHERE agent_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Launchpad token Agent is immutable'); END",
 launchpad_token_agent_binding:"CREATE TRIGGER launchpad_token_agent_binding BEFORE UPDATE ON agents WHEN EXISTS(SELECT 1 FROM launchpad_first_tokens WHERE agent_id=OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.owner IS NOT OLD.owner OR NEW.secret IS NOT NULL OR json_extract(NEW.data,'$.tokenDraftRevision') IS NOT 1 OR json_extract(NEW.data,'$.id') IS NOT NEW.id OR json_extract(NEW.data,'$.creator') IS NOT NEW.owner OR (json_extract(NEW.data,'$.owner') IS NOT NULL AND json_extract(NEW.data,'$.owner') IS NOT NEW.owner) OR json_extract(NEW.data,'$.token') IS NOT NULL OR json_extract(NEW.data,'$.coin') IS NOT (SELECT token_json FROM launchpad_first_tokens WHERE agent_id=OLD.id)) BEGIN SELECT RAISE(ABORT,'Launchpad token Agent binding is immutable'); END"
};
const receiptStatuses=new Set(['Idle','Prepared','Awaiting approval','Submitted','Confirming','Unknown','Success','Failed','Deleted']);
const fields=['name','ticker','description','image','website','twitter','telegram'];
const fail=message=>Object.assign(Error(message),{status:409});
const canonical=input=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||!Object.isFrozen(input)||Object.keys(input).some(k=>!fields.includes(k))||!['name','ticker'].every(k=>typeof input[k]==='string'&&input[k].trim())||Object.values(input).some(v=>typeof v!=='string'))throw fail('Schema-normalized frozen token draft required');
 // Content bounds/URLs belong to the separately reviewed schema, not this store.
 const token={};for(const key of fields)if(Object.hasOwn(input,key))token[key]=input[key];token.mint=null;return JSON.stringify(token);
};
const normalize=s=>String(s??'').replace(/\s+/g,' ').trim();
// Explicit-path read only: ENOENT is unavailable, never initialized empty authority.
export function readFirstTokenReceiptAuthority(agent,path){
 const unavailable={available:false,initialized:false,agentId:agent?.id??null,owner:agent?.creator??null,receipt:null};
 try{
  if(typeof path!=='string'||!path||typeof agent?.id!=='string'||typeof agent?.creator!=='string')return unavailable;
  const bytes=readFileSync(path,'utf8'),journal=JSON.parse(bytes);
  // The current writer emits compact JSON.stringify bytes. Alternate/duplicate-key bytes lack this authority.
  if(JSON.stringify(journal)!==bytes.trim())return unavailable;
  if(journal?.version!==2||!journal.receipts||typeof journal.receipts!=='object'||Array.isArray(journal.receipts))return unavailable;
  for(const [key,r]of Object.entries(journal.receipts))if(!r||typeof r!=='object'||Array.isArray(r)||r.agentId!==key||typeof r.owner!=='string'||!r.owner||r.network!=='solana:101'||!receiptStatuses.has(r.status)||(r.signature!=null&&(typeof r.signature!=='string'||!r.signature.trim()))||(r.broadcastAttempted!==undefined&&typeof r.broadcastAttempted!=='boolean'))return unavailable;
  const receipt=journal.receipts[agent.id]??null;if(receipt&&receipt.owner!==agent.creator)return unavailable;
  return {available:true,initialized:true,agentId:agent.id,owner:agent.creator,receipt};
 }catch{return unavailable;}
}
export function installFirstTokenStore(db,{readLaunchpadScope,readReceiptAuthority,now=Date.now}={}){
 if(typeof readLaunchpadScope!=='function'||typeof readReceiptAuthority!=='function')throw fail('First-token authorities required');
 const object=name=>db.prepare('SELECT type,sql FROM sqlite_master WHERE name=?').get(name);
 const sentinel=()=>db.prepare('SELECT value FROM settings WHERE key=?').get(SENTINEL);
 const assertReady=()=>{if(sentinel()?.value!=='installed'||object('launchpad_first_tokens')?.type!=='table'||normalize(object('launchpad_first_tokens')?.sql)!==normalize(TABLE))throw fail('First-token store unavailable');for(const[name,sql]of Object.entries(GUARDS))if(object(name)?.type!=='trigger'||normalize(object(name)?.sql)!==normalize(sql))throw fail('First-token store unavailable');};
 if(!object('launchpad_first_tokens')&&!sentinel()){
  db.exec('BEGIN IMMEDIATE');try{db.exec(TABLE);for(const sql of Object.values(GUARDS))db.exec(sql);db.prepare('INSERT INTO settings VALUES(?,?)').run(SENTINEL,'installed');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 }
 assertReady();
 function requireTransaction(){try{db.exec('BEGIN IMMEDIATE');}catch(error){if(/within a transaction/i.test(error.message))return;throw fail('First-token transaction unavailable');}db.exec('ROLLBACK');throw fail('First-token requires an atomic caller transaction');}
 function load(id,owner){const row=db.prepare('SELECT * FROM agents WHERE id=?').get(id);if(!row||row.owner!==owner)throw fail('Owned Agent unavailable');let agent;try{agent=JSON.parse(row.data);}catch{throw fail('Agent data unavailable');}if(!agent||agent.id!==id||agent.creator!==owner||(agent.owner!=null&&agent.owner!==owner)||agent.token!=null)throw fail('Agent binding unavailable');return {row,agent};}
 function valid(binding,row,agent){return binding?.agent_id===agent.id&&binding.owner===row.owner&&binding.version===1&&Number.isSafeInteger(binding.created_at)&&binding.created_at>=0&&row.secret===null&&agent.tokenDraftRevision===1&&JSON.stringify(agent.coin)===binding.token_json;}
 function readTokenBinding(id,owner){try{assertReady();const{row,agent}=load(id,owner),binding=db.prepare('SELECT * FROM launchpad_first_tokens WHERE agent_id=?').get(id);if((binding&&!valid(binding,row,agent))||(!binding&&agent.tokenDraftRevision!=null))throw fail('Token binding unavailable');return {available:true,bound:!!binding,token:binding?JSON.parse(binding.token_json):null,revision:binding?1:0,reason:null};}catch{return {available:false,bound:null,token:null,revision:null,reason:'FIRST_TOKEN_AUTHORITY_UNAVAILABLE'};}}
 function bindFirstToken(id,owner,draft){
  requireTransaction();assertReady();const tokenJSON=canonical(draft),{row,agent}=load(id,owner),scope=readLaunchpadScope(agent);
  if(scope?.available!==true||scope.scoped!==true||scope.reason!==null)throw fail('Authoritative Launchpad scope required');
  const prior=db.prepare('SELECT * FROM launchpad_first_tokens WHERE agent_id=?').get(id);
  if(prior){if(!valid(prior,row,agent)||prior.token_json!==tokenJSON)throw fail('First-token binding conflict');return {agentId:id,token:JSON.parse(tokenJSON),revision:1,replayed:true};}
  if(row.secret!==null||agent.coin!==null||agent.launch!=null||agent.tokenDraftRevision!=null)throw fail('Only a tokenless identity can bind its first token');
  const evidence=readReceiptAuthority(agent);if(evidence?.available!==true||evidence.initialized!==true||evidence.agentId!==id||evidence.owner!==owner||evidence.receipt!==null)throw fail('Authoritative absence of launch receipt required');
  const time=now();if(!Number.isSafeInteger(time)||time<0)throw fail('First-token timestamp unavailable');
  db.prepare('INSERT INTO launchpad_first_tokens VALUES(?,?,?,?,?)').run(id,owner,1,tokenJSON,time);
  const updated={...agent,coin:JSON.parse(tokenJSON),tokenDraftRevision:1,updatedAt:time};
  db.prepare('UPDATE agents SET data=? WHERE id=? AND owner=?').run(JSON.stringify(updated),id,owner);
  return {agentId:id,token:JSON.parse(tokenJSON),revision:1,replayed:false};
 }
 return {readTokenBinding,bindFirstToken};
}
