import {randomUUID} from 'node:crypto';
import {createOwnerTradingConsents} from './owner-trading-consent.js';
import {createRealBalanceReservations} from '../real-balance-reservations.js';
import {createBoundPumpDecisionPorts} from './pump-bound-decision-ports.js';
import {createPumpRuntimeLedger} from './pump-runtime-ledger.js';
import {createPumpRuntimeExecutor} from './pump-runtime-executor.js';
import {createPumpReadinessAttestations} from './pump-readiness-attestation.js';
import {createPumpPreparationCoordinator} from './pump-preparation-coordinator.js';
import {reject} from './intent.js';

// A composition root, not an execution capability. Default startup has no DB,
// timer, RPC, custody or consent side effect. Enabled means preparation ONLY.
export function createPumpPreparationRuntime(options={}) {
  const {enabled=false}=options;
  if(typeof enabled!=='boolean')reject('PUMP_PREPARATION_MODE');
  let closed=false;
  if(!enabled)return Object.freeze({
    status:()=>({state:closed?'STOPPED':'DISABLED',preparationEnabled:false,executionAllowed:false}),
    async tick(){return {state:closed?'STOPPED':'DISABLED',executionAllowed:false};},
    stop(){closed=true;}
  });
  const allowed=['enabled','db','origin','source','now','holder','ttl','readPlan','readAuthority','readOwnerContext','readContext','readInputs','adapter'];
  if(Object.keys(options).some(k=>!allowed.includes(k)))reject('PUMP_PREPARATION_DEPENDENCY');
  const {db,origin,source='ON_CHAIN',now=Date.now,holder=randomUUID(),ttl=15000,
    readPlan,readAuthority,readOwnerContext,readContext,readInputs,adapter:supplied}=options;
  const methods=['qualification','prepare','verifyPrepared','assertPreparedCurrent','readFinalized','verifyFinalizedEffects'];
  if(!['ON_CHAIN','LOCAL_FIXTURE'].includes(source)||!db||typeof now!=='function'||
    [readPlan,readAuthority,readOwnerContext,readContext,readInputs].some(f=>typeof f!=='function')||
    !supplied||Object.keys(supplied).some(k=>!methods.includes(k))||
    methods.some(k=>typeof supplied[k]!=='function'))reject('PUMP_PREPARATION_DEPENDENCY');
  const adapter=Object.freeze(Object.fromEntries(methods.map(k=>[k,supplied[k].bind(supplied)])));
  const consents=createOwnerTradingConsents(db,{readPlan,readAuthority,origin,now});
  const reservations=createRealBalanceReservations(db,{readBudgetAuthority:r=>consents.resolveBudgetAuthority(r),now});
  let attest;
  const scopes=new Map();
  const ledger=createPumpRuntimeLedger(db,{source,now,readBudgetAuthority:r=>consents.resolveBudgetAuthority(r),
    executionFencing:{holder,ttl},readExecutionSafety:()=>({executionEnabled:false,signingEnabled:false}),
    readCanonicalBinding:id=>readAuthority(scopes.get(id)?.ownerContext),
    assertExecutionReady:r=>attest.assertExecutionReady(r)});
  const assertScope=id=>{
    if(closed)reject('PUMP_PREPARATION_STOPPED');
    const s=scopes.get(id);if(!s)reject('PUMP_PREPARATION_SCOPE');
    ledger.fences.assertCurrent(s.leader,s.agent,id);return s;
  };
  const ownerContext=async(actor,id)=>{
    const s=assertScope(id),ctx=structuredClone(await readOwnerContext(actor,id));assertScope(id);
    if(ctx?.authenticated!==true||ctx.agentId!==id)reject('PUMP_PREPARATION_OWNER');
    s.ownerContext=ctx;return ctx;
  };
  const ports=createBoundPumpDecisionPorts({consents,reservations,readOwnerContext:ownerContext,
    readInputs:async(actor,id)=>{assertScope(id);const inputs=await readInputs(actor,id);assertScope(id);return inputs;},
    source:source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE',now});
  // Fence each synchronous write in the existing product-DB transaction. Never
  // hold a transaction across await; stale/closed results cannot persist later.
  const write=(id,fn,{prepare=false}={})=>reservations.atomic(()=>{
    const check=()=>{
      const scope=assertScope(id),control=ledger.control(id);
      if(prepare&&(control.paused!==0||control.revision!==scope.controlRevision))reject('PUMP_PREPARATION_CONTROL_CHANGED');
    };
    check();const result=fn();check();return result;
  });
  const fencedLedger={...ledger,
    prepare:spec=>write(spec.intent.agentId,()=>ledger.prepare(spec),{prepare:true}),
    cancel:id=>write(ledger.get(id)?.intent.agentId,()=>ledger.cancel(id)),
    settle:(id,proof)=>write(ledger.get(id)?.intent.agentId,()=>ledger.settle(id,proof))};
  const executor=createPumpRuntimeExecutor({ledger:fencedLedger,adapter,source,now,deriveBudget:ports.deriveBudget,
    readContext:async(actor,id)=>{
      assertScope(id);const ctx=structuredClone(await readContext(actor,id));assertScope(id);
      const control=ledger.control(id);scopes.get(id).controlRevision=control.revision;
      return {...ctx,paused:ctx?.paused!==false||control.paused===1,controlRevision:control.revision};
    }});
  attest=createPumpReadinessAttestations({ledger:fencedLedger,executor,adapter,source,now});
  const coordinator=createPumpPreparationCoordinator({ledger:fencedLedger,executor,readDecision:ports.readDecision,now});
  const release=token=>{try{ledger.fences.release(token);}catch(error){if(error.code!=='PUMP_FENCE_STALE'&&error.code!=='PUMP_FENCE_CLOCK_ROLLBACK')throw error;}};
  return Object.freeze({
    status:()=>({state:closed?'STOPPED':'PREPARATION_ONLY',preparationEnabled:!closed,executionAllowed:false,activeTicks:scopes.size}),
    async tick(actor,agentId) {
      if(closed)return {state:'STOPPED',executionAllowed:false};
      if(typeof agentId!=='string'||!agentId||agentId.length>128)reject('PUMP_PREPARATION_AGENT');
      if(scopes.has(agentId))return {state:'BUSY',executionAllowed:false};
      const leader=ledger.fences.acquireLeader();if(!leader)return {state:'STANDBY',executionAllowed:false};
      const agent=ledger.fences.acquireAgent(leader,agentId);if(!agent)return {state:'BUSY',executionAllowed:false};
      scopes.set(agentId,{leader,agent});
      try {
        // UNKNOWN reconciliation precedes consent/market; revocation or Pause
        // must not turn an existing uncertain signature into another operation.
        const result=await coordinator.tick(actor,agentId);assertScope(agentId);
        if(result.state==='PREPARED_UNSIGNED'){
          const proof=await attest.verify(actor,result.executionId);assertScope(agentId);
          return {...result,readiness:proof,executionAllowed:false};
        }
        return result;
      } finally {
        scopes.delete(agentId);release(agent);
        if(scopes.size===0)release(leader);
      }
    },
    // Preserve committed evidence. In-flight calls fail their next guard and
    // release only their own still-current fence generation in finally.
    stop(){closed=true;}
  });
}
