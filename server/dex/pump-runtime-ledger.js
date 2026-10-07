import {randomUUID} from 'node:crypto';
import {digest,integer,signedInteger,reject} from './intent.js';
import {createRealBalanceReservations} from '../real-balance-reservations.js';
import {createPumpExecutionFence} from './pump-execution-fence.js';
import {pumpEntryPolicyFromAuthority} from './pump-entry-policy.js';

const venues=new Set(['PUMP_BONDING_CURVE','PUMPSWAP']);
export function createPumpRuntimeLedger(db,{source='LOCAL_FIXTURE',now=Date.now,readBudgetAuthority,executionFencing,readCanonicalBinding,readExecutionSafety,assertExecutionReady}={}){
 if(!['LOCAL_FIXTURE','ON_CHAIN'].includes(source))reject('PUMP_RUNTIME_SOURCE');
 const holds=createRealBalanceReservations(db,{readBudgetAuthority,now});
 const fences=executionFencing?createPumpExecutionFence(db,{...executionFencing,atomic:holds.atomic,now}):null;
 if(fences)db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_sign_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL)');
 const syncRead=(port,input)=>{if(typeof port!=='function'||port.constructor.name==='AsyncFunction')reject('PUMP_CLAIM_DEPENDENCY_UNAVAILABLE');const value=port(structuredClone(input));if(value?.then)reject('PUMP_CLAIM_ASYNC_FORBIDDEN');return structuredClone(value);};
 db.exec(`CREATE TABLE IF NOT EXISTS pump_runtime_executions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,agent_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(owner,request_key));
 CREATE TABLE IF NOT EXISTS pump_runtime_controls(agent_id TEXT PRIMARY KEY,paused INTEGER NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS pump_runtime_receipts(execution_id TEXT PRIMARY KEY,signature TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pump_runtime_expenses(execution_id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pump_runtime_positions(agent_id TEXT NOT NULL,mint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(agent_id,mint));
 CREATE TABLE IF NOT EXISTS pump_runtime_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,execution_id TEXT NOT NULL,data TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS pump_receipt_no_update BEFORE UPDATE ON pump_runtime_receipts BEGIN SELECT RAISE(ABORT,'Immutable Pump receipt'); END;
 CREATE TRIGGER IF NOT EXISTS pump_receipt_no_delete BEFORE DELETE ON pump_runtime_receipts BEGIN SELECT RAISE(ABORT,'Immutable Pump receipt'); END;
 CREATE TRIGGER IF NOT EXISTS pump_event_no_update BEFORE UPDATE ON pump_runtime_events BEGIN SELECT RAISE(ABORT,'Immutable Pump event'); END;
 CREATE TRIGGER IF NOT EXISTS pump_event_no_delete BEFORE DELETE ON pump_runtime_events BEGIN SELECT RAISE(ABORT,'Immutable Pump event'); END;`);
 db.exec(`CREATE TRIGGER IF NOT EXISTS pump_expense_no_update BEFORE UPDATE ON pump_runtime_expenses BEGIN SELECT RAISE(ABORT,'Immutable Pump expense'); END;
 CREATE TRIGGER IF NOT EXISTS pump_expense_no_delete BEFORE DELETE ON pump_runtime_expenses BEGIN SELECT RAISE(ABORT,'Immutable Pump expense'); END;`);
 const get=id=>{const r=db.prepare('SELECT data FROM pump_runtime_executions WHERE id=?').get(id);return r?JSON.parse(r.data):null;};
 const receipt=id=>{const r=db.prepare('SELECT data FROM pump_runtime_receipts WHERE execution_id=?').get(id);return r?JSON.parse(r.data):null;};
 const position=(agentId,mint)=>{const r=db.prepare('SELECT data FROM pump_runtime_positions WHERE agent_id=? AND mint=?').get(agentId,mint);return r?JSON.parse(r.data):null;};
 const put=r=>{db.prepare('UPDATE pump_runtime_executions SET data=? WHERE id=?').run(JSON.stringify(r),r.id);db.prepare('INSERT INTO pump_runtime_events(execution_id,data) VALUES(?,?)').run(r.id,JSON.stringify(r));return r;};
 const operation=id=>'pump-runtime:'+id;
 const lookup=(intent,requestKey)=>{const row=db.prepare('SELECT data,fingerprint FROM pump_runtime_executions WHERE owner=? AND request_key=?').get(intent.owner,requestKey);if(!row)return null;if(row.fingerprint!==digest(intent))reject('IDEMPOTENCY_CONFLICT');return JSON.parse(row.data);};
 const control=agentId=>db.prepare('SELECT paused,revision FROM pump_runtime_controls WHERE agent_id=?').get(agentId)??{paused:0,revision:0};
 return {get,receipt,position,control,lookup,...(fences?{fences}:{}),reservation:id=>holds.get(operation(id)),
  pause(agentId){return holds.atomic(()=>{db.prepare('INSERT INTO pump_runtime_controls VALUES(?,1,1) ON CONFLICT(agent_id) DO UPDATE SET paused=1,revision=revision+1').run(agentId);return control(agentId);});},
  list:agentId=>db.prepare('SELECT data FROM pump_runtime_executions WHERE agent_id=? ORDER BY rowid DESC').all(agentId).map(r=>JSON.parse(r.data)),
  expenses:agentId=>db.prepare('SELECT data FROM pump_runtime_expenses WHERE agent_id=? ORDER BY rowid DESC').all(agentId).map(r=>JSON.parse(r.data)),
  prepare({intent,plan,requestKey,budget}){return holds.atomic(()=>{
   if(Object.hasOwn(plan,'entryPolicy'))reject('PUMP_ENTRY_POLICY_SERVER_ONLY');
   if(!venues.has(plan.venueKind)||plan.source!==source||typeof requestKey!=='string'||requestKey.length<16||requestKey.length>100)reject('PUMP_RUNTIME_PLAN');
   const fingerprint=digest(intent),old=lookup(intent,requestKey);if(old){if(budget!==undefined&&digest(budget)!==digest(holds.get(operation(old.id))?.budget?.request??null))reject('BUDGET_IDEMPOTENCY_CONFLICT');return old;}
   if(!Number.isSafeInteger(plan.snapshotSlot)||plan.snapshotSlot<0)reject('PUMP_RUNTIME_SNAPSHOT_SLOT');
   const buy=intent.side==='BUY',swap=plan.venueKind==='PUMPSWAP',amount=integer(intent.inputAmount),fee=integer(plan.feeCapLamports,{zero:true}),rent=integer(plan.rentCapLamports,{zero:true});
   if(fee>10000n||!plan.quote||plan.quote.inputAmount!==intent.inputAmount||plan.quote.inputMint!==intent.inputMint||plan.quote.outputMint!==intent.outputMint)reject('PUMP_RUNTIME_REVIEW');
   if(rent>10000000n||integer(plan.refundCapLamports,{zero:true})>10000000n)reject('PUMP_RUNTIME_RENT_CAP');
   const minimum=integer(plan.quote.minimumOutput),estimate=integer(plan.quote.estimatedOutput);
   if(minimum>estimate||minimum<estimate*BigInt(10000-intent.slippageBps)/10000n)reject('PUMP_RUNTIME_SLIPPAGE');
   const inputAsset=buy?(swap?'WSOL':'NATIVE_SOL'):intent.inputMint;
   const balance=buy?(swap?plan.balances.wsol:plan.balances.native):plan.balances.token;
   if(integer(balance,{zero:true})<amount)reject('PUMP_RUNTIME_INPUT_BALANCE');
   if(!buy&&BigInt(position(intent.agentId,intent.inputMint)?.quantity??'0')<amount)reject('PUMP_RUNTIME_UNTRACKED_POSITION');
   const nativeHold=fee+rent+(buy&&!swap?amount:0n);
   if(budget!==undefined&&(!budget||budget.owner!==intent.owner||budget.agentId!==intent.agentId||budget.wallet!==intent.agentWallet||budget.mint!==(buy?intent.outputMint:intent.inputMint)||budget.network!==intent.network||budget.messageHash!==plan.messageHash||budget.maxDebitLamports!==(fee+rent+(buy?amount:0n)).toString()||budget.tradeInputLamports!==(buy?amount.toString():'0')))reject('BUDGET_PUMP_PLAN_BINDING');
   const r={id:randomUUID(),intent:structuredClone(intent),plan:structuredClone(plan),planDigest:digest(plan),controlRevision:control(intent.agentId).revision,requestKey,fingerprint,status:'PREPARED',source,mode:'REAL',provenance:source==='LOCAL_FIXTURE'?'LOCAL_FIXTURE':'BACKEND VERIFIED',inputAsset,inputHold:amount.toString(),nativeHold:nativeHold.toString(),createdAt:now(),signature:null,notBroadcast:true};
   if(plan.risk?.authorizationGranted!==false||plan.risk.source!==source||plan.risk.nativeDebit!==r.nativeHold)reject('PUMP_RUNTIME_RISK_REQUIRED');
   holds.reserve({operationId:operation(r.id),intentHash:fingerprint,status:'PREPARED',kind:'PUMP_RUNTIME',resources:[{wallet:intent.agentWallet,lamports:r.nativeHold,balanceLamports:plan.balances.native,protectedLamports:plan.risk.protectedLamports}],...(budget!==undefined?{budget}:{})});
   const entryPolicy=intent.side==='BUY'?pumpEntryPolicyFromAuthority(holds.get(operation(r.id))?.budget?.authority):null;
   if(entryPolicy&&BigInt(position(intent.agentId,intent.outputMint)?.quantity??'0')>0n)reject('PUMP_ENTRY_EXISTING_POSITION');
   if(entryPolicy){r.plan.entryPolicy=entryPolicy;r.planDigest=digest(r.plan);}
   db.prepare('INSERT INTO pump_runtime_executions VALUES(?,?,?,?,?,?)').run(r.id,intent.owner,requestKey,fingerprint,intent.agentId,JSON.stringify(r));return put(r);
  });},
  // Unmounted library contract: durable claim facts only, never a signing port.
  // Fences, consent, binding, controls, budget and record advance share product DB.
  claimSigning(id,{leaderToken,agentToken,expectedPlanDigest,expectedMessageHash,expectedControlRevision,expectedBindingDigest}={}){return holds.atomic(()=>{
   if(!fences)reject('PUMP_CLAIM_UNMOUNTED');
   const r=get(id),at=now();if(!r||r.status!=='PREPARED'||r.signature)reject('PUMP_CLAIM_STATE');
   if(r.source!==source||r.plan.source!==source||r.plan.risk?.source!==source)reject('PUMP_CLAIM_SOURCE');
   if(r.plan.entryPolicy&&r.intent.side==='BUY'&&BigInt(position(r.intent.agentId,r.intent.outputMint)?.quantity??'0')>0n)reject('PUMP_ENTRY_EXISTING_POSITION');
   if(r.planDigest!==digest(r.plan)||r.fingerprint!==digest(r.intent)||r.planDigest!==expectedPlanDigest||r.plan.messageHash!==expectedMessageHash)reject('PUMP_CLAIM_MESSAGE_CHANGED');
   for(const expires of [r.intent.expiresAt,r.plan.quote?.expiresAt,r.plan.risk?.expiresAt])if(!Number.isSafeInteger(expires)||expires<=at)reject('PUMP_CLAIM_EXPIRED');
   fences.assertCurrent(leaderToken,agentToken,r.intent.agentId);
   const c=control(r.intent.agentId);if(c.paused||c.revision!==expectedControlRevision||r.controlRevision!==expectedControlRevision)reject('PUMP_CLAIM_CONTROL_CHANGED');
   const safety=syncRead(readExecutionSafety,r);
   if(safety?.executionEnabled!==true||safety.signingEnabled!==true||safety.killSwitch!==false||safety.emergencyStop!==false||safety.agentId!==r.intent.agentId||safety.controlRevision!==c.revision)reject('PUMP_CLAIM_SAFETY');
   const binding=syncRead(readCanonicalBinding,r.intent.agentId),mint=r.intent.side==='BUY'?r.intent.outputMint:r.intent.inputMint;
   if(!binding||binding.owner!==r.intent.owner||binding.agentId!==r.intent.agentId||binding.wallet!==r.intent.agentWallet||binding.mint!==mint||binding.network!=='solana:101'||!binding.executionId||!binding.signature||!Number.isSafeInteger(binding.confirmedSlot)||binding.confirmedSlot<=0||binding.provenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'||digest(binding)!==expectedBindingDigest)reject('PUMP_CLAIM_BINDING_CHANGED');
   if(syncRead(assertExecutionReady,r)!==true)reject('PUMP_CLAIM_PREPARATION_UNQUALIFIED');
   const h=holds.get(operation(id));if(!h||h.status!=='PREPARED'||h.signature||h.intentHash!==r.fingerprint||!h.budget||h.budget.claimedAt!==null||h.budget.request.messageHash!==expectedMessageHash||h.budget.authority.launchBindingDigest!==expectedBindingDigest)reject('PUMP_CLAIM_RESERVATION');
   holds.reserve({...h,status:'UNKNOWN'});holds.claimBudget(operation(id),expectedMessageHash,id);
   // Synchronous readers may still take time. A lease/preparation expiring
   // during validation rolls back the inserted claim and budget as well.
   const finalAt=now();for(const expires of [r.intent.expiresAt,r.plan.quote.expiresAt,r.plan.risk.expiresAt])if(expires<=finalAt)reject('PUMP_CLAIM_EXPIRED');
   if(h.budget.authority.startsAt>finalAt||h.budget.authority.expiresAt<=finalAt||h.budget.day!==new Date(finalAt).toISOString().slice(0,10))reject('PUMP_CLAIM_AUTHORITY_EXPIRED');
   fences.assertCurrent(leaderToken,agentToken,r.intent.agentId);
   const finalControl=control(r.intent.agentId);if(finalControl.paused||finalControl.revision!==expectedControlRevision||digest(get(id))!==digest(r))reject('PUMP_CLAIM_CONTROL_CHANGED');
   return put({...r,status:'UNKNOWN',reason:'SIGNING_CLAIMED',authorizedMessageHash:expectedMessageHash,claimBindingDigest:expectedBindingDigest,claimLeaderGeneration:leaderToken.generation,claimAgentGeneration:agentToken.generation,claimedAt:finalAt});
  });},
  trackPending(id,{signature,messageHash}){return holds.atomic(()=>{
   const r=get(id);if(!r||r.plan.messageHash!==messageHash)reject('PUMP_RUNTIME_MESSAGE_BINDING');
   if(r.signature){if(r.signature!==signature)reject('PUMP_RUNTIME_SIGNATURE_CONFLICT');return r;}
   const claim=r.status==='UNKNOWN'&&r.reason==='SIGNING_CLAIMED'&&r.authorizedMessageHash===messageHash&&db.prepare('SELECT message_hash FROM dex_autonomous_sign_claim WHERE execution_id=?').get(id)?.message_hash===messageHash;
   if(r.status!=='PREPARED'&&!claim||typeof signature!=='string'||!signature)reject('PUMP_RUNTIME_STATE');
   const h=holds.get(operation(id));holds.reserve({...h,status:'UNKNOWN',signature});
   return put({...r,status:'UNKNOWN',signature,reason:'EXISTING_SIGNATURE_TRACKED_NO_SEND',trackedAt:now()});
  });},
  cancel(id){return holds.atomic(()=>{const r=get(id);if(r?.status!=='PREPARED'||r.signature)reject('PUMP_RUNTIME_CANNOT_CANCEL_PENDING');holds.finish(operation(id),'CANCELLED');return put({...r,status:'CANCELLED'});});},
  settle(id,proof){return holds.atomic(()=>{
   const r=get(id);if(!r||r.source!==source||proof?.source!==source||proof.finalized!==true||proof.executionId!==id||proof.signature!==r.signature||proof.messageHash!==r.plan.messageHash||proof.network!=='solana:101'||proof.genesis!==r.intent.genesis||proof.owner!==r.intent.owner||proof.agentId!==r.intent.agentId||proof.agentWallet!==r.intent.agentWallet||proof.inputMint!==r.intent.inputMint||proof.outputMint!==r.intent.outputMint||!Number.isSafeInteger(proof.slot)||proof.slot<0)reject('PUMP_RUNTIME_RECEIPT_BINDING');
   const prior=receipt(id);if(prior){if(digest(prior.evidence)!==digest(proof))reject('PUMP_RUNTIME_RECEIPT_CONFLICT');return r;}
   if(!Object.hasOwn(proof,'error')||(proof.error!==null&&(typeof proof.error!=='string'||!proof.error.length)&&(typeof proof.error!=='object'||Array.isArray(proof.error)||!Object.keys(proof.error).length))||proof.slot<r.plan.snapshotSlot)reject('PUMP_RUNTIME_FINALITY_CLASSIFICATION');
   if(r.status!=='UNKNOWN'||!r.signature)reject('PUMP_RUNTIME_PENDING_REQUIRED');
   const e=proof.effects,fee=integer(e.networkFeeLamports,{zero:true}),rent=signedInteger(e.rentLamports),buy=r.intent.side==='BUY',swap=r.plan.venueKind==='PUMPSWAP';
   if(fee>integer(r.plan.feeCapLamports,{zero:true})||rent>integer(r.plan.rentCapLamports,{zero:true})||-rent>integer(r.plan.refundCapLamports,{zero:true}))reject('PUMP_RUNTIME_FEE_RENT_CAP');
   let nextPosition=null,unspent=0n;
   if(proof.error!==null){if(e.nativeDelta!==(-fee).toString()||e.tokenDelta!=='0'||e.wsolDelta!=='0'||rent!==0n||e.actualInput!=='0'||e.actualOutput!=='0')reject('PUMP_RUNTIME_FAILED_EFFECTS');}
   else{
    const input=integer(e.actualInput),output=integer(e.actualOutput),budget=integer(r.inputHold);
    if((buy?input>budget:input!==budget)||output<integer(r.plan.quote.minimumOutput))reject('PUMP_RUNTIME_TRADE_BOUND');
    const fees=e.venueFees;if(!fees||fees.includedInTrade!==true)reject('PUMP_RUNTIME_VENUE_FEES');
    const venueFees=['protocol','creator','buyback','lp'].reduce((n,k)=>n+integer(fees[k],{zero:true}),0n);
    if(venueFees>(buy?input:output+venueFees)||(!buy&&integer(e.grossOutput)!==output+venueFees))reject('PUMP_RUNTIME_VENUE_FEE_BALANCE');
    const quoteDelta=buy?-input:output,tokenDelta=buy?output:-input,nativeDelta=(swap?0n:quoteDelta)-fee-rent;
    if(e.nativeDelta!==nativeDelta.toString()||e.tokenDelta!==tokenDelta.toString()||e.wsolDelta!==(swap?quoteDelta:0n).toString())reject('PUMP_RUNTIME_ASSET_DELTA');
    const mint=buy?r.intent.outputMint:r.intent.inputMint;
    const p=position(r.intent.agentId,mint)??{agentId:r.intent.agentId,mint,mode:'REAL',source,provenance:source==='LOCAL_FIXTURE'?'LOCAL_FIXTURE':'ON-CHAIN VERIFIED',quantity:'0',costBasisLamports:'0',realizedPnlLamports:'0',networkFeesLamports:'0',venueFeesLamports:'0',rentPaidLamports:'0',rentRecoveredLamports:'0',unrealizedPnl:null};
    if(p.source!==source)reject('PUMP_RUNTIME_POSITION_PROVENANCE');
    // Native SOL and canonical WSOL share lamport units for basis, not spendability.
    p.costBasisUnit='SOL_EQUIVALENT_LAMPORTS';p.rentExcludedFromPnl=true;
    if(buy){
     if(r.plan.entryPolicy){
      const expected=pumpEntryPolicyFromAuthority(holds.get(operation(id))?.budget?.authority);
      if(!expected||digest(expected)!==digest(r.plan.entryPolicy))reject('PUMP_ENTRY_POLICY_CHANGED');
      if(BigInt(p.quantity)>0n){
       // Prevent before signing above; if an authoritative existing transaction
       // still reports an additional BUY, account for it and pause for recovery.
       // Never discard an actual receipt because a preflight invariant failed.
       p.recoveryRequired=true;
       p.unexpectedEntryReceipts=[...(p.unexpectedEntryReceipts??[]),{executionId:id,signature:proof.signature,slot:proof.slot}];
       db.prepare('INSERT INTO pump_runtime_controls VALUES(?,1,1) ON CONFLICT(agent_id) DO UPDATE SET paused=1,revision=revision+1').run(r.intent.agentId);
      }
     }
     if(BigInt(p.quantity)===0n){
      p.openedAt=now();p.openedAtProvenance='BACKEND_FINALITY_OBSERVED_AT';p.pool=r.plan.venueAddress??null;
      p.openingReceipt={executionId:id,signature:proof.signature,slot:proof.slot,actualChainVerified:source==='ON_CHAIN'};
      p.entryPolicy=r.plan.entryPolicy?structuredClone(r.plan.entryPolicy):null;
     }
     p.quantity=(BigInt(p.quantity)+output).toString();p.costBasisLamports=(BigInt(p.costBasisLamports)+input+fee).toString();
    }
    else{const q=BigInt(p.quantity);if(q<input)reject('PUMP_RUNTIME_UNTRACKED_POSITION');const basis=input===q?BigInt(p.costBasisLamports):BigInt(p.costBasisLamports)*input/q;p.quantity=(q-input).toString();p.costBasisLamports=(BigInt(p.costBasisLamports)-basis).toString();p.realizedPnlLamports=(BigInt(p.realizedPnlLamports)+output-fee-basis).toString();}
    p.networkFeesLamports=(BigInt(p.networkFeesLamports)+fee).toString();p.venueFeesLamports=(BigInt(p.venueFeesLamports)+venueFees).toString();
    if(rent>=0n)p.rentPaidLamports=(BigInt(p.rentPaidLamports)+rent).toString();else p.rentRecoveredLamports=(BigInt(p.rentRecoveredLamports)-rent).toString();
    p.lastVenue=r.plan.venueKind;p.updatedAt=now();nextPosition=p;unspent=buy?budget-input:0n;
   }
   const record={executionId:id,signature:proof.signature,source,provenance:source==='LOCAL_FIXTURE'?'LOCAL_FIXTURE':'ON-CHAIN VERIFIED',actualChainVerified:source==='ON_CHAIN',evidence:structuredClone(proof)};
   db.prepare('INSERT INTO pump_runtime_receipts VALUES(?,?,?)').run(id,proof.signature,JSON.stringify(record));
   db.prepare('INSERT INTO pump_runtime_expenses VALUES(?,?,?)').run(id,r.intent.agentId,JSON.stringify({executionId:id,source,networkFeeLamports:fee.toString(),rentLamports:rent.toString(),failed:proof.error!==null,feeIncludedInPositionPnl:proof.error===null,rentIncludedInPositionPnl:false}));
   if(nextPosition)db.prepare('INSERT INTO pump_runtime_positions VALUES(?,?,?) ON CONFLICT(agent_id,mint) DO UPDATE SET data=excluded.data').run(nextPosition.agentId,nextPosition.mint,JSON.stringify(nextPosition));
   const status=proof.error!==null?'FAILED':'CONFIRMED';holds.finish(operation(id),status,{provenTerminal:true,source,signature:proof.signature,inputAsset:r.inputAsset,unspentInput:unspent.toString(),networkFeeLamports:fee.toString(),rentLamports:rent.toString(),...(holds.get(operation(id))?.budget?{budgetMessageHash:r.plan.messageHash,budgetDebitLamports:(fee+(rent>0n?rent:0n)+(buy&&proof.error===null?integer(e.actualInput):0n)).toString()}:{})});
   return put({...r,status,settledAt:now(),unspentInput:unspent.toString(),releasedAsset:r.inputAsset});
  });}
 };
}
