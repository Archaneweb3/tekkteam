import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/pump-launch-ui.js','utf8').slice(readFileSync('src/pump-launch-ui.js','utf8').indexOf('export function mountPumpLaunch')).replace('export function','function');
const owner='11111111111111111111111111111111',identity={agentId:'a',owner,name:'Coin',symbol:'COIN'},evidence={launch:identity,metadataUri:'https://fixture.invalid/m',walletTransactionBase64:'AQID',createdAt:new Date().toISOString()};
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(api){
 let current=true,writes=0,events=0,timers=0;const nodes=new Map();
 function node(){return new Proxy({value:'0',hidden:false,replaceChildren(){writes++;},append(){writes++;},closest(){return node();},setAttribute(){}},{set(o,k,v){writes++;o[k]=v;return true;}});}
 const q=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);};
 const host={isConnected:true,dataset:{},innerHTML:'',querySelector:q};
 const context={api,Buffer,crypto:{randomUUID:()=> 'fixture'},Date,AbortSignal,agentLaunchData:()=>identity,assertAgentLaunch(){},parseInitialBuy:()=>0,buyLamports:()=>0,validateLaunchEvidence:()=>({validatedOverheadLamports:1,estimatedPayerDebitLamports:1,payerPreBalance:100000,payerPostBalance:99999}),verifyLaunchTransaction:()=>({serialize:()=>Buffer.from([1,2,3])}),launchBalancePreflight:()=>({insufficient:false,buyLamports:0,minimumKnownLamports:1}),launchProductError:()=>({title:'Unavailable',message:'Fixture'}),launchDiagnostics:()=>({}),deriveLaunchViewState:()=>({}),document:{createElement:node},window:{dispatchEvent(){events++;}},localStorage:{setItem(){}},setTimeout(){timers++;},fetch:async url=>({ok:true,json:async()=>url.includes('mainnet-balance')?{owner,network:'solana:101',lamports:100000,checkedAt:Date.now()}:identity})};
 vm.runInNewContext(source,context);context.mountPumpLaunch(host,{agent:{},isCurrent:()=>current,getWallet:()=>({assertBound(){},signTransaction:async()=> 'AQID'})});
 return {host,q,reset:()=>writes=0,stale:()=>current=false,reads:()=>({writes,events,timers})};
}
test('unsigned Awaiting approval reload and recheck expose only explicit fresh preparation',async()=>{
 let calls=0;const receipt={agentId:'a',owner,network:'solana:101',id:'p',status:'Awaiting approval',signature:null,broadcastAttempted:false,initialBuyLamports:0};
 const f=fixture(async path=>{assert.ok(path.startsWith('status'));calls++;return receipt;});
 await flush();assert.equal(calls,1);assert.equal(f.q('[data-prepare]').hidden,false);assert.equal(f.q('[data-prepare]').disabled,false);assert.equal(f.q('[data-approve]').hidden,true);
 await f.q('[data-check]').onclick({target:f.q('[data-check]')});assert.equal(calls,2);assert.equal(f.q('[data-approve]').hidden,true);assert.equal(f.reads().timers,0);assert.equal(f.reads().events,0);
});
for(const reason of ['close','owner'])test('late initial status after '+reason+' produces no UI/event/balance read',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let calls=0;const f=fixture(async()=>{calls++;return pending;});
 if(reason==='close')f.host.isConnected=false;else f.stale();f.reset();resolve({status:'Success',confirmed:true,signature:'fixture',mint:owner,owner,agentId:'a',network:'solana:101'});await flush();
 assert.deepEqual(f.reads(),{writes:0,events:0,timers:0});assert.equal(calls,1);
});
for(const reason of ['close','owner'])test('late submit after '+reason+' neither renders nor starts polling',async()=>{
 let resolve,entered;const submitted=new Promise(r=>resolve=r),arrived=new Promise(r=>entered=r);let statuses=0;
 const f=fixture(async path=>{
  if(path.startsWith('status'))return statuses++===0?{status:'Idle'}:{agentId:'a',id:'p',status:'Prepared',confirmed:false,metadataUri:evidence.metadataUri};
  if(path==='prepare')return {id:'p',evidence};if(path==='review')return {id:'p'};
  if(path==='submit'){entered();return submitted;}throw Error('Unexpected request');
 });
 await flush();await f.q('[data-prepare]').onclick({target:f.q('[data-prepare]')});
 const approval=f.q('[data-approve]').onclick({target:f.q('[data-approve]')});await arrived;
 if(reason==='close')f.host.isConnected=false;else f.stale();f.reset();resolve({status:'Confirming',agentId:'a',owner,network:'solana:101',signature:'fixture'});await approval;
 assert.deepEqual(f.reads(),{writes:0,events:0,timers:0});assert.equal(statuses,2);
});
