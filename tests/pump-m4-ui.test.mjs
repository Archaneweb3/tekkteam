import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {agentLaunchData,assertAgentLaunch} from '../src/agent-launch-data.js';
import {mountM4Launch} from '../src/pump-m4-ui.js';
import {assertM4ReviewLifetime} from '../src/pump-review-lifetime.js';

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

test('late signed submission displays its exact refusal and never enters confirmation polling',async()=>{
 // LOCAL_FIXTURE UI lifecycle: synthetic keys, no RPC and no transaction transport.
 const owner=Keypair.generate(),mint=Keypair.generate(),agent={id:'late',name:'Agent',creator:owner.publicKey.toBase58(),coin:{name:'Coin',ticker:'FIX'}};
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)}));
 const unsigned=tx.serialize({requireAllSignatures:false}).toString('base64');tx.partialSign(mint);const partial=tx.serialize({requireAllSignatures:false}).toString('base64');
 const startedAt=Date.now(),result={mint:mint.publicKey.toBase58(),transactionBase64:unsigned,simulation:{status:'PASS'},executionReview:{startedAt,expiresAt:startedAt+30000,digest:'fixture'}};
 const node=()=>({textContent:'',disabled:false,hidden:false,style:{},append(){},replaceChildren(){}}),nodes=new Map(),host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}};
 const requests=[];let signatures=0,polls=0;
 const context={Buffer,Transaction,agentLaunchData,assertAgentLaunch,assertM4ReviewLifetime,AbortSignal,crypto,Date,document:{createElement:node},clearTimeout(){},setTimeout(fn,ms){if(ms===5000||ms===2000){polls++;throw Error('A stopped execution must not poll');}return 1;},validatePreparation:async r=>{assert.equal(r,result);},fetch:async(url,options={})=>{
  const action=url.split('/').at(-1);requests.push({action,method:options.method??'GET'});
  if(url==='/api/agents/late')return {ok:true,json:async()=>agent};
  if(action==='status')return {ok:true,json:async()=>({status:'READY_FOR_REVIEW',executionId:'fixture',walletApprovalOpened:false,result})};
  if(action==='prepare'){const body=JSON.parse(options.body);assert.equal(body.replaceExecutionId,'fixture');return {ok:true,json:async()=>({status:'READY_FOR_REVIEW',executionId:body.requestId,result,walletApprovalOpened:false})};}
  if(action==='review')return {ok:true,json:async()=>({status:'AWAITING_WALLET_APPROVAL',executionId:JSON.parse(options.body).requestId,result,walletApprovalOpened:true,walletTransactionBase64:partial})};
  if(action==='submit')return {ok:true,json:async()=>({status:'SIGNED_NOT_BROADCAST',signature:'local-fixture-signature',error:'EXECUTION_REVIEW_EXPIRED',broadcastAttempted:false,walletApprovalOpened:true,result})};
  throw Error('Unexpected operation');
 }};
 const source=readFileSync('src/pump-m4-ui.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');vm.runInNewContext(source,context);
 context.mountM4Launch(host,{agent,isCurrent:()=>true,getM4Wallet:()=>({assertBound(){},async signTransaction(bytes){signatures++;const signed=Transaction.from(Buffer.from(bytes,'base64'));signed.partialSign(owner);return signed.serialize().toString('base64');}}),capability:{m4Target:{owner:agent.creator,agentId:agent.id}}});
 await new Promise(resolve=>setImmediate(resolve));await host.querySelector('[data-approve]').onclick();
 assert.equal(signatures,1);assert.equal(polls,0);assert.equal(requests.filter(r=>r.action==='status').length,1);assert.equal(requests.filter(r=>r.action==='submit').length,1);
 assert.match(host.querySelector('[data-status]').textContent,/Owner signed.*Broadcast prevented/);assert.equal(host.querySelector('[data-error]').textContent,'EXECUTION_REVIEW_EXPIRED');
 assert.equal(host.querySelector('[data-prepare]').disabled,true);assert.equal(host.querySelector('[data-approve]').disabled,true);assert.equal(host.querySelector('[data-check]').hidden,false);host.isConnected=false;
});

test('non-JSON rate-limit failure reports HTTP status without transaction operations',async()=>{
 const priorFetch=globalThis.fetch,priorDocument=globalThis.document,node=()=>({textContent:'',disabled:false,hidden:false,style:{},append(){},replaceChildren(){}}),nodes=new Map(),host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}};
 try{
  globalThis.document={createElement:node};globalThis.fetch=async(url,options={})=>{assert.equal(options.method,'GET');return {ok:false,status:429,json:async()=>{throw SyntaxError('Too many requests');}};};
  const owner=Keypair.generate().publicKey.toBase58(),agent={id:'rate',name:'Agent',creator:owner,coin:{name:'Coin',ticker:'FIX'}};
  mountM4Launch(host,{agent,isCurrent:()=>true,getM4Wallet:()=>{throw Error('Must not sign');},capability:{m4Target:{owner,agentId:agent.id}}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(host.querySelector('[data-error]').textContent,'Launch service unavailable (HTTP 429)');
 }finally{host.isConnected=false;globalThis.fetch=priorFetch;globalThis.document=priorDocument;}
});

test('pending JIT owner check keeps controls locked without advancing any transaction request',async()=>{
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
  assert.doesNotMatch(host.querySelector('[data-status]').textContent,/AWAITING_WALLET_APPROVAL/);releaseOwner({ok:false,status:401});await approval;
  assert.ok(requests.every(method=>method==='GET'));
 }finally{releaseOwner({ok:false,status:401});host.isConnected=false;globalThis.fetch=priorFetch;globalThis.document=priorDocument;}
});
