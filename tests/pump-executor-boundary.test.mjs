import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {createPumpOfflineQuoteProvider} from '../server/dex/pump-offline-provider.js';
import {createControlledExecutor} from '../server/dex/executor.js';
import {createDexLedger} from '../server/dex/ledger.js';
const now=1800000000000,wallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
async function setup(t,migrated){
 const bundle=await pumpAccountFixture({migrated});bundle.context.observedAt=now;
 const directory=mkdtempSync(path.join(tmpdir(),'tekkteam-pump-ledger-')),file=path.join(directory,'fixture.sqlite');let db=new DatabaseSync(file),ledger=createDexLedger(db),reads=0,finalizedReads=0;
 t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
 const provider=createPumpOfflineQuoteProvider({now:()=>now,readBundle:async()=>{reads++;return bundle;}}),context={authenticated:true,agentId:bundle.agent.id,owner:bundle.agent.creator,agentWallet:wallet};
 const engine=(adapter)=>createControlledExecutor({ledger,provider,adapter,authorize:async()=>context,assertTarget:intent=>{assert.equal(intent.agentId,bundle.agent.id);assert.equal(intent.owner,bundle.agent.creator);assert.equal(intent.outputMint,bundle.receipt.mint);return {available:true};},flags:()=>({controlledEnabled:false,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:true}),now:()=>now});
 const body={direction:'BUY',inputMint:'So11111111111111111111111111111111111111112',outputMint:bundle.receipt.mint,inputAmount:'100000000',slippageBps:100,requestKey:'pump-offline-quote-operation'};
 return {engine,body,context,get ledger(){return ledger;},get reads(){return reads;},get finalizedReads(){return finalizedReads;},pendingAdapter:{readFinalized:async()=>{finalizedReads++;return null;}},restart(){db.close();db=new DatabaseSync(file);ledger=createDexLedger(db);}};
}
for(const migrated of [false,true])test(`Pump quote integrates with existing ledger but cannot prepare ${migrated}`,async t=>{
 const f=await setup(t,migrated),engine=f.engine(),record=await engine.quote({},f.body),again=await engine.quote({},f.body);
 assert.equal(record.id,again.id);assert.equal(f.reads,1);assert.equal(record.quote.inputSemantics,'SPENDABLE_BUDGET');assert.equal(record.quote.executable,false);assert.equal(record.quote.provider,'PUMP_OFFLINE_SDK');
 await assert.rejects(engine.prepare({},record.id),/UNVERIFIED_ROUTE_ADAPTER/);assert.equal(f.ledger.get(record.id).status,'QUOTED');assert.equal(f.ledger.position(f.context.agentId,f.body.outputMint).quantity,'0');assert.equal(f.ledger.position(f.context.agentId,f.body.outputMint).realizedPnlLamports,'0');assert.equal(f.ledger.receipt(record.id),null);
 await assert.rejects(engine.quote({}, {...f.body,inputAmount:'1'}),/IDEMPOTENCY_CONFLICT/);
});
test('pending synthetic signature survives ledger restart without rebroadcast or fabricated PnL',async t=>{
 const f=await setup(t,true),record=await f.engine().quote({},f.body);
 f.ledger.transition(record.id,['QUOTED'],'PREPARING');f.ledger.transition(record.id,['PREPARING'],'PREPARED');f.ledger.transition(record.id,['PREPARED'],'UNKNOWN',{signature:'SYNTHETIC_PENDING_NOT_SIGNED',messageHash:'synthetic-history',reason:'LOCAL_FIXTURE_PENDING'});
 f.restart();const engine=f.engine(f.pendingAdapter),recovered=await engine.reconcile({},record.id);
 assert.equal(recovered.status,'UNKNOWN');assert.equal(recovered.signature,'SYNTHETIC_PENDING_NOT_SIGNED');assert.equal(f.finalizedReads,1);assert.equal('broadcastOnce'in f.pendingAdapter,false);assert.equal(f.ledger.receipt(record.id),null);assert.equal(f.ledger.position(f.context.agentId,f.body.outputMint).quantity,'0');
 await assert.rejects(engine.cancel({},record.id),/CANNOT_CANCEL_SIGNED/);await assert.rejects(engine.quote({}, {...f.body,requestKey:'new-pump-operation-key'}),/ACTIVE_EXECUTION_REQUIRES_RECONCILIATION/);
});
test('quote provider freezes request before awaiting raw bundle',async()=>{
 const bundle=await pumpAccountFixture({migrated:true});bundle.context.observedAt=now;
 const intent={network:'solana:mainnet',direction:'BUY',agentId:bundle.agent.id,owner:bundle.agent.creator,agentWallet:wallet,inputMint:'So11111111111111111111111111111111111111112',outputMint:bundle.receipt.mint,inputAmount:'100000000',slippageBps:100,expiresAt:now+30000};
 const baseline=await createPumpOfflineQuoteProvider({now:()=>now,readBundle:async()=>bundle}).quote(intent);
 let release;const waiting=new Promise(resolve=>release=resolve),provider=createPumpOfflineQuoteProvider({now:()=>now,readBundle:async captured=>{assert.equal(Object.isFrozen(captured),true);assert.throws(()=>{captured.network='solana:103';},TypeError);await waiting;return bundle;}}),pending=provider.quote(intent);
 Object.assign(intent,{network:'solana:103',direction:'SELL',inputMint:bundle.receipt.mint,outputMint:wallet,agentWallet:bundle.agent.creator,inputAmount:'1'});release();
 assert.deepEqual(await pending,baseline);
});
