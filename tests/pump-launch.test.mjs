import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {Keypair,Transaction,PublicKey} from '@solana/web3.js';
import {MintLayout,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {buildCreation,creationAccounts,PAYER,GENESIS} from '../src/pump-readiness.js';
import {validateLaunchEvidence,verifyLaunchTransaction} from '../src/pump-launch-validation.js';
import {createPumpLaunch} from '../server/pump-launch.js';
import {agentLaunchData} from '../src/agent-launch-data.js';
const agent={id:'agent-one',name:'Felix',creator:PAYER,character:'frank',description:'Agent launch',coin:{name:'Felix Token',ticker:'FLX'}};
const identity=agentLaunchData(agent);
const launch={...identity,metadataUri:'https://metadata.example/metadata/agents/agent-one/content.json'};

function evidence(data=launch){
 const original=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url)));
 const mint=Keypair.generate(),accounts=creationAccounts(mint.publicKey,data.owner);
 let json=JSON.stringify(original);
 original.structure.accounts.forEach((a,i)=>{if(a.address!==accounts[i].pubkey.toBase58())json=json.replaceAll(a.address,accounts[i].pubkey.toBase58());});
 const e=JSON.parse(json),tx=buildCreation(mint.publicKey,e.recentBlockhash,data);
 e.launch=data;e.metadataUri=data.metadataUri;
 e.transactionBase64=tx.serialize({requireAllSignatures:false}).toString('base64');
 tx.partialSign(mint);e.walletTransactionBase64=tx.serialize({requireAllSignatures:false}).toString('base64');
 e.createdAt=new Date().toISOString();return e;
}
test('prepared mint signature is valid; payer signature remains required',()=>{
 const e=evidence();assert.equal(validateLaunchEvidence(e).allowed,true);
 assert.ok(verifyLaunchTransaction(e.walletTransactionBase64,e,false));
 assert.throws(()=>verifyLaunchTransaction(e.walletTransactionBase64,e,true),/signatures/);
 const tx=Transaction.from(Buffer.from(e.walletTransactionBase64,'base64'));tx.instructions[0].data[10]^=1;
 assert.throws(()=>verifyLaunchTransaction(tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),e,false),/changed transaction/);
 for(const mutate of [x=>x.chainId='solana:103',x=>x.metadataUri='https://wrong.test',x=>x.simulation.value.accounts[5].lamports-=10000000]){const bad=structuredClone(e);mutate(bad);assert.throws(()=>validateLaunchEvidence(bad));}
});
async function service(t,options={}){
 const e=evidence(),calls={sent:0},journal=join(mkdtempSync(join(tmpdir(),'tekkwork-launch-')),'receipt.json');
 const mintData=Buffer.alloc(MintLayout.span);
 MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
 const connection={getGenesisHash:async()=>GENESIS,getBlockHeight:async()=>e.lastValidBlockHeight-100,getSignatureStatuses:async()=>({value:[{err:null,confirmationStatus:'confirmed'}]}),getAccountInfo:async()=>({data:mintData,owner:TOKEN_2022_PROGRAM_ID,executable:false,lamports:2702560}),getTransaction:async()=>({meta:{err:null,preBalances:[17664446],postBalances:[12152806],fee:10000},transaction:{message:{accountKeys:[new PublicKey(PAYER)]}}}),...options.connection};
 const send=async bytes=>{calls.sent++;if(options.sendError)throw Error('Timeout');const tx=Transaction.from(bytes);return (await import('bs58')).default.encode(tx.signature);};
 const app=createPumpLaunch({journal,prepare:async()=>e,connection,send,getAgent:async id=>({...agent,id}),publishMetadata:async()=>launch.metadataUri,...options.adapters});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const request=(path,body)=>new Promise((resolve,reject)=>{if(body)body={agentId:identity.agentId,agent:identity,...body};if(!body&&!path.includes('?'))path+='?agentId='+identity.agentId;const req=http.request(`http://127.0.0.1:${server.address().port}/pump-launch/${path}`,{method:body?'POST':'GET',headers:{host:'127.0.0.1:4193',origin:'http://127.0.0.1:5188','Content-Type':'application/json'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({code:res.statusCode,data:JSON.parse(data)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 return {e,calls,request,journal,connection};
}
test('one valid submission then confirmation/mint verification; no double send',async t=>{
 const s=await service(t),prepared=await s.request('prepare',{payer:PAYER});assert.equal(prepared.code,200);
 assert.equal(s.calls.sent,0);
 const tx=Transaction.from(Buffer.from(s.e.walletTransactionBase64,'base64'));tx.addSignature(new PublicKey(PAYER),Buffer.alloc(64,7));
 // Test-only payer signature substitute: the real wallet secret is never available to tests.
 const verify=t.mock.method(Transaction.prototype,'verifySignatures',()=>true);
 t.mock.method(Transaction.prototype,'_getMessageSignednessErrors',()=>undefined);
 const body={id:prepared.data.id,transaction:tx.serialize({verifySignatures:false}).toString('base64')};
 assert.equal((await s.request('submit',body)).code,200);assert.equal(s.calls.sent,1);
 assert.equal((await s.request('submit',body)).code,409);assert.equal(s.calls.sent,1);
 verify.mock.restore();
 const status=await s.request('status');assert.equal(status.data.status,'Success');assert.equal(status.data.observedSpendLamports,5511640);assert.equal(status.data.mint,s.e.mint);
 assert.equal((await s.request('prepare',{payer:PAYER})).code,409);
 const restart=createPumpLaunch({journal:s.journal,connection:s.connection,send:()=>assert.fail('Restart must not broadcast')});assert.ok(restart);
});
test('unsigned/rejected request and altered message never broadcast',async t=>{
 const s=await service(t),p=await s.request('prepare',{payer:PAYER});
 assert.equal((await s.request('submit',{id:p.data.id,transaction:s.e.walletTransactionBase64})).code,400);
 const tx=Transaction.from(Buffer.from(s.e.walletTransactionBase64,'base64'));tx.instructions[0].data[9]^=1;
 assert.equal((await s.request('submit',{id:p.data.id,transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')})).code,400);
 assert.equal(s.calls.sent,0);
});
test('ambiguous network send is latched; confirmation check never resends',async t=>{
 const s=await service(t,{sendError:true}),p=await s.request('prepare',{payer:PAYER});
 const tx=Transaction.from(Buffer.from(s.e.walletTransactionBase64,'base64'));tx.addSignature(new PublicKey(PAYER),Buffer.alloc(64,8));t.mock.method(Transaction.prototype,'verifySignatures',()=>true);t.mock.method(Transaction.prototype,'_getMessageSignednessErrors',()=>undefined);
 const body={id:p.data.id,transaction:tx.serialize({verifySignatures:false}).toString('base64')};
 const result=await s.request('submit',body);assert.match(result.data.notice,/unknown/);
 await s.request('status');await s.request('submit',body);assert.equal(s.calls.sent,1);
});
test('wrong mainnet endpoint blocks preparation',async t=>{
 const s=await service(t,{connection:{getGenesisHash:async()=>'devnet'}});assert.equal((await s.request('prepare',{payer:PAYER})).code,400);assert.equal(s.calls.sent,0);
});

test('explicit reprepare invalidates old ID; review latches against replacement',async t=>{
 const s=await service(t),a=await s.request('prepare',{payer:PAYER,initialBuy:'0'});
 const b=await s.request('prepare',{payer:PAYER,initialBuy:'0',replacePreparationId:a.data.id});assert.equal(b.code,200);assert.notEqual(b.data.id,a.data.id);
 assert.equal((await s.request('submit',{id:a.data.id,transaction:s.e.walletTransactionBase64})).code,409);
 assert.equal((await s.request('review',{id:b.data.id,initialBuy:'0.1'})).code,400);
 assert.equal((await s.request('review',{id:b.data.id,initialBuy:'0'})).code,200);
 assert.equal((await s.request('prepare',{payer:PAYER,replacePreparationId:b.data.id})).code,409);assert.equal(s.calls.sent,0);
});

test('agent parameterization preserves instruction structure and rejects identity substitution',()=>{
 const e=evidence({...launch,owner:Keypair.generate().publicKey.toBase58(),name:'Another Token',symbol:'OTHER'});
 assert.equal(validateLaunchEvidence(e).allowed,true);
 const tx=Transaction.from(Buffer.from(e.transactionBase64,'base64'));
 assert.equal(tx.instructions.length,1);assert.equal(tx.feePayer.toBase58(),e.launch.owner);
 for(const field of ['name','symbol','owner','metadataUri']){
  const changed=structuredClone(e);changed.launch[field]=field==='owner'?PAYER:'incorrect';
  assert.throws(()=>validateLaunchEvidence(changed));
 }
});
test('receipts stay keyed by agent; cross-agent submit and mismatched identity stop',async t=>{
 const s=await service(t);const p=await s.request('prepare',{payer:PAYER});assert.equal(p.code,200);
 assert.equal((await s.request('status?agentId=agent-two')).data.status,'Idle');
 assert.equal((await s.request('submit',{agentId:'agent-two',id:p.data.id,transaction:s.e.walletTransactionBase64})).code,409);
 assert.equal((await s.request('prepare',{agentId:'agent-two',payer:PAYER,agent:{...identity,agentId:'agent-two',name:'Wrong'}})).code,400);
 const disk=JSON.parse(readFileSync(s.journal));assert.equal(disk.receipts['agent-one'].agentId,'agent-one');assert.equal(disk.receipts['agent-two'],undefined);assert.equal(s.calls.sent,0);
});
test('missing public metadata or changed prepared identity blocks launch',async t=>{
 for(const adapters of [{publishMetadata:async()=>{throw Error('Metadata unavailable');}},{prepare:async()=>evidence({...launch,agentId:'another-agent'})}]){
  const s=await service(t,{adapters});assert.equal((await s.request('prepare',{payer:PAYER})).code,400);assert.equal(s.calls.sent,0);
 }
});
