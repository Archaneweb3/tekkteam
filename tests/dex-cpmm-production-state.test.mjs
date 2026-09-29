import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {loadFreshCpmmPolicy,simulateUnsignedCpmm,CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {assertQuoteFresh} from '../server/dex/quote.js';

const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-mainnet.json',import.meta.url)));
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-messages.json',import.meta.url)));
const wallet=captured.messages.find(x=>x.direction==='BUY').intent.agentWallet;
const intent=()=>({mode:'CONTROLLED_REAL',network:'solana:mainnet',agentWallet:wallet,direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100});
function connection(patch={}){
 const accounts=new Map(snapshot.accounts.map(a=>[a.address,a]));
 const info=a=>a?{owner:new PublicKey(a.owner),data:Buffer.from(a.data,'base64'),lamports:a.lamports,executable:a.executable}:null;
 const c={getGenesisHash:async()=>snapshot.genesis,getAccountInfoAndContext:async()=>({context:{slot:100},value:info(accounts.get(CONTROLLED_CPMM_POOL))}),getMultipleAccountsInfoAndContext:async keys=>({context:{slot:101},value:keys.map(k=>{const address=k.toBase58();return address===wallet?{owner:PublicKey.default,data:Buffer.alloc(0),lamports:6995000,executable:false}:info(accounts.get(address));})}),getMinimumBalanceForRentExemption:async()=>captured.ataRentLamports,getLatestBlockhashAndContext:async()=>({context:{slot:102},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}}),simulateTransaction:async()=>({context:{slot:103},value:{err:null,unitsConsumed:64027}})};
 return {c:{...c,...patch},accounts};
}
test('production read-only loader derives fresh raw pool/ATA, local quote, full validation and unsigned simulation',async()=>{const {c}=connection(),p=await loadFreshCpmmPolicy(c,intent());assert.equal(p.policy.snapshot.genesis,snapshot.genesis);assert.equal(p.policy.agentBalanceLamports,'6995000');assert.equal(p.context.rentCost.toString(),'2976880');assert.equal(p.validation.status,'SUPPORTED_BY_VALIDATOR');assert.equal(p.validation.unexplainedWritableAccounts,0);assert.equal((await simulateUnsignedCpmm(c,p)).success,true);});
test('prepare-enabled production quote uses the shared bounded quote TTL',async()=>{
 const fixed=Date.now(),now=()=>fixed,adapter=createCpmmProductionAdapter({connection:connection().c,allowPrepare:true,now});
 const quote=await adapter.quote(intent());
 assert.equal(quote.expiresAt-quote.createdAt,25000);
 assert.equal(assertQuoteFresh(quote,now()),quote);
 assert.throws(()=>assertQuoteFresh(quote,quote.expiresAt),/QUOTE_EXPIRED/);
});
test('production loader rejects wrong network, token, program and snapshot race before build',async()=>{const wrong=intent();wrong.outputMint=wallet;await assert.rejects(loadFreshCpmmPolicy(connection().c,wrong),/UNSUPPORTED/);for(const override of [{getGenesisHash:async()=> 'wrong'},{getLatestBlockhashAndContext:async()=>({context:{slot:99},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}})}])await assert.rejects(loadFreshCpmmPolicy(connection(override).c,intent()));const {c,accounts}=connection();accounts.set('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',{...accounts.get('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),executable:false});await assert.rejects(loadFreshCpmmPolicy(c,intent()),/PROGRAM_UNAVAILABLE/);});
test('pool discovery fences second RPC read to first slot and fails closed on regression or truncation',async()=>{
 const {c}=connection(),original=c.getMultipleAccountsInfoAndContext;let config;
 c.getMultipleAccountsInfoAndContext=async(keys,options)=>{config=options;return original(keys);};
 await loadFreshCpmmPolicy(c,intent(),{deferBuild:true});
 assert.deepEqual(config,{commitment:'confirmed',minContextSlot:100});
 c.getMultipleAccountsInfoAndContext=async keys=>({context:{slot:99},value:(await original(keys)).value});
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{deferBuild:true}),e=>{
  assert.equal(e.code,'STALE_POOL_SNAPSHOT');assert.equal(e.snapshotDiagnostic.poolFetchContextSlot,100);assert.equal(e.snapshotDiagnostic.dependentFetchContextSlot,99);
  assert.equal(e.snapshotDiagnostic.slotDelta,-1);assert.equal(e.snapshotDiagnostic.minContextSlot,100);
  assert.equal(e.snapshotDiagnostic.maxAgeMs,10000);assert.ok(Number.isSafeInteger(e.snapshotDiagnostic.poolFetchedAt));
  assert.ok(Number.isSafeInteger(e.snapshotDiagnostic.dependentSnapshotFetchedAt));return true;
 });
 c.getMultipleAccountsInfoAndContext=async keys=>({context:{slot:101},value:(await original(keys)).value.slice(1)});
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{deferBuild:true}),e=>{
  assert.equal(e.code,'POOL_SNAPSHOT_LENGTH_MISMATCH');assert.equal(e.snapshotDiagnostic.accountCountReceived,e.snapshotDiagnostic.accountCountExpected-1);return true;
 });
});
test('RPC -32016 at the fenced dependent read is classified with safe slot diagnostics, never bypassed',async()=>{
 const {c}=connection({getSlot:async()=>99,getMultipleAccountsInfoAndContext:async()=>{throw Object.assign(Error('Minimum context slot has not been reached'),{code:-32016});}});
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{deferBuild:true}),e=>{
  assert.equal(e.code,'RPC_MIN_CONTEXT_SLOT_NOT_REACHED');assert.equal(e.snapshotDiagnostic.poolFetchContextSlot,100);
  assert.equal(e.snapshotDiagnostic.minContextSlot,100);assert.equal(e.snapshotDiagnostic.currentRpcSlot,99);
  assert.equal(e.snapshotDiagnostic.dependentFetchContextSlot,null);assert.equal(e.snapshotDiagnostic.accountCountReceived,null);
  return true;
 });
});
test('acceptance pre-sign read retries once with a new pool slot and succeeds on the second fenced snapshot',async()=>{
 const {c}=connection(),poolRead=c.getAccountInfoAndContext,dependentRead=c.getMultipleAccountsInfoAndContext;
 let pools=0,dependents=0;const seen=[];
 c.getAccountInfoAndContext=async(...args)=>({...(await poolRead(...args)),context:{slot:100+2*pools++}});
 c.getMultipleAccountsInfoAndContext=async(keys,config)=>{dependents++;seen.push(config.minContextSlot);if(dependents===1)throw Object.assign(Error('lag'),{code:-32016});return {...await dependentRead(keys),context:{slot:103}};};
 c.getLatestBlockhashAndContext=async()=>({context:{slot:104},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}});
 const result=await loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}});
 assert.deepEqual(seen,[100,102]);assert.equal(pools,2);assert.equal(result.retryDiagnostics.length,2);
 assert.equal(result.retryDiagnostics[0].rpcErrorCode,-32016);assert.equal(result.retryDiagnostics[0].requestedMinContextSlot,100);
 assert.equal(result.retryDiagnostics[1].requestedMinContextSlot,102);assert.equal(result.retryDiagnostics[1].dependentContextSlot,103);
});
test('two -32016 responses require a third entirely new pool snapshot, never a reused minContextSlot',async()=>{
 const {c}=connection(),poolRead=c.getAccountInfoAndContext,dependentRead=c.getMultipleAccountsInfoAndContext;let pools=0,reads=0;const minima=[];
 c.getAccountInfoAndContext=async(...args)=>({...(await poolRead(...args)),context:{slot:100+pools++}});
 c.getMultipleAccountsInfoAndContext=async(keys,config)=>{minima.push(config.minContextSlot);if(++reads<3)throw Object.assign(Error('lag'),{code:-32016});return {...await dependentRead(keys),context:{slot:103}};};
 c.getLatestBlockhashAndContext=async()=>({context:{slot:104},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}});
 const result=await loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}});
 assert.deepEqual(minima,[100,101,102]);assert.equal(result.retryDiagnostics.length,3);assert.deepEqual(result.retryDiagnostics.map(x=>x.rpcErrorCode),[-32016,-32016,null]);
});
test('pre-sign HTTP 429 retries a full snapshot and respects Retry-After without changing the slot fence',async()=>{
 const {c}=connection(),poolRead=c.getAccountInfoAndContext,dependentRead=c.getMultipleAccountsInfoAndContext;
 let pools=0,dependents=0;const fences=[],waits=[];
 c.getAccountInfoAndContext=async(...args)=>({...(await poolRead(...args)),context:{slot:100+pools++}});
 c.getMultipleAccountsInfoAndContext=async(keys,config)=>{fences.push(config.minContextSlot);if(++dependents===1)throw Object.assign(Error('429 Too Many Requests'),{response:{headers:new Headers({'Retry-After':'1.2'})}});return {...await dependentRead(keys),context:{slot:103}};};
 c.getLatestBlockhashAndContext=async()=>({context:{slot:104},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}});
 const p=await loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async ms=>{waits.push(ms);}});
 assert.deepEqual(fences,[100,101]);assert.equal(pools,2);assert.deepEqual(waits,[1200]);assert.deepEqual(p.retryDiagnostics.map(x=>x.rpcErrorCode),[429,null]);
});
test('pre-sign 429 exhaustion fails closed; unscoped reads never retry',async()=>{
 const {c}=connection();let pools=0;
 c.getAccountInfoAndContext=async()=>{pools++;throw Error('429 Too Many Requests');};
 await assert.rejects(loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}}),e=>e.code==='RPC_RATE_LIMITED'&&e.retryDiagnostics.length===3);
 assert.equal(pools,3);
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{deferBuild:true}),/429/);assert.equal(pools,4);
});
test('pre-sign blockhash RPC behind the fenced snapshot retries from a new pool read, never accepts stale context',async()=>{
 const {c}=connection(),poolRead=c.getAccountInfoAndContext;let pools=0,blocks=0;
 c.getAccountInfoAndContext=async(...args)=>{pools++;return poolRead(...args);};
 c.getLatestBlockhashAndContext=async()=>({context:{slot:++blocks===1?99:103},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}});
 const p=await loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}});
 assert.equal(pools,2);assert.equal(blocks,2);assert.equal(p.retryDiagnostics[0].rpcErrorCode,'STALE_CPMM_SNAPSHOT');assert.equal(p.retryDiagnostics[0].currentRpcSlot,99);assert.equal(p.retryDiagnostics[1].currentRpcSlot,103);
});
test('three -32016 reads reject safely with three diagnostics and no fourth RPC read',async()=>{
 const {c}=connection(),poolRead=c.getAccountInfoAndContext;let pools=0,reads=0;
 c.getAccountInfoAndContext=async(...args)=>{pools++;return poolRead(...args);};
 c.getMultipleAccountsInfoAndContext=async()=>{reads++;throw Object.assign(Error('lag'),{code:-32016});};
 await assert.rejects(loadFreshCpmmPolicy(c,{...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'},{deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}}),e=>{assert.equal(e.code,'RPC_MIN_CONTEXT_SLOT_NOT_REACHED');assert.equal(e.retryDiagnostics.length,3);return true;});
 assert.equal(pools,3);assert.equal(reads,3);
});
test('below-fence response gets a fresh retry; count mismatch and other RPC errors do not',async()=>{
 const {c}=connection(),dependentRead=c.getMultipleAccountsInfoAndContext;let reads=0;
 c.getMultipleAccountsInfoAndContext=async keys=>{reads++;const result=await dependentRead(keys);return {...result,context:{slot:reads===1?99:101}};};
 const opts={deferBuild:true,retryMinContextSlot:true,retryWait:async()=>{}},i={...intent(),mode:'AUTONOMOUS_ACCEPTANCE_TEST'};
 const recovered=await loadFreshCpmmPolicy(c,i,opts);assert.equal(reads,2);assert.equal(recovered.retryDiagnostics[0].rpcErrorCode,'STALE_POOL_SNAPSHOT');
 reads=0;c.getMultipleAccountsInfoAndContext=async keys=>{reads++;const result=await dependentRead(keys);return {...result,value:result.value.slice(1)};};
 await assert.rejects(loadFreshCpmmPolicy(c,i,opts),e=>e.code==='POOL_SNAPSHOT_LENGTH_MISMATCH');assert.equal(reads,1);
 reads=0;c.getMultipleAccountsInfoAndContext=async()=>{reads++;throw Object.assign(Error('other RPC failure'),{code:-32005});};
 await assert.rejects(loadFreshCpmmPolicy(c,i,opts),e=>e.code===-32005);assert.equal(reads,1);
});
test('fenced active-pool counters may advance, but discovered pool roles may not change',async()=>{
 const {c}=connection(),original=c.getMultipleAccountsInfoAndContext;
 c.getMultipleAccountsInfoAndContext=async keys=>{const result=await original(keys),pool={...result.value[0],data:Buffer.from(result.value[0].data)};pool.data.writeBigUInt64LE(pool.data.readBigUInt64LE(341)+1n,341);result.value[0]=pool;return result;};
 const fresh=await loadFreshCpmmPolicy(c,intent(),{deferBuild:true});assert.equal(fresh.pool,CONTROLLED_CPMM_POOL);assert.equal(fresh.snapshotDiagnostic.dependentFetchContextSlot,101);
 c.getMultipleAccountsInfoAndContext=async keys=>{const result=await original(keys),pool={...result.value[0],data:Buffer.from(result.value[0].data)};pool.data[8]^=1;result.value[0]=pool;return result;};
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{deferBuild:true}),/POOL_ROLES_CHANGED_DURING_SNAPSHOT/);
});
test('fresh fenced quote carries bounded safe snapshot diagnostics; stale-by-time rejects at unchanged 10000ms',async()=>{
 const fixed=Date.now(),good=await loadFreshCpmmPolicy(connection().c,intent(),{now:()=>fixed,deferBuild:true});
 assert.equal(good.snapshotDiagnostic.poolFetchContextSlot,100);assert.equal(good.snapshotDiagnostic.dependentFetchContextSlot,101);
 assert.equal(good.snapshotDiagnostic.currentRpcSlot,102);assert.equal(good.snapshotDiagnostic.slotDelta,1);
 assert.equal(good.snapshotDiagnostic.accountCountExpected,good.snapshotDiagnostic.accountCountReceived);
 assert.equal(good.snapshotDiagnostic.ageMs,0);assert.equal(good.snapshotDiagnostic.maxAgeMs,10000);
 assert.equal(good.snapshotDiagnostic.source,'FRESH_MAINNET_RPC');assert.equal(good.snapshotDiagnostic.cacheTtlMs,null);
 let clock=fixed;const {c}=connection();c.getLatestBlockhashAndContext=async()=>{clock+=10001;return {context:{slot:102},value:{blockhash:captured.block.blockhash,lastValidBlockHeight:200}};};
 await assert.rejects(loadFreshCpmmPolicy(c,intent(),{now:()=>clock,deferBuild:true}),e=>{
  assert.equal(e.code,'STALE_CPMM_SNAPSHOT');assert.equal(e.snapshotDiagnostic.ageMs,10001);
  assert.equal(e.snapshotDiagnostic.maxAgeMs,10000);assert.equal(e.snapshotDiagnostic.currentRpcSlot,102);return true;
 });
});
test('disarmed production adapter rejects direct signer and broadcaster calls before vault/RPC access',async()=>{let vault=0,send=0;const adapter=createCpmmProductionAdapter({connection:{sendRawTransaction:async()=>{send++;}},db:{prepare(){vault++;throw Error('must not reach vault');}},store:{unseal(){vault++;throw Error('must not unseal');}}});await assert.rejects(adapter.signExactMessage({},{}),/DISARMED/);await assert.rejects(adapter.broadcastOnce('',{maxRetries:0,skipPreflight:false}),/DISARMED/);assert.equal(vault,0);assert.equal(send,0);});
test('production reserve plan has verified quote and capital snapshot but no final transaction until after hold',async()=>{
 const {c}=connection(),adapter=createCpmmProductionAdapter({connection:c,db:{},store:{}}),i=intent();
 const quote=await adapter.quote(i),r={intent:i,quote};
 const pre=await adapter.reservePlan(r);
 assert.equal(pre.collected.transaction,undefined);
 assert.equal(pre.snapshot.networkFeeLamports,'10000');
 assert.equal(pre.snapshot.ataRentLamports,'2976880');
 const final=await adapter.buildReserved(r,pre);
 assert.ok(final.transaction);assert.equal(final.validationPolicy.blockhash,captured.block.blockhash);
});
