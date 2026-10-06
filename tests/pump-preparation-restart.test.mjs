import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pumpAccountFixture,pumpWalletFixture,fixtureBlockhash,fixtureWallet} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {createPumpRuntimeAdapter} from '../server/dex/pump-runtime-adapter.js';
import {createPumpNativeValidityReader} from '../server/dex/pump-native-reader.js';
import {GENESIS} from '../src/pump-readiness.js';
import {SOL_MINT} from '../server/dex/intent.js';

// All account/height/simulation evidence is synthetic DI, never real qualification.
const at=1800000000000;
async function fixture(migrated=false){
 const bundle=await pumpAccountFixture({migrated});bundle.context.source='BACKEND_RPC_READ';bundle.context.observedAt=at;
 const venue=decodePumpVenueBundle(bundle),wallet=fixtureWallet.toBase58();
 const nativeValidity={source:'BACKEND_RPC_READ',genesis:GENESIS,commitment:'finalized',blockhash:fixtureBlockhash,blockhashContextSlot:102,minContextSlot:102,currentBlockHeight:80,lastValidBlockHeight:90,checkedAt:at};
 const snapshot={venue,accounts:pumpWalletFixture(venue,wallet),blockhash:fixtureBlockhash,networkFeeLamports:'5000',nativeValidity};
 const intent={owner:venue.owner,agentId:venue.agentId,agentWallet:wallet,network:'solana:101',genesis:GENESIS,side:'BUY',inputMint:SOL_MINT,outputMint:venue.mint,inputAmount:'1000000',slippageBps:100,expiresAt:at+10000};
 let clock=at,ready=true,proof={...nativeValidity,blockhashValid:true,blockhashValidationSlot:103},reads=0,simulations=0;
 const adapter=(restart=false)=>createPumpRuntimeAdapter({source:'ON_CHAIN',qualification:()=>ready,now:()=>clock,readSnapshot:()=>{assert.equal(restart,false,'restart must not fetch/rebuild');reads++;return snapshot;},readNativeValidity:async request=>{assert.deepEqual(request,{blockhash:fixtureBlockhash,commitment:'finalized',minContextSlot:102});return proof;},simulateUnsigned:p=>{assert.equal(restart,false,'restart must not simulate a replacement');simulations++;return {source:'BACKEND_RPC_READ',messageHash:p.messageHash,success:true,err:null};},readFinalized:signature=>({signature,existing:true}),verifyFinalizedEffects:()=>({existing:true})});
 return {adapter,intent,snapshot,get counts(){return {reads,simulations};},set clock(x){clock=x;},set ready(x){ready=x;},get proof(){return proof;},set proof(x){proof=x;}};
}
for(const swap of [false,true])test(`durable JSON/SQLite restart validates original ${swap?'swap':'curve'} bytes without snapshot, blockhash refresh or simulation`,async()=>{
 const x=await fixture(swap),plan=await x.adapter().prepare(x.intent,{},async()=>{}),bytes=plan.unsignedTransaction;
 const dir=mkdtempSync(join(tmpdir(),'tekkteam-prepare-')),file=join(dir,'fixture.sqlite');let db=new DatabaseSync(file);
 try{db.exec('CREATE TABLE fixture_plan(data TEXT)');db.prepare('INSERT INTO fixture_plan VALUES(?)').run(JSON.stringify(plan));db.close();db=new DatabaseSync(file);const restored=JSON.parse(db.prepare('SELECT data FROM fixture_plan').get().data);assert.equal(await x.adapter(true).verifyPrepared({intent:x.intent,plan:restored}),true);assert.equal(restored.unsignedTransaction,bytes);assert.deepEqual(x.counts,{reads:1,simulations:1});if(swap)assert.equal(restored.preparationEvidence.rawBundle.accounts.quoteVault.lamports,20002039280);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
for(const [name,change]of [
 ['native expiry',x=>{x.proof.currentBlockHeight=91;}],['invalid blockhash',x=>{x.proof.blockhashValid=false;}],['wrong hash',x=>{x.proof.blockhash=SOL_MINT;}],['wrong network',x=>{x.proof.genesis='wrong';}],['old RPC context',x=>{x.proof.blockhashValidationSlot=101;}],['height rollback',x=>{x.proof.currentBlockHeight=79;}],['stale proof',x=>{x.clock=at+5001;}],['review expired',x=>{x.clock=at+10000;x.proof.checkedAt=at+10000;}],['qualification revoked',x=>{x.ready=false;}]
])test(`restart fails closed: ${name}`,async()=>{const x=await fixture(),plan=await x.adapter().prepare(x.intent,{},async()=>{});change(x);await assert.rejects(x.adapter(true).verifyPrepared({plan,intent:x.intent}));assert.deepEqual(x.counts,{reads:1,simulations:1});});
test('last valid height is inclusive; blockhash invalidity independently rejects there',async()=>{const x=await fixture(),plan=await x.adapter().prepare(x.intent,{},async()=>{});x.proof.currentBlockHeight=90;assert.equal(await x.adapter(true).verifyPrepared({plan}),true);x.proof.blockhashValid=false;await assert.rejects(x.adapter(true).verifyPrepared({plan}),/BLOCKHASH_INVALID/);});
test('provider mutation during native await cannot extend the reviewed lifetime',async()=>{
 const x=await fixture(),plan=await x.adapter().prepare(x.intent,{},async()=>{});
 const adapter=createPumpRuntimeAdapter({source:'ON_CHAIN',qualification:()=>true,now:()=>at,readNativeValidity:async()=>{plan.preparationEvidence.nativeValidity.lastValidBlockHeight=200;return {...x.proof,currentBlockHeight:91};}});
 await assert.rejects(adapter.verifyPrepared({plan,intent:x.intent}),/BLOCKHASH_EXPIRED/);
});
for(const [name,mutate]of [
 ['amount',p=>{p.quote.inputAmount='2';}],['balance',p=>{p.balances.native='9999999999';}],['fee cap',p=>{p.feeCapLamports='999999';}],['raw account',p=>{p.preparationEvidence.accounts.wallet.lamports++;}],['blockhash',p=>{p.preparationEvidence.blockhash=SOL_MINT;}],['native expiry',p=>{p.preparationEvidence.nativeValidity.lastValidBlockHeight++;}],['bytes',p=>{const b=Buffer.from(p.unsignedTransaction,'base64');b[b.length-5]^=1;p.unsignedTransaction=b.toString('base64');}],['effect policy',p=>{p.effectPolicy={};}]
])test(`persisted mutation rejected: ${name}`,async()=>{const x=await fixture(),plan=await x.adapter().prepare(x.intent,{},async()=>{});const changed=JSON.parse(JSON.stringify(plan));mutate(changed);await assert.rejects(x.adapter(true).verifyPrepared({plan:changed,intent:x.intent}));});
test('ON_CHAIN preparation requires native proof; passive history stays accessible after expiry/revocation',async()=>{const x=await fixture();delete x.snapshot.nativeValidity;await assert.rejects(x.adapter().prepare(x.intent,{},async()=>{}),/NATIVE_VALIDITY/);assert.equal(x.counts.simulations,0);x.ready=false;x.clock=at+999999;assert.deepEqual(await x.adapter(true).readFinalized('existing-signature'),{signature:'existing-signature',existing:true});});
test('RPC reader uses only original finalized/minContext requests and does not refresh a blockhash',async()=>{const seen=[];const reader=createPumpNativeValidityReader({now:()=>at,transport:{rpc:async(method,params)=>{seen.push({method,params});if(method==='getGenesisHash')return GENESIS;if(method==='getBlockHeight')return 89;if(method==='isBlockhashValid')return {context:{slot:103},value:true};throw Error('FORBIDDEN');}}});const proof=await reader({blockhash:fixtureBlockhash,commitment:'finalized',minContextSlot:102});assert.equal(proof.currentBlockHeight,89);assert.equal(proof.blockhashValidationSlot,103);assert.equal(proof.blockhashValid,true);assert.deepEqual(seen.map(x=>x.method),['getGenesisHash','getBlockHeight','isBlockhashValid']);assert.deepEqual(seen[1].params,[{commitment:'finalized',minContextSlot:102}]);assert.deepEqual(seen[2].params,[fixtureBlockhash,{commitment:'finalized',minContextSlot:102}]);});
