import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assertAssociatedCoinRealTarget,createAssociatedCoinRealGuard} from '../server/associated-coin-real-policy.js';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';
import {SOL_MINT} from '../server/dex/intent.js';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',other='11111111111111111111111111111111';
const agent={id:'LOCAL_FIXTURE',creator:other},scope={available:true,scoped:true,reason:null};
const receipt={agentId:agent.id,owner:agent.creator,network:'solana:101',status:'Success',confirmed:true,signature:'LOCAL_FIXTURE_NOT_A_CHAIN_SIGNATURE',mint};
const authority={available:true,initialized:true,agentId:agent.id,owner:agent.creator,receipt};
const intent={agentId:agent.id,owner:agent.creator,direction:'BUY',inputMint:SOL_MINT,outputMint:mint};
const check=(changes={})=>assertAssociatedCoinRealTarget({agent,scope,receiptAuthority:authority,intent,...changes});
test('confirmed associated BUY and SELL are target eligibility only',()=>{
 for(const value of [intent,{...intent,direction:'SELL',inputMint:mint,outputMint:SOL_MINT}])assert.deepEqual(check({intent:value}),{kind:'ASSOCIATED_COIN',mint,available:true,reason:null});
});
for(const value of [{...intent,outputMint:other},{...intent,inputMint:other},{...intent,direction:'SELL',inputMint:other,outputMint:SOL_MINT},{...intent,direction:'HOLD'}])test('associated rejects altered pair '+JSON.stringify(value),()=>assert.throws(()=>check({intent:value}),/REAL_ASSOCIATED_MINT_MISMATCH/));
for(const changes of [{agentId:'other'},{owner:'other'}])test('intent binding '+JSON.stringify(changes),()=>assert.throws(()=>check({intent:{...intent,...changes}}),/REAL_TARGET_BINDING_MISMATCH/));
for(const value of [null,{}, {available:false,scoped:false,reason:'UNKNOWN'}, {...scope,reason:'UNKNOWN'}, {...scope,scoped:null}])test('scope unavailable '+JSON.stringify(value),()=>assert.throws(()=>check({scope:value}),/REAL_TARGET_AUTHORITY_UNAVAILABLE/));
for(const changes of [{available:false},{initialized:false},{agentId:'other'},{owner:'other'},{receipt:null}])test('receipt authority '+JSON.stringify(changes),()=>assert.throws(()=>check({receiptAuthority:{...authority,...changes}}),/REAL_TARGET_RECEIPT_UNAVAILABLE/));
for(const changes of [{agentId:'other'},{owner:'other'},{network:'solana:103'},{status:'Unknown'},{status:'Prepared'},{confirmed:false},{signature:null},{mint:'not-a-mint'}])test('receipt evidence '+JSON.stringify(changes),()=>assert.throws(()=>check({receiptAuthority:{...authority,receipt:{...receipt,...changes}}}),/REAL_TARGET_RECEIPT_UNAVAILABLE/));
test('initialized General remains General without a coin or receipt',()=>assert.deepEqual(check({scope:{available:true,scoped:false,reason:null},receiptAuthority:null,intent:{...intent,outputMint:other}}),{kind:'GENERAL',mint:null,available:true,reason:null}));
test('mutable coin and client General cannot erase immutable scope',()=>assert.throws(()=>check({agent:{...agent,coin:{mint:other},targetPolicy:'GENERAL'},intent:{...intent,outputMint:other,targetPolicy:'GENERAL'}}),/REAL_ASSOCIATED_MINT_MISMATCH/));
test('guard uses current immutable SQLite scope and rejects missing guards',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE agents(id TEXT PRIMARY KEY,owner TEXT,data TEXT);');
  db.prepare('INSERT INTO agents VALUES(?,?,?)').run(agent.id,agent.creator,JSON.stringify(agent));
  const ledger=installLaunchpadScopeLedger(db,{now:()=>1});
  const guard=createAssociatedCoinRealGuard({readAgent:()=>agent,readLaunchpadScope:ledger.readLaunchpadScope,readReceiptAuthority:()=>authority});
  assert.equal(guard({...intent,outputMint:other}).kind,'GENERAL');
  db.exec('BEGIN');ledger.insertLaunchpadScope(agent,{source:'LAUNCHPAD_IDENTITY'});db.exec('COMMIT');
  assert.throws(()=>guard({...intent,outputMint:other,targetPolicy:'GENERAL'}),/REAL_ASSOCIATED_MINT_MISMATCH/);
  assert.equal(guard(intent).mint,mint);
  const trigger=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'launchpad_scope_%' LIMIT 1").get();
  db.exec(`DROP TRIGGER ${trigger.name}`);
  assert.throws(()=>guard(intent),/REAL_TARGET_AUTHORITY_UNAVAILABLE/);
 }finally{db.close();}
});
test('missing and throwing read dependencies fail closed',()=>{
 for(const deps of [{},{readAgent:()=>{throw Error();},readLaunchpadScope:()=>scope}])assert.throws(()=>createAssociatedCoinRealGuard(deps)(intent),/REAL_TARGET_AUTHORITY_UNAVAILABLE/);
});
