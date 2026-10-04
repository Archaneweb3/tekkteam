import test from 'node:test';
import assert from 'node:assert/strict';
import {decodePumpVenueBundle,decodedPumpState} from '../server/dex/pump-account-decoder.js';
import {pumpAccountFixture,fixtureOwner} from './pump-account-fixture.mjs';
import {ExtensionType} from '@solana/spl-token';
for(const migrated of [false,true])test(`official offline decoder ${migrated?'canonical PumpSwap':'bonding curve'} remains disarmed`,async()=>{
 const input=await pumpAccountFixture({migrated}),v=decodePumpVenueBundle(input);assert.equal(v.kind,migrated?'PUMPSWAP':'PUMP_BONDING_CURVE');assert.equal(v.owner,fixtureOwner.toBase58());assert.equal(v.onChainVerified,false);assert.equal(v.authorizationGranted,false);assert.equal(Object.isFrozen(v),true);assert.throws(()=>decodedPumpState(JSON.parse(JSON.stringify(v))),/DECODED_STATE_REQUIRED/);
 if(migrated)assert.equal(decodedPumpState(v).pool.virtualQuoteReserves.toString(),'-5000000000');
});
const cases=[
 ['standalone Success without association',false,x=>{x.receipt={status:'Success',mint:'4Lr5S4tugXweyUCV55dSdjp2JU55onpCM3VeRah5qE9S'};}],
 ['Failed historical receipt',false,x=>{x.receipt.status='Failed';x.receipt.confirmed=false;}],
 ['Unknown historical receipt',false,x=>{x.receipt.status='Unknown';x.receipt.confirmed=false;}],
 ['Deleted historical receipt',false,x=>{x.receipt.status='Deleted';delete x.receipt.signature;}],
 ['Devnet receipt cannot be promoted',false,x=>{x.receipt.network='solana:103';}],
 ['confirmed flag without signature',false,x=>{delete x.receipt.signature;}],
 ['wrong owner',false,x=>{x.receipt.owner=x.receipt.mint;}],
 ['stale slot',false,x=>{x.context.currentSlot=999;}],
 ['wrong network',false,x=>{x.context.network='solana:103';}],
 ['foreign curve address',false,x=>{x.accounts.curve.address=x.receipt.owner;}],
 ['wrong program owner',false,x=>{x.accounts.curve.owner=x.receipt.owner;}],
 ['mixed account slot',false,x=>{x.accounts.mint.slot=99;}],
 ['wrong curve discriminator',false,x=>{x.accounts.curve.data[0]^=1;}],
 ['partial unknown curve layout',false,x=>{x.accounts.curve.data=x.accounts.curve.data.subarray(0,100);}],
 ['missing fees',false,x=>{delete x.accounts.feeConfig;}],
 ['partial fee layout',false,x=>{x.accounts.feeConfig.data=x.accounts.feeConfig.data.subarray(0,1000);}],
 ['missing migrated pool',true,x=>{delete x.accounts.pool;}],
 ['foreign migrated pool address',true,x=>{x.accounts.pool.address=x.receipt.owner;}],
 ['wrong pool discriminator',true,x=>{x.accounts.pool.data[0]^=1;}],
 ['foreign vault address',true,x=>{x.accounts.baseVault.address=x.receipt.owner;}],
 ['wrong quote mint',true,x=>{x.accounts.quoteMint.address=x.receipt.mint;}],
 ['uninitialized quote mint',true,x=>{x.accounts.quoteMint.data[45]=0;}],
];
for(const [name,migrated,mutate]of cases)test(`decoder rejects ${name}`,async()=>{const input=await pumpAccountFixture({migrated});mutate(input);assert.throws(()=>decodePumpVenueBundle(input));});
test('signed virtual quote reserve cannot exceed covered actual vault balance',async()=>{
 const input=await pumpAccountFixture({migrated:true,virtualQuote:'-20000000001'});assert.throws(()=>decodePumpVenueBundle(input),/EFFECTIVE_RESERVE_INVALID/);
});
test('classic base program remains decoder-compatible without promoting fixture provenance',async()=>{
 const v=decodePumpVenueBundle(await pumpAccountFixture({migrated:true,classic:true}));assert.equal(v.source,'LOCAL_FIXTURE');assert.equal(v.provenance,'DERIVED');
});
test('consumer mutation cannot change canonical decoded proof or raw snapshots',async()=>{
 const v=decodePumpVenueBundle(await pumpAccountFixture({migrated:true})),first=decodedPumpState(v);
 first.pool.virtualQuoteReserves.iaddn(500);first.feeConfig.feeTiers[0].fees.creatorFeeBps.iaddn(999);first.copied.pool.info.data[0]^=1;first.context.slot=0;
 const second=decodedPumpState(v);assert.equal(second.pool.virtualQuoteReserves.toString(),'-5000000000');assert.equal(second.feeConfig.feeTiers[0].fees.creatorFeeBps.toString(),'50');assert.notEqual(second.copied.pool.info.data[0],first.copied.pool.info.data[0]);assert.equal(second.context.slot,100);
});
const immutable=()=>{const data=Buffer.alloc(4);data.writeUInt16LE(ExtensionType.ImmutableOwner);return data;};
for(const [name,change]of [['unsynced WSOL',x=>x.accounts.quoteVault.lamports++],['missing WSOL lamports',x=>delete x.accounts.quoteVault.lamports],['unsafe WSOL lamports',x=>x.accounts.quoteVault.lamports=Number.MAX_SAFE_INTEGER+1],['base vault over supply',x=>x.accounts.baseVault.data.writeBigUInt64LE(1000000000000001n,64)]])test(`pool decoder rejects ${name}`,async()=>{const x=await pumpAccountFixture({migrated:true});change(x);assert.throws(()=>decodePumpVenueBundle(x));});
test('canonical Token-2022 pool ImmutableOwner remains supported',async()=>{const x=await pumpAccountFixture({migrated:true});x.accounts.baseVault.data=Buffer.concat([x.accounts.baseVault.data,Buffer.from([2]),immutable()]);assert.equal(decodePumpVenueBundle(x).kind,'PUMPSWAP');});
for(const [name,role,classic,tlv]of [
 ['duplicate','baseVault',false,Buffer.concat([immutable(),immutable()])],
 ['nonzero payload','baseVault',false,Buffer.from([7,0,1,0,1])],
 ['truncated payload','baseVault',false,Buffer.from([7,0,1,0])],
 ['trailing fragment','baseVault',false,Buffer.from([7,0,0,0,1])],
 ['classic base TLV','baseVault',true,immutable()],
 ['classic WSOL TLV','quoteVault',false,immutable()],
])test(`pool decoder rejects ${name}`,async()=>{const x=await pumpAccountFixture({migrated:true,classic});x.accounts[role].data=Buffer.concat([x.accounts[role].data,Buffer.from([2]),tlv]);assert.throws(()=>decodePumpVenueBundle(x));});
