import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadOnlyQualificationRpc,qualifyPumpProgramsReadOnly} from '../tools/pump-readonly-qualification.mjs';
import {GENESIS} from '../src/pump-readiness.js';
test('RPC read scope never permits simulation/signature/transaction/send',async()=>{
 let calls=0;const rpc=createReadOnlyQualificationRpc('https://tekkteam-fixture.invalid/private',{request:async()=>{calls++;throw Error('secret endpoint');}});
 for(const method of ['simulateTransaction','getTransaction','getSignatureStatuses','sendTransaction','getProgramAccounts'])await assert.rejects(rpc(method),/METHOD_DENIED/);assert.equal(calls,0);
 await assert.rejects(rpc('getGenesisHash'),e=>e.message==='QUALIFICATION_RPC_READ_FAILED');
});
test('redirects are denied and errors redact transport details',async()=>{
 const rpc=createReadOnlyQualificationRpc('https://tekkteam-fixture.invalid/credential',{request:async(u,options)=>{assert.equal(options.redirect,'error');throw Error('credential redirect');}});
 await assert.rejects(rpc('getGenesisHash'),e=>e.message==='QUALIFICATION_RPC_READ_FAILED');
});
test('concurrent response IDs are request-local',async()=>{
 const resolvers=[];const rpc=createReadOnlyQualificationRpc('https://tekkteam-fixture.invalid/',{request:(u,o)=>new Promise(resolve=>resolvers.push(()=>resolve({ok:true,json:async()=>({id:JSON.parse(o.body).id,result:JSON.parse(o.body).method})})))});
 const a=rpc('getGenesisHash'),b=rpc('getMultipleAccounts');resolvers[1]();resolvers[0]();assert.deepEqual(await Promise.all([a,b]),['getGenesisHash','getMultipleAccounts']);
});
test('wrong genesis prevents all account reads',async()=>{let calls=0;await assert.rejects(qualifyPumpProgramsReadOnly(async()=>{calls++;return 'wrong';}),/GENESIS_MISMATCH/);assert.equal(calls,1);});
test('missing programs cannot qualify venue or invent a pool',async()=>{
 const report=await qualifyPumpProgramsReadOnly(async method=>method==='getGenesisHash'?GENESIS:{context:{slot:1},value:Array(7).fill(null)});
 assert.equal(report.coinPoolQualified,false);assert.equal(report.venueExecutionQualified,false);assert.equal(report.simulationPerformed,false);assert.equal(report.records.length,7);
});
