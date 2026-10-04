import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpInstruction} from '../server/dex/pump-offline-instruction.js';
import {curveProgram,swapProgram} from '../server/dex/pump-sdk-boundary.js';
const now=1800000000000,wallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`unsigned ${migrated?'PumpSwap':'curve'} ${side} typed ABI only`,async()=>{
 const input=await pumpAccountFixture({migrated});input.context.observedAt=now;const venue=decodePumpVenueBundle(input);
 const result=await buildOfflinePumpInstruction({venue,executionWallet:wallet,now,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}});
 const idl=(migrated?swapProgram:curveProgram).idl.instructions.find(i=>i.name===result.method);
 assert.deepEqual([...result.instruction.data.subarray(0,8)],idl.discriminator);assert.equal(result.instruction.data.readBigUInt64LE(8),BigInt(result.quote.inputAmount));assert.equal(result.instruction.data.readBigUInt64LE(16),BigInt(result.quote.minimumOutput));
 assert.equal(result.instruction.keys.length,idl.accounts.length+(migrated?3:2));
 assert.equal(result.instruction.keys.filter(k=>k.isSigner).length,1);assert.equal(result.instruction.keys.find(k=>k.isSigner).pubkey.toBase58(),wallet);
 assert.equal(result.executable,false);assert.equal(result.walletAuthorityVerified,false);assert.equal(result.simulationVerified,false);
});
test('fixture execution wallet is a public address only',()=>assert.equal(PublicKey.isOnCurve(new PublicKey(wallet).toBytes()),true));
