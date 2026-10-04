import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {quotePumpVenue} from '../server/dex/pump-quote.js';
const vectors=[
 [false,'0','100','3505133','100','0'],[false,'0','100000000','3536585322990','100000000','0'],[false,'0','1000000000000','793100000000000','85685401931','914314598069'],
 [false,'500','100','3362066','100','0'],[false,'500','100000000','3385926101617','99999999','1'],[false,'500','1000000000000','793100000000000','89510643088','910489356912'],
 [true,'0','100','5075839','99','1'],[true,'0','100000000','5200655633857','99999999','1'],[true,'0','1000000000000','781263852632592','999999999999','1'],
 [true,'500','100','4864346','99','1'],[true,'500','100000000','4980219631009','99999999','1'],[true,'500','1000000000000','780744714886886','999999999999','1'],
];
for(const [migrated,fee,amount,output,debit,dust]of vectors)test(`SDK pinned fixture budget ${migrated}/${fee}/${amount}`,async()=>{
 const now=1800000000000,b=await pumpAccountFixture({migrated,creatorFeeBps:fee,creatorFeeConfigurable:fee!=='0'});b.context.observedAt=now;const venue=decodePumpVenueBundle(b);
 const q=quotePumpVenue({venue,now,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side:'BUY',inputMint:venue.quoteMint,outputMint:venue.mint,inputAmount:amount,slippageBps:100,expiresAt:now+10000}});
 assert.equal(q.estimatedOutput,output);assert.equal(q.estimatedDebit,debit);assert.equal(q.estimatedUnspentBudget,dust);assert.equal(q.actualDebitVerified,false);assert.equal(q.executable,false);
});
