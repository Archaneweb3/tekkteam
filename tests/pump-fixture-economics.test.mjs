import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture,pumpWalletFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {quotePumpVenue} from '../server/dex/pump-quote.js';
import {inspectPumpFixtureEconomics} from '../server/dex/pump-fixture-economics.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID} from '@solana/spl-token';
const now=1800000000000,wallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
async function setup(migrated,side){
 const b=await pumpAccountFixture({migrated});b.context.observedAt=now;const venue=decodePumpVenueBundle(b),intent={agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000},q=quotePumpVenue({venue,intent,now});
 const beforeAccounts=pumpWalletFixture(venue,wallet),afterAccounts=pumpWalletFixture(venue,wallet),buy=side==='BUY',debit=BigInt(q.estimatedDebit),output=BigInt(q.estimatedOutput);
 afterAccounts.base.data.writeBigUInt64LE(2000000000n+(buy?output:-debit),64);
 if(migrated){const wsol=150000000n+(buy?-debit:output);afterAccounts.quote.data.writeBigUInt64LE(wsol,64);afterAccounts.quote.lamports=Number(wsol)+2039280;afterAccounts.wallet.lamports-=5000;}
 else afterAccounts.wallet.lamports+=Number(buy?-debit-5000n:output-5000n);
 return {venue,intent,executionWallet:wallet,beforeAccounts,afterAccounts,networkFeeLamports:'5000',now};
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`fixture ${migrated} ${side} effects never produce receipts or Real PnL`,async()=>{const result=inspectPumpFixtureEconomics(await setup(migrated,side));assert.equal(result.notReceipt,true);assert.equal(result.positionEffect,null);assert.equal(result.pnlEffect,null);assert.equal(result.authorizationGranted,false);assert.equal(result.unspentBudget,migrated&&side==='BUY'?'1':'0');});
test('BUY rejects debit over approved budget even when output sufficient',async()=>{const x=await setup(true,'BUY');x.afterAccounts.quote.data.writeBigUInt64LE(49999999n,64);x.afterAccounts.quote.lamports=52039279;assert.throws(()=>inspectPumpFixtureEconomics(x),/ECONOMICS_MISMATCH/);});
test('SELL requires exact input rather than budget semantics',async()=>{const x=await setup(true,'SELL');x.afterAccounts.base.data.writeBigUInt64LE(1000000001n,64);assert.throws(()=>inspectPumpFixtureEconomics(x),/ECONOMICS_MISMATCH/);});
test('unexpected native debit in WSOL swap is not silently allocated as rent',async()=>{const x=await setup(true,'BUY');x.afterAccounts.wallet.lamports--;assert.throws(()=>inspectPumpFixtureEconomics(x),/UNEXPECTED_SOL_OR_RENT/);});
test('post account mint/authority is independently decoded',async()=>{const x=await setup(false,'BUY');x.afterAccounts.base.data.fill(0,32,64);assert.throws(()=>inspectPumpFixtureEconomics(x),/TOKEN_AUTHORITY/);});
test('balance fixture cannot label backend account state as a finalized receipt',async()=>{const x=await setup(true,'BUY');x.venue={...x.venue,source:'BACKEND_RPC_READ'};assert.throws(()=>inspectPumpFixtureEconomics(x),/FIXTURE_ECONOMICS_ONLY/);});
for(const [name,change]of [['below minimum',x=>x.afterAccounts.base.data.writeBigUInt64LE(2000000000n,64)],['zero debit',x=>{x.afterAccounts.quote.data.writeBigUInt64LE(150000000n,64);x.afterAccounts.quote.lamports=152039280;}],['negative debit',x=>{x.afterAccounts.quote.data.writeBigUInt64LE(150000001n,64);x.afterAccounts.quote.lamports=152039281;}],['wrong post mint',x=>NATIVE_MINT.toBuffer().copy(x.afterAccounts.base.data,0)],['wrong post program',x=>x.afterAccounts.base.owner=TOKEN_PROGRAM_ID.toBase58()],['wrong post slot',x=>x.afterAccounts.base.slot=101],['post above supply',x=>x.afterAccounts.base.data.writeBigUInt64LE(1000000000000001n,64)],['post WSOL unsynced',x=>x.afterAccounts.quote.lamports++]])test(`fixture effects reject ${name}`,async()=>{const x=await setup(true,'BUY');change(x);assert.throws(()=>inspectPumpFixtureEconomics(x));});
