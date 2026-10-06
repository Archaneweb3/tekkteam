import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {importCanonicalAgent} from '../tools/import-canonical-agent.mjs';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';
import {installFirstTokenStore} from '../server/launchpad-token-store.js';
function fixture(t){
 const source=new DatabaseSync(':memory:'),destination=new DatabaseSync(':memory:');t.after(()=>{source.close();destination.close();});
 for(const db of [source,destination])db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);INSERT INTO settings VALUES('network_binding','mainnet');CREATE TABLE agents(no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE,owner TEXT,data TEXT,secret TEXT);CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT);CREATE TABLE requests(owner TEXT,key TEXT,fingerprint TEXT,agent_id TEXT,PRIMARY KEY(owner,key));CREATE TABLE sessions(hash TEXT,address TEXT,expires INTEGER)");
 source.exec("CREATE TABLE m4_execution(id INTEGER PRIMARY KEY,payload TEXT);CREATE TABLE m4_execution_history(execution_id TEXT PRIMARY KEY,payload TEXT)");
 const agent={id:'target',creator:'owner',name:'ret',coin:null};source.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run(agent.id,agent.creator,JSON.stringify(agent));
 const scope=installLaunchpadScopeLedger(source),tokens=installFirstTokenStore(source,{readLaunchpadScope:scope.readLaunchpadScope,readReceiptAuthority:a=>({available:true,initialized:true,agentId:a.id,owner:a.creator,receipt:null})});
 source.exec('BEGIN');scope.insertLaunchpadScope(agent,{source:'LAUNCHPAD_IDENTITY'});tokens.bindFirstToken('target','owner',Object.freeze({name:'ret',ticker:'3ED',image:'https://staging.tekkteam.tech/unchanged.png'}));source.exec('COMMIT');
 const state={executionId:'expired',target:{agentId:'target',owner:'owner'},status:'TRANSACTION_EXPIRED',broadcastAttempted:false};source.prepare('INSERT INTO m4_execution VALUES(1,?)').run(JSON.stringify(state));
 source.prepare('INSERT INTO m4_execution_history VALUES(?,?)').run('signed-history',JSON.stringify({...state,executionId:'signed-history',status:'SIGNED_NOT_BROADCAST',signature:'preserved'}));
 source.prepare('INSERT INTO requests VALUES(?,?,?,?)').run('owner','original-key','original-fingerprint','target');source.exec("INSERT INTO sessions VALUES('source-session','owner',999999)");
 destination.exec("INSERT INTO agents(id,owner,data,secret) VALUES('legacy','legacy-owner','{\"id\":\"legacy\"}',NULL);INSERT INTO agent_wallets VALUES('legacy','legacy-address','original-encrypted-secret');INSERT INTO settings VALUES('vault_check','original-encrypted-check')");
 return {source,destination,agentId:'target',owner:'owner',legacyJournal:{version:2,receipts:{legacy:{agentId:'legacy',owner:'11111111111111111111111111111111',network:'solana:101',status:'Unknown',signature:'preserved-unknown'}}},stagingJournal:{version:2,receipts:{}}};
}
test('canonical import preserves original rows, encrypted wallet, draft and history; repeat creates no duplicate',t=>{
 const f=fixture(t),r=importCanonicalAgent(f);assert.equal(r.replayed,false);assert.equal(r.image,'https://staging.tekkteam.tech/unchanged.png');
 assert.equal(f.destination.prepare('SELECT count(*) n FROM agents').get().n,2);assert.equal(f.destination.prepare('SELECT secret FROM agent_wallets').get().secret,'original-encrypted-secret');assert.equal(f.destination.prepare("SELECT value FROM settings WHERE key='vault_check'").get().value,'original-encrypted-check');
 assert.equal(f.destination.prepare('SELECT count(*) n FROM sessions').get().n,0);
 assert.equal(f.destination.prepare('SELECT fingerprint FROM requests').get().fingerprint,'original-fingerprint');
 assert.equal(importCanonicalAgent(f).replayed,true);assert.equal(f.destination.prepare('SELECT count(*) n FROM agent_wallets').get().n,1);
 assert.equal(f.destination.prepare('SELECT payload FROM m4_execution_history').get().payload,f.source.prepare('SELECT payload FROM m4_execution_history').get().payload);
 assert.throws(()=>f.destination.exec('DELETE FROM m4_execution_history'),/Immutable/);assert.throws(()=>f.destination.exec('UPDATE launchpad_first_tokens SET created_at=0'),/immutable/);
});
test('collision, wrong owner, existing target wallet, broadcast and nonempty source journal fail closed',t=>{
 for(const change of [f=>f.owner='wrong',f=>f.source.exec("INSERT INTO agent_wallets VALUES('target','x','x')"),f=>f.source.exec("UPDATE m4_execution SET payload=json_set(payload,'$.broadcastAttempted',json('true'))"),f=>f.stagingJournal.receipts.target={},f=>f.destination.exec("INSERT INTO agents(id,owner,data,secret) VALUES('target','owner','{}',NULL)")]){
  const f=fixture(t);change(f);assert.throws(()=>importCanonicalAgent(f),/CANONICAL_IMPORT_|RECEIPT_JOURNAL_INVALID/);assert.equal(f.destination.prepare('SELECT secret FROM agent_wallets').get().secret,'original-encrypted-secret');
 }
});
test('replay rejects lost idempotency records instead of trusting the manifest',t=>{const f=fixture(t);importCanonicalAgent(f);f.destination.exec("DELETE FROM requests WHERE agent_id='target'");assert.throws(()=>importCanonicalAgent(f),/REPLAY_DIVERGED/);});
