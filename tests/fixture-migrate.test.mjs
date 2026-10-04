import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {openStore} from '../server/store.js';
import {fixtureOwner,fixtureOtherOwner,provenance} from '../tools/local-owner-preview/fixture-contract.mjs';
import {migrateDisposableFixture} from '../tools/local-owner-preview/fixture-migrate.mjs';
const ports={backend:4290,frontend:5198};
function fixture(){
 const dir=fs.mkdtempSync(path.join(tmpdir(),'tekkteam-owner-fixture-')),store=openStore(dir+'/fixture.sqlite');
 store.db.exec('CREATE TABLE agent_wallets(id TEXT);CREATE TABLE dex_receipts(id TEXT);CREATE TABLE real_reservation_mutex(id INTEGER,revision INTEGER);INSERT INTO real_reservation_mutex VALUES(1,0)');
 store.db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run('fixture',fixtureOwner,JSON.stringify({id:'fixture',creator:fixtureOwner,name:'LOCAL_FIXTURE migration',status:'DRAFT',coin:null,launch:null}));
 const cookies=['owner','other','expired'].map((label,i)=>({label,value:'fixture-session-'+i}));
 for(const c of cookies)store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(c.value).digest('hex'),c.label==='other'?fixtureOtherOwner:fixtureOwner,Date.now()+1000);
 store.close();
 fs.writeFileSync(dir+'/browser-session.json',JSON.stringify({origin:'http://127.0.0.1:5198',cookies,...provenance}));
 fs.writeFileSync(dir+'/pump-agent-launches.json',JSON.stringify({version:2,receipts:{}}));
 fs.writeFileSync(dir+'/events.jsonl',JSON.stringify({event:'READY',ports})+'\n');return dir;
}
test('migration preserves rows/sessions and original bytes with fresh local vault, no custody',()=>{
 const dir=fixture(),original=fs.readFileSync(dir+'/fixture.sqlite'),oldKey=fs.readFileSync(dir+'/vault.key');
 const result=migrateDisposableFixture(dir,ports);assert.equal(result.sourceRetained,true);assert.equal(result.custodyMigrated,false);
 assert.deepEqual(fs.readFileSync(dir+'/fixture.sqlite'),original);assert.deepEqual(fs.readFileSync(dir+'/vault.key'),oldKey);
 assert.notDeepEqual(fs.readFileSync(result.destination+'/vault.key'),oldKey);
 const after=openStore(result.destination+'/fixture.sqlite');assert.equal(after.db.prepare('SELECT count(*) n FROM agents').get().n,1);assert.equal(after.db.prepare('SELECT count(*) n FROM sessions').get().n,3);after.close();
 assert.deepEqual(fs.readFileSync(result.destination+'/browser-session.json'),fs.readFileSync(dir+'/browser-session.json'));
});
for(const kind of ['custody','receipt','foreign-agent','session','unknown-table','provenance','real-activity'])test('migration rejects '+kind,()=>{
 const dir=fixture(),store=openStore(dir+'/fixture.sqlite');
 if(kind==='custody')store.db.exec("INSERT INTO agent_wallets VALUES('opaque')");
 if(kind==='receipt')store.db.exec("INSERT INTO dex_receipts VALUES('opaque')");
 if(kind==='foreign-agent')store.db.prepare('UPDATE agents SET owner=?').run(fixtureOtherOwner);
 if(kind==='session')store.db.prepare('UPDATE sessions SET address=?').run('foreign');
 if(kind==='unknown-table')store.db.exec('CREATE TABLE private_data(value TEXT);INSERT INTO private_data VALUES(1)');
 if(kind==='real-activity')store.db.exec('UPDATE real_reservation_mutex SET revision=1');store.close();
 if(kind==='provenance'){const p=JSON.parse(fs.readFileSync(dir+'/browser-session.json'));p.realWalletAuthenticated=true;fs.writeFileSync(dir+'/browser-session.json',JSON.stringify(p));}
 assert.throws(()=>migrateDisposableFixture(dir,ports),/FIXTURE_MIGRATION_/);
});
test('migration rejects a metadata parent junction outside the fixture',()=>{
 const dir=fixture(),external=fs.mkdtempSync(path.join(tmpdir(),'tekkteam-assets-'));fs.mkdirSync(external+'/public');
 fs.symlinkSync(external,dir+'/pump-metadata-site',process.platform==='win32'?'junction':'dir');
 assert.throws(()=>migrateDisposableFixture(dir,ports),/FIXTURE_MIGRATION_ASSET_DENIED/);
});
