import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Keypair} from '@solana/web3.js';
import {observerState} from '../server/agent-observer-state.js';
import {createAgentObserver} from '../server/agent-observer-worker.js';

test('durable leader and Agent fencing reject stale takeover/expiry commits on two connections',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-observer-')),path=join(dir,'state.sqlite'),a=new DatabaseSync(path),b=new DatabaseSync(path);let now=1000;
 try{const one=observerState(a,{now:()=>now,runId:'one',ttl:1000}),two=observerState(b,{now:()=>now,runId:'two',ttl:1000});
 const leader=one.leader(),lock=one.agent(leader,'a');assert.equal(two.leader(),null);assert.throws(()=>two.agent(leader,'a'));
 const observation={agentId:'a',mode:'OBSERVER_ONLY',executionAllowed:false};one.commit(leader,lock,observation);
 now=2001;const replacement=two.leader(),replacementLock=two.agent(replacement,'a');assert.equal(replacement.generation,2);assert.throws(()=>one.renew(leader));assert.throws(()=>one.commit(leader,lock,observation));one.release(leader);two.commit(replacement,replacementLock,observation);
 assert.throws(()=>two.commit(replacement,replacementLock,{...observation,executionAllowed:true}));
 two.release(replacementLock);two.release(replacement);const third=two.leader();assert.equal(third.generation,3);assert.throws(()=>two.commit(replacement,replacementLock,observation));
 now=1999;assert.throws(()=>two.renew(third),/ROLLBACK/);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});

function product(db){
 const key=()=>Keypair.generate().publicKey.toBase58(),owner=key(),mint=key(),wallet=key();
 const binding={owner,agentId:'a',mint,network:'solana:101',signature:'fixture',executionId:'fixture-execution'},agent={id:'a',creator:owner,tradingWallet:wallet,launchWalletBinding:binding};
 const receipt={...binding,confirmed:true,status:'Success',confirmedSlot:12,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 db.exec('CREATE TABLE agents(id TEXT,owner TEXT,data TEXT);CREATE TABLE agent_wallets(agent_id TEXT,address TEXT,secret TEXT);CREATE TABLE launch_agent_bindings(agent_id TEXT,owner TEXT,mint TEXT,network TEXT,signature TEXT,execution_id TEXT,wallet TEXT);CREATE TABLE real_reserved_accounts(wallet TEXT,lamports TEXT);CREATE TABLE canonical_launch_receipts(agent_id TEXT,execution_id TEXT,signature TEXT,mint TEXT,payload TEXT);CREATE TABLE dex_executions(id TEXT,agent_id TEXT,data TEXT);CREATE TABLE agent_funding(id TEXT,agent_id TEXT,data TEXT)');
 db.prepare('INSERT INTO agents VALUES(?,?,?)').run('a',owner,JSON.stringify(agent));db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('a',wallet,'fixture-envelope');db.prepare('INSERT INTO launch_agent_bindings VALUES(?,?,?,?,?,?,?)').run('a',owner,mint,binding.network,binding.signature,binding.executionId,wallet);db.prepare('INSERT INTO canonical_launch_receipts VALUES(?,?,?,?,?)').run('a',binding.executionId,binding.signature,mint,JSON.stringify(receipt));
 db.prepare('INSERT INTO dex_executions VALUES(?,?,?)').run('same-unknown-operation','a',JSON.stringify({status:'UNKNOWN',signedTransaction:'DO-NOT-PROJECT'}));
}
test('observer survives restart, holds the same UNKNOWN operation, has no execution ports and never writes product DB',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-observer-')),path=join(dir,'product.sqlite'),statePath=join(dir,'worker.sqlite'),writer=new DatabaseSync(path);product(writer);
 try{for(let i=0;i<2;i++){
  const readonly=new DatabaseSync(path,{readOnly:true}),db=new DatabaseSync(statePath),before=writer.prepare('SELECT total_changes() n').get().n;
  const worker=createAgentObserver({productDb:readonly,stateDb:db});await worker.tick();
  const row=db.prepare('SELECT data FROM observer_agents WHERE agent_id=?').get('a'),r=JSON.parse(row.data);assert.equal(r.state,'RECONCILIATION_REQUIRED');assert.deepEqual(r.pending,[{source:'dex_executions',id:'same-unknown-operation',status:'UNKNOWN'}]);assert.equal(r.executionAllowed,false);assert.doesNotMatch(row.data,/DO-NOT-PROJECT|fixture-envelope/);assert.throws(()=>readonly.exec('DELETE FROM agents'));assert.equal(writer.prepare('SELECT total_changes() n').get().n,before);worker.stop();readonly.close();db.close();
 }}finally{writer.close();rmSync(dir,{recursive:true,force:true});}
});
test('binding mutation during awaited observation prevents commit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-observer-')),path=join(dir,'product.sqlite'),writer=new DatabaseSync(path);product(writer);const reader=new DatabaseSync(path,{readOnly:true}),state=new DatabaseSync(':memory:');
 try{const worker=createAgentObserver({productDb:reader,stateDb:state,afterRead:async()=>writer.exec("UPDATE launch_agent_bindings SET mint='wrong'")});await assert.rejects(worker.tick());assert.equal(state.prepare('SELECT count(*) n FROM observer_agents').get().n,0);worker.stop();}finally{reader.close();writer.close();state.close();rmSync(dir,{recursive:true,force:true});}
});
