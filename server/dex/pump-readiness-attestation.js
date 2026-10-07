import {digest, reject} from './intent.js';

// Bridges asynchronous exact-message/native verification to the synchronous
// product-DB claim. It is not an execution capability and is never persisted.
export function createPumpReadinessAttestations({ledger, executor, adapter, source='ON_CHAIN', now=Date.now, maxAgeMs=1000}={}) {
  if (!['ON_CHAIN','LOCAL_FIXTURE'].includes(source) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs<1 || maxAgeMs>5000 || typeof ledger?.get!=='function' || typeof executor?.read!=='function' || typeof adapter?.verifyPrepared!=='function' || typeof adapter?.assertPreparedCurrent!=='function') reject('PUMP_ATTESTATION_DEPENDENCY');
  const cache=new Map(), attempts=new Map(); let highWater=0;
  const time=()=>{const at=now();if(!Number.isSafeInteger(at)||at<highWater)reject('PUMP_ATTESTATION_CLOCK');highWater=at;return at;};
  const qualified=()=>{if(source==='ON_CHAIN'&&adapter.qualification?.()!==true)reject('PUMP_ATTESTATION_UNQUALIFIED');};
  const current=r=>{
    qualified();const at=time();
    if(!r||r.status!=='PREPARED'||r.signature||r.source!==source||r.plan?.source!==source||r.plan.risk?.source!==source||r.planDigest!==digest(r.plan)||r.fingerprint!==digest(r.intent))reject('PUMP_ATTESTATION_RECORD');
    for(const expiry of [r.intent.expiresAt,r.plan.quote?.expiresAt,r.plan.risk.expiresAt])if(!Number.isSafeInteger(expiry)||expiry<=at)reject('PUMP_ATTESTATION_EXPIRED');
    const sim=r.plan.simulation;
    if(sim?.success!==true||sim.notReceipt!==true||sim.messageHash!==r.plan.messageHash||sim.source!==(source==='ON_CHAIN'?'BACKEND_RPC_READ':'LOCAL_FIXTURE'))reject('PUMP_ATTESTATION_SIMULATION');
    if(digest(ledger.get(r.id))!==digest(r))reject('PUMP_ATTESTATION_CHANGED');
    if(adapter.assertPreparedCurrent.constructor.name==='AsyncFunction')reject('PUMP_ATTESTATION_ASYNC_NATIVE');
    const native=adapter.assertPreparedCurrent(structuredClone(r));if(native?.then)reject('PUMP_ATTESTATION_ASYNC_NATIVE');
    qualified();
    if(digest(ledger.get(r.id))!==digest(r))reject('PUMP_ATTESTATION_CHANGED');
    const finalAt=time();
    for(const expiry of [r.intent.expiresAt,r.plan.quote.expiresAt,r.plan.risk.expiresAt])if(expiry<=finalAt)reject('PUMP_ATTESTATION_EXPIRED');
    return finalAt;
  };
  return Object.freeze({
    async verify(actor,id) {
      cache.delete(id); const token=Symbol(id);attempts.set(id,token);
      try {
        const {record}=await executor.read(actor,id), r=structuredClone(record), started=time();
        qualified();
        if(await adapter.verifyPrepared(structuredClone(r))!==true)reject('PUMP_ATTESTATION_UNVERIFIED');
        const latest=await executor.read(actor,id);
        if(digest(latest.record)!==digest(r)||attempts.get(id)!==token)reject('PUMP_ATTESTATION_CHANGED');
        const at=current(r),expiresAt=Math.min(started+maxAgeMs,r.intent.expiresAt,r.plan.quote.expiresAt,r.plan.risk.expiresAt);
        if(expiresAt<=at)reject('PUMP_ATTESTATION_EXPIRED');
        const proof={executionId:id,recordDigest:digest(r),planDigest:r.planDigest,messageHash:r.plan.messageHash,checkedAt:at,expiresAt,executionAllowed:false};
        cache.set(id,proof);if(cache.size>128)cache.delete(cache.keys().next().value);
        return structuredClone(proof);
      } catch(error) { if(attempts.get(id)===token)cache.delete(id); throw error; }
      finally { if(attempts.get(id)===token)attempts.delete(id); }
    },
    assertExecutionReady(record) {
      const r=structuredClone(record),proof=cache.get(r?.id),at=current(r);
      if(!proof||proof.recordDigest!==digest(r)||proof.expiresAt<=at||proof.checkedAt>at)reject('PUMP_ATTESTATION_REQUIRED');
      return true;
    },
    invalidate(id) { cache.delete(id);attempts.delete(id); }
  });
}
