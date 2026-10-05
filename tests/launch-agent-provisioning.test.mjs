import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Keypair} from '@solana/web3.js';
import {openStore} from '../server/store.js';
import {provisionLaunchAgent} from '../server/launch-agent-provisioning.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
import {createM4Execution} from '../server/pump-m4.js';

// Disposable LOCAL_FIXTURE evidence, never a real receipt or wallet.
test('confirmed binding creates one encrypted wallet, survives restart and rejects reassociation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'launch-provision-')),path=join(dir,'db.sqlite');let store=openStore(path);
 try{
  store.db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL)');
  const owner=Keypair.generate().publicKey.toBase58(),agent={id:'agent',creator:owner,coin:null};
  store.db.prepare('INSERT INTO agents(id,owner,data) VALUES(?,?,?)').run(agent.id,owner,JSON.stringify(agent));
  const receipt={confirmed:true,status:'Success',network:'solana:101',owner,agentId:agent.id,mint:Keypair.generate().publicKey.toBase58(),signature:'fixture',executionId:'execution',confirmedSlot:1,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
  assert.throws(()=>provisionLaunchAgent(store,{...receipt,confirmed:false}));
  const first=provisionLaunchAgent(store,receipt);assert.equal(first.status,'READY');
  const saved=store.db.prepare('SELECT * FROM agent_wallets').get(),secret=store.unseal(saved.secret,'trading:agent');
  assert.equal(Keypair.fromSecretKey(secret).publicKey.toBase58(),first.wallet);assert.notEqual(saved.secret,Buffer.from(secret).toString('base64'));secret.fill(0);
  store.close();store=openStore(path);assert.deepEqual(provisionLaunchAgent(store,receipt),first);
  assert.throws(()=>provisionLaunchAgent(store,{...receipt,mint:Keypair.generate().publicKey.toBase58()}));
  const other={...agent,id:'other'};store.db.prepare('INSERT INTO agents(id,owner,data) VALUES(?,?,?)').run(other.id,owner,JSON.stringify(other));
  assert.throws(()=>provisionLaunchAgent(store,{...receipt,agentId:other.id,executionId:'other-execution'}));
  assert.equal(store.db.prepare('SELECT count(*) n FROM launch_agent_bindings').get().n,1);
  assert.equal(store.db.prepare('SELECT count(*) n FROM agent_wallets').get().n,1);
  assert.equal(JSON.parse(store.db.prepare('SELECT data FROM agents').get().data).coin,null);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('provisioning retries after confirmation without another confirmation or broadcast',async()=>{
 let confirmations=0,provisions=0;
 const f=m4Fixture({dependencies:{confirm:async()=>{confirmations++;return {status:'LAUNCHED',confirmedSlot:200,confirmedAt:Date.now(),blockTime:1,observedSpendLamports:5557360,networkFeeLamports:10000,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};},provisionAgent:receipt=>{assert.equal(receipt.confirmed,true);if(++provisions===1)throw Error('storage temporarily unavailable');return {status:'READY',agentId:receipt.agentId,wallet:'fixture'};}}});
 try{
  const prepared=await f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()}),request=f.request(prepared);
  assert.equal(provisions,0);await f.controller.run('review',f.identity,request);await f.controller.run('submit',f.identity,{...request,signedTransactionBase64:f.signed()});
  const confirmed=await f.controller.run('status',f.identity);assert.equal(confirmed.status,'LAUNCHED');assert.equal(confirmed.provisioning.status,'RECONCILIATION_REQUIRED');
  const resumed=createM4Execution(f.deps);assert.equal((await resumed.run('status',f.identity)).provisioning.status,'READY');await resumed.run('status',f.identity);
  assert.equal(confirmations,1);assert.equal(provisions,2);assert.equal(f.sends(),1);
 }finally{f.db.close();}
});
