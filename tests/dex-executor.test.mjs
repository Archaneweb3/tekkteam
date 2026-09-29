import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,VersionedTransaction,TransactionMessage,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
import bs58 from 'bs58';
import {createDexLedger} from '../server/dex/ledger.js';
import {createControlledExecutor} from '../server/dex/executor.js';
import {createRealBalanceReservations} from '../server/real-balance-reservations.js';
import {createOneShotArm} from '../server/dex/one-shot-arm.js';
import {canonicalIntent,evaluateControlledRisk,DEFAULT_RISK_POLICY,SOL_MINT} from '../server/dex/intent.js';

const kp=n=>Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>(i+n)%256)),wallet=kp(1),owner=kp(2),token=kp(3).publicKey.toBase58(),program=kp(4).publicKey,inputAccount=kp(5).publicKey,outputAccount=kp(6).publicKey,blockhash=kp(7).publicKey.toBase58();
const body=(overrides={})=>({direction:'BUY',inputMint:SOL_MINT,outputMint:token,inputAmount:'1000000',slippageBps:100,requestKey:'fixture-operation-key-0001',...overrides});
function fixture(t,{requireSimulation=false}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const ledger=createDexLedger(db);
 const state={now:1000,flags:{controlledEnabled:true,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:false},owner:owner.publicKey.toBase58(),balance:'10000000',height:100,failSend:false,finalized:false,quoteCalls:0,signCalls:0,broadcastCalls:0,simulationCalls:0,stored:new Map(),snapshotPatch:{}};
 const ctx=()=>({authenticated:true,agentId:'fixture-agent',owner:state.owner,agentWallet:wallet.publicKey.toBase58()});
 const provider={quote:async intent=>{state.quoteCalls++;return {provider:'SYNTHETIC_TEST_ONLY',network:'solana:mainnet',inputMint:intent.inputMint,outputMint:intent.outputMint,inputAmount:intent.inputAmount,slippageBps:intent.slippageBps,estimatedOutput:intent.direction==='BUY'?'100':'700000',minimumOutput:intent.direction==='BUY'?'99':'693000',reference:'fixture-quote-'+state.quoteCalls,createdAt:state.now,expiresAt:state.now+15000};}};
 const policy=r=>({intent:r.intent,quote:r.quote,genesisHash:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',blockhash,computeBudget:{units:10000,microLamports:0},inputTokenAccount:inputAccount.toBase58(),outputTokenAccount:outputAccount.toBase58(),allowedWritableAccounts:[wallet.publicKey.toBase58(),inputAccount.toBase58(),outputAccount.toBase58()],routeDecoders:new Map([[program.toBase58(),ix=>{assert.equal(ix.data.length,16);assert.equal(ix.keys.length,5);assert.deepEqual(ix.keys.map(x=>x.pubkey.toBase58()),[wallet.publicKey.toBase58(),r.intent.inputMint,r.intent.outputMint,inputAccount.toBase58(),outputAccount.toBase58()]);return {authority:ix.keys[0].pubkey.toBase58(),inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputTokenAccount:inputAccount.toBase58(),outputTokenAccount:outputAccount.toBase58(),inputAmount:String(ix.data.readBigUInt64LE()),minimumOutput:String(ix.data.readBigUInt64LE(8))};}]])});
 const adapter={
  validationPolicy:async r=>policy(r),
  build:async r=>{const data=Buffer.alloc(16);data.writeBigUInt64LE(BigInt(r.intent.inputAmount));data.writeBigUInt64LE(BigInt(r.quote.minimumOutput),8);const accounts=[wallet.publicKey,kp(3).publicKey,kp(3).publicKey,inputAccount,outputAccount];const {PublicKey}=await import('@solana/web3.js');accounts[1]=new PublicKey(r.intent.inputMint);accounts[2]=new PublicKey(r.intent.outputMint);const instructions=[ComputeBudgetProgram.setComputeUnitPrice({microLamports:0}),ComputeBudgetProgram.setComputeUnitLimit({units:10000}),new TransactionInstruction({programId:program,data,keys:accounts.map((pubkey,i)=>({pubkey,isSigner:i===0,isWritable:i===0||i>2}))})];const tx=new VersionedTransaction(new TransactionMessage({payerKey:wallet.publicKey,recentBlockhash:blockhash,instructions}).compileToV0Message());return {transaction:Buffer.from(tx.serialize()).toString('base64'),blockhash,lastValidBlockHeight:200,pool:program.toBase58(),routePolicyVersion:'fixture-direct-v1'};},
  snapshot:async r=>({network:'solana:mainnet',agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:state.balance,networkFeeLamports:'5000',ataRentLamports:'0',ataExists:true,inputTokenBalance:'100',observedAt:state.now,...state.snapshotPatch}),
  blockHeight:async()=>state.height,
  simulateUnsigned:async(r,decoded)=>{state.simulationCalls++;assert.equal(Buffer.from(r.transaction,'base64').length>0,true);return {success:true,messageHash:decoded.messageHash,slot:123,unitsConsumed:64027};},
  assertCustody:async intent=>assert.equal(intent.agentWallet,wallet.publicKey.toBase58()),
  signExactMessage:async(r,d)=>{state.signCalls++;d.transaction.sign([wallet]);const signed=Buffer.from(d.transaction.serialize()).toString('base64');state.stored.set(bs58.encode(d.transaction.signatures[0]),{signed,r});return signed;},
  broadcastOnce:async(encoded,options)=>{state.broadcastCalls++;assert.deepEqual(options,{maxRetries:0,skipPreflight:false});if(state.failSend)throw Error('fixture transport uncertain');return bs58.encode(VersionedTransaction.deserialize(Buffer.from(encoded,'base64')).signatures[0]);},
  readFinalized:async signature=>state.finalized?{signature,finalized:true,slot:123,error:null,transaction:state.stored.get(signature).signed,networkFeeLamports:'5000'}:null,
  verifiedEffects:async r=>({actualInput:r.intent.inputAmount,actualOutput:r.intent.direction==='BUY'?'100':'700000',networkFeeLamports:'5000',rentLamports:'0',agentSolDelta:r.intent.direction==='BUY'?'-1005000':'695000',agentTokenDelta:r.intent.direction==='BUY'?'100':'-50'})
 };
 const deps={ledger,provider,adapter,authorize:async()=>ctx(),flags:()=>state.flags,now:()=>state.now,requireSimulation};const engine=createControlledExecutor(deps);
 const prepare=async(b=body())=>{const q=await engine.quote({},b);return engine.prepare({},q.id);};
 const confirm=r=>engine.confirm({},r.id,{confirm:true,messageHash:r.messageHash,quoteReference:r.quote.reference,confirmationToken:r.confirmationToken});
 return {db,ledger,state,adapter,engine,deps,prepare,confirm,ctx};
}

test('BUY exact reviewed message -> one broadcast -> finalized immutable real receipt',async t=>{const f=fixture(t),r=await f.prepare();assert.equal(r.status,'PREPARED');assert.equal(f.ledger.position('fixture-agent',token).quantity,'0');await f.confirm(r);assert.equal(f.state.broadcastCalls,1);assert.equal((await f.engine.reconcile({},r.id)).status,'SUBMITTED');f.state.finalized=true;assert.equal((await f.engine.reconcile({},r.id)).status,'CONFIRMED');assert.equal(f.ledger.position('fixture-agent',token).costBasisLamports,'1005000');assert.equal(f.ledger.position('fixture-agent',token).quantity,'100');assert.throws(()=>f.db.prepare('UPDATE dex_receipts SET signature=?').run('tamper'),/Immutable/);await f.confirm(r);await f.engine.reconcile({},r.id);assert.equal(f.state.signCalls,1);assert.equal(f.state.broadcastCalls,1);assert.equal(f.ledger.position('fixture-agent',token).quantity,'100');});
test('SELL fixture reconciles actual net proceeds and isolated cost basis',async t=>{const f=fixture(t),buy=await f.prepare();await f.confirm(buy);f.state.finalized=true;await f.engine.reconcile({},buy.id);const sell=await f.prepare(body({direction:'SELL',inputMint:token,outputMint:SOL_MINT,inputAmount:'50',requestKey:'fixture-operation-key-0002'}));await f.confirm(sell);await f.engine.reconcile({},sell.id);assert.deepEqual(f.ledger.position('fixture-agent',token),{agentId:'fixture-agent',mint:token,mode:'REAL',quantity:'50',costBasisLamports:'502500',realizedPnlLamports:'192500',rentPaidLamports:'0',updatedAt:1000});assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'paper_%'").get().n,0);});
test('timeout preserves SAME signature UNKNOWN; reconciliation never broadcasts again',async t=>{const f=fixture(t),r=await f.prepare();f.state.failSend=true;const unknown=await f.confirm(r);assert.equal(unknown.status,'UNKNOWN');assert.ok(unknown.signature);await f.confirm(r);f.state.finalized=true;assert.equal((await f.engine.reconcile({},r.id)).status,'CONFIRMED');assert.equal(f.state.broadcastCalls,1);});
test('concurrent confirmation has one durable claim and one signing/send',async t=>{const f=fixture(t),r=await f.prepare();await Promise.allSettled([f.confirm(r),f.confirm(r)]);assert.equal(f.state.signCalls,1);assert.equal(f.state.broadcastCalls,1);});
test('immutable idempotency same intent reused; changed intent conflict; active intent blocks replacement',async t=>{const f=fixture(t),q=await f.engine.quote({},body());assert.equal((await f.engine.quote({},body())).id,q.id);assert.equal(f.state.quoteCalls,1);for(const change of [{inputAmount:'100'},{outputMint:kp(9).publicKey.toBase58()},{direction:'SELL',inputMint:token,outputMint:SOL_MINT}])await assert.rejects(f.engine.quote({},body(change)),/IDEMPOTENCY_CONFLICT/);await assert.rejects(f.engine.quote({},body({requestKey:'fixture-operation-key-0002'})),/ACTIVE/);});
test('manual cancellation then new intent key; terminal cannot reopen',async t=>{const f=fixture(t),r=await f.prepare();await f.engine.cancel({},r.id);assert.throws(()=>f.ledger.transition(r.id,['FAILED'],'PREPARED'),/STATE_CONFLICT/);const next=await f.engine.quote({},body({requestKey:'fixture-operation-key-0002'}));assert.notEqual(next.id,r.id);});
test('controlled gate is independent of autonomous kill switch; emergency stop fails closed',async t=>{const f=fixture(t),q=await f.engine.quote({},body());for(const flags of [{controlledEnabled:false,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:false},{controlledEnabled:true,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:true},{controlledEnabled:true,liveEnabled:true,killSwitch:true,realMoneyEmergencyStop:false}]){f.state.flags=flags;await assert.rejects(f.engine.prepare({},q.id));}f.state.flags={controlledEnabled:true,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:false};await assert.rejects(createControlledExecutor({...f.deps,adapter:undefined}).prepare({},q.id),/UNVERIFIED/);assert.equal(f.state.signCalls,0);});
test('explicit hash+quote-bound confirmation and correct owner required',async t=>{const f=fixture(t),r=await f.prepare();await assert.rejects(f.engine.confirm({},r.id,{confirm:false}),/MANUAL/);await assert.rejects(f.engine.confirm({},r.id,{confirm:true,messageHash:'other',quoteReference:r.quote.reference}),/MANUAL/);f.state.owner=kp(8).publicKey.toBase58();await assert.rejects(f.confirm(r),/OWNERSHIP/);assert.equal(f.state.signCalls,0);});
test('quote expiry rejects BEFORE signing and does not silently requote',async t=>{const f=fixture(t),r=await f.prepare();f.state.now+=16000;await assert.rejects(f.confirm(r),/EXPIRED/);assert.equal(f.ledger.get(r.id).status,'EXPIRED');assert.equal(f.state.quoteCalls,1);assert.equal(f.state.signCalls,0);});
test('expired blockhash and changed review balance require fresh manual review',async t=>{for(const change of [f=>f.state.height=201,f=>f.state.balance='9000000']){const f=fixture(t),r=await f.prepare();change(f);await assert.rejects(f.confirm(r));assert.equal(f.state.signCalls,0);}});
test('provider message mutation and invalid signing result rejected without send',async t=>{const f=fixture(t),r=await f.prepare();f.adapter.signExactMessage=async(_r,d)=>{d.transaction.sign([wallet]);d.transaction.signatures[0][0]^=1;return Buffer.from(d.transaction.serialize()).toString('base64');};await assert.rejects(f.confirm(r),/SIGNATURE/);assert.equal(f.state.broadcastCalls,0);});
test('risk reserves fees, ATA rent, future sell and safety; rejects insufficient balances',async t=>{const f=fixture(t),r=await f.prepare(),snapshot=await f.adapter.snapshot(r);assert.ok(evaluateControlledRisk(r.intent,snapshot,DEFAULT_RISK_POLICY,1000).allowed);assert.ok(evaluateControlledRisk(r.intent,{...snapshot,ataExists:false,ataRentLamports:'2039280'},DEFAULT_RISK_POLICY,1000).allowed);for(const patch of [{solBalanceLamports:'1000000'},{solBalanceLamports:'3014999'},{mintsVerified:false},{tokenAccountsVerified:false},{observedAt:-10000},{ataExists:false,ataRentLamports:'0'},{networkFeeLamports:'20000'}])assert.throws(()=>evaluateControlledRisk(r.intent,{...snapshot,...patch},DEFAULT_RISK_POLICY,1000));const sell={...r.intent,direction:'SELL'};assert.throws(()=>evaluateControlledRisk(sell,{...snapshot,inputTokenBalance:'0'},DEFAULT_RISK_POLICY,1000),/INSUFFICIENT_TOKEN/);});
test('canonical intent rejects authority injection, amount floats, bad network selection and slippage',t=>{const f=fixture(t);for(const changes of [{owner:'attacker'},{inputAmount:'0.001'},{inputAmount:'0'},{network:'devnet'},{slippageBps:101},{slippageBps:-1},{inputMint:token,outputMint:token}])assert.throws(()=>canonicalIntent(body(changes),f.ctx(),1000));});
test('unexpected finalized balance delta cannot create a real position',async t=>{const f=fixture(t),r=await f.prepare();await f.confirm(r);f.state.finalized=true;const effects=f.adapter.verifiedEffects;f.adapter.verifiedEffects=async r=>({...await effects(r),agentSolDelta:'-2000000'});await assert.rejects(f.engine.reconcile({},r.id),/BALANCE/);assert.equal(f.ledger.receipt(r.id),null);assert.equal(f.ledger.position('fixture-agent',token).quantity,'0');});
test('risk or confirmation expires during custody check even while quote remains fresh: no signature',async t=>{const f=fixture(t),r=await f.prepare();f.adapter.assertCustody=async()=>{f.state.now+=11000;};await assert.rejects(f.confirm(r),/EXPIRED/);assert.equal(f.state.signCalls,0);assert.equal(f.state.broadcastCalls,0);});
test('effects adapter cannot overwrite independently verified receipt identity',async t=>{const f=fixture(t),r=await f.prepare();await f.confirm(r);f.state.finalized=true;const effects=f.adapter.verifiedEffects;f.adapter.verifiedEffects=async r=>({...await effects(r),executionId:'forged',signature:'forged',finalized:false,slot:0,messageHash:'forged'});await f.engine.reconcile({},r.id);const receipt=f.ledger.receipt(r.id);assert.equal(receipt.executionId,r.id);assert.equal(receipt.signature,f.ledger.get(r.id).signature);assert.equal(receipt.slot,123);assert.equal(receipt.messageHash,r.messageHash);assert.equal(receipt.finalized,true);});
test('slow preparation validation cannot persist stale risk review',async t=>{const f=fixture(t),policy=f.adapter.validationPolicy;f.adapter.validationPolicy=async r=>{f.state.now+=11000;return policy(r);};await assert.rejects(f.prepare(),/RISK_EXPIRED/);assert.equal(f.state.signCalls,0);});
test('post-sign RPC delay or emergency stop prevents broadcasting, preserving same signature',async t=>{for(const lateChange of [s=>s.now+=16000,s=>s.flags.realMoneyEmergencyStop=true]){const f=fixture(t),r=await f.prepare();let calls=0;f.adapter.blockHeight=async()=>{if(++calls===2)lateChange(f.state);return 100;};const result=await f.confirm(r);assert.equal(result.status,'UNKNOWN');assert.equal(result.reason,'SIGNED_NOT_BROADCAST');assert.ok(result.signature);assert.equal(f.state.signCalls,1);assert.equal(f.state.broadcastCalls,0);}});
test('failed finalized swap persists immutable fee expense, no position, releases reservation',async t=>{const f=fixture(t),r=await f.prepare();await f.confirm(r);f.state.finalized=true;const read=f.adapter.readFinalized;f.adapter.readFinalized=async s=>({...await read(s),error:{InstructionError:[2,'FixtureFailure']}});const result=await f.engine.reconcile({},r.id);assert.equal(result.status,'FAILED');assert.equal(f.ledger.receipt(r.id).status,'FAILED');assert.equal(f.ledger.position('fixture-agent',token).quantity,'0');assert.equal(f.db.prepare('SELECT fee_lamports FROM dex_real_expenses').get().fee_lamports,'5000');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.throws(()=>f.db.exec('DELETE FROM dex_real_expenses'),/Immutable/);await f.engine.reconcile({},r.id);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM dex_real_expenses').get().n,1);});
test('simulation is persisted before PREPARED and confirm cannot rebuild or use unsimulated message',async t=>{
 const f=fixture(t,{requireSimulation:true}),r=await f.prepare();assert.equal(f.state.simulationCalls,1);assert.equal(r.simulation.messageHash,r.messageHash);
 f.adapter.build=()=>{throw Error('confirm rebuilt');};await f.confirm(r);assert.equal(f.state.broadcastCalls,1);
 const g=fixture(t,{requireSimulation:true}),q=await g.prepare(body({requestKey:'fixture-unsimulated-message'}));
 const stored=g.ledger.get(q.id);stored.simulation=null;g.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify(stored),q.id);
 await assert.rejects(g.confirm(q),/UNSIMULATED_MESSAGE/);assert.equal(g.state.signCalls,0);
});
test('simulation failure, wrong message and stale blockhash reject and release reservation',async t=>{
 for(const kind of ['program','rpc','wrong-message','stale']){
  const f=fixture(t,{requireSimulation:true});
  if(kind==='program')f.adapter.simulateUnsigned=async()=>({success:false,messageHash:'bad'});
  if(kind==='rpc')f.adapter.simulateUnsigned=async()=>{throw Error('RPC unavailable');};
  if(kind==='wrong-message')f.adapter.simulateUnsigned=async()=>({success:true,messageHash:'f'.repeat(64)});
  if(kind==='stale')f.adapter.simulateUnsigned=async(_r,d)=>{f.state.height=201;return {success:true,messageHash:d.messageHash};};
  await assert.rejects(f.prepare(body({requestKey:'fixture-simulation-'+kind})));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
  assert.equal(f.db.prepare('SELECT status FROM dex_executions').get().status,'REJECTED_BEFORE_SIGNING');
  assert.equal(f.state.signCalls,0);
 }
});
test('simulated PREPARED expiry releases reservation without signing',async t=>{const f=fixture(t,{requireSimulation:true}),r=await f.prepare();f.state.now+=16000;assert.equal((await f.engine.expire({},r.id)).status,'EXPIRED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal(f.state.signCalls,0);});
test('overlapping concurrent prepares: exactly one atomic hold, loser fails before final build',async t=>{
 const f=fixture(t,{requireSimulation:true}),originalBuild=f.adapter.build;
 let builds=0;
 f.adapter.reservePlan=async r=>({snapshot:await f.adapter.snapshot(r)});
 f.adapter.buildReserved=async r=>{builds++;return originalBuild(r);};
 const second=createControlledExecutor({...f.deps,authorize:async()=>({...f.ctx(),agentId:'other-agent'})});
 const q1=await f.engine.quote({},body({requestKey:'concurrent-operation-one'}));
 const q2=await second.quote({},body({requestKey:'concurrent-operation-two'}));
 const results=await Promise.allSettled([f.engine.prepare({},q1.id),second.prepare({},q2.id)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal(builds,1);assert.equal(f.state.signCalls,0);assert.equal(f.state.broadcastCalls,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
 const winner=results.find(x=>x.status==='fulfilled').value;
 const hold=f.ledger.reservation(winner.id);
 assert.equal(hold.operationId,`dex:${winner.id}`);assert.equal(hold.intentHash,winner.fingerprint);
 assert.equal(hold.resources[0].lamports,'1010000');
 assert.throws(()=>createRealBalanceReservations(f.db).reserve({operationId:hold.operationId,intentHash:hold.intentHash,status:'PREPARED',kind:'CONTROLLED_DEX',resources:[{...hold.resources[0],lamports:'109999'}]}),/RESERVATION_RESOURCE_MUTATION/);
});
test('reserved build, validator and simulation failures leave no orphan hold',async t=>{
 for(const failAt of ['build','validator','simulation']){
  const f=fixture(t,{requireSimulation:true}),originalBuild=f.adapter.build;
  f.adapter.reservePlan=async r=>({snapshot:await f.adapter.snapshot(r)});
  f.adapter.buildReserved=async r=>{
   if(failAt==='build')throw Error('fixture build failure');
   const plan=await originalBuild(r);
   return failAt==='validator'?{...plan,transaction:'invalid-base64'}:plan;
  };
  if(failAt==='simulation')f.adapter.simulateUnsigned=async()=>({success:false});
  await assert.rejects(f.prepare(body({requestKey:'reserved-failure-'+failAt})));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
  assert.equal(f.db.prepare('SELECT status FROM dex_executions').get().status,'REJECTED_BEFORE_SIGNING');
  assert.equal(f.state.signCalls,0);
 }
});
test('one-shot fixture authorizes exactly one fresh reviewed execution and auto-disarms on finalized outcome',async t=>{
 const f=fixture(t,{requireSimulation:true}),r=await f.prepare(body({inputAmount:'100000',requestKey:'one-shot-fixture-intent'}));
 const acceptance={owner:r.intent.owner,agentId:r.intent.agentId,agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAmount:'100000',pool:r.pool};
 const arm=createOneShotArm(f.db,{now:()=>f.state.now,acceptance}),hold=f.ledger.reservation(r.id);
 const approval={confirm:true,messageHash:r.messageHash,quoteReference:r.quote.reference,confirmationToken:r.confirmationToken};
 assert.equal(arm.stage(r,hold).status,'ARMED');
 assert.throws(()=>arm.stage(r,hold),/ONE_SHOT_ALREADY_ACTIVE/);
 assert.throws(()=>arm.stage({...r,id:'second-execution'},hold),/ONE_SHOT_ALREADY_ACTIVE/);
 assert.throws(()=>arm.claim({...r,id:'different-execution'},hold,approval),/ONE_SHOT_NOT_ARMED/);
 assert.throws(()=>arm.claim({...r,messageHash:'f'.repeat(64)},hold,approval),/ONE_SHOT_RECORD_INVALID/);
 assert.throws(()=>arm.claim({...r,intent:{...r.intent,inputAmount:'200000'}},hold,approval),/ONE_SHOT_INTENT_MISMATCH/);
 assert.throws(()=>arm.claim(r,{...hold,intentHash:'changed'},approval),/ONE_SHOT_RESERVATION_MISMATCH/);
 assert.throws(()=>arm.claim({...r,capabilityHash:'f'.repeat(64)},hold,approval),/ONE_SHOT_BINDING_MISMATCH/);
 assert.throws(()=>arm.claim(r,hold,{...approval,confirmationToken:'wrong'}),/ONE_SHOT_OWNER_CONFIRMATION_REQUIRED/);
 const guarded=createControlledExecutor({...f.deps,oneShot:arm});
 const result=await guarded.confirm({},r.id,approval);
 assert.equal(result.status,'SUBMITTED');assert.equal(f.state.signCalls,1);assert.equal(f.state.broadcastCalls,1);
 assert.equal(arm.status().status,'CLAIMED');
 await guarded.confirm({},r.id,approval);assert.equal(f.state.signCalls,1);assert.equal(f.state.broadcastCalls,1);
 f.adapter.verifiedEffects=async()=>({actualInput:'100000',actualOutput:'100',networkFeeLamports:'5000',rentLamports:'0',agentSolDelta:'-105000',agentTokenDelta:'100'});
 f.state.finalized=true;assert.equal((await guarded.reconcile({},r.id)).status,'CONFIRMED');assert.equal(arm.status().status,'DISARMED');
 assert.throws(()=>arm.claim(r,hold,approval),/ONE_SHOT_NOT_ARMED/);
 assert.throws(()=>arm.stage(r,hold),/ONE_SHOT_CONSUMED/);
});
test('one-shot fixture rejects expired, stale-blockhash and autonomous paths before signing',async t=>{
 const f=fixture(t,{requireSimulation:true}),r=await f.prepare(body({inputAmount:'100000',requestKey:'one-shot-expiry-fixture'})),acceptance={owner:r.intent.owner,agentId:r.intent.agentId,agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAmount:'100000',pool:r.pool};
 const arm=createOneShotArm(f.db,{now:()=>f.state.now,acceptance}),hold=f.ledger.reservation(r.id),guarded=createControlledExecutor({...f.deps,oneShot:arm});
 arm.stage(r,hold);f.state.height=201;
 await assert.rejects(guarded.confirm({},r.id,{confirm:true,messageHash:r.messageHash,quoteReference:r.quote.reference,confirmationToken:r.confirmationToken}),/BLOCKHASH_EXPIRED/);
 assert.equal(f.state.signCalls,0);assert.equal(f.state.broadcastCalls,0);
 const g=fixture(t,{requireSimulation:true}),q=await g.prepare(body({inputAmount:'100000',requestKey:'one-shot-timed-fixture'})),rule={owner:q.intent.owner,agentId:q.intent.agentId,agentWallet:q.intent.agentWallet,inputMint:q.intent.inputMint,outputMint:q.intent.outputMint,inputAmount:'100000',pool:q.pool},timed=createOneShotArm(g.db,{now:()=>g.state.now,acceptance:rule});
 timed.stage(q,g.ledger.reservation(q.id));g.state.now=q.quote.expiresAt;
 assert.equal(timed.status().status,'DISARMED');assert.throws(()=>timed.claim(q,g.ledger.reservation(q.id),{confirm:true,confirmationToken:q.confirmationToken,messageHash:q.messageHash,quoteReference:q.quote.reference}),/ONE_SHOT_NOT_ARMED/);
 assert.equal(g.state.signCalls,0);
 await assert.rejects(createControlledExecutor({...g.deps,oneShot:timed,flags:()=>({controlledEnabled:true,liveEnabled:true,killSwitch:true,realMoneyEmergencyStop:false})}).confirm({},q.id,{}),/CONTROLLED_REAL_DISABLED/);
});
test('owner-only arming validates persisted review without signing and rejects changed or stale state',async t=>{
 const f=fixture(t,{requireSimulation:true}),r=await f.prepare(body({inputAmount:'100000',requestKey:'owner-arm-fixture'}));
 const acceptance={owner:r.intent.owner,agentId:r.intent.agentId,agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAmount:'100000',pool:r.pool};
 const arm=createOneShotArm(f.db,{now:()=>f.state.now,acceptance}),engine=createControlledExecutor({...f.deps,oneShot:arm,requireSimulation:true});
 f.state.owner=kp(8).publicKey.toBase58();await assert.rejects(engine.arm({},r.id),/OWNERSHIP/);f.state.owner=r.intent.owner;
 const original=f.adapter.snapshot;f.adapter.snapshot=async x=>({...await original(x),solBalanceLamports:'1'});
 await assert.rejects(engine.arm({},r.id),/SOL_RESERVE_VIOLATION/);assert.equal(arm.status(),null);f.adapter.snapshot=original;
 f.state.height=201;await assert.rejects(engine.arm({},r.id),/BLOCKHASH_EXPIRED/);f.state.height=100;
 assert.equal((await engine.arm({},r.id)).status,'ARMED');
 assert.equal(f.state.signCalls,0);assert.equal(f.state.broadcastCalls,0);
 await assert.rejects(engine.arm({},r.id),/ONE_SHOT_ALREADY_ACTIVE/);
 const record=f.ledger.get(r.id);f.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify({...record,messageHash:'f'.repeat(64)}),r.id);
 await assert.rejects(engine.arm({},r.id),/MESSAGE/);
 assert.equal(f.state.signCalls,0);assert.equal(f.state.broadcastCalls,0);
});
