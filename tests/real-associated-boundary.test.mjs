import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlledExecutor} from '../server/dex/executor.js';
import {createAutonomousExecutionPort} from '../server/dex/autonomous-execution-port.js';
import {createAssociatedCoinRealGuard} from '../server/associated-coin-real-policy.js';
import {SOL_MINT} from '../server/dex/intent.js';
import express from 'express';
import {DatabaseSync} from 'node:sqlite';
import {installControlledDex} from '../server/dex/routes.js';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',other='11111111111111111111111111111111';
const agent={id:'LOCAL_FIXTURE',creator:other},ctx={authenticated:true,agentId:agent.id,owner:other,agentWallet:other};
const body={direction:'BUY',inputMint:SOL_MINT,outputMint:mint,inputAmount:'1000',slippageBps:100,requestKey:'LOCAL_FIXTURE_INTENT_001'};
const flags=Object.freeze({controlledEnabled:false,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:true});
function fixture({scoped=true,providerQuote}={}){
 const state={scope:{available:true,scoped,reason:null},authority:{available:true,initialized:true,agentId:agent.id,owner:other,receipt:{agentId:agent.id,owner:other,network:'solana:101',status:'Success',confirmed:true,signature:'LOCAL_FIXTURE_NO_SIGNATURE',mint}},reserves:0,quotes:0,effects:0};
 const assertTarget=createAssociatedCoinRealGuard({readAgent:()=>agent,readLaunchpadScope:()=>state.scope,readReceiptAuthority:()=>state.authority});
 let record;
 const ledger={reserve:c=>{state.reserves++;record={...c,id:'execution',status:'QUOTED'};return {record};},get:()=>record,transition:(_id,_from,patchState,patch)=>record={...record,...patch,status:patchState}};
 const provider={quote:async intent=>{state.quotes++;if(providerQuote)await providerQuote(state);return {...intent,createdAt:100,expiresAt:30100,minimumOutput:'99',estimatedOutput:'100',reference:'LOCAL_FIXTURE_QUOTE'};}};
 const forbidden=()=>{state.effects++;throw Error('FORBIDDEN_FIXTURE_EFFECT');};
 const adapter={kind:'CPMM_CLASSIC_WSOL_USDC_V1',autonomousCustodyBound:true,assertCustody:forbidden,signExactMessage:forbidden,broadcastOnce:forbidden};
 const engine=createControlledExecutor({ledger,provider,adapter,authorize:async()=>ctx,flags:()=>flags,assertTarget,now:()=>100});
 return {state,assertTarget,ledger,adapter,engine};
}
test('controlled wrong target rejected before provider or reservation with Live OFF',async()=>{
 const f=fixture();await assert.rejects(f.engine.quote({}, {...body,outputMint:other}),/REAL_ASSOCIATED_MINT_MISMATCH/);assert.deepEqual([f.state.reserves,f.state.quotes,f.state.effects],[0,0,0]);
});
for(const scoped of [true,false])test('valid '+(scoped?'associated':'General')+' quote retains disabled preparation and confirmation',async()=>{
 const f=fixture({scoped}),q=await f.engine.quote({}, {...body,outputMint:scoped?mint:other});assert.equal(q.status,'QUOTED');
 for(const method of ['prepare','confirm'])await assert.rejects(f.engine[method]({},q.id,{}),/REAL_MONEY_EMERGENCY_STOP/);
 assert.equal(f.state.effects,0);assert.deepEqual(flags,{controlledEnabled:false,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:true});
});
test('authority changing during quote await is rechecked',async()=>{
 const f=fixture({providerQuote:async state=>{state.scope={available:false,scoped:false,reason:'UNKNOWN'};}});
 await assert.rejects(f.engine.quote({},body),/REAL_TARGET_AUTHORITY_UNAVAILABLE/);assert.equal(f.ledger.get().status,'REJECTED_BEFORE_SIGNING');assert.equal(f.state.effects,0);
});
test('client configuration cannot erase scope or add arbitrary target policy',async()=>{
 const f=fixture();await assert.rejects(f.engine.quote({}, {...body,targetPolicy:'GENERAL'}),/UNEXPECTED_INTENT_FIELD/);assert.equal(f.state.reserves,0);
});
test('controlled missing authority dependency fails closed',async()=>{
 const engine=createControlledExecutor({authorize:async()=>ctx,now:()=>100});await assert.rejects(engine.quote({},body),/REAL_TARGET_AUTHORITY_UNAVAILABLE/);
});
test('cancel and reconciliation remain independent of eligibility',async()=>{
 const f=fixture(),q=await f.engine.quote({},body);f.state.scope=null;
 assert.equal((await f.engine.reconcile({},q.id)).status,'QUOTED');assert.equal((await f.engine.cancel({},q.id)).status,'FAILED');assert.equal(f.state.effects,0);
});
test('autonomous wrong target fails before network, custody or ledger',async()=>{
 const f=fixture();let networkReads=0;
 const port=createAutonomousExecutionPort({ledger:f.ledger,adapter:f.adapter,flags:()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true}),network:{verify:async()=>{networkReads++;throw Error('NO_RPC');}},assertTarget:f.assertTarget});
 for(const mode of ['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'])await assert.rejects(port.execute({agent,intent:{...body,agentId:agent.id,owner:other,outputMint:other,mode}}),/REAL_ASSOCIATED_MINT_MISMATCH/);
 assert.deepEqual([networkReads,f.state.reserves,f.state.effects],[0,0,0]);
});
test('autonomous missing target dependency fails before any operation',async()=>{
 const f=fixture();const port=createAutonomousExecutionPort({ledger:f.ledger,adapter:f.adapter,flags:()=>flags,network:{verify:async()=>{throw Error('NO_RPC');}}});
 await assert.rejects(port.execute({intent:{...body,agentId:agent.id,owner:other}}),/REAL_TARGET_AUTHORITY_UNAVAILABLE/);assert.equal(f.state.effects,0);
});
test('actual HTTP installer enforces canonical scope before disabled preparation or RPC',async()=>{
 const db=new DatabaseSync(':memory:');let server;
 try{
  db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE agents(id TEXT PRIMARY KEY,owner TEXT,data TEXT);CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT);');
  db.prepare('INSERT INTO agents VALUES(?,?,?)').run(agent.id,other,JSON.stringify({...agent,tradingWallet:other,coin:null}));
  db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(agent.id,other,'LOCAL_FIXTURE_NO_SECRET');
  db.prepare('INSERT INTO agents VALUES(?,?,?)').run('GENERAL_FIXTURE',other,JSON.stringify({id:'GENERAL_FIXTURE',creator:other,tradingWallet:mint,coin:null}));
  db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run('GENERAL_FIXTURE',mint,'LOCAL_FIXTURE_NO_SECRET');
  const scope=installLaunchpadScopeLedger(db,{now:()=>100});db.exec('BEGIN');scope.insertLaunchpadScope(agent,{source:'LAUNCHPAD_IDENTITY'});db.exec('COMMIT');
  const f=fixture();let rpc=0;
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{if(req.headers['x-local-owner']!==other)return res.sendStatus(401);req.session={address:other};next();};
  const installed=installControlledDex(app,{db,auth,owned:req=>({agent:JSON.parse(db.prepare('SELECT data FROM agents WHERE id=?').get(req.params.id).data)}),sessionValid:req=>req.session?.address===other,productionAdapter:f.adapter,productionFlags:()=>flags,realMoney:{verify:async()=>{rpc++;throw Error('FORBIDDEN_RPC');}},provider:{quote:async i=>({...i,createdAt:100,expiresAt:30100,minimumOutput:'99',estimatedOutput:'100',reference:'LOCAL_FIXTURE_QUOTE'})},readLaunchpadScope:scope.readLaunchpadScope,readReceiptAuthority:()=>f.state.authority,now:()=>100});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const call=async(path,value,owner=other)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/${agent.id}/${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-local-owner':owner},body:JSON.stringify(value)});const text=await response.text();return {status:response.status,data:response.status===401?null:JSON.parse(text)};};
  for(const path of ['controlled-swap/quote','controlled-execution/prepare','controlled-execution/dry-run']){
   const r=await call(path,{...body,outputMint:other});assert.equal(r.status,409);assert.equal(r.data.error,'REAL_ASSOCIATED_MINT_MISMATCH');
  }
  assert.equal((await call('controlled-execution/prepare',body)).data.error,'CONTROLLED_REAL_DISABLED');
  assert.equal((await call('controlled-execution/prepare',body,'wrong')).status,401);
  const q=await call('controlled-swap/quote',body);assert.equal(q.status,200);assert.equal(q.data.status,'QUOTED');
  assert.equal(installed.ledger.list(agent.id).length,1);
  f.state.authority={available:false};assert.equal((await call('controlled-swap/quote',body)).data.error,'REAL_TARGET_RECEIPT_UNAVAILABLE');
  const general=await fetch(`http://127.0.0.1:${server.address().port}/api/agents/GENERAL_FIXTURE/controlled-swap/quote`,{method:'POST',headers:{'Content-Type':'application/json','x-local-owner':other},body:JSON.stringify({...body,outputMint:other,requestKey:'GENERAL_FIXTURE_INTENT_001'})});
  assert.equal(general.status,200);assert.equal((await general.json()).status,'QUOTED');
  assert.deepEqual([rpc,f.state.effects],[0,0]);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));db.close();}
});
