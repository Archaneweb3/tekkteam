import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
const e=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-pump-pool.json',import.meta.url)));
const sdk=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-pump-sdk-evidence.json',import.meta.url)));
test('Pump concrete snapshot: canonical PDA, discriminator and classic mint provenance',()=>{
 const f=e.fields,p=new PublicKey(e.accounts[0].address),program=new PublicKey(e.accounts[1].address),idx=Buffer.alloc(2);idx.writeUInt16LE(f.index);
 assert.equal(e.accounts[0].owner,program.toBase58());
 assert.equal(Buffer.from(e.accounts[0].dataBase64,'base64').subarray(0,8).toString('hex'),'f19a6d0411b16dbc');
 assert.equal(PublicKey.findProgramAddressSync([Buffer.from('pool'),idx,...['creator','base_mint','quote_mint'].map(k=>new PublicKey(f[k]).toBuffer())],program)[0].toBase58(),p.toBase58());
 assert.equal(e.pda.creatorMatches,true);for(const i of [5,6]){assert.equal(e.accounts[i].owner,TOKEN_PROGRAM_ID.toBase58());assert.equal(e.accounts[i].dataLength,82);}
 for(const k of ['is_mayhem_mode','is_cashback_coin','is_holder_reward'])assert.equal(f[k],false);
});
test('Pump concrete reserves: vault authority, ATA, mint and effective quote',()=>{
 const pool=new PublicKey(e.accounts[0].address);for(const [i,m]of [[7,e.fields.base_mint],[8,e.fields.quote_mint]]){const a=e.accounts[i],x=unpackAccount(new PublicKey(a.address),{owner:new PublicKey(a.owner),data:Buffer.from(a.dataBase64,'base64')},TOKEN_PROGRAM_ID);assert.equal(x.mint.toBase58(),m);assert.equal(x.owner.toBase58(),pool.toBase58());assert.equal(getAssociatedTokenAddressSync(x.mint,pool,true).toBase58(),a.address);assert.equal(x.isFrozen,false);assert.equal(x.delegate,null);assert.equal(x.closeAuthority,null);assert(x.amount>0n);}
 assert.equal(e.fields.virtual_quote_reserves,'0');
});
test('Pump evidence stops at unmodeled buyback remaining accounts, not a supported swap',()=>{
 const data=Buffer.from(e.accounts[2].dataBase64,'base64');let offset=8;let buyback;
 for(const field of e.schema.global.type.fields){const t=field.type,n=typeof t==='object'?t.array[1]*32:{pubkey:32,u64:8,bool:1,u8:1}[t];if(field.name==='buyback_basis_points')buyback=data.readBigUInt64LE(offset);offset+=n;}
 assert.equal(buyback,5000n);assert.match(sdk.fragments.buy,/buybackFeeRecipientTokenAccount/);assert.match(sdk.fragments.sell,/buybackFeeRecipientTokenAccount/);
 assert.match(sdk.fragments.buy,/methods\.buy\(baseOut, maxQuoteIn/);
 assert.doesNotMatch(sdk.fragments.buy,/methods\.buyExactQuoteIn/);
 // These fixtures establish a blocker, not math parity or validator support.
});
