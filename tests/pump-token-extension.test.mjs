import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture,fixtureWallet} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {quotePumpVenue} from '../server/dex/pump-quote.js';
for(const migrated of [false,true])test(`actual metadata TLV layout decodes and quotes offline ${migrated}`,async()=>{
 const b=await pumpAccountFixture({migrated,metadata:true});b.context.observedAt=1800000000000;const venue=decodePumpVenueBundle(b),result=quotePumpVenue({venue,now:b.context.observedAt,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side:'BUY',inputMint:venue.quoteMint,outputMint:venue.mint,inputAmount:'100000000',slippageBps:100,expiresAt:b.context.observedAt+10000}});assert.equal(result.executable,false);assert.ok(BigInt(result.estimatedOutput)>0n);
});
test('embedded metadata cannot identify another mint',async()=>{const b=await pumpAccountFixture({metadata:true,metadataMint:fixtureWallet});assert.throws(()=>decodePumpVenueBundle(b),/TOKEN_METADATA_INVALID/);});
for(const [name,mutate]of [['null pointer',b=>b.accounts.mint.data.fill(0,202,234)],['duplicate pointer',b=>b.accounts.mint.data=Buffer.concat([b.accounts.mint.data,b.accounts.mint.data.subarray(166,234)])],['forbidden extension',b=>b.accounts.mint.data.writeUInt16LE(1,166)],['missing metadata',b=>b.accounts.mint.data=b.accounts.mint.data.subarray(0,234)],['malformed metadata',b=>b.accounts.mint.data.fill(255,302,306)]])test(`mint TLV rejects ${name}`,async()=>{const b=await pumpAccountFixture({metadata:true});mutate(b);assert.throws(()=>decodePumpVenueBundle(b));});
