import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {pumpAccountFixture} from './pump-account-fixture.mjs';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpInstruction} from '../server/dex/pump-offline-instruction.js';
const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),amm=new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'),fee=new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'),wallet=new PublicKey('1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM'),now=1800000000000;
const pda=(program,...seeds)=>PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s),program)[0];
const ata=(mint,owner,program=TOKEN_PROGRAM_ID)=>getAssociatedTokenAddressSync(mint,owner,true,program);
const key=n=>new PublicKey(Buffer.alloc(32,n));
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`independent PDA/account/privilege oracle ${migrated} ${side}`,async()=>{
 const b=await pumpAccountFixture({migrated});b.context.observedAt=now;const venue=decodePumpVenueBundle(b),mint=new PublicKey(venue.mint),creator=new PublicKey(venue.owner),buy=side==='BUY';
 const result=await buildOfflinePumpInstruction({venue,executionWallet:wallet.toBase58(),now,intent:{agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:buy?venue.quoteMint:venue.mint,outputMint:buy?venue.mint:venue.quoteMint,inputAmount:buy?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000}});
 let addresses,writable,signer;
 if(!migrated){
  const curve=pda(pump,'bonding-curve',mint.toBuffer()),vault=pda(pump,'creator-vault',creator.toBuffer());
  const prefix=[pda(pump,'global'),key(31),mint,curve,ata(mint,curve,TOKEN_2022_PROGRAM_ID),ata(mint,wallet,TOKEN_2022_PROGRAM_ID),wallet,SystemProgram.programId];
  addresses=buy?[...prefix,TOKEN_2022_PROGRAM_ID,vault,pda(pump,'__event_authority'),pump,pda(pump,'global_volume_accumulator'),pda(pump,'user_volume_accumulator',wallet.toBuffer()),pda(fee,'fee_config',pump.toBuffer()),fee]:[...prefix,vault,TOKEN_2022_PROGRAM_ID,pda(pump,'__event_authority'),pump,pda(fee,'fee_config',pump.toBuffer()),fee];
  addresses.push(pda(pump,'bonding-curve-v2',mint.toBuffer()),key(41));writable=buy?[1,3,4,5,6,9,13,17]:[1,3,4,5,6,8,15];signer=6;
 }else{
  const authority=pda(pump,'pool-authority',mint.toBuffer()),pool=pda(amm,'pool',Buffer.from([0,0]),authority.toBuffer(),mint.toBuffer(),NATIVE_MINT.toBuffer()),creatorVault=pda(amm,'creator_vault',creator.toBuffer());
  addresses=[pool,wallet,pda(amm,'global_config'),mint,NATIVE_MINT,ata(mint,wallet,TOKEN_2022_PROGRAM_ID),ata(NATIVE_MINT,wallet),ata(mint,pool,TOKEN_2022_PROGRAM_ID),ata(NATIVE_MINT,pool),key(31),ata(NATIVE_MINT,key(31)),TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,SystemProgram.programId,ASSOCIATED_TOKEN_PROGRAM_ID,pda(amm,'__event_authority'),amm,ata(NATIVE_MINT,creatorVault),creatorVault];
  if(buy)addresses.push(pda(amm,'global_volume_accumulator'),pda(amm,'user_volume_accumulator',wallet.toBuffer()));
  addresses.push(pda(fee,'fee_config',amm.toBuffer()),fee,pda(amm,'pool-v2',mint.toBuffer()),key(41),ata(NATIVE_MINT,key(41)));
  writable=buy?[0,1,5,6,7,8,10,17,20,25]:[0,1,5,6,7,8,10,17,23];signer=1;
 }
 assert.deepEqual(result.instruction.keys.map(k=>k.pubkey.toBase58()),addresses.map(k=>k.toBase58()));
 assert.deepEqual(result.instruction.keys.map(k=>k.isWritable),addresses.map((_,i)=>writable.includes(i)));assert.deepEqual(result.instruction.keys.map(k=>k.isSigner),addresses.map((_,i)=>i===signer));
 assert.equal(result.instruction.programId.toBase58(),(migrated?amm:pump).toBase58());if(buy)assert.equal(result.instruction.data[24],0);
});
