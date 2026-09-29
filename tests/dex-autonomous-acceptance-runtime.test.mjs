import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync} from '@solana/spl-token';
import bs58 from 'bs58';
import {fixture,tokenInfo,captured} from './cpmm-envelope-fixture.mjs';
import {fixtureMarket,fixtureProvenance} from './market-provenance-fixture.mjs';
import {CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {buildCpmmEnvelope,cpmmEnvelopeContext,CPMM_ENVELOPE} from '../server/dex/cpmm-envelope.js';
import {createDexLedger} from '../server/dex/ledger.js';
import {createAutonomousClaim} from '../server/dex/autonomous-claim.js';
import {createAutonomousExecutionPort} from '../server/dex/autonomous-execution-port.js';
import {createAutonomousAcceptance} from '../server/dex/autonomous-acceptance.js';
import {createAutonomousAcceptanceWorker} from '../server/dex/autonomous-acceptance-worker.js';
import {createRealBalanceReservations} from '../server/real-balance-reservations.js';

const signer=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1)),wallet=signer.publicKey.toBase58();
const candidate={mode:'AUTONOMOUS_ACCEPTANCE_TEST',agentId:'agent',owner:'owner',agentWallet:wallet,tokenMint:CONTROLLED_USDC_MINT,pool:CONTROLLED_CPMM_POOL,venue:'RAYDIUM_CPMM',policyVersion:'fixture-policy',maxBuyLamports:'100000',maxSlippageBps:100,maxOpenPositions:1,maxHoldMs:180000};
function harness(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const ledger=createDexLedger(db);
 const state={now:1_800_000_000_000,signs:0,sends:0,quoteCalls:0,failQuoteOn:null,finalized:true,tokenBalance:'0',balance:6995000,networkVerified:true,vaultVerified:true,sent:new Map(),failBroadcast:false,invalidSignature:false,failSimulation:false,failValuationOnce:false};
 const acceptance=createAutonomousAcceptance(db,{activationConfigured:true,now:()=>state.now,candidate});
 const agent={agentId:'agent',owner:'owner',agentWallet:wallet,vaultVerified:true,strategy:'momentum',strategyConfigVersion:0};
 const network={verify:async()=>({network:'solana:mainnet',verified:state.networkVerified})};
 const context={ownerAuthenticated:true,ownershipVerified:true,vaultVerified:true,networkVerified:true,owner:'owner',agentId:'agent',agentWallet:wallet};
 const policy=intent=>{const p=fixture(intent.direction);p.intent={...intent};p.agentBalanceLamports=String(state.balance);p.agentAccounts=[SOL_MINT,CONTROLLED_USDC_MINT].map(mint=>({address:getAssociatedTokenAddressSync(new PublicKey(mint),signer.publicKey).toBase58(),info:mint===CONTROLLED_USDC_MINT&&state.tokenBalance!=='0'?tokenInfo(mint,wallet,state.tokenBalance):null}));return p;};
 const snap=(intent,p,fee)=>{const c=cpmmEnvelopeContext(p);return {network:'solana:mainnet',agentWallet:wallet,inputMint:intent.inputMint,outputMint:intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.agentBalanceLamports,networkFeeLamports:String(fee),ataRentLamports:c.rentCost.toString(),netRentLamports:(c.buy&&state.tokenBalance==='0'?String(captured.ataRentLamports):'0'),ataExists:c.rentCost===0n,inputTokenBalance:state.tokenBalance,observedAt:state.now};};
 const claim=createAutonomousClaim({db,ledger,flags:()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true}),acceptance});
 const adapter={kind:'CPMM_CLASSIC_WSOL_USDC_V1',autonomousCustodyBound:true,
  async assertCustody(i){assert.equal(i.agentWallet,wallet);},
  async quote(i){state.quoteCalls++;if(state.quoteCalls===state.failQuoteOn)throw Object.assign(Error('RPC_MIN_CONTEXT_SLOT_NOT_REACHED'),{code:'RPC_MIN_CONTEXT_SLOT_NOT_REACHED',retryDiagnostics:[1,2,3].map(attempt=>({attempt,requestedMinContextSlot:100,currentRpcSlot:99,rpcErrorCode:-32016}))});if(i.direction==='SELL'&&state.failValuationOnce){state.failValuationOnce=false;throw Error('Fixture valuation unavailable');}const p=policy(i),q=cpmmEnvelopeContext(p).q;return {provider:'LOCAL_RAYDIUM_CPMM',pool:CONTROLLED_CPMM_POOL,inputMint:i.inputMint,outputMint:i.outputMint,inputAmount:i.inputAmount,slippageBps:i.slippageBps,estimatedOutput:q.output.toString(),minimumOutput:q.minimumOutput.toString(),reference:'fixture-quote',createdAt:state.now,expiresAt:state.now+25000};},
  async reservePlan(r){const p=policy(r.intent);return {collected:{policy:p},snapshot:snap(r.intent,p,10000)};},
  async buildReserved(_r,pre){const p=pre.collected.policy;return {transaction:buildCpmmEnvelope(p),blockhash:p.blockhash,lastValidBlockHeight:200,validationPolicy:p,stateDigest:'fixture-state',snapshotSlot:101,pool:CONTROLLED_CPMM_POOL,routePolicyVersion:CPMM_ENVELOPE};},
  async snapshot(r){return snap(r.intent,r.validationPolicy,5000);},async validationPolicy(r){return r.validationPolicy;},async blockHeight(){return 100;},
  async simulateUnsigned(_r,decoded){return {success:!state.failSimulation,messageHash:decoded.messageHash,slot:103,unitsConsumed:64027};},
  async signExactMessage(r,decoded){claim.assertSigningClaim(r);state.signs++;const tx=decoded.transaction;tx.sign([signer]);if(state.invalidSignature)tx.signatures[0][0]^=1;return Buffer.from(tx.serialize()).toString('base64');},
  async broadcastOnce(encoded,options,r){claim.assertBroadcastClaim(r);assert.deepEqual(options,{maxRetries:0,skipPreflight:false});state.sends++;const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),sig=bs58.encode(tx.signatures[0]);state.sent.set(sig,encoded);if(state.failBroadcast)throw Error('transport uncertain');return sig;},
  async readFinalized(signature){if(!state.finalized)return null;return {signature,finalized:true,slot:123,error:null,transaction:state.sent.get(signature),networkFeeLamports:'5000'};},
  async verifiedEffects(r){const q=cpmmEnvelopeContext(r.validationPolicy).q,input=BigInt(r.intent.inputAmount),output=q.output,fee=5000n,rent=r.intent.direction==='BUY'&&state.tokenBalance==='0'?BigInt(captured.ataRentLamports):0n;if(r.intent.direction==='BUY')state.tokenBalance=output.toString();else state.tokenBalance='0';return {actualInput:input.toString(),actualOutput:output.toString(),networkFeeLamports:fee.toString(),rentLamports:rent.toString(),agentSolDelta:(r.intent.direction==='BUY'?-input-fee-rent:output-fee-rent).toString(),agentTokenDelta:(r.intent.direction==='BUY'?output:-input).toString()};}
 };
 const port=createAutonomousExecutionPort({ledger,adapter,flags:()=>({liveAutonomousEnabled:false,autonomousKillSwitch:true,realMoneyEmergencyStop:true}),network,currentAgent:async()=>agent,acceptance,now:()=>state.now});
 const worker=()=>createAutonomousAcceptanceWorker({acceptance,ledger,port,adapter,agentContext:async()=>({...agent,vaultVerified:state.vaultVerified}),network,marketRead:async()=>({...fixtureMarket(state.now),volume5m:0,change5m:null,buys5m:0,sells5m:0}),resolveProvenance:args=>fixtureProvenance(args.snapshot,args.agentWallet,state.now),actualTokenBalance:async()=>state.tokenBalance,now:()=>state.now});
 return {db,ledger,state,acceptance,context,port,claim,worker};
}
test('owner cycle uses production port, durable claims, actual fill, max hold, SELL and auto-disarm',async t=>{
 const h=harness(t),s=h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});assert.equal(s.status,'ARMED');
 const first=await h.worker().tick();assert.equal(first.status,'CONFIRMED');assert.equal(h.acceptance.read().status,'POSITION_OPEN');assert.equal(h.acceptance.read().strategyResult.side,'HOLD');
 assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);assert.equal(h.ledger.activePosition('agent').quantity,h.state.tokenBalance);
 h.state.failValuationOnce=true;assert.equal((await h.worker().tick()).action,'WAIT');h.state.now+=180000;
 const second=await h.worker().tick();assert.equal(second.status,'CONFIRMED');assert.equal(second.exitReason,'MAX_HOLD');assert.equal(h.acceptance.read().status,'COMPLETED');assert.equal(h.acceptance.read().emergencyPermission,false);
 assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);const p=h.ledger.position('agent',CONTROLLED_USDC_MINT);assert.equal(p.quantity,'0');assert.ok(p.lastRealizedPnlLamports);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM dex_autonomous_sign_claim').get().n,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM dex_autonomous_broadcast_claim').get().n,2);
 assert.equal((await h.worker().tick()).reason,'ACCEPTANCE_DISARMED');assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);
});
test('confirmed position with failed cycle and emergency stop recovers for exactly one owner-authorized SELL',async t=>{
 const h=harness(t),cycle=h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});await h.worker().tick();
 const buy=h.ledger.get(h.acceptance.read().buyExecutionId),receipt=h.ledger.receipt(buy.id),position=h.ledger.activePosition('agent');
 const oldIntent={...buy.intent,direction:'SELL',inputMint:CONTROLLED_USDC_MINT,outputMint:SOL_MINT,inputAmount:position.quantity,requestKey:'historical-sell-key',createdAt:h.state.now,expiresAt:h.state.now+30000};
 const old=h.ledger.reserve({intent:oldIntent,fingerprint:'historical-sell-fingerprint',requestKey:'historical-sell-key'}).record;
 h.ledger.transition(old.id,['QUOTED'],'REJECTED_BEFORE_SIGNING',{reason:'429 Too Many Requests'});
 h.state.now+=180001;h.db.prepare('UPDATE dex_autonomous_acceptance SET data=? WHERE agent_id=?').run(JSON.stringify({...h.acceptance.read(),status:'FAILED',emergencyPermission:false,emergencyStopped:true,failureReason:'429 Too Many Requests'}),'agent');
 const recover=createAutonomousAcceptance(h.db,{activationConfigured:true,now:()=>h.state.now,candidate,recoveryCycleId:cycle.cycleId,recoveryBuyExecutionId:buy.id,recoveryBuySignature:buy.signature,recoveryQuantity:position.quantity});
 const args={position,buy,receipt};assert.throws(()=>recover.ownerRecoverExit({...h.context,owner:'wrong'},args),/ACCEPTANCE_RECOVERY_LOCKED/);
 assert.equal(recover.recoveryEligibility(h.context,args).eligible,true);assert.equal(recover.safeHistoricalSell(h.ledger.get(old.id)),true);
 assert.equal(recover.safeHistoricalSell({...h.ledger.get(old.id),signature:'unexpected'}),false);
 assert.equal(recover.safeHistoricalSell({...h.ledger.get(old.id),status:'UNKNOWN'}),false);
 assert.equal(recover.recoveryEligibility(h.context,{...args,activeReservation:true}).eligible,false);
 h.db.prepare('INSERT INTO dex_autonomous_sign_claim VALUES(?,?)').run(old.id,'unexpected-claim');assert.equal(recover.recoveryEligibility(h.context,args).reason,'UNRESOLVED_SELL_EXECUTION');h.db.prepare('DELETE FROM dex_autonomous_sign_claim WHERE execution_id=?').run(old.id);
 h.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify({...h.ledger.get(old.id),signature:'unexpected'}),old.id);assert.equal(recover.recoveryEligibility(h.context,args).reason,'UNRESOLVED_SELL_EXECUTION');h.db.prepare('UPDATE dex_executions SET data=? WHERE id=?').run(JSON.stringify({...h.ledger.get(old.id),signature:null}),old.id);
 assert.throws(()=>recover.ownerRecoverExit(h.context,{...args,position:{...position,acceptanceCycleId:'wrong'}}),/ACCEPTANCE_RECOVERY_LOCKED/);
 assert.throws(()=>recover.ownerRecoverExit(h.context,{...args,buy:{...buy,intent:{...buy.intent,acceptanceCycleId:'wrong'}}}),/ACCEPTANCE_RECOVERY_LOCKED/);
 const restored=recover.ownerRecoverExit(h.context,args);assert.equal(restored.status,'POSITION_OPEN');assert.equal(restored.recoveryExit,true);assert.equal(restored.emergencyStopped,true);assert.equal(restored.emergencyPermission,false);
 assert.throws(()=>recover.assertBuy({...buy.intent,acceptanceCycleId:cycle.cycleId},{context:h.context,flags:{},riskPass:true,openPositions:0}),/ACCEPTANCE_BUY_LOCKED/);
 assert.throws(()=>recover.ownerRecoverExit(h.context,args),/ACCEPTANCE_RECOVERY_LOCKED/);
 assert.equal((await h.worker().tick()).status,'CONFIRMED');assert.equal(h.acceptance.read().status,'COMPLETED');assert.equal(h.acceptance.read().recoveryExit,false);assert.equal(h.acceptance.read().emergencyStopped,true);
 assert.equal(h.ledger.get(old.id).status,'REJECTED_BEFORE_SIGNING');const fresh=h.ledger.list('agent').find(r=>r.intent.direction==='SELL'&&r.id!==old.id);assert.ok(fresh);assert.notEqual(fresh.requestKey,old.requestKey);assert.equal(fresh.status,'CONFIRMED');
 assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);assert.equal(h.ledger.activePosition('agent'),null);assert.equal((await h.worker().tick()).reason,'ACCEPTANCE_DISARMED');
});
test('restart with submitted BUY reconciles same signature without second signing',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.state.finalized=false;const first=await h.worker().tick();assert.equal(first.status,'SUBMITTED');assert.equal(h.state.signs,1);h.state.finalized=true;const result=await h.worker().tick();assert.equal(result.action,'RECONCILE');assert.equal(h.acceptance.read().status,'POSITION_OPEN');assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);});
test('unknown broadcast locks cycle; reconciliation of same signature recovers',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.state.failBroadcast=true;h.state.finalized=false;const first=await h.worker().tick();assert.equal(first.status,'UNKNOWN');assert.equal(h.acceptance.read().status,'UNKNOWN');assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);h.state.finalized=true;assert.equal((await h.worker().tick()).action,'RECONCILE');assert.equal(h.acceptance.read().status,'POSITION_OPEN');assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);});
test('invalid signature rejects before broadcast and permanently disables this cycle',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.state.invalidSignature=true;await h.worker().tick();assert.equal(h.state.signs,1);assert.equal(h.state.sends,0);assert.equal(h.acceptance.read().status,'FAILED');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);});
test('restart during submitted SELL reconciles same execution and closes once',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});await h.worker().tick();h.state.now+=180000;h.state.finalized=false;const sell=await h.worker().tick();assert.equal(sell.status,'SUBMITTED');assert.equal(h.acceptance.read().status,'SELLING');h.state.finalized=true;const recovered=await h.worker().tick();assert.equal(recovered.action,'RECONCILE');assert.equal(h.acceptance.read().status,'COMPLETED');assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);});
test('SELL UNKNOWN never opens second leg and later reconciles same signature',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});await h.worker().tick();h.state.now+=180000;h.state.finalized=false;h.state.failBroadcast=true;const sell=await h.worker().tick();assert.equal(sell.status,'UNKNOWN');assert.equal(h.acceptance.read().status,'UNKNOWN');assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);h.state.finalized=true;assert.equal((await h.worker().tick()).action,'RECONCILE');assert.equal(h.acceptance.read().status,'COMPLETED');assert.equal(h.state.signs,2);assert.equal(h.state.sends,2);});
test('Mainnet, vault, capital, simulation and competing reservation fail closed',async t=>{for(const reason of ['NETWORK','VAULT','CAPITAL','SIMULATION','RESERVATION']){const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});if(reason==='NETWORK')h.state.networkVerified=false;if(reason==='VAULT')h.state.vaultVerified=false;if(reason==='CAPITAL')h.state.balance=100000;if(reason==='SIMULATION')h.state.failSimulation=true;if(reason==='RESERVATION')createRealBalanceReservations(h.db).reserve({operationId:'fixture:other',intentHash:'other',status:'PREPARED',resources:[{wallet,lamports:'1'}]});await h.worker().tick();assert.equal(h.acceptance.read().status,'FAILED',reason);assert.equal(h.state.signs,0,reason);assert.equal(h.state.sends,0,reason);}}
);
test('emergency stop before tick prevents BUY',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.acceptance.ownerEmergencyStop();assert.equal((await h.worker().tick()).reason,'ACCEPTANCE_DISARMED');assert.equal(h.state.signs,0);assert.equal(h.state.sends,0);});
test('durable sign and broadcast claims reject duplicate side effects',async t=>{const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.state.finalized=false;await h.worker().tick();const r=h.ledger.list('agent')[0];assert.equal(r.status,'SUBMITTED');assert.throws(()=>h.claim.assertSigningClaim(r),/AUTONOMOUS_SIGNING_CLAIM_MISSING/);assert.throws(()=>h.claim.assertBroadcastClaim(r),/AUTONOMOUS_BROADCAST_ALREADY_CLAIMED/);assert.equal(h.state.signs,1);assert.equal(h.state.sends,1);});
test('restart expires an unsigned prepared BUY and releases its reservation without signing',async t=>{
 const h=harness(t),cycle=h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});
 const intent={mode:candidate.mode,acceptanceCycleId:cycle.cycleId,network:'solana:mainnet',agentId:'agent',owner:'owner',agentWallet:wallet,direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100,pool:candidate.pool,createdAt:h.state.now,expiresAt:h.state.now+1000};
 const {record}=h.ledger.reserve({intent,fingerprint:'expiry-fixture',requestKey:'expiry-fixture'});
 h.ledger.transition(record.id,['QUOTED'],'PREPARING',{risk:{allowed:true,snapshot:{solBalanceLamports:'6995000',networkFeeLamports:'5000',ataRentLamports:'2976880'}}});
 h.ledger.transition(record.id,['PREPARING'],'PREPARED',{quote:{expiresAt:h.state.now+1000},messageHash:'fixture-hash',lastValidBlockHeight:200});
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,1);
 h.state.now+=1001;
 const result=await h.worker().tick();assert.equal(result.action,'EXPIRE');assert.equal(h.ledger.get(record.id).status,'EXPIRED');
 assert.equal(h.acceptance.read().status,'FAILED');assert.equal(h.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 assert.equal(h.state.signs,0);assert.equal(h.state.sends,0);
});
test('exhausted pre-sign RPC lag rejects one execution without reservation, signer or broadcaster',async t=>{
 const h=harness(t);h.acceptance.ownerEnable(h.context,{acceptanceOverrideConfigured:true});h.state.failQuoteOn=2;
 const result=await h.worker().tick();assert.equal(result.action,'FAILED');
 const r=h.ledger.list('agent')[0];assert.equal(r.status,'REJECTED_BEFORE_SIGNING');assert.equal(r.reason,'RPC_MIN_CONTEXT_SLOT_NOT_REACHED');
 assert.equal(r.stateReadAttempts.length,3);assert.equal(h.acceptance.read().status,'FAILED');
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM real_reserved_accounts').get().n,0);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM dex_autonomous_sign_claim').get().n,0);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM dex_autonomous_broadcast_claim').get().n,0);
 assert.equal(h.state.signs,0);assert.equal(h.state.sends,0);
});
