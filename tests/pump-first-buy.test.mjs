import {GENESIS} from '../src/pump-readiness.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {VersionedTransaction,PublicKey} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {pumpAccountFixture,pumpWalletFixture,fixtureWallet,fixtureBlockhash} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpInstruction} from '../server/dex/pump-offline-instruction.js';
import {buildFirstBuyCandidate,validateFirstBuyCandidate,inspectFirstBuyCosts} from '../server/dex/pump-first-buy.js';
const now=1000000;
async function options(extra={}){
 const raw=await pumpAccountFixture(extra);raw.context.observedAt=now;const venue=decodePumpVenueBundle(raw),wallet=fixtureWallet.toBase58(),accounts=pumpWalletFixture(venue,wallet);
 accounts.base={address:accounts.base.address,slot:venue.slot,exists:false};
 return {venue,executionWallet:wallet,accounts,now,blockhash:fixtureBlockhash,intent:{agentId:venue.agentId,owner:venue.owner,agentWallet:wallet,network:'solana:101',side:'BUY',inputMint:venue.quoteMint,outputMint:venue.mint,inputAmount:'100000',slippageBps:100,expiresAt:now+30000}};
}
function costs(candidate){return {candidate,now,feeQuote:{messageHash:candidate.messageHash,genesis:GENESIS,source:candidate.source,commitment:'finalized',observedAt:now,lamports:'5000'},protectedReserveLamports:'2020000',sessionCapLamports:'500000',dailyCapLamports:'500000',auxiliary:Object.fromEntries(candidate.rentCandidates.filter(r=>r.role!=='base').map(r=>[r.role,{address:r.address,slot:candidate.slot,exists:false}])),rentQuotes:Object.fromEntries(candidate.rentCandidates.map(r=>[r.allocationBytes,{allocationBytes:r.allocationBytes,lamports:String(1000000+r.allocationBytes*100),commitment:'finalized',observedAt:now}]))};}
test('first BUY adds exact idempotent ATA before unchanged Pump instruction; classic and Token2022',async()=>{
 for(const classic of [false,true]){const o=await options({classic}),c=await buildFirstBuyCandidate(o),tx=VersionedTransaction.deserialize(Buffer.from(c.unsignedTransaction,'base64')),original=await buildOfflinePumpInstruction(o);
  const [ata,pump]=tx.message.compiledInstructions;assert.equal(c.instructionCount,2);assert.equal(c.base.allocationBytes,classic?165:170);
  assert.equal(tx.message.staticAccountKeys[ata.programIdIndex].toBase58(),ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());assert.deepEqual([...ata.data],[1]);
  assert.equal(c.base.address,getAssociatedTokenAddressSync(new PublicKey(c.mint),fixtureWallet,false,new PublicKey(o.venue.tokenProgram)).toBase58());
  assert.deepEqual(Buffer.from(pump.data),original.instruction.data);assert.equal(c.method,'buyExactSolIn');
  assert.deepEqual([...pump.accountKeyIndexes].map(i=>tx.message.staticAccountKeys[i].toBase58()),original.instruction.keys.map(k=>k.pubkey.toBase58()));
  assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));assert.equal(c.executable,false);assert.equal(c.serializedSize<=1232,true);
  assert.equal((await validateFirstBuyCandidate(c.unsignedTransaction,o)).messageHash,c.messageHash);
 }
});
test('existing qualified ATA keeps one Pump instruction; missing state cannot masquerade as absent',async()=>{
 const o=await options();o.accounts=pumpWalletFixture(o.venue,o.executionWallet);assert.equal((await buildFirstBuyCandidate(o)).instructionCount,1);
 delete o.accounts.base;await assert.rejects(buildFirstBuyCandidate(o),{code:'FIRST_BUY_ACCOUNT_CONTEXT'});
 const b=await options();b.accounts.base.data=Buffer.alloc(0);await assert.rejects(buildFirstBuyCandidate(b),{code:'FIRST_BUY_ABSENCE_INVALID'});
});
test('zero-balance/missing wallet may be diagnosed but is never executable or simulated',async()=>{
 const o=await options();o.accounts.wallet={address:o.executionWallet,slot:o.venue.slot,exists:false};const c=await buildFirstBuyCandidate(o),r=inspectFirstBuyCosts(costs(c));
 assert.equal(c.wallet.lamports,'0');assert.ok(r.blockers.includes('AGENT_WALLET_INSUFFICIENT_FOR_CANDIDATE_AND_RESERVE'));
 assert.ok(r.blockers.includes('LEGACY_BUY_VOLUME_ALLOCATION_NOT_INDEPENDENTLY_VERIFIED'));
 assert.ok(r.blockers.includes('TOTAL_DEBIT_EXCEEDS_CURRENT_DAILY_CEILING'));
 assert.equal(r.exactMaximumDebitVerified,false);assert.equal(r.simulationVerified,false);assert.equal(r.authorizationGranted,false);
 assert.equal(BigInt(r.estimatedDebitLamports),BigInt(r.inputLamports)+BigInt(r.networkFeeLamports)+BigInt(r.rentEstimateLamports));
});
test('candidate rejects instruction/amount/blockhash/signature mutations and wrong scope',async()=>{
 const o=await options(),c=await buildFirstBuyCandidate(o),tx=VersionedTransaction.deserialize(Buffer.from(c.unsignedTransaction,'base64'));
 tx.message.compiledInstructions[1].data[8]^=1;await assert.rejects(validateFirstBuyCandidate(Buffer.from(tx.serialize()).toString('base64'),o),{code:'FIRST_BUY_CANONICAL_MISMATCH'});
 const signed=VersionedTransaction.deserialize(Buffer.from(c.unsignedTransaction,'base64'));signed.signatures[0][0]=1;await assert.rejects(validateFirstBuyCandidate(Buffer.from(signed.serialize()).toString('base64'),o),{code:'FIRST_BUY_CANONICAL_MISMATCH'});
 await assert.rejects(validateFirstBuyCandidate(c.unsignedTransaction,{...o,blockhash:fixtureWallet.toBase58()}),{code:'FIRST_BUY_CANONICAL_MISMATCH'});
 await assert.rejects(buildFirstBuyCandidate({...o,intent:{...o.intent,agentWallet:new PublicKey(Buffer.alloc(32,1)).toBase58()}}),{code:'FIRST_BUY_SCOPE'});
 o.accounts.base.slot++;await assert.rejects(buildFirstBuyCandidate(o),{code:'FIRST_BUY_ACCOUNT_CONTEXT'});
});
test('rent and auxiliary observations are bounded, exact address/time and absence bound',async()=>{
 const c=await buildFirstBuyCandidate(await options());
 const stale=costs(c);stale.rentQuotes[137].observedAt=now-30001;assert.throws(()=>inspectFirstBuyCosts(stale),{code:'FIRST_BUY_RENT_QUOTE_INVALID'});
 const fee=costs(c);fee.feeQuote.messageHash='0'.repeat(64);assert.throws(()=>inspectFirstBuyCosts(fee),{code:'FIRST_BUY_FEE_QUOTE_INVALID'});
 const unknown=costs(c);delete unknown.auxiliary.userVolumeAccumulator;assert.throws(()=>inspectFirstBuyCosts(unknown),{code:'FIRST_BUY_ACCOUNT_CONTEXT'});
 const wrong=costs(c);wrong.auxiliary.creatorVault.address=c.mint;assert.throws(()=>inspectFirstBuyCosts(wrong),{code:'FIRST_BUY_ACCOUNT_CONTEXT'});
 const falseAbsent=costs(c);falseAbsent.auxiliary.creatorVault.lamports=0;assert.throws(()=>inspectFirstBuyCosts(falseAbsent),{code:'FIRST_BUY_ABSENCE_INVALID'});
 assert.throws(()=>inspectFirstBuyCosts({...costs(c),now:now+30000}),{code:'FIRST_BUY_CANDIDATE_INVALID'});
});
test('async caller mutation cannot alter validated wallet or intent; existing unknown rent is never zero',async()=>{
 const o=await options(),balance=String(o.accounts.wallet.lamports),pending=buildFirstBuyCandidate(o);o.accounts.wallet.lamports=1;o.intent.inputAmount='999999';
 const c=await pending;assert.equal(c.wallet.lamports,balance);assert.equal(c.quote.inputAmount,'100000');
 const input=costs(c);input.auxiliary.creatorVault.exists=true;const result=inspectFirstBuyCosts(input);
 assert.equal(result.rentEstimateLamports,null);assert.equal(result.estimatedDebitLamports,null);assert.equal(result.accountRentCandidates.find(r=>r.role==='creatorVault').rentEstimateLamports,null);
 assert.ok(BigInt(result.knownDebitSubtotalLamports)>0n);
});
test('exact creator vault system layout computes rent top-up, never existence-only zero',async()=>{
 const c=await buildFirstBuyCandidate(await options()),input=costs(c);Object.assign(input.auxiliary.creatorVault,{exists:true,owner:'11111111111111111111111111111111',executable:false,data:Buffer.alloc(0),lamports:100});
 const r=inspectFirstBuyCosts(input),vault=r.accountRentCandidates.find(r=>r.role==='creatorVault');assert.equal(vault.rentEstimateLamports,'999900');assert.equal(vault.layoutVerified,'SYSTEM_ZERO_DATA_CREATOR_VAULT');assert.notEqual(r.estimatedDebitLamports,null);
 input.auxiliary.creatorVault.data=Buffer.alloc(1);assert.equal(inspectFirstBuyCosts(input).estimatedDebitLamports,null);
});
