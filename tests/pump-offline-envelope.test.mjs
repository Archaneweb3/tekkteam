import test from 'node:test';
import assert from 'node:assert/strict';
import {VersionedTransaction} from '@solana/web3.js';
import {pumpAccountFixture,fixtureBlockhash} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpEnvelope,validateOfflinePumpEnvelope} from '../server/dex/pump-offline-envelope.js';
const now=1800000000000;
async function setup(migrated,side){const b=await pumpAccountFixture({migrated});b.context.observedAt=now;const venue=decodePumpVenueBundle(b);return {venue,now,blockhash:fixtureBlockhash,executionWallet:'1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM',intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}};}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`canonical unsigned ${migrated} ${side} envelope stays disarmed`,async()=>{const options=await setup(migrated,side),built=await buildOfflinePumpEnvelope(options),checked=await validateOfflinePumpEnvelope(built.unsignedTransaction,options);assert.equal(checked.messageHash,built.messageHash);assert.equal(checked.executable,false);assert.equal(checked.simulationVerified,false);});
for(const [name,mutate]of [
 ['signature',t=>t.signatures[0][0]=1],['minimum output',t=>t.message.compiledInstructions[0].data[16]^=1],['extra instruction',t=>t.message.compiledInstructions.push(t.message.compiledInstructions[0])],['account order',t=>{const a=t.message.compiledInstructions[0].accountKeyIndexes;[a[0],a[1]]=[a[1],a[0]];}],['authority header',t=>t.message.header.numReadonlyUnsignedAccounts--],
])test(`unsigned validator rejects ${name}`,async()=>{const options=await setup(true,'BUY'),built=await buildOfflinePumpEnvelope(options),t=VersionedTransaction.deserialize(Buffer.from(built.unsignedTransaction,'base64'));mutate(t);await assert.rejects(()=>validateOfflinePumpEnvelope(Buffer.from(t.serialize()).toString('base64'),options));});
