import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,readdirSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Transaction} from '@solana/web3.js';
import {createPumpLaunchPreparation,readAtMinimumContext} from '../server/pump-launch-preparation.js';
import {createLaunchPreparationTransport,PREPARATION_IDL} from '../server/launch-preparation-transport.js';
import {createPreparationEvidenceWriter} from '../server/preparation-evidence.js';
import {createPreparationDiagnosticWriter} from '../server/pump-preparation-diagnostics.js';
import {walletTestConfig,walletTestRoute,preparationCapabilities} from '../server/wallet-test-policy.js';
import {validatePreparation} from '../src/pump-preparation-ui.js';
import {GENESIS,PAYER,inspectCreation} from '../src/pump-readiness.js';
import {fixtureAtomicBalances} from './pump-atomic-fixture.mjs';
import {COMPUTE_BUDGET} from '../src/pump-fee-policy.js';
// Derived local fixtures only; not evidence of a new Mainnet simulation or human owner.
const original=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url))),idl=JSON.parse(readFileSync(new URL('../node_modules/@pump-fun/pump-sdk/src/idl/pump.json',import.meta.url)));
const identity={agentId:'LOCAL_FIXTURE',agentName:'Fixture Agent',name:'Fixture Coin',symbol:'FIX',description:'Fixture',character:'frank',owner:PAYER,image:'https://fixture.example/metadata/agents/LOCAL_FIXTURE/'+'a'.repeat(64)+'.png'};
function fixture({wrongGenesis=false,failSimulation=false,now=Date.now,readPreparation,executionReview=false,explicitM4Fees=false,captureDiagnostics,mutateSimulation}={}){
 const calls=[];let addresses,remapped;
 const transport={provider:'fixture.invalid',publicRequest:async url=>{assert.equal(url,PREPARATION_IDL);return {json:async()=>idl};},rpc:async(method,params)=>{
  calls.push(method);
  if(method==='getGenesisHash')return wrongGenesis?'WRONG':GENESIS;
  if(method==='getLatestBlockhash')return {context:{slot:original.before.context.slot},value:{blockhash:original.recentBlockhash,lastValidBlockHeight:original.lastValidBlockHeight}};
  if(method==='getRecentPrioritizationFees'){assert.equal(explicitM4Fees,true);assert.deepEqual(params[0],original.structure.accounts.filter(a=>a.writable).map(a=>addresses[original.structure.accounts.findIndex(e=>e.name===a.name)]));return [{slot:original.before.context.slot,prioritizationFee:125001}];}
  if(method==='getFeeForMessage'){const tx=Transaction.populate((await import('@solana/web3.js')).Message.from(Buffer.from(params[0],'base64')));if(explicitM4Fees){assert.equal(tx.instructions.length,3);assert.equal(tx.instructions[0].programId.toBase58(),COMPUTE_BUDGET);assert.equal(tx.instructions[1].data.readBigUInt64LE(1),125001n);}return {context:{slot:original.before.context.slot},value:original.feeQuote.value+(explicitM4Fees?25001:0)};}
  if(method==='isBlockhashValid')return {context:{slot:Math.max(original.before.context.slot,params[1]?.minContextSlot??0)},value:true};
  if(method==='getMinimumBalanceForRentExemption')return original.rent.find(a=>a.dataLength===params[0]).minimumRentExemptionLamports;
  if(method==='getMultipleAccounts'){
   if(!addresses){addresses=params[0];let json=JSON.stringify(original);original.structure.accounts.forEach((a,i)=>{if(a.address!==addresses[i])json=json.replaceAll(a.address,addresses[i]);});remapped=JSON.parse(json,(k,v)=>k==='data'&&typeof v==='object'&&typeof v?.sha256==='string'&&Number.isSafeInteger(v?.length)?[Buffer.alloc(v.length).toString('base64'),'base64']:v);}
   if(explicitM4Fees&&params[0].length===17&&addresses.length===16){addresses=params[0];assert.equal(addresses[16],COMPUTE_BUDGET);const p={owner:'NativeLoader1111111111111111111111111111111',executable:true,lamports:1,data:['','base64']};remapped.before.value.push(structuredClone(p));remapped.afterRead.value.push(structuredClone(p));remapped.simulation.value.accounts.push(structuredClone(p));remapped.simulation.value.accounts[5].lamports-=25001;remapped.simulation.value.logs.unshift(`Program ${COMPUTE_BUDGET} invoke [1]`,`Program ${COMPUTE_BUDGET} success`,`Program ${COMPUTE_BUDGET} invoke [1]`,`Program ${COMPUTE_BUDGET} success`);for(const g of remapped.simulation.value.innerInstructions)g.index+=2;}
   const response=structuredClone(calls.filter(x=>x==='getMultipleAccounts').length<=2?remapped.before:remapped.afterRead);response.context.slot=Math.max(response.context.slot,params[1]?.minContextSlot??0);return response;
  }
  if(method==='simulateTransaction'){assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);const bytes=Buffer.from(params[0],'base64'),tx=Transaction.from(bytes);assert.ok(tx.signatures.every(x=>x.signature===null));const simulation=structuredClone(remapped.simulation);const structure={accounts:addresses.map(address=>({address}))};fixtureAtomicBalances(bytes,structure,remapped.before,simulation,10000+(explicitM4Fees?25001:0));if(explicitM4Fees)assert.equal(params[1].accounts.addresses.length,17);if(failSimulation)simulation.value.err={InstructionError:[0,'InsufficientFunds']};mutateSimulation?.(simulation);return simulation;}
  assert.fail('Forbidden/unexpected RPC '+method);
 }};
 return {calls,prepare:createPumpLaunchPreparation({transport,publishMetadata:async()=> 'https://fixture.example/'+'b'.repeat(43),now,readPreparation,executionReview,explicitM4Fees,captureDiagnostics})};
}

test('actual M4 producer quotes scoped writable accounts and reviews the entire explicit-fee message/17 accounts',async()=>{
 const f=fixture({executionReview:true,explicitM4Fees:true}),r=await f.prepare(identity,'0',crypto.randomUUID());
 assert.equal(r.instructionCount,3);assert.equal(r.computeBudgetInstructionCount,2);assert.equal(r.structure.accounts.length,17);assert.equal(r.policy.baseFeeLamports,10000);assert.equal(r.policy.priorityFeeLamports,25001);assert.equal(r.policy.networkFeeLamports,35001);assert.equal(r.executionReview.networkFeeLamports,35001);assert.equal(r.executionReview.atomicBalanceEvidence.accounts.length,17);assert.equal(r.executionReview.reviewedDebitLamports,r.executionReview.otherRequiredDebitLamports+35001);assert.ok(f.calls.includes('getRecentPrioritizationFees'));await validatePreparation(r,identity,0);assert.equal(r.signingEnabled,false);assert.equal(r.broadcastEnabled,false);
});

test('explicit fee producer cannot omit or mutate the extra readonly CB account atomic proof',async()=>{
 for(const mutateSimulation of [s=>s.value.accounts.pop(),s=>{s.value.accounts[16].lamports++;const index=s.value.postBalances.indexOf(1);assert.ok(index>=0);s.value.postBalances[index]++;}]){const f=fixture({executionReview:true,explicitM4Fees:true,mutateSimulation});await assert.rejects(f.prepare(identity,'0',crypto.randomUUID()));}
});

test('failure diagnostics persist BEFORE unexpected debit guard, privately and without signature or secret fields',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tekkteam-m4-diagnostic-')),write=createPreparationDiagnosticWriter(root);
 const f=fixture({executionReview:true,captureDiagnostics:write,mutateSimulation:s=>{s.context.slot++;s.value.accounts[11].lamports--;delete s.value.preBalances;delete s.value.postBalances;}});
 await assert.rejects(f.prepare(identity,'0',crypto.randomUUID()),e=>e.code==='EXECUTION_ATOMIC_BALANCES_UNPROVEN');
 const dir=join(root,'preparation-diagnostics'),files=readdirSync(dir);assert.equal(files.length,1);
 const raw=readFileSync(join(dir,files[0]),'utf8'),record=JSON.parse(raw),vault=record.accounts.find(a=>a.role==='sol_vault');
 assert.equal(record.accounts.length,16);assert.equal(vault.externalDeltaLamports,-1);assert.equal(vault.classification,'UNRESOLVED');assert.equal(record.transactionsSigned,0);assert.equal(record.broadcasts,0);
 assert.doesNotMatch(raw,/secretKey|privateKey|rpcUrl|walletTransactionBase64|transactionBase64/);assert.equal(readdirSync(root).includes('public'),false);
 const denied=fixture({executionReview:true,captureDiagnostics:async()=>{throw Error('DISK_FAILURE');}});await assert.rejects(denied.prepare(identity,'0',crypto.randomUUID()),/DISK_FAILURE/);
});
test('M3.1 producer decodes actual fixture CPI and enforces fresh total/reserve review with no signing',async()=>{
 const f=fixture({executionReview:true}),result=await f.prepare(identity,'0',crypto.randomUUID());
 assert.equal(result.executionReview.guaranteeClass,'EXECUTION_GUARDED');assert.equal(result.executionReview.reviewedDebitLamports,result.policy.estimatedPayerDebitLamports);assert.equal(result.executionReview.ceilingLamports,10000000);assert.equal(result.executionReview.minimumReserveLamports,1000000);assert.equal(result.executionReview.authorizationGranted,false);assert.ok(f.calls.includes('isBlockhashValid'));await validatePreparation(result,identity,0);
 const root=mkdtempSync(join(tmpdir(),'tekkteam-m31-producer-'));await createPreparationEvidenceWriter(root)(result);assert.equal(result.signingEnabled,false);assert.equal(result.broadcastEnabled,false);
});

test('distinct same-slot revalidation diagnostics never collide or overwrite earlier evidence',async()=>{
 let proof;const f=fixture({captureDiagnostics:async(r,p)=>{proof=p;}}),result=await f.prepare(identity,'0',crypto.randomUUID());
 const root=mkdtempSync(join(tmpdir(),'tekkteam-m4-diagnostic-same-slot-')),write=createPreparationDiagnosticWriter(root),p={...proof,stage:'M4_REVALIDATION'};
 await write(result,p);await write(result,p);await write({...result,createdAt:new Date(Date.parse(result.createdAt)+1).toISOString()},p);
 assert.equal(readdirSync(join(root,'preparation-diagnostics')).length,2);
});
test('unsigned construction reuses pinned Pump builder/policy; replay deduplicates without mint signing',async()=>{
 const f=fixture(),id=crypto.randomUUID(),a=await f.prepare(identity,'0',id),count=f.calls.length,b=await f.prepare(identity,'0',id);
 assert.deepEqual(a,b);assert.equal(f.calls.length,count);assert.equal(a.instructionCount,1);assert.equal(a.launch.initialBuyLamports,0);assert.equal(a.simulation.status,'PASS');assert.equal(a.policy.allowed,true,JSON.stringify(a.policy.reasons));assert.ok(a.policy.estimatedPayerDebitLamports>0);assert.equal(a.walletTransactionBase64,undefined);assert.equal(a.signingEnabled,false);assert.equal(a.broadcastEnabled,false);assert.ok(Transaction.from(Buffer.from(a.transactionBase64,'base64')).signatures.every(x=>x.signature===null));
 await validatePreparation(a,identity,0);await assert.rejects(f.prepare(identity,'1',id),e=>e.code==='PREPARATION_REQUEST_CONFLICT');
 assert.equal(a.policy.baseFeeLamports+a.policy.otherRequiredDebitLamports,a.policy.estimatedPayerDebitLamports);assert.ok(a.policy.minimumRentExemptionLamports>0);assert.equal(a.computeBudgetInstructionCount,0);assert.equal(a.transactionType,'LEGACY');assert.ok(a.simulation.logs.length>0);assert.equal(a.simulation.logsTruncated,false);
 assert.equal(a.policy.reviewDebitCeilingLamports,10000000);assert.equal(a.policy.absoluteMaximumWalletDebitLamports,null);assert.equal(typeof a.policy.prestateSameBank,'boolean');
 await assert.rejects(validatePreparation({...a,policy:{...a.policy,absoluteMaximumWalletDebitLamports:a.policy.estimatedPayerDebitLamports}},identity,0));
 await assert.rejects(validatePreparation({...a,policy:{...a.policy,reviewDebitCeilingLamports:10000001}},identity,0));
 await assert.rejects(validatePreparation({...a,policy:{...a.policy,estimatedPayerDebitLamports:10000001,otherRequiredDebitLamports:10000001-a.policy.baseFeeLamports}},identity,0));
 await assert.rejects(validatePreparation({...a,policy:{...a.policy,otherRequiredDebitLamports:a.policy.otherRequiredDebitLamports+1}},identity,0));
 await assert.rejects(validatePreparation({...a,transactionSha256:'0'.repeat(64)},identity,0));await assert.rejects(validatePreparation({...a,network:'solana:103'},identity,0));
});

test('completed request binding survives restart and expiry; refresh needs a new ID',async()=>{
 let clock=Date.now();const now=()=>clock,root=mkdtempSync(join(tmpdir(),'tekkteam-m3-replay-')),write=createPreparationEvidenceWriter(root,{now});
 const first=fixture({now,readPreparation:write.read}),id=crypto.randomUUID(),result=await first.prepare(identity,'0',id);await write(result);
 const restarted=fixture({now,readPreparation:createPreparationEvidenceWriter(root,{now}).read});
 assert.deepEqual(await restarted.prepare(identity,'0',id),result);assert.equal(restarted.calls.length,0);
 clock=result.expiresAt+1;
 await assert.rejects(first.prepare(identity,'0',id),e=>e.code==='PREPARATION_EXPIRED');
 await assert.rejects(restarted.prepare(identity,'0',id),e=>e.code==='PREPARATION_EXPIRED');
 await assert.rejects(restarted.prepare(identity,'1',id),e=>e.code==='PREPARATION_REQUEST_CONFLICT');
 await assert.rejects(restarted.prepare({...identity,name:'Changed Coin'},'0',id),e=>e.code==='PREPARATION_REQUEST_CONFLICT');
 assert.equal(restarted.calls.length,0);assert.equal(readdirSync(join(root,'preparation-evidence')).length,1);
 const refreshed=fixture({now,readPreparation:write.read}),next=await refreshed.prepare(identity,'0',crypto.randomUUID());await write(next);
 assert.notEqual(next.id,result.id);assert.notEqual(next.mint,result.mint);assert.equal(readdirSync(join(root,'preparation-evidence')).length,2);
 const colliding=fixture({now}),replacement=await colliding.prepare(identity,'0',id);await assert.rejects(write(replacement),e=>e.code==='PREPARATION_REQUEST_CONFLICT');
 assert.equal(readdirSync(join(root,'preparation-evidence')).length,2);
});

test('in-memory completed request cannot silently rebuild after expiry',async()=>{
 let clock=Date.now();const f=fixture({now:()=>clock}),id=crypto.randomUUID(),result=await f.prepare(identity,'0',id),calls=f.calls.length;
 clock=result.expiresAt+1;await assert.rejects(f.prepare(identity,'0',id),e=>e.code==='PREPARATION_EXPIRED');
 await assert.rejects(f.prepare(identity,'1',id),e=>e.code==='PREPARATION_REQUEST_CONFLICT');assert.equal(f.calls.length,calls);
});

test('legacy request reuse is refused without rewriting or contacting RPC',async()=>{
 const root=mkdtempSync(join(tmpdir(),'tekkteam-m3-legacy-')),dir=join(root,'preparation-evidence'),id=crypto.randomUUID();mkdirSync(dir);
 const file=join(dir,id+'-'+'a'.repeat(64)+'.json'),content=JSON.stringify({formatVersion:1,evidence:'historical'});writeFileSync(file,content);
 const f=fixture({readPreparation:createPreparationEvidenceWriter(root).read});
 await assert.rejects(f.prepare(identity,'0',id),e=>e.code==='PREPARATION_LEGACY_REQUEST');assert.equal(f.calls.length,0);assert.equal(readFileSync(file,'utf8'),content);
 assert.equal(createPreparationEvidenceWriter(root).read(identity,0,crypto.randomUUID()),null);
});

test('minimum-slot lag retries identical read/simulation and refuses other failures or weaker context',async()=>{
 const params=['UNSIGNED_BYTES',{sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:100}],seen=[],retries=[];let calls=0;
 const transport={rpc:async(method,input)=>{seen.push(structuredClone(input));if(++calls<3)throw Object.assign(Error('lag'),{rpcCode:-32016});return {context:{slot:100}};}};
 assert.deepEqual(await readAtMinimumContext(transport,'simulateTransaction',params,{pause:async()=>{},onRetry:detail=>retries.push(detail)}),{context:{slot:100}});assert.equal(calls,3);assert.ok(seen.every(input=>JSON.stringify(input)===JSON.stringify(params)));assert.equal(retries.length,2);
 calls=0;await assert.rejects(readAtMinimumContext({rpc:async()=>{calls++;throw Object.assign(Error('lag'),{rpcCode:-32016});}},'getMultipleAccounts',[[],params[1]],{pause:async()=>{}}));assert.equal(calls,4);
 for(const [method,options,code] of [['simulateTransaction',{...params[1],commitment:'confirmed'},-32016],['simulateTransaction',params[1],-32002],['sendTransaction',params[1],-32016]]){calls=0;await assert.rejects(readAtMinimumContext({rpc:async()=>{calls++;throw Object.assign(Error('denied'),{rpcCode:code});}},method,['x',options],{pause:async()=>{}}));assert.equal(calls,1);}
});

test('private preparation evidence verifies unsigned bytes, idempotent file and linked-file denial; no public asset/receipt',async()=>{
 const f=fixture(),result=await f.prepare(identity,'0',crypto.randomUUID()),root=mkdtempSync(join(tmpdir(),'tekkteam-m3-evidence-')),write=createPreparationEvidenceWriter(root);
 await write(result);await write(result);const dir=join(root,'preparation-evidence'),files=readdirSync(dir);assert.equal(files.length,1);assert.equal(readdirSync(root).includes('public'),false);
 const stored=JSON.parse(readFileSync(join(dir,files[0])));assert.equal(stored.authorizationGranted,false);assert.equal(stored.transactionsSigned,0);assert.equal(stored.broadcasts,0);assert.deepEqual(stored.result,result);
 await assert.rejects(write({...result,signingEnabled:true}));await assert.rejects(write({...result,transactionSha256:'0'.repeat(64)}));await assert.rejects(write({...result,id:'../not-an-id'}));
 linkSync(join(dir,files[0]),join(dir,'hardlink-test'));await assert.rejects(write(result));
});
test('wrong genesis stops before construction/simulation; failed simulation has no payable debit claim',async()=>{
 const a=fixture({wrongGenesis:true});await assert.rejects(a.prepare(identity,'0',crypto.randomUUID()),e=>e.code==='PREPARATION_WRONG_MAINNET');assert.equal(a.calls.includes('simulateTransaction'),false);
 const b=fixture({failSimulation:true}),result=await b.prepare(identity,'0',crypto.randomUUID());assert.equal(result.simulation.status,'FAIL');assert.equal(result.policy.allowed,false);assert.equal(result.policy.estimatedPayerDebitLamports,null);assert.deepEqual(result.simulation.error,{InstructionError:[0,'InsufficientFunds']});
});
test('closed transport rejects value-moving/history RPC and unqualified public origins without network',async()=>{
 const t=createLaunchPreparationTransport({rpcUrl:'https://rpc.example.invalid/PRIVATE_CONFIG',origin:'https://staging.example.com'});
 for(const m of ['sendTransaction','sendRawTransaction','getTransaction','getSignaturesForAddress','requestAirdrop'])await assert.rejects(t.rpc(m,[]),e=>e.code==='PREPARATION_RPC_METHOD_DENIED');
 await assert.rejects(t.rpc('simulateTransaction',['x',{sigVerify:true}]),e=>e.code==='PREPARATION_SIMULATION_OPTIONS_DENIED');
 for(const uri of ['https://evil.example/image.png','https://staging.example.com/api/state','https://staging.example.com/'+ 'a'.repeat(43)+'?secret=1'])await assert.rejects(t.publicRequest(uri),e=>e.code==='PREPARATION_PUBLIC_PATH_DENIED');
 assert.equal(t.sign,undefined);assert.equal(t.send,undefined);assert.equal(t.request,undefined);assert.equal(t.rpcUrl,undefined);assert.doesNotMatch(t.provider,/PRIVATE_CONFIG/);
});
test('M3 allowlist is explicit and default off; launch/sign/submit/funding/Real remain denied',()=>{
 const id='265cd7e8-d6e8-4159-9ad6-66a62271361c';for(const path of ['/api/launchpad/agents/'+id+'/preparation','/api/launchpad/agents/'+id+'/token-draft','/api/launchpad/agent-identities']){assert.equal(walletTestRoute('POST',path),false);assert.equal(walletTestRoute('POST',path,true),true);}
 for(const path of ['/api/pump-launch/prepare','/api/pump-launch/review','/api/pump-launch/submit','/api/agents/'+id+'/trading/enable','/api/funding','/api/withdrawal','/mainnet-rpc'])for(const m of ['GET','POST','DELETE'])assert.equal(walletTestRoute(m,path,true),false);
 const cfg={origin:'https://staging.example.com',port:4395,dataDir:'/var/lib/staging',rpcUrl:'https://rpc.example.invalid'};assert.equal(walletTestConfig(cfg).launchPreparation,undefined);assert.throws(()=>walletTestConfig({...cfg,launchPreparation:'true'}));for(const flag of ['signing','broadcast','launch','funding','transfers','trading','withdrawal','workers'])assert.equal(preparationCapabilities[flag],false);
});
