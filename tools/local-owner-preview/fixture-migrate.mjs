import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../../server/store.js';
import {fixtureOwner,fixtureOtherOwner} from './fixture-contract.mjs';
import {validateFixtureResume} from './fixture-resume.mjs';

const fail=code=>{throw Error(code);};
const preserved=new Set(['agents','events','requests','sessions','launchpad_agent_scopes','launchpad_first_tokens']);
const owners=new Set([fixtureOwner,fixtureOtherOwner]);
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Only the closed, seeded LOCAL_FIXTURE contract can migrate. No vault recovery.
export function migrateDisposableFixture(directory,ports){
 const dir=path.resolve(directory);
 if(fs.realpathSync(path.dirname(dir))!==fs.realpathSync(tmpdir())||!/^tekkteam-owner-fixture-[a-zA-Z0-9]+$/.test(path.basename(dir))||fs.lstatSync(dir).isSymbolicLink())fail('FIXTURE_MIGRATION_PATH_DENIED');
 const regular=file=>{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('FIXTURE_MIGRATION_FILE_DENIED');};
 for(const name of ['fixture.sqlite','browser-session.json','pump-agent-launches.json','events.jsonl'])regular(path.join(dir,name));
 const sessionBytes=fs.readFileSync(path.join(dir,'browser-session.json'));
 const descriptor=JSON.parse(sessionBytes);
 if(descriptor.origin!==`http://127.0.0.1:${ports.frontend}`||descriptor.dataSource!=='LOCAL_FIXTURE'||descriptor.realWalletAuthenticated!==false||descriptor.backgroundJobs!==false||descriptor.authSource!=='TEST_SESSION_SEEDED'||descriptor.cookies?.length!==3)fail('FIXTURE_MIGRATION_PROVENANCE_DENIED');
 const ready=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(e=>e.event==='READY');
 if(ready.length!==1||ready[0].ports.backend!==ports.backend||ready[0].ports.frontend!==ports.frontend)fail('FIXTURE_MIGRATION_BOOTSTRAP_DENIED');
 const journalBytes=fs.readFileSync(path.join(dir,'pump-agent-launches.json'));
 const journal=JSON.parse(journalBytes);
 if(journal.version!==2||!journal.receipts||Object.keys(journal.receipts).length!==0)fail('FIXTURE_MIGRATION_RECEIPT_DENIED');
 const source=new DatabaseSync(path.join(dir,'fixture.sqlite'),{readOnly:true});
 let dest,store;
 try{
  source.exec('BEGIN');
  const schema=source.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC").all();
  const tables=schema.filter(s=>s.type==='table');
  const rows=Object.fromEntries(tables.map(s=>[s.name,source.prepare('SELECT * FROM '+quote(s.name)).all()]));
  for(const [name,list]of Object.entries(rows))if(!preserved.has(name)&&name!=='settings'&&name!=='real_reservation_mutex'&&list.length)fail('FIXTURE_MIGRATION_NON_DISPOSABLE_'+name);
  if(rows.real_reservation_mutex?.some(r=>r.revision!==0))fail('FIXTURE_MIGRATION_REAL_ACTIVITY_DENIED');
  if(rows.settings.some(r=>!['vault_check','network_binding','launchpad_scope_ledger_v1','launchpad_first_token_store_v1'].includes(r.key)))fail('FIXTURE_MIGRATION_SETTINGS_DENIED');
  for(const r of rows.agents){const a=JSON.parse(r.data);if(r.secret!==null||r.owner!==fixtureOwner||a.creator!==r.owner||a.id!==r.id||!a.name?.startsWith('LOCAL_FIXTURE ')||a.status!=='DRAFT'||a.launch!==null||a.coin?.mint!=null||a.coin&&!a.coin.name?.startsWith('LOCAL_FIXTURE '))fail('FIXTURE_MIGRATION_AGENT_DENIED');}
  const ids=new Set(rows.agents.map(r=>r.id));
  for(const name of ['events','requests','launchpad_agent_scopes','launchpad_first_tokens'])for(const r of rows[name]??[])if(r.owner!==fixtureOwner||!ids.has(r.agent_id))fail('FIXTURE_MIGRATION_RELATION_DENIED');
  for(const r of rows.sessions)if(!owners.has(r.address)||!descriptor.cookies.some(c=>hash(c.value)===r.hash))fail('FIXTURE_MIGRATION_SESSION_DENIED');
  if(rows.sessions.length!==3)fail('FIXTURE_MIGRATION_SESSION_DENIED');
  const assets=[];
 const assetRoot=path.join(dir,'pump-metadata-site','public');
  if(fs.existsSync(assetRoot)){
   for(const folder of [path.join(dir,'pump-metadata-site'),assetRoot])if(fs.lstatSync(folder).isSymbolicLink()||!fs.lstatSync(folder).isDirectory())fail('FIXTURE_MIGRATION_ASSET_DENIED');
   const relativeRoot=path.relative(fs.realpathSync(dir),fs.realpathSync(assetRoot));if(relativeRoot.startsWith('..')||path.isAbsolute(relativeRoot))fail('FIXTURE_MIGRATION_ASSET_DENIED');
   const walk=folder=>{if(fs.lstatSync(folder).isSymbolicLink())fail('FIXTURE_MIGRATION_ASSET_DENIED');for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else{regular(file);const relative=path.relative(assetRoot,file).replaceAll('\\','/');if(!/^metadata\/agents\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.png$/.test(relative)||!ids.has(relative.split('/')[2]))fail('FIXTURE_MIGRATION_ASSET_DENIED');const bytes=fs.readFileSync(file);if(hash(bytes)!==path.basename(file,'.png'))fail('FIXTURE_MIGRATION_ASSET_HASH_DENIED');assets.push({relative,bytes});}}};walk(assetRoot);
  }
  dest=fs.mkdtempSync(path.join(tmpdir(),'tekkteam-owner-fixture-'));
  store=openStore(path.join(dest,'fixture.sqlite'));
  store.db.exec('BEGIN IMMEDIATE');
  for(const s of tables)if(!store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(s.name))store.db.exec(s.sql);
  for(const [name,list]of Object.entries(rows))for(const row of list){if(name==='settings'&&row.key==='vault_check')continue;const keys=Object.keys(row),stmt=store.db.prepare('INSERT INTO '+quote(name)+'('+keys.map(quote).join(',')+') VALUES('+keys.map(()=>'?').join(',')+')');stmt.run(...keys.map(k=>row[k]));}
  for(const s of schema.filter(s=>s.type!=='table'))if(!store.db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(s.name))store.db.exec(s.sql);
  store.db.exec('COMMIT');store.close();store=null;
  fs.writeFileSync(path.join(dest,'browser-session.json'),sessionBytes,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(dest,'pump-agent-launches.json'),journalBytes,{flag:'wx'});
  for(const a of assets){const file=path.join(dest,'pump-metadata-site','public',a.relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,a.bytes,{flag:'wx'});}
  validateFixtureResume(dest,ports);
  return {source:dir,destination:dest,sourceRetained:true,custodyMigrated:false,fundsPresent:false,rows:Object.fromEntries(Object.entries(rows).map(([name,list])=>[name,list.length])),assets:assets.length};
 }finally{store?.close();source.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=migrateDisposableFixture(process.argv[2],{backend:Number(process.argv[3]),frontend:Number(process.argv[4])});
 fs.writeFileSync('artifacts/launchpad-continuation/direct-delivery/fixture-migration.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:'MIGRATED',destination:report.destination,sourceRetained:true,custodyMigrated:false}));
}
