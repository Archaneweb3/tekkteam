import test from 'node:test';
import {fixtureGeneralScope} from './dex-target-authority-fixture.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import {installControlledDex} from '../server/dex/routes.js';
import {SOL_MINT} from '../server/dex/intent.js';

test('controlled production HTTP surface: auth, quote idempotency, explicit cancel, no execution even with flags',async t=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT)');
 const owner=Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey.toBase58(),wallet=Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58(),mint=Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey.toBase58();db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('fixture-agent',wallet,'NOT_A_REAL_SECRET');
 const saved={CONTROLLED_REAL_ENABLED:process.env.CONTROLLED_REAL_ENABLED,GLOBAL_TRADING_KILL_SWITCH:process.env.GLOBAL_TRADING_KILL_SWITCH,LIVE_TRADING_ENABLED:process.env.LIVE_TRADING_ENABLED};
 process.env.CONTROLLED_REAL_ENABLED='true';process.env.GLOBAL_TRADING_KILL_SWITCH='false';process.env.LIVE_TRADING_ENABLED='false';
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(req.headers['x-fixture-owner']!==owner)return res.sendStatus(401);req.session={address:owner};next();};
 installControlledDex(app,{db,readLaunchpadScope:fixtureGeneralScope(db,[{id:'fixture-agent',creator:owner,tradingWallet:wallet}]),auth,sessionValid:req=>req.headers['x-expired']!=='yes',owned:req=>{if(req.params.id!=='fixture-agent')throw Object.assign(Error('Agent not found'),{status:404});return {agent:{id:'fixture-agent',tradingWallet:wallet}};},now:()=>1000,provider:{quote:async i=>({provider:'FIXTURE_ONLY',...i,estimatedOutput:'100',minimumOutput:'99',createdAt:1000,expiresAt:16000,reference:'fixture-ref'})}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();db.close();for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const base='http://127.0.0.1:'+server.address().port+'/api/agents/fixture-agent/controlled-swap';
 const call=async(path='',body,headers={})=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-fixture-owner':owner,...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.text()};};
 assert.equal((await call('',undefined,{'x-fixture-owner':'wrong'})).status,401);
 const state=JSON.parse((await call()).data);assert.equal(state.enabled,false);assert.equal(state.requested,true);assert.equal(state.adapterReady,false);
 for(const action of ['prepare','confirm']){const r=await call('/'+action,{confirm:true});assert.equal(r.status,409);assert.match(r.data,/UNVERIFIED_ROUTE_ADAPTER/);}
 const body={direction:'BUY',inputMint:SOL_MINT,outputMint:mint,inputAmount:'100000',slippageBps:100,requestKey:'fixture-request-key-0001'};
 assert.equal((await call('/quote',body,{'x-expired':'yes'})).status,409);
 const first=JSON.parse((await call('/quote',body)).data);assert.equal(first.status,'QUOTED');assert.equal(JSON.parse((await call('/quote',body)).data).id,first.id);
 assert.match((await call('/quote',{...body,inputAmount:'50000'})).data,/IDEMPOTENCY_CONFLICT/);
 assert.match((await call('/quote',{...body,requestKey:'fixture-request-key-0002'})).data,/ACTIVE_EXECUTION/);
 assert.equal(JSON.parse((await call('/'+first.id+'/cancel',{})).data).status,'FAILED');
 assert.equal(JSON.parse((await call('/quote',{...body,requestKey:'fixture-request-key-0002'})).data).status,'QUOTED');
 const publicJson=(await call()).data;assert.equal(/secret|transaction|SIGNED/.test(publicJson),false);
 process.env.LIVE_TRADING_ENABLED='true';assert.equal(JSON.parse((await call()).data).liveEnabled,true);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM dex_executions WHERE status IN ('SIGNED','SUBMITTED','CONFIRMED')").get().n,0);
});
