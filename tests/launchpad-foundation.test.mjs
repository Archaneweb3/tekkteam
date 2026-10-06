import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {createServer} from '../server/app.js';
import {ensureIdentitySchema} from '../server/identity-schema.js';
import {strategyRegistry} from '../server/strategy-registry.js';
import {strategies} from '../server/config.js';
import {defaultStrategyConfig} from '../public/app/strategy-config.js';
import {operatingPlan,lifecycleProjection,publicLaunchProjection,ownerAgentContract} from '../server/launchpad-contracts.js';

const agent={id:'test-agent',creator:'owner',name:'Agent',character:'frank',strategy:'balanced',coin:null,launch:null};
test('operator-inventoried production V2 schema needs no rebuild or relationship/history rewrite',()=>{
 const db=new DatabaseSync(':memory:');try{
  // Verbatim operator-reported core DDL; Paper rows below are synthetic FK
  // fixtures, not a claim about unprovided production Paper column layouts.
  db.exec('PRAGMA foreign_keys=ON; PRAGMA user_version=2; CREATE TABLE agents(no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,secret TEXT NULL); CREATE TABLE requests(owner TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,agent_id TEXT NOT NULL,PRIMARY KEY(owner,key)); CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY REFERENCES agents(id),address TEXT NOT NULL,secret TEXT NOT NULL);');
  db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run('existing','fixture-owner','{}');
  db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('existing','fixture-public-address','synthetic-fixture-opaque-value');
  for(const name of ['paper_states','paper_history','paper_decisions','paper_portfolio_history']){db.exec(`CREATE TABLE ${name}(agent_id TEXT REFERENCES agents(id), snapshot TEXT);`);db.prepare(`INSERT INTO ${name} VALUES(?,?)`).run('existing','original-paper-snapshot');}
  const before=JSON.stringify(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()),changes=db.prepare('SELECT total_changes() AS n').get().n;
  ensureIdentitySchema(db);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);assert.equal(JSON.stringify(db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all()),before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);assert.equal(db.prepare('PRAGMA table_info(agents)').all().find(c=>c.name==='secret').notnull,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  for(const name of ['paper_states','paper_history','paper_decisions','paper_portfolio_history'])assert.equal(db.prepare(`SELECT snapshot FROM ${name}`).get().snapshot,'original-paper-snapshot');
  assert.deepEqual({...db.prepare('SELECT agent_id,address FROM agent_wallets').get()},{agent_id:'existing',address:'fixture-public-address'});
  db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run('one','same-key','fingerprint','existing');db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run('two','same-key','fingerprint','existing');
  assert.equal(db.prepare('SELECT count(*) AS n FROM requests').get().n,2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%revision%' OR name LIKE '%publication%'").get().n,0);
 }finally{db.close();}
});
test('registry truthful presets, fixed exposure and planned exclusion',()=>{
 const registry=strategyRegistry(),a=registry.archetypes[0];
 assert.deepEqual(a.presets.map(p=>[p.runtimePresetId,p.displayName]),[['selective','Strict'],['balanced','Standard'],['momentum','Broad'],['guardian','Guardian'],['scout','Scout'],['operator','Operator'],['hunter','Hunter'],['berserker','Berserker']]);
 for(const p of a.presets){assert.equal(p.effectiveLimits.maxPositionPercent,10);assert.equal(p.parameters.risk.maxPositionPercent,10);}
 assert.ok(strategies.every(p=>p.maxPositionPct===10));
 assert.ok(registry.archetypes.slice(1).every(p=>p.implementationStatus==='PLANNED'&&!p.selectable&&!p.supportedModes.length));
 registry.archetypes[0].presets[0].parameters.risk.maxPositionPercent=1;
 assert.equal(strategyRegistry().archetypes[0].presets[0].parameters.risk.maxPositionPercent,10);
});
test('operating plan derives saved configuration without mutation or permission',()=>{
 const config=defaultStrategyConfig('selective');config.risk.maxPositionPercent=2;config.risk.maxSolPerTrade=.0002;
 const paper={strategy:'selective',strategyConfig:config,strategyConfigVersion:7,initialSol:.1,enabled:true};const before=JSON.stringify(paper);
 const p=operatingPlan(agent,paper);assert.equal(p.presetDisplayName,'Strict');assert.equal(p.effectiveExposure.configuredPercent,2);assert.equal(p.capitalLimit.maxSolPerTrade,.0002);assert.equal(p.capitalLimit.startingCapitalSol,.1);assert.equal(p.configurationRevision,7);assert.equal(p.authorizationGranted,false);assert.equal(JSON.stringify(paper),before);
 assert.equal(operatingPlan({...agent,strategy:'fake'}).available,false);
});
test('canonical lifecycle maps bound receipts and never promotes unknown or Devnet',()=>{
 assert.equal(lifecycleProjection(agent).token.state,'NOT_CONFIGURED');assert.equal(lifecycleProjection(agent).launch.state,'NOT_CONFIGURED');
 const a={...agent,coin:{name:'Token',ticker:'TOK'}},base={agentId:a.id,owner:a.creator,network:'solana:101',id:'receipt'};
 assert.equal(lifecycleProjection(a).token.state,'CONFIGURED');
 for(const [status,state]of [['Prepared','PREPARED'],['Awaiting approval','AWAITING_OWNER_APPROVAL'],['Confirming','RECONCILIATION_REQUIRED'],['Failed','FAILED']]){
  const receipt={...base,status,...(status==='Confirming'?{signature:'sig',broadcastAttempted:true}:{})};assert.equal(lifecycleProjection(a,{receipt}).launch.state,state);
 }
 assert.equal(lifecycleProjection(a,{receipt:{...base,status:'Success',confirmed:true,mint:'mint',signature:'sig'}}).launch.state,'CONFIRMED');
 assert.equal(lifecycleProjection(a,{receipt:{...base,status:'Prepared',signature:'sig'}}).launch.state,'RECONCILIATION_REQUIRED');
 assert.equal(lifecycleProjection(a,{receipt:{...base,status:'Success',confirmed:true,mint:'mint',signature:'sig',network:'solana:devnet'}}).launch.state,'UNAVAILABLE');
 assert.equal(lifecycleProjection(a,{receipt:{...base,status:'Failed',signature:'sig'}}).launch.state,'RECONCILIATION_REQUIRED');
 assert.equal(lifecycleProjection(a,{receipt:{...base,status:'Failed',signature:'sig',resolution:'ONCHAIN_FAILURE'}}).launch.state,'FAILED');
});
test('public opt-in + allowlist and owner safe projection exclude private material',()=>{
 const a={...agent,secret:'SECRET',vault:'SECRET',coin:{name:'Token',ticker:'TOK',privateKey:'SECRET'},launch:{message:'SECRET'}};
 const receipt={agentId:a.id,owner:a.creator,network:'solana:101',status:'Success',confirmed:true,mint:'mint',signature:'sig',message:'SECRET',diagnostics:'SECRET'};
 assert.equal(publicLaunchProjection(a,{receipt}),null);
 assert.equal(publicLaunchProjection(a,{receipt,publication:{enabled:true,agentId:a.id,owner:'wrong'}}),null);
 const p=publicLaunchProjection(a,{receipt,publication:{enabled:true,agentId:a.id,owner:a.creator}});
 assert.deepEqual(Object.keys(p),['agent','token','launch']);assert.ok(!JSON.stringify(p).includes('SECRET'));
 assert.ok(!JSON.stringify(ownerAgentContract(a,{receipt,wallet:{address:'wallet',secret:'SECRET'}})).includes('SECRET'));
});
test('legacy nullable upgrade preserves data/FK/index/sequence; V2 repeat no-op',()=>{
 const db=new DatabaseSync(':memory:');
 try{db.exec("PRAGMA foreign_keys=ON;CREATE TABLE agents(no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,secret TEXT NOT NULL);CREATE INDEX owner_index ON agents(owner);CREATE TABLE child(agent_id TEXT REFERENCES agents(id));INSERT INTO agents VALUES(1,'a','o','{}','ciphertext');INSERT INTO child VALUES('a');UPDATE sqlite_sequence SET seq=99 WHERE name='agents';");
 ensureIdentitySchema(db);ensureIdentitySchema(db);
 assert.equal(db.prepare('SELECT secret FROM agents').get().secret,'ciphertext');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 const r=db.prepare("INSERT INTO agents(id,owner,data,secret) VALUES('b','o','{}',NULL)").run();assert.equal(Number(r.lastInsertRowid),100);assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='owner_index'").get());
 }finally{db.close();}
});
test('Mainnet identity-only write isolated from issuance, custody, Paper and execution',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-phase-a-')),owner=Keypair.generate().publicKey.toBase58(),other=Keypair.generate().publicKey.toBase58(),token='fixture-session';
 const s=createServer({dbPath:join(dir,'test.sqlite'),network:'mainnet',mainnetSafetyMode:true,rpc:'https://api.mainnet-beta.solana.com'});
 s.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),owner,Date.now()+100000);
 s.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update('other').digest('hex'),other,Date.now()+100000);
 const http=s.app.listen(0,'127.0.0.1');await new Promise(r=>http.once('listening',r));
 const call=async(path,body,cookie=token,key='identity-key-0001')=>{const response=await fetch(`http://127.0.0.1:${http.address().port}/api${path}`,{method:body?'POST':'GET',headers:{Origin:'http://127.0.0.1:5188','Content-Type':'application/json',Cookie:`tw_session=${cookie}`,'Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 try{
  const input={name:'Identity Only',character:'frank',strategy:'balanced'};
  assert.equal((await call('/agent-identities',input,'missing')).status,401);
  assert.equal((await call('/agent-identities',{...input,coin:{}})).status,400);
  const r=await call('/agent-identities',input);assert.equal(r.status,201);assert.equal(r.data.coin,null);assert.equal(r.data.launch,null);
  assert.equal((await call('/agent-identities',input)).data.id,r.data.id);
  const second=await call('/agent-identities',input,'other');assert.equal(second.status,201);assert.notEqual(second.data.id,r.data.id);assert.equal(second.data.creator,other);
  const replay=()=>call('/agent-identities',input);
  s.store.db.prepare('UPDATE requests SET agent_id=? WHERE owner=? AND key=?').run(second.data.id,owner,'identity-key-0001');
  const crossOwner=await replay();assert.equal(crossOwner.status,409);assert.ok(!JSON.stringify(crossOwner.data).includes(other));assert.ok(!JSON.stringify(crossOwner.data).includes(second.data.id));
  s.store.db.prepare('UPDATE requests SET agent_id=? WHERE owner=? AND key=?').run('missing-agent',owner,'identity-key-0001');assert.equal((await replay()).status,409);
  s.store.db.prepare('UPDATE requests SET agent_id=? WHERE owner=? AND key=?').run(r.data.id,owner,'identity-key-0001');
  const original=s.store.db.prepare('SELECT data FROM agents WHERE id=?').get(r.data.id).data;
  for(const data of [JSON.stringify({...r.data,creator:other}),JSON.stringify({...r.data,id:second.data.id}),'invalid json']){s.store.db.prepare('UPDATE agents SET data=? WHERE id=?').run(data,r.data.id);assert.equal((await replay()).status,409);}
  s.store.db.prepare('UPDATE agents SET data=? WHERE id=?').run(original,r.data.id);assert.equal((await replay()).data.id,r.data.id);
  assert.equal((await call('/agent-identities',{...input,name:'Changed'})).status,409);
  assert.equal(s.store.db.prepare('SELECT secret FROM agents WHERE id=?').get(r.data.id).secret,null);
  for(const table of ['agent_wallets','paper_states','submissions','dex_executions'])assert.equal(s.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,0);
  const contract=await call(`/agents/${r.data.id}/contract`);assert.equal(contract.data.coin,null);assert.equal(contract.data.lifecycle.launch.state,'NOT_CONFIGURED');
  assert.equal((await call(`/agents/${r.data.id}/contract`,null,'other')).status,404);
  assert.equal((await call(`/agents/${r.data.id}/operating-plan`)).data.authorizationGranted,false);
  assert.equal((await call('/agents',input)).status,403);
  assert.equal((await call(`/agents/${r.data.id}/prepare`,{})).status,403);
  assert.equal((await call('/state')).data.agents.length,1);
 }finally{await new Promise(r=>http.close(r));s.close();rmSync(dir,{recursive:true,force:true});}
});
test('empty legacy table retains historical autoincrement after nullable upgrade',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE agents(no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,secret TEXT NOT NULL);INSERT INTO agents VALUES(41,'deleted','o','{}','cipher');DELETE FROM agents;");ensureIdentitySchema(db);
  assert.equal(Number(db.prepare("INSERT INTO agents(id,owner,data,secret) VALUES('new','o','{}',NULL)").run().lastInsertRowid),42);
 }finally{db.close();}
});
