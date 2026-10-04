import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {Keypair,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {createPumpFinalizedReader} from '../server/dex/pump-finalized-reader.js';
import {GENESIS} from '../src/pump-readiness.js';
import {digest} from '../server/dex/intent.js';

// Mock the native HTTPS boundary before the factory captures it. No socket,
// DNS, production configuration or real RPC is used by this isolated worker.
const originalRequest=https.request,calls=[];
let scenario={};
https.request=(url,options,callback)=>{
 const req=new EventEmitter();
 req.destroy=()=>{req.destroyed=true;};
 req.end=body=>{
  const parsed=body===undefined?null:JSON.parse(body);
  calls.push({url:String(url),method:options.method,body:parsed,req});
  if(scenario.silent)return;
  queueMicrotask(()=>{
   if(scenario.socketError){req.emit('error',Object.assign(Error('private-provider-marker'),{code:'PRIVATE_ERROR'}));return;}
   const res=new EventEmitter();res.statusCode=scenario.status??200;res.headers={};res.resume=()=>{};
   callback(res);
   if(res.statusCode!==200)return;
   const envelope={jsonrpc:'2.0',id:parsed.id,result:scenario.results?.[parsed.method]??null};
   if(scenario.rpcError){delete envelope.result;envelope.error={code:-32005,message:'private-provider-marker'};}
   if(scenario.wrongId)envelope.id++;
   if(scenario.noResult)delete envelope.result;
   if(scenario.oversized){res.emit('data',Buffer.alloc(24*1024*1024+1));return;}
   res.emit('data',Buffer.from(scenario.invalidJson?'private-provider-marker':JSON.stringify(envelope)));
   res.emit('end');
  });
 };
 return req;
};
after(()=>{https.request=originalRequest;});
const {createLaunchPreparationTransport,FINALITY_RPC_METHODS}=await import('../server/launch-preparation-transport.js?finality-test');
const signature=bs58.encode(Buffer.alloc(64,1));
const config={rpcUrl:'https://rpc.example.test/?api-key=private-provider-marker',origin:'https://staging.example.test'};
const target={owner:'owner',agentId:'agent',initialBuyLamports:0,ceilingLamports:10000000};
const make=()=>{calls.length=0;scenario={};return createLaunchPreparationTransport({...config,finalityOnly:true});};
const transactionParams=[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}];

test('explicit finality mode exposes only frozen provider and read RPC capabilities',()=>{
 const transport=make();
 assert.deepEqual(Object.keys(transport).sort(),['provider','rpc']);assert(Object.isFrozen(transport));
 assert.equal(transport.provider,'rpc.example.test');
 assert.deepEqual(FINALITY_RPC_METHODS,['getGenesisHash','getSignatureStatuses','getTransaction']);assert(Object.isFrozen(FINALITY_RPC_METHODS));
 assert.equal(calls.length,0);
});

test('default preparation and target-bound M4 capabilities remain separate',async()=>{
 make();const plain=createLaunchPreparationTransport(config),m4=createLaunchPreparationTransport({...config,m4Target:target});
 assert.equal(typeof plain.publicRequest,'function');assert.equal('submitOnce'in plain,false);
 assert.equal(typeof m4.publicRequest,'function');assert.equal(typeof m4.submitOnce,'function');
 for(const method of ['getSignatureStatuses','getTransaction','sendTransaction'])await assert.rejects(plain.rpc(method,transactionParams),{code:'PREPARATION_RPC_METHOD_DENIED'});
 await assert.rejects(m4.rpc('sendTransaction',[]),{code:'PREPARATION_RPC_METHOD_DENIED'});
 await assert.rejects(m4.submitOnce('unsigned',signature),{code:'M4_SEND_AUTHORITY_REQUIRED'});
 assert.equal(calls.length,0);
});

test('mode is boolean, default-off, and cannot coexist with a broadcast target',()=>{
 for(const finalityOnly of [1,'true',null,{},[]])assert.throws(()=>createLaunchPreparationTransport({...config,finalityOnly}),{code:'FINALITY_TRANSPORT_MODE_INVALID'});
 assert.throws(()=>createLaunchPreparationTransport({...config,finalityOnly:true,m4Target:target}),{code:'FINALITY_TRANSPORT_MODE_INVALID'});
 assert.throws(()=>createLaunchPreparationTransport({...config,m4Target:{...target,initialBuyLamports:1}}),{code:'M4_TARGET_INVALID'});
});

test('allowed reads send exact bounded JSON-RPC options and capture caller params before await',async()=>{
 const transport=make();scenario.results={getGenesisHash:GENESIS,getSignatureStatuses:{context:{slot:101},value:[null]},getTransaction:null};
 assert.equal(await transport.rpc('getGenesisHash',[]),GENESIS);
 const params=[[signature],{searchTransactionHistory:true}],pending=transport.rpc('getSignatureStatuses',params);
 params[0][0]='mutated-after-call';params[1].searchTransactionHistory=false;
 assert.deepEqual(await pending,{context:{slot:101},value:[null]});
 assert.equal(await transport.rpc('getTransaction',transactionParams),null);
 assert.deepEqual(calls.map(c=>c.body),[
  {jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]},
  {jsonrpc:'2.0',id:2,method:'getSignatureStatuses',params:[[signature],{searchTransactionHistory:true}]},
  {jsonrpc:'2.0',id:3,method:'getTransaction',params:transactionParams}
 ]);assert(calls.every(c=>c.method==='POST'));
});

for(const method of ['sendTransaction','sendRawTransaction','requestAirdrop','simulateTransaction','getMultipleAccounts','getBalance','getBlockHeight','getLatestBlockhash','getSignaturesForAddress','getFeeForMessage'])test(`finality denies ${method} before any HTTPS request`,async()=>{
 const transport=make();await assert.rejects(transport.rpc(method,[]),{code:'PREPARATION_RPC_METHOD_DENIED'});assert.equal(calls.length,0);
});

test('status reads require exactly one canonical nonzero 64-byte signature and history true',async()=>{
 const transport=make();
 for(const params of [undefined,{},[],[[signature]],[[signature,signature],{searchTransactionHistory:true}],[[signature],{searchTransactionHistory:false}],[[signature],{searchTransactionHistory:true,extra:1}],[[signature],{searchTransactionHistory:true},1],[[bs58.encode(Buffer.alloc(64))],{searchTransactionHistory:true}],[[bs58.encode(Buffer.alloc(63,1))],{searchTransactionHistory:true}],[['0x1234'],{searchTransactionHistory:true}],[[signature],[]]])await assert.rejects(transport.rpc('getSignatureStatuses',params),{code:'FINALITY_RPC_OPTIONS_DENIED'});
 assert.equal(calls.length,0);
});

test('transaction reads require finalized base64 V0 with no extra options or arguments',async()=>{
 const transport=make();
 for(const params of [[],[signature],['0x1234',transactionParams[1]],[signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}],[signature,{encoding:'base64',commitment:'confirmed',maxSupportedTransactionVersion:0}],[signature,{encoding:'base64',commitment:'finalized'}],[signature,{...transactionParams[1],maxSupportedTransactionVersion:1}],[signature,{...transactionParams[1],extra:1}],[...transactionParams,1]])await assert.rejects(transport.rpc('getTransaction',params),{code:'FINALITY_RPC_OPTIONS_DENIED'});
 for(const params of [undefined,{},[1]])await assert.rejects(transport.rpc('getGenesisHash',params),{code:'FINALITY_RPC_OPTIONS_DENIED'});
 assert.equal(calls.length,0);
});

test('wire params are canonical copies immune to caller toJSON and repeated getter mutation',async()=>{
 const transport=make(),params=[[signature],{searchTransactionHistory:true}];
 Object.defineProperty(params,'toJSON',{value:()=>[[signature,signature],{searchTransactionHistory:false}]});
 Object.defineProperty(params[0],'toJSON',{value:()=>['0x1234']});
 Object.defineProperty(params[1],'toJSON',{value:()=>({searchTransactionHistory:false})});
 await transport.rpc('getSignatureStatuses',params);
 assert.deepEqual(calls[0].body.params,[[signature],{searchTransactionHistory:true}]);
 let reads=0;const options={encoding:'base64',commitment:'finalized'};
 Object.defineProperty(options,'maxSupportedTransactionVersion',{enumerable:true,get(){return reads++===0?0:99;}});
 await transport.rpc('getTransaction',[signature,options]);
 assert.deepEqual(calls[1].body.params,transactionParams);assert.equal(reads,1);
});

test('inherited required fields and throwing accessors/proxies fail before HTTPS with fixed error',async()=>{
 const transport=make(),inherited=Object.assign(Object.create({searchTransactionHistory:true}),{extra:true});
 const throwing=Object.defineProperty({},'searchTransactionHistory',{enumerable:true,get(){throw Error('private-provider-marker');}});
 const proxy=new Proxy({searchTransactionHistory:true},{ownKeys(){throw Error('private-provider-marker');}});
 for(const options of [inherited,throwing,proxy])await assert.rejects(transport.rpc('getSignatureStatuses',[[signature],options]),e=>e.code==='FINALITY_RPC_OPTIONS_DENIED'&&!e.stack.includes('private-provider-marker'));
 assert.equal(calls.length,0);
});

test('existing tracked reader works through finality-only factory without send capability',async()=>{
 const transport=make(),signer=Keypair.fromSeed(Buffer.alloc(32,181)),other=Keypair.fromSeed(Buffer.alloc(32,182));
 const message=new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:other.publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:other.publicKey,lamports:1})]}).compileToV0Message(),tx=new VersionedTransaction(message);
 const plan={source:'LOCAL_FIXTURE',venueKind:'PUMP_BONDING_CURVE',snapshotSlot:100,unsignedTransaction:Buffer.from(tx.serialize()).toString('base64'),messageHash:createHash('sha256').update(message.serialize()).digest('hex')};
 tx.sign([signer]);const sig=bs58.encode(tx.signatures[0]),intent={network:'solana:101',genesis:GENESIS,agentWallet:signer.publicKey.toBase58()};
 const record={id:'local-transport-reader',status:'UNKNOWN',source:'LOCAL_FIXTURE',signature:sig,intent,plan,planDigest:digest(plan),fingerprint:digest(intent)};
 scenario.results={getGenesisHash:GENESIS,getSignatureStatuses:{context:{slot:102},value:[{slot:101,confirmationStatus:'finalized',confirmations:null,err:null}]},getTransaction:{slot:101,blockTime:null,version:0,transaction:[Buffer.from(tx.serialize()).toString('base64'),'base64'],meta:{err:null,fee:5000}}};
 const observation=await createPumpFinalizedReader({rpc:transport.rpc})(sig,record);
 assert.equal(observation.source,'LOCAL_FIXTURE');assert.equal(observation.authorizationGranted,false);assert.equal(observation.venueExecutionQualified,false);
 assert.equal(record.status,'UNKNOWN');assert.equal(observation.slot,101);assert.equal(calls.length,3);assert.equal('submitOnce'in transport,false);
 // Synthetic signed bytes verify transport binding only, never a Real receipt.
});

for(const status of [401,403,429])test(`HTTP ${status} remains bounded and sanitized without retry`,async()=>{
 const transport=make();scenario.status=status;
 await assert.rejects(transport.rpc('getGenesisHash',[]),e=>e.code==='PREPARATION_HTTP_FAILED'&&e.httpStatus===status&&!e.stack.includes('private-provider-marker'));
 assert.equal(calls.length,1);
});
for(const [name,setup,code]of [['provider RPC error',{rpcError:true},'PREPARATION_RPC_ERROR'],['wrong id',{wrongId:true},'PREPARATION_RPC_RESPONSE_INVALID'],['missing result',{noResult:true},'PREPARATION_RPC_RESPONSE_INVALID'],['bad JSON',{invalidJson:true},'PREPARATION_RPC_RESPONSE_INVALID'],['socket failure',{socketError:true},'PREPARATION_UNREACHABLE'],['oversized body',{oversized:true},'PREPARATION_RESPONSE_TOO_LARGE']])test(`${name} cannot leak provider content or trigger retry`,async()=>{
 const transport=make();scenario=setup;
 await assert.rejects(transport.rpc('getGenesisHash',[]),e=>e.code===code&&!e.stack.includes('private-provider-marker')&&!JSON.stringify(e).includes('private-provider-marker'));
 assert.equal(calls.length,1);
});

test('read-only transport retains existing 20-second request deadline',async t=>{
 const transport=make();scenario.silent=true;t.mock.timers.enable({apis:['setTimeout']});
 const pending=transport.rpc('getGenesisHash',[]),rejected=assert.rejects(pending,{code:'PREPARATION_TIMEOUT'});
 t.mock.timers.tick(20000);await rejected;
 assert.equal(calls.length,1);assert.equal(calls[0].req.destroyed,true);t.mock.timers.reset();
});
