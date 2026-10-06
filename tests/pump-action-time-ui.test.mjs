import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Keypair,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import {agentLaunchData,assertAgentLaunch} from '../src/agent-launch-data.js';
import {FINAL_MESSAGE_POLICY,validateFinalWalletMessage} from '../src/pump-wallet-final.js';
// LOCAL_FIXTURE UI lifecycle; synthetic owner, no RPC and no real wallet.
async function fixture({failedStatus=false,reject=false,initial='NOT_STARTED',closeDuringPrepare=false}={}){
 const owner=Keypair.generate(),mint=Keypair.generate(),agent={id:'fixture',name:'Agent',creator:owner.publicKey.toBase58(),coin:{name:'Coin',ticker:'FIX'}};
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true}],data:Buffer.alloc(0)}));
 const bytes=tx.serialize({requireAllSignatures:false}).toString('base64'),result={transactionBase64:bytes,mint:mint.publicKey.toBase58(),metadataUri:'https://fixture.invalid',createdAt:'fixture',simulation:{status:'PASS'},executionReview:{version:2,digest:'fixture',reviewedDebitLamports:5500000,networkFeeLamports:20000,otherRequiredDebitLamports:5480000,ceilingLamports:10000000}};
 const node=()=>({textContent:'',disabled:false,style:{},children:[],append(...c){this.children.push(...c);},replaceChildren(){this.children=[];}}),nodes=new Map(),host={isConnected:true,innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);}};
 let state={status:initial,...(initial==='NOT_STARTED'?{}:{executionId:'existing',result})},signs=0,failStatus=failedStatus;const requests=[];
 const context={Buffer,Transaction,FINAL_MESSAGE_POLICY,validateFinalWalletMessage,agentLaunchData,assertAgentLaunch,AbortSignal,crypto,Date,document:{createElement:node},validatePreparation:async()=>{},assertActionTimeHandoff(){},setTimeout(){throw Error('Unexpected polling');},fetch:async(url,opts={})=>{
  const action=url.split('/').at(-1);requests.push({action,method:opts.method??'GET'});if(url==='/api/agents/fixture')return {ok:true,json:async()=>agent};
  if(action==='wallet-status'){if(failStatus)throw Error('offline');return {ok:true,json:async()=>state};}
  if(action==='estimate')return {ok:true,json:async()=>({result})};
  if(action==='wallet-prepare'){state={status:'AWAITING_WALLET_APPROVAL',executionId:'fresh',result,walletTransactionBase64:bytes,walletValidity:{}};if(closeDuringPrepare)host.isConnected=false;return {ok:true,json:async()=>state};}
  if(action==='reject'){state={...state,status:'USER_REJECTED'};return {ok:true,json:async()=>state};}
  if(action==='submit'){state={...state,status:'SIGNED_NOT_BROADCAST',error:'M4_BLOCKHASH_EXPIRED',signature:'synthetic',broadcastAttempted:false};return {ok:true,json:async()=>state};}
  throw Error('Unexpected '+action);
 }};
 vm.runInNewContext(readFileSync('src/pump-action-time-ui.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,''),context);
 context.mountM4ActionTimeLaunch(host,{agent,isCurrent:()=>host.isConnected,capability:{m4Target:{owner:agent.creator,agentId:agent.id}},getM4Wallet:()=>({assertBound(){},async signTransaction(raw){signs++;if(reject)throw Object.assign(Error('User rejected'),{code:4001,walletRequestOpened:true});const t=Transaction.from(Buffer.from(raw,'base64'));t.partialSign(owner);return t.serialize({requireAllSignatures:false}).toString('base64');}})});
 await new Promise(r=>setImmediate(r));return {host,requests,signs:()=>signs,setFailure:v=>failStatus=v,q:s=>host.querySelector('[data-'+s+']')};
}
test('initial failed state disables actions without render exception; successful recheck unlocks',async()=>{const f=await fixture({failedStatus:true});assert.equal(f.q('approve').disabled,true);assert.equal(f.q('prepare').disabled,true);assert.match(f.q('status').textContent,/unavailable/);f.setFailure(false);await f.q('check').onclick();assert.equal(f.q('approve').disabled,false);assert.equal(f.signs(),0);});
test('cost review does not open wallet; explicit double Continue prepares and signs once; native expiry remains unsent',async()=>{const f=await fixture();await f.q('prepare').onclick();assert.equal(f.signs(),0);assert.equal(f.requests.filter(r=>r.action==='wallet-prepare').length,0);await Promise.all([f.q('approve').onclick(),f.q('approve').onclick()]);assert.equal(f.signs(),1);assert.equal(f.requests.filter(r=>r.action==='wallet-prepare').length,1);assert.equal(f.requests.filter(r=>r.action==='submit').length,1);assert.match(f.q('status').textContent,/TRANSACTION EXPIRED — PREPARE AGAIN/);assert.equal(f.q('prepare').disabled,true);assert.equal(f.q('approve').textContent,'Prepare Again');});
test('wallet rejection has no submit or automatic second prepare',async()=>{const f=await fixture({reject:true});await f.q('approve').onclick();assert.equal(f.signs(),1);assert.equal(f.requests.filter(r=>r.action==='reject').length,1);assert.equal(f.requests.filter(r=>r.action==='submit').length,0);assert.equal(f.requests.filter(r=>r.action==='wallet-prepare').length,1);});
test('reload in claimed awaiting state never reopens wallet',async()=>{const f=await fixture({initial:'AWAITING_WALLET_APPROVAL'});assert.equal(f.q('approve').disabled,true);await f.q('approve').onclick();assert.equal(f.signs(),0);assert.equal(f.requests.filter(r=>r.method==='POST').length,0);});
test('closed dialog after final preparation prevents wallet handoff',async()=>{const f=await fixture({closeDuringPrepare:true});await f.q('approve').onclick();assert.equal(f.signs(),0);assert.equal(f.requests.filter(r=>r.action==='submit').length,0);});
