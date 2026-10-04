import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture,fixtureBlockhash,pumpWalletFixture,encoded} from './pump-account-fixture.mjs';
import {buildOfflinePumpInstruction} from '../server/dex/pump-offline-instruction.js';
import {curveProgram,pumpSdk,BN} from '../server/dex/pump-sdk-boundary.js';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {createPumpDryRunInspector} from '../server/dex/pump-dry-run.js';
const now=1800000000000,wallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
async function fixture(migrated=false,side='BUY'){
 const b=await pumpAccountFixture({migrated});b.context.observedAt=now;const venue=decodePumpVenueBundle(b);
 const options={venue,executionWallet:wallet,accounts:pumpWalletFixture(venue,wallet),networkFeeLamports:'5000',blockhash:fixtureBlockhash,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}};
 const context={owner:venue.owner,agentId:venue.agentId,agentWallet:wallet,associatedMint:venue.mint,network:'solana:101',authenticated:true,paused:false,liveEnabled:false,broadcastEnabled:false,revision:1};
 return {options,context};
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`local simulation ${migrated} ${side} cannot create position or PnL`,async()=>{
 const f=await fixture(migrated,side);let calls=0;const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async p=>{calls++;assert.equal(p.sigVerify,false);return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});
 const result=await inspector.inspect(f.options);assert.equal(calls,1);assert.equal(result.localSimulationPassed,true);assert.equal(result.onChainSimulationVerified,false);assert.equal(result.positionEffect,null);assert.equal(result.pnlEffect,null);assert.equal(result.executable,false);assert.equal('confirm'in inspector,false);
});
for(const [name,change]of [['paused',c=>c.paused=true],['wrong mint',c=>c.associatedMint=wallet],['wrong authority',c=>c.agentWallet=c.owner],['Live enabled',c=>c.liveEnabled=true],['broadcast enabled',c=>c.broadcastEnabled=true]])test(`dry run denies ${name} before simulator`,async()=>{const f=await fixture();change(f.context);let calls=0;const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async()=>calls++});await assert.rejects(inspector.inspect(f.options));assert.equal(calls,0);});
test('Pause during awaited simulation rejects stale operation',async()=>{const f=await fixture(true);const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async p=>{f.context.paused=true;f.context.revision++;return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});await assert.rejects(inspector.inspect(f.options),/PAUSED_OR_UNSAFE/);});
test('simulator mismatch cannot become success',async()=>{const f=await fixture();const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async()=>({source:'LOCAL_FIXTURE',messageHash:'foreign',success:true,err:null})});await assert.rejects(inspector.inspect(f.options),/SIMULATION_REJECTED/);});
for(const [name,readNumber,expectedCalls]of [['inventory',2,0],['pre-validation',4,0],['post-validation',6,1]])test(`Pause during ${name} await invalidates dry run`,async()=>{
 const f=await fixture(true);let reads=0,calls=0;
 const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>{if(++reads===readNumber)queueMicrotask(()=>{f.context.paused=true;f.context.revision++;});return f.context;},simulateUnsigned:async p=>{calls++;return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});
 await assert.rejects(inspector.inspect(f.options),/PAUSED_OR_UNSAFE/);assert.equal(calls,expectedCalls);
});
test('original request and account buffers cannot mutate pending local inspection',async()=>{const f=await fixture(true);const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async p=>{f.options.intent.inputAmount='1';f.options.accounts.base.data.fill(0);return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});const result=await inspector.inspect(f.options);assert.equal(result.quote.inputAmount,'100000000');assert.equal(result.walletInspection.baseBalance,'2000000000');});
test('successful fixture simulation exposes missing account qualification',async()=>{const f=await fixture(true),inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async p=>({source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null})});const result=await inspector.inspect(f.options);assert.equal(result.localSimulationPassed,true);assert.equal(result.venueExecutionQualified,false);assert.equal(result.accountInventory.allAccountsQualified,false);assert(result.accountInventory.rows.some(r=>r.status==='MISSING_REQUIRES_READ'));});
test('hostile account inventory is denied before simulator',async()=>{const f=await fixture(true);f.options.instructionAccounts=[{address:f.options.venue.mint,slot:99,exists:false}];let calls=0;const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async()=>calls++});await assert.rejects(inspector.inspect(f.options),/INVENTORY_ACCOUNT_INVALID/);assert.equal(calls,0);});
test('instruction buffer mutation cannot rewrite returned inventory proof',async()=>{const f=await fixture(true),account={...f.options.accounts.base,data:Buffer.from(f.options.accounts.base.data)};f.options.instructionAccounts=[account];const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async p=>{account.data.fill(0);return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});const r=await inspector.inspect(f.options);const row=r.accountInventory.rows.find(a=>a.address===account.address);assert.equal(row.status,'VERIFIED_LOCAL_LAYOUT');assert.notEqual(row.dataHash,await import('node:crypto').then(m=>m.createHash('sha256').update(account.data).digest('hex')));});
test('Pause during auxiliary coder await aborts before simulation',async()=>{
 const f=await fixture(),built=await buildOfflinePumpInstruction({...f.options,now});
 const address=built.accountRoles.find(a=>a.role==='globalVolumeAccumulator').address,data=await encoded(curveProgram,'globalVolumeAccumulator',{startTime:new BN(1),endTime:new BN(2),secondsInADay:new BN(86400)});
 f.options.instructionAccounts=[{address,owner:pumpSdk.PUMP_PROGRAM_ID.toBase58(),slot:100,exists:true,executable:false,data}];
 const coder=curveProgram.coder.accounts,original=coder.encode;let calls=0;
 coder.encode=async function(name,value){if(name==='globalVolumeAccumulator')queueMicrotask(()=>{f.context.paused=true;f.context.revision++;});return original.call(this,name,value);};
 try{const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>f.context,simulateUnsigned:async()=>calls++});await assert.rejects(inspector.inspect(f.options),/PAUSED_OR_UNSAFE/);assert.equal(calls,0);}finally{coder.encode=original;}
});
test('intent expires while simulator awaits, never returning stale success',async()=>{const f=await fixture(true);let clock=now;const inspector=createPumpDryRunInspector({now:()=>clock,readContext:()=>f.context,simulateUnsigned:async p=>{clock=f.options.intent.expiresAt;return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null};}});await assert.rejects(inspector.inspect(f.options),/EXPIRED/);});
