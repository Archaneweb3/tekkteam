import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {quotePumpVenue} from '../server/dex/pump-quote.js';
const now=1800000000000;
async function setup(migrated=false,side='BUY',virtualQuote){
 const bundle=await pumpAccountFixture({migrated,...(virtualQuote?{virtualQuote}:{})});bundle.context.observedAt=now;
 const venue=decodePumpVenueBundle(bundle);
 return {venue,now,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}};
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`${migrated?'PumpSwap':'curve'} ${side} offline quote remains non executable`,async()=>{
 const result=quotePumpVenue(await setup(migrated,side));assert.ok(BigInt(result.estimatedOutput)>0n);assert.equal(BigInt(result.minimumOutput),BigInt(result.estimatedOutput)*9900n/10000n);assert.equal(result.executable,false);assert.equal(result.actualDebitVerified,false);assert.equal(result.authorizationGranted,false);assert.equal(result.provenance,'DERIVED');
 assert.equal(result.estimatedOutput,migrated?(side==='BUY'?'5200655633857':'18723'):(side==='BUY'?'3536585322990':'27734'));
});
for(const [label,change]of [
 ['foreign mint',x=>x.intent.inputMint=x.venue.mint],['foreign owner',x=>x.intent.owner=x.venue.mint],['excess slippage',x=>x.intent.slippageBps=101],['float amount',x=>x.intent.inputAmount='1.1'],['overflow',x=>x.intent.inputAmount='18446744073709551616'],['expired',x=>x.now+=30001],['extended expiry',x=>x.intent.expiresAt=now+30001],
])test(`quote rejects ${label}`,async()=>{const input=await setup();change(input);assert.throws(()=>quotePumpVenue(input));});
test('quote requires an observation timestamp',async()=>{const input=await setup();input.venue=decodePumpVenueBundle(await pumpAccountFixture());assert.throws(()=>quotePumpVenue(input),/EXPIRED/);});
test('negative signed virtual reserves affect PumpSwap math',async()=>{
 const negative=quotePumpVenue(await setup(true,'BUY','-5000000000')),zero=quotePumpVenue(await setup(true,'BUY','0'));assert.ok(BigInt(negative.estimatedOutput)>BigInt(zero.estimatedOutput));
});
test('unregistered decoded descriptor cannot supply quote evidence',async()=>{const input=await setup();input.venue=JSON.parse(JSON.stringify(input.venue));assert.throws(()=>quotePumpVenue(input),/DECODED_STATE_REQUIRED/);});
for(const migrated of [false,true])test(`SELL beyond supply rejected ${migrated}`,async()=>{const input=await setup(migrated,'SELL');input.intent.inputAmount='1000000000000001';assert.throws(()=>quotePumpVenue(input),/SELL_SUPPLY_EXCEEDED/);});
test('unqualified creator fee override cannot reach quote math',async()=>{const bundle=await pumpAccountFixture({creatorFeeBps:'10000'});assert.throws(()=>decodePumpVenueBundle(bundle),/CREATOR_FEE_OVERRIDE_UNQUALIFIED/);});
test('curve SELL cannot use virtual SOL as actual available liquidity',async()=>{const x=await setup(false,'SELL');x.intent.inputAmount='1000000000000000';assert.throws(()=>quotePumpVenue(x),/REAL_RESERVE_INSUFFICIENT/);});
for(const migrated of [false,true])test(`tiny BUY cannot become a positive executable quote ${migrated}`,async()=>{const x=await setup(migrated);x.intent.inputAmount='1';assert.throws(()=>quotePumpVenue(x));});
test('curve reserve cap does not fabricate spending the entire budget',async()=>{const x=await setup();x.intent.inputAmount='1000000000000';const q=quotePumpVenue(x);assert.equal(q.estimatedOutput,'793100000000000');assert.ok(BigInt(q.estimatedDebit)<BigInt(q.inputAmount));assert.equal(BigInt(q.estimatedDebit)+BigInt(q.estimatedUnspentBudget),BigInt(q.inputAmount));assert.equal(q.actualDebitVerified,false);});
for(const migrated of [false,true])test(`integer dust budgets remain estimates ${migrated}`,async()=>{const x=await setup(migrated);for(let n=2;n<=128;n++){x.intent.inputAmount=String(n);try{const q=quotePumpVenue(x);assert.ok(BigInt(q.estimatedDebit)<=BigInt(n));assert.equal(BigInt(q.estimatedDebit)+BigInt(q.estimatedUnspentBudget),BigInt(n));assert.equal(q.actualDebitVerified,false);}catch(error){assert.ok(['PUMP_QUOTE_OUTPUT_INVALID','PUMP_QUOTE_BUDGET_ROUNDING_UNQUALIFIED','PUMP_QUOTE_MATH_REJECTED'].includes(error.code),error.code);}}});
