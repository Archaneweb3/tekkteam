import test from 'node:test';
import {fixtureGeneralScope} from './dex-target-authority-fixture.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import {installControlledDex} from '../server/dex/routes.js';
import {ENGINE_ACCEPTANCE} from '../server/dex/autonomous-acceptance.js';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';

test('actual owner route creates only one fixture cycle, never signs, and emergency stop removes permission',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1));
 const candidate={...ENGINE_ACCEPTANCE,agentId:'fixture-agent',owner:'fixture-owner',agentWallet:signer.publicKey.toBase58(),tokenMint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL};
 db.exec('CREATE TABLE agents(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL); CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT NOT NULL,secret TEXT NOT NULL)');
 db.prepare('INSERT INTO agents VALUES(?,?,?)').run(candidate.agentId,candidate.owner,JSON.stringify({id:candidate.agentId,name:'Fixture',tradingWallet:candidate.agentWallet,strategy:'momentum'}));
 db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(candidate.agentId,candidate.agentWallet,'sealed-fixture');
 let sendCount=0,rpcReady=false;const connection={getBalance:async()=>6995000,sendRawTransaction:async()=>{sendCount++;throw Error('UNEXPECTED_SEND');}};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(req.headers['x-owner']!==candidate.owner)return res.sendStatus(401);req.session={address:candidate.owner};next();};
 const installed=installControlledDex(app,{db,readLaunchpadScope:fixtureGeneralScope(db,[{id:candidate.agentId,creator:candidate.owner,tradingWallet:candidate.agentWallet}]),auth,sessionValid:req=>req.headers['x-owner']===candidate.owner,owned:req=>{if(req.params.id!==candidate.agentId)throw Object.assign(Error('NOT_FOUND'),{status:404});return {agent:{id:candidate.agentId,tradingWallet:candidate.agentWallet}};},store:{unseal:()=>Uint8Array.from(signer.secretKey)},realMoney:{connection,get productionRpcConfigured(){return rpcReady;},verify:async()=>({networkConsistent:true})},acceptanceCandidate:candidate,now:()=>1800000000000});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/api/agents/${candidate.agentId}/autonomous-acceptance`;
 const call=async(path='',body,headers={})=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-owner':candidate.owner,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();return {status:r.status,data:JSON.parse(text.startsWith('{')?text:'{}')};};
 assert.equal((await call('',undefined,{'x-owner':'other'})).status,401);
 assert.equal((await call('/start',{mint:'arbitrary'})).status,409);
 assert.equal((await call()).data.canStart,false);assert.equal((await call('/start',{})).status,409);assert.equal(installed.acceptance.read(),null);
 rpcReady=true;
 assert.equal((await call()).data.canStart,true);
 const start=await call('/start',{});assert.equal(start.status,200);assert.equal(start.data.status,'ARMED');assert.ok(start.data.cycleId);
 assert.equal((await call('/start',{})).status,409);
 assert.equal((await call()).data.canStart,false);assert.equal(installed.acceptance.read().cycleId,start.data.cycleId);
 db.prepare('UPDATE agent_wallets SET address=? WHERE agent_id=?').run('temporarily-unavailable',candidate.agentId);
 assert.equal((await call()).status,409); // status/custody is unavailable; Stop must remain independent.
 const stopped=await call('/emergency-stop',{});assert.equal(stopped.data.status,'STOPPED');assert.equal(installed.acceptance.read().emergencyPermission,false);
 const firstStoppedAt=installed.acceptance.read().stoppedAt;
 assert.equal((await call('/emergency-stop',{})).status,200);
 assert.equal(installed.acceptance.read().stoppedAt,firstStoppedAt);
 assert.equal((await call('/start',{})).status,409);assert.equal(sendCount,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM dex_executions').get().n,0);
});
