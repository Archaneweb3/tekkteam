import test from 'node:test';import assert from 'node:assert/strict';
import {createPumpReadinessAttestations} from '../server/dex/pump-readiness-attestation.js';
import {digest} from '../server/dex/intent.js';
function fixture(){
  let at=1000,native=true,qualified=true;
  const intent={expiresAt:10000},plan={source:'ON_CHAIN',risk:{source:'ON_CHAIN',expiresAt:9000},quote:{expiresAt:10000},messageHash:'a'.repeat(64),unsignedTransaction:'fixture-exact-bytes',simulation:{success:true,notReceipt:true,source:'BACKEND_RPC_READ',messageHash:'a'.repeat(64)}};
  let r={id:'execution',status:'PREPARED',signature:null,source:'ON_CHAIN',intent,plan,planDigest:digest(plan),fingerprint:digest(intent)};
  const ledger={get:()=>structuredClone(r)},executor={read:async()=>({record:structuredClone(r)})},adapter={verifyPrepared:async()=>true,qualification:()=>qualified,assertPreparedCurrent:()=>{if(!native)throw Error('NATIVE_EXPIRED');}};
  const open=()=>createPumpReadinessAttestations({ledger,executor,adapter,now:()=>at});let store=open();
  return {ledger,executor,adapter,open,store,get record(){return structuredClone(r);},change:fn=>fn(r),time:x=>at=x,native:x=>native=x,qualified:x=>qualified=x};
}
test('exact verified record bridges to synchronous claim; restart requires revalidation',async()=>{
  const f=fixture();assert.throws(()=>f.store.assertExecutionReady(f.record),/ATTESTATION_REQUIRED/);
  const p=await f.store.verify({},'execution');assert.equal(p.executionAllowed,false);assert.equal(f.store.assertExecutionReady(f.record),true);
  assert.throws(()=>f.open().assertExecutionReady(f.record),/ATTESTATION_REQUIRED/);
  assert.equal('sign'in f.store,false);assert.equal('broadcast'in f.store,false);
});
for(const mutation of ['plan','intent','status','signature','simulation','source','native','qualification','expiry','clock'])test('claim attestation rejects '+mutation,async()=>{
  const f=fixture();await f.store.verify({},'execution');
  if(mutation==='plan')f.change(r=>{r.plan.unsignedTransaction='different';r.planDigest=digest(r.plan);});
  if(mutation==='intent')f.change(r=>{r.intent.amount='999';r.fingerprint=digest(r.intent);});
  if(mutation==='status')f.change(r=>r.status='UNKNOWN');if(mutation==='signature')f.change(r=>r.signature='unexpected');
  if(mutation==='simulation')f.change(r=>{r.plan.simulation.success=false;r.planDigest=digest(r.plan);});
  if(mutation==='source')f.change(r=>r.source='LOCAL_FIXTURE');if(mutation==='native')f.native(false);if(mutation==='qualification')f.qualified(false);
  if(mutation==='expiry')f.time(2000);if(mutation==='clock')f.time(999);
  assert.throws(()=>f.store.assertExecutionReady(f.record));
});
test('asynchronous verifier or authority changes cannot install stale attestation',async()=>{
  const f=fixture();f.adapter.verifyPrepared=async()=>{f.change(r=>{r.intent.amount='changed';r.fingerprint=digest(r.intent);});return true;};
  await assert.rejects(f.store.verify({},'execution'),/CHANGED/);assert.throws(()=>f.store.assertExecutionReady(f.record),/REQUIRED/);
});
test('invalidating an in-flight verification prevents it repopulating cache',async()=>{
  const f=fixture();let resolve,entered;const ready=new Promise(r=>entered=r);f.adapter.verifyPrepared=()=>new Promise(r=>{resolve=r;entered();});
  const verification=f.store.verify({},'execution');await ready;f.store.invalidate('execution');resolve(true);
  await assert.rejects(verification,/CHANGED/);assert.throws(()=>f.store.assertExecutionReady(f.record),/REQUIRED/);
});
test('late verification, false proof, async native assertion all deny',async()=>{
  for(const mode of ['late','false','async']){const f=fixture();
    if(mode==='late')f.adapter.verifyPrepared=async()=>{f.time(2000);return true;};
    if(mode==='false')f.adapter.verifyPrepared=async()=>false;
    if(mode==='async')f.adapter.assertPreparedCurrent=async()=>{};
    await assert.rejects(f.store.verify({},'execution'));
  }
});
test('native verification crossing cached expiry fails at the final boundary',async()=>{
  const f=fixture();await f.store.verify({},'execution');f.time(1999);
  f.adapter.assertPreparedCurrent=()=>f.time(2000);
  assert.throws(()=>f.store.assertExecutionReady(f.record),/REQUIRED/);
});
