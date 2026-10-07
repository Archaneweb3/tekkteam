import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {Keypair,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';import {createHash} from 'node:crypto';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {createActivationPlans,DEFAULT_ACTIVATION_PLAN} from '../server/dex/activation-plan.js';
import {createOwnerTradingConsents} from '../server/dex/owner-trading-consent.js';
import {createRealBalanceReservations} from '../server/real-balance-reservations.js';
import {createBoundPumpDecisionPorts} from '../server/dex/pump-bound-decision-ports.js';
import {createPumpRuntimeLedger} from '../server/dex/pump-runtime-ledger.js';
import {createPumpRuntimeExecutor} from '../server/dex/pump-runtime-executor.js';
import {createPumpPreparationCoordinator} from '../server/dex/pump-preparation-coordinator.js';
import {createPumpReadinessAttestations} from '../server/dex/pump-readiness-attestation.js';
import {pumpSdk} from '../server/dex/pump-sdk-boundary.js';import {GENESIS} from '../src/pump-readiness.js';import {SOL_MINT,digest} from '../server/dex/intent.js';
const start=1800000000000;
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());let at=start,reads=0;
 const owner=Keypair.generate(),wallet=Keypair.generate(),mint=Keypair.generate().publicKey.toBase58(),agent={id:'fixture-agent',creator:owner.publicKey.toBase58(),strategy:'operator'},ctx={authenticated:true,owner:agent.creator,agentId:agent.id};
 const binding={owner:ctx.owner,agentId:agent.id,wallet:wallet.publicKey.toBase58(),mint,network:'solana:101',executionId:'fixture-launch',signature:bs58.encode(new Uint8Array(64).fill(9)),confirmedSlot:100,provenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 const plans=createActivationPlans(db,{readAuthority:()=>({kind:'LAUNCHPAD',...binding}),now:()=>at}),p=plans.save(agent,{revision:0,policy:DEFAULT_ACTIVATION_PLAN}).plan;
 const consents=createOwnerTradingConsents(db,{readPlan:()=>plans.read(agent).plan,readAuthority:()=>binding,origin:'https://fixture.tekkteam.invalid',now:()=>at});
 const review=consents.prepareReview(ctx,{planRevision:p.revision,planDigest:p.planDigest});consents.approve(ctx,{reviewId:review.terms.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(review.message),owner.secretKey))});
 const context={...ctx,agentWallet:binding.wallet,associatedMint:mint,network:'solana:101',genesis:GENESIS,authorityVerified:true,revision:1,paused:false,enabled:true,killSwitch:false,emergencyStop:false,liveEnabled:false,broadcastEnabled:false};
 const reservations=createRealBalanceReservations(db,{readBudgetAuthority:r=>consents.resolveBudgetAuthority(r),now:()=>at});
 const inputs={binding,market:{mint,network:'solana:101',source:'LOCAL_FIXTURE',snapshotId:'fixture-snapshot',slot:100,observedAt:start,liquidityUsd:50000,volume5m:2000,change5m:2,buys5m:20,sells5m:10},capital:{mode:'REAL',source:'LOCAL_FIXTURE',wallet:binding.wallet,mint,network:'solana:101',genesis:GENESIS,costsQualified:true,observedAt:start,slot:100,balanceLamports:'3000000',initialCapitalLamports:'3000000',tokenBalance:'0',heldLamports:'0',feeCapLamports:'10000',rentCapLamports:'0'},venue:{qualified:true,kind:'PUMP_BONDING_CURVE',program:pumpSdk.PUMP_PROGRAM_ID.toBase58(),mint,source:'LOCAL_FIXTURE',address:'fixture-curve',observedAt:start},position:null,pending:[],lastTradeAt:0};
 const ports=createBoundPumpDecisionPorts({consents,reservations,readOwnerContext:()=>ctx,readInputs:async()=>{reads++;return inputs;},source:'LOCAL_FIXTURE',now:()=>at});
 let attest;
 const ledger=createPumpRuntimeLedger(db,{now:()=>at,readBudgetAuthority:r=>consents.resolveBudgetAuthority(r),executionFencing:{holder:'fixture-worker',ttl:10000},readCanonicalBinding:()=>binding,readExecutionSafety:()=>({executionEnabled:true,signingEnabled:true,killSwitch:false,emergencyStop:false,agentId:agent.id,controlRevision:ledger.control(agent.id).revision}),assertExecutionReady:r=>attest.assertExecutionReady(r)});
 // Synthetic unsigned bytes test orchestration only, not Pump program validity.
 const adapter={async prepare(intent){const m=new TransactionMessage({payerKey:wallet.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:owner.publicKey,lamports:0})]}).compileToV0Message(),messageHash=createHash('sha256').update(m.serialize()).digest('hex');return {source:'LOCAL_FIXTURE',observedAt:start,venueKind:'PUMP_BONDING_CURVE',venueAddress:'fixture-curve',snapshotSlot:100,unsignedTransaction:Buffer.from(new VersionedTransaction(m).serialize()).toString('base64'),messageHash,quote:{side:'BUY',agentId:agent.id,inputMint:SOL_MINT,outputMint:mint,inputAmount:intent.inputAmount,slippageBps:100,estimatedOutput:'50',minimumOutput:'50',expiresAt:intent.expiresAt},simulation:{source:'LOCAL_FIXTURE',messageHash,success:true,notReceipt:true},balances:{native:'3000000',wsol:'0',token:'0'},feeCapLamports:'10000',rentCapLamports:'0',refundCapLamports:'0'};},verifyPrepared:async()=>true,assertPreparedCurrent:()=>{},readFinalized:async()=>null};
 const executor=createPumpRuntimeExecutor({ledger,adapter,readContext:()=>context,deriveBudget:ports.deriveBudget,now:()=>at});
 attest=createPumpReadinessAttestations({ledger,executor,adapter,source:'LOCAL_FIXTURE',now:()=>at});
 const coordinator=createPumpPreparationCoordinator({ledger,executor,readDecision:ports.readDecision,now:()=>at});
 return {db,ctx,consents,context,binding,ports,ledger,executor,attest,coordinator,inputs,time:v=>at=v,get reads(){return reads;},args(r){const leaderToken=ledger.fences.acquireLeader(),agentToken=ledger.fences.acquireAgent(leaderToken,agent.id);return {leaderToken,agentToken,expectedPlanDigest:r.planDigest,expectedMessageHash:r.plan.messageHash,expectedControlRevision:0,expectedBindingDigest:digest(binding)};}};
}
test('real fixture consent -> bounded unsigned preparation; repeat tick does not claim/sign or duplicate',async t=>{
 const f=fixture(t),result=await f.coordinator.tick({},f.ctx.agentId),r=f.ledger.get(result.executionId);
 assert.equal(result.state,'PREPARED_UNSIGNED');assert.equal(r.plan.entryPolicy.personality,'operator');assert.equal(f.ledger.reservation(r.id).budget.request.maxDebitLamports,'107000');
 assert.equal((await f.coordinator.tick({},f.ctx.agentId)).state,'PREPARATION_ALREADY_EXISTS');assert.equal(f.reads,1);
 assert.equal(f.ledger.list(f.ctx.agentId).length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('revocation and Pause after attestation prevent atomic claim',async t=>{
 const f=fixture(t),out=await f.coordinator.tick({},f.ctx.agentId),r=f.ledger.get(out.executionId);await f.attest.verify({},r.id);const args=f.args(r);
 f.consents.revoke(f.ctx);assert.throws(()=>f.ledger.claimSigning(r.id,args),/INACTIVE/);assert.equal(f.ledger.get(r.id).status,'PREPARED');
 f.ledger.pause(f.ctx.agentId);assert.throws(()=>f.ledger.claimSigning(r.id,args),/CONTROL_CHANGED/);
 assert.equal(f.db.prepare('SELECT count(*) n FROM dex_autonomous_sign_claim').get().n,0);
});
test('unsigned UNKNOWN is preserved and prevents any new market decision',async t=>{
 const f=fixture(t),out=await f.coordinator.tick({},f.ctx.agentId),r=f.ledger.get(out.executionId);await f.attest.verify({},r.id);f.ledger.claimSigning(r.id,f.args(r));
 f.consents.revoke(f.ctx);f.time(start+20000);
 assert.equal((await f.coordinator.tick({},f.ctx.agentId)).state,'RECONCILIATION_REQUIRED');assert.equal(f.reads,1);assert.equal(f.ledger.get(r.id).signature,null);
});
test('first verified fixture BUY persists entry policy and opening receipt; partial SELL preserves it',async t=>{
 const f=fixture(t),out=await f.coordinator.tick({},f.ctx.agentId),r=f.ledger.get(out.executionId);await f.attest.verify({},r.id);f.ledger.claimSigning(r.id,f.args(r));
 f.ledger.trackPending(r.id,{signature:'fixture-buy-signature',messageHash:r.plan.messageHash});
 const effects={actualInput:r.intent.inputAmount,actualOutput:'50',networkFeeLamports:'5000',rentLamports:'0',nativeDelta:String(-BigInt(r.intent.inputAmount)-5000n),tokenDelta:'50',wsolDelta:'0',venueFees:{protocol:'100',creator:'100',buyback:'0',lp:'0',includedInTrade:true}};
 const proof={source:'LOCAL_FIXTURE',executionId:r.id,signature:'fixture-buy-signature',messageHash:r.plan.messageHash,network:'solana:101',genesis:GENESIS,owner:r.intent.owner,agentId:r.intent.agentId,agentWallet:r.intent.agentWallet,inputMint:SOL_MINT,outputMint:f.binding.mint,slot:101,finalized:true,error:null,effects};
 f.ledger.settle(r.id,proof);const first=f.ledger.position(f.ctx.agentId,f.binding.mint);assert.equal(first.openedAt,start);assert.equal(first.openedAtProvenance,'BACKEND_FINALITY_OBSERVED_AT');assert.equal(first.openingReceipt.actualChainVerified,false);assert.deepEqual(first.entryPolicy,r.plan.entryPolicy);
 const intent={...r.intent,side:'SELL',inputMint:f.binding.mint,outputMint:SOL_MINT,inputAmount:'25'},plan={...r.plan,quote:{...r.plan.quote,side:'SELL',inputMint:f.binding.mint,outputMint:SOL_MINT,inputAmount:'25',estimatedOutput:'60000',minimumOutput:'59400'},balances:{native:'2900000',token:'50',wsol:'0'},risk:{...r.plan.risk,nativeDebit:'10000'}};delete plan.entryPolicy;
 const sell=f.ledger.prepare({intent,plan,requestKey:'fixture-partial-sell-0001'});f.ledger.trackPending(sell.id,{signature:'fixture-sell-signature',messageHash:plan.messageHash});
 f.time(start+1000);f.ledger.settle(sell.id,{...proof,executionId:sell.id,signature:'fixture-sell-signature',inputMint:f.binding.mint,outputMint:SOL_MINT,slot:102,effects:{...effects,actualInput:'25',actualOutput:'60000',grossOutput:'60200',nativeDelta:'55000',tokenDelta:'-25'}});
 const next=f.ledger.position(f.ctx.agentId,f.binding.mint);assert.equal(next.quantity,'25');assert.deepEqual(next.entryPolicy,first.entryPolicy);assert.deepEqual(next.openingReceipt,first.openingReceipt);assert.equal(next.openedAt,first.openedAt);
});
test('changed plan costs or consent after decision reject the derivation port',async t=>{
 const f=fixture(t),d=await f.ports.readDecision({},f.ctx.agentId),{requestKey,...intent}=d.intent;
 const plan={venueKind:'PUMP_BONDING_CURVE',feeCapLamports:'10000',rentCapLamports:'1',risk:{protectedLamports:'2020000'}};
 assert.throws(()=>f.ports.deriveBudget({intent,plan,context:f.context}),/POLICY_CHANGED/);
 f.consents.revoke(f.ctx);assert.throws(()=>f.ports.deriveBudget({intent,plan:{...plan,rentCapLamports:'0'},context:f.context}),/INACTIVE/);
});
