import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {quotePumpVenue} from '../server/dex/pump-quote.js';
const now=1800000000000;
async function quote(migrated,side,overrides={}){const b=await pumpAccountFixture({migrated,...overrides});b.context.observedAt=now;const venue=decodePumpVenueBundle(b);return quotePumpVenue({venue,now,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}});}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`bounded creator override changes net ${migrated} ${side} estimate`,async()=>{const scheduled=await quote(migrated,side),configured=await quote(migrated,side,{creatorFeeConfigurable:true,creatorFeeBps:'500'});assert.ok(BigInt(configured.estimatedOutput)<BigInt(scheduled.estimatedOutput));assert.equal(configured.executable,false);});
for(const migrated of [false,true])for(const [name,fields]of [['disabled gate',{creatorFeeBps:'500'}],['above ceiling',{creatorFeeConfigurable:true,creatorFeeBps:'501'}],['invalid ceiling',{creatorFeeConfigurable:true,creatorFeeBps:'500',creatorFeeCeiling:'10000'}],['effective fee total',{creatorFeeConfigurable:true,creatorFeeBps:'9970',creatorFeeCeiling:'9999'}]])test(`creator fee rejects ${migrated} ${name}`,async()=>{await assert.rejects(quote(migrated,'BUY',fields));});
