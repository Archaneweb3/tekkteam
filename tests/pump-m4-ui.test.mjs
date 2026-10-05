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
