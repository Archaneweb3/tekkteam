import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {pumpAccountFixture,fixtureWallet,fixtureBlockhash} from './pump-account-fixture.mjs';
import {inspectFirstBuyReadOnly,firstBuyReadOnlyRpc} from '../tools/pump-first-buy-readonly.mjs';
import {GENESIS} from '../src/pump-readiness.js';
test('read-only probe uses one coherent account context and exact message fee, never simulates or signs',async()=>{
 const raw=await pumpAccountFixture(),slot=100,seen=[],at=1000000;
 const binding={agentId:raw.agent.id,owner:raw.agent.creator,mint:raw.receipt.mint,agentWallet:fixtureWallet.toBase58(),network:'solana:101',receiptSignature:raw.receipt.signature,receiptExecutionId:'fixture-receipt',pending:[],executionAllowed:false};
 const receipt={...raw.receipt,executionId:binding.receiptExecutionId,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 const rpc=async(method,args)=>{seen.push([method,args]);
  if(method==='getGenesisHash')return GENESIS;
  if(method==='getMultipleAccounts')return {context:{slot},value:args[0].map(key=>{const a=Object.values(raw.accounts).find(a=>a.address===key);return a?{owner:a.owner,executable:false,lamports:1000000,data:[a.data.toString('base64'),'base64']}:null;})};
  if(method==='getLatestBlockhash')return {context:{slot},value:{blockhash:fixtureBlockhash,lastValidBlockHeight:1000}};
  if(method==='getMinimumBalanceForRentExemption')return 1000000+args[0]*100;
  if(method==='getFeeForMessage')return {context:{slot},value:5000};throw Error('Unexpected method');
 };
 const originalOwner=binding.owner,originalWallet=binding.agentWallet;
 const pending=inspectFirstBuyReadOnly({rpc,binding,receipt,now:()=>at});binding.agentWallet=new PublicKey(Buffer.alloc(32,1)).toBase58();receipt.owner=binding.agentWallet;
 const report=await pending;binding.agentWallet=originalWallet;receipt.owner=originalOwner;
 assert.equal(report.costs.agentWallet,originalWallet);
 assert.equal(report.genesis,GENESIS);assert.equal(report.costs.walletLamports,'0');assert.equal(report.instructionCount,2);assert.equal(report.transactionSigned,false);assert.equal(report.broadcast,false);
 assert.equal(seen.filter(r=>r[0]==='getMultipleAccounts').length,2);assert.equal(report.costs.networkFeeLamports,'5000');assert.equal(report.costs.executable,false);
 assert.equal(seen.some(r=>/simulate|send|sign/.test(r[0])),false);
 await assert.rejects(inspectFirstBuyReadOnly({rpc,binding:{...binding,pending:[{status:'UNKNOWN'}]},receipt,now:()=>at}),/CANONICAL_BINDING/);
 await assert.rejects(inspectFirstBuyReadOnly({rpc:async()=>new PublicKey(Buffer.alloc(32,1)).toBase58(),binding,receipt,now:()=>at}),/GENESIS/);
});
test('transport rejects all non-read allowlist calls without invoking request and sanitizes provider errors',async()=>{
 let calls=0;const rpc=firstBuyReadOnlyRpc('https://tekkteam-fixture.invalid/private',{request:async()=>{calls++;throw Error('secret provider details');}});
 for(const method of ['sendTransaction','simulateTransaction','getTransaction','requestAirdrop'])await assert.rejects(rpc(method,[]),/METHOD_DENIED/);
 assert.equal(calls,0);await assert.rejects(rpc('getGenesisHash',[]),e=>e.message==='FIRST_BUY_RPC_READ_FAILED');assert.equal(calls,1);
});
test('minimum-context retry is bounded and preserves exact message and minimum slot',async()=>{
 const calls=[];let count=0;
 const rpc=firstBuyReadOnlyRpc('https://tekkteam-fixture.invalid',{request:async(_,o)=>{const b=JSON.parse(o.body);calls.push(b);return {ok:true,status:200,json:async()=>({id:b.id,...(++count<3?{error:{code:-32016,message:'redacted-provider-message'}}:{result:{context:{slot:123},value:5000}})})};}});
 const params=['same-message',{commitment:'finalized',minContextSlot:123}];assert.equal((await rpc('getFeeForMessage',params)).value,5000);assert.equal(calls.length,3);assert.ok(calls.every(c=>JSON.stringify(c.params)===JSON.stringify(params)));
 const fail=firstBuyReadOnlyRpc('https://tekkteam-fixture.invalid',{request:async(_,o)=>({ok:true,status:200,json:async()=>({id:JSON.parse(o.body).id,error:{code:-32016,message:'never print endpoint or provider message'}})})});
 await assert.rejects(fail('getFeeForMessage',params),e=>e.message==='FIRST_BUY_RPC_READ_FAILED'&&e.rpcCode===-32016&&e.httpStatus===200);
});
