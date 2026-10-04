import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
async function fixture(response){
 const saved={window:globalThis.window,CustomEvent:globalThis.CustomEvent,fetch:globalThis.fetch};let calls=0;
 globalThis.window={addEventListener(){},dispatchEvent(){}};globalThis.CustomEvent=class{};
 globalThis.fetch=async()=>{calls++;return response;};
 const backend=await import('../public/app/backend.js?http-errors-'+(++serial));
 return {backend,get calls(){return calls;},close(){Object.assign(globalThis,saved);}};
}
for(const status of [401,403,503])test(`non-JSON HTTP${status} retains status, not invented backend downtime`,async()=>{const f=await fixture({ok:false,status,json:async()=>{throw SyntaxError('Invalid JSON');}});try{await assert.rejects(f.backend.request('/trading/leaderboard?sort=pnl'),e=>e.httpStatus===status&&!/Start the backend|did not respond/.test(e.message)&&(status===503||/Access is unavailable/.test(e.message)));assert.equal(f.calls,1);}finally{f.close();}});
test('malformed successful HTTP is rejected rather than treated as valid application state',async()=>{const f=await fixture({ok:true,status:200,json:async()=>{throw SyntaxError();}});try{await assert.rejects(f.backend.request('/state'),e=>e.httpStatus===200&&e.code==='API_RESPONSE_INVALID');assert.equal(f.calls,1);}finally{f.close();}});
test('structured rejection preserves authoritative submission fence only',async()=>{const f=await fixture({ok:false,status:400,json:async()=>({error:'Intent rejected',submissionState:'REJECTED_BEFORE_BROADCAST'})});try{await assert.rejects(f.backend.request('/launch'),e=>e.httpStatus===400&&e.submissionState==='REJECTED_BEFORE_BROADCAST'&&e.message==='Intent rejected');}finally{f.close();}});
test('valid JSON payload shape remains caller-owned',async()=>{const f=await fixture({ok:true,status:200,json:async()=>null});try{assert.equal(await f.backend.request('/state'),null);}finally{f.close();}});
