import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {mountM4Launch} from '../src/pump-m4-ui.js';

test('failed owner pre-check restores only authoritative controls; durable approval latch stays locked',async()=>{
 const priorFetch=globalThis.fetch,priorDocument=globalThis.document;
 try{
  const node=()=>({textContent:'',disabled:false,hidden:false,style:{},append(){},replaceChildren(){}});
  globalThis.document={createElement:node};
  for(const durablyOpened of [false,true,null]){
   const nodes=new Map(),host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}};
   const owner=Keypair.generate().publicKey.toBase58(),agent={id:'fixture',name:'Agent',creator:owner,coin:{name:'Coin',ticker:'FIX'}};
   const result={mint:owner,metadataUri:'https://fixture.invalid',simulation:{status:'PASS'},executionReview:{expiresAt:Date.now()+500}};
   let reads=0,signs=0;const requests=[];
   globalThis.fetch=async(url,options={})=>{
    requests.push({url,method:options.method??'GET'});
    if(url.endsWith('/status')){reads++;if(reads>1&&durablyOpened===null)throw Error('Status unavailable');return {ok:true,json:async()=>({status:reads>1&&durablyOpened?'AWAITING_WALLET_APPROVAL':'READY_FOR_REVIEW',walletApprovalOpened:reads>1&&durablyOpened===true,result})};}
    if(url==='/api/agents/fixture')return {ok:false,status:401};
    throw Error('Unexpected transaction operation');
   };
   mountM4Launch(host,{agent,isCurrent:()=>true,getM4Wallet:()=>({assertBound(){},signTransaction(){signs++;}}),capability:{m4Target:{owner,agentId:agent.id}}});
   await new Promise(r=>setImmediate(r));assert.equal(host.querySelector('[data-approve]').disabled,false);
   await host.querySelector('[data-approve]').onclick();
   assert.equal(reads,2);assert.equal(signs,0);assert.ok(requests.every(r=>r.method==='GET'));
   assert.equal(host.querySelector('[data-approve]').disabled,durablyOpened!==false);
   assert.equal(host.querySelector('[data-prepare]').disabled,true);
   if(durablyOpened===null)assert.match(host.querySelector('[data-status]').textContent,/Execution state unavailable/);
   assert.match(host.querySelector('[data-error]').textContent,/Owner session unavailable/);
   assert.equal(host.querySelector('[data-check]').hidden,false);host.isConnected=false;
  }
 }finally{globalThis.fetch=priorFetch;globalThis.document=priorDocument;}
});

test('expiry during an approval attempt keeps preparation locked and never claims no prompt opened',async()=>{
 const priorFetch=globalThis.fetch,priorDocument=globalThis.document;
 const node=()=>({textContent:'',disabled:false,hidden:false,style:{},append(){},replaceChildren(){}});
 const nodes=new Map(),host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}};
 let releaseOwner;const ownerCheck=new Promise(resolve=>releaseOwner=resolve);
 try{
  globalThis.document={createElement:node};
  const owner=Keypair.generate().publicKey.toBase58(),agent={id:'expiry',name:'Agent',creator:owner,coin:{name:'Coin',ticker:'FIX'}},requests=[];
  const result={mint:owner,metadataUri:'https://fixture.invalid',simulation:{status:'PASS'},executionReview:{expiresAt:Date.now()+100}};
  globalThis.fetch=async(url,options={})=>{requests.push(options.method??'GET');if(url.endsWith('/status'))return {ok:true,json:async()=>({status:'READY_FOR_REVIEW',walletApprovalOpened:false,result})};if(url==='/api/agents/expiry')return ownerCheck;throw Error('Unexpected transaction operation');};
  mountM4Launch(host,{agent,isCurrent:()=>true,getM4Wallet:()=>{throw Error('No signing allowed');},capability:{m4Target:{owner,agentId:agent.id}}});
  await new Promise(resolve=>setImmediate(resolve));const approval=host.querySelector('[data-approve]').onclick();
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(host.querySelector('[data-prepare]').disabled,true);assert.equal(host.querySelector('[data-approve]').disabled,true);
  assert.match(host.querySelector('[data-status]').textContent,/Review expired during approval/);assert.doesNotMatch(host.querySelector('[data-status]').textContent,/no wallet prompt opened/);
  assert.equal(host.querySelector('[data-check]').hidden,false);releaseOwner({ok:false,status:401});await approval;
  assert.ok(requests.every(method=>method==='GET'));
 }finally{releaseOwner({ok:false,status:401});host.isConnected=false;globalThis.fetch=priorFetch;globalThis.document=priorDocument;}
});
