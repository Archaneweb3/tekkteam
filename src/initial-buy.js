import {PublicKey,TransactionInstruction} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';

// Exact decimal conversion: never round user-authorized value through a float.
export function parseInitialBuy(value='0') {
 if(typeof value!=='string'||!/^(?:\d+)(?:\.\d{1,9})?$/.test(value))throw Error('Enter a non-negative SOL amount with at most 9 decimals');
 const [whole,fraction='']=value.split('.');const n=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('SOL amount exceeds supported precision');
 return Number(n);
}
export function buyLamports(launch){const n=launch?.initialBuyLamports??0;if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid initial buy lamports');return n;}
export const FEE_PROGRAM='pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';
// Official pinned FEE_RECIPIENTS.md; membership is rechecked against Mainnet Global.
export const FEE_RECIPIENT='62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV';
export const BUYBACK_RECIPIENT='5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD';
const pump=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const pda=(program,...seeds)=>PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s.toBuffer()),program)[0];
export function initialBuyAccounts(mint,owner){
 const user=new PublicKey(owner),curve=pda(pump,'bonding-curve',mint),fee=new PublicKey(FEE_PROGRAM);
 const names=['global','fee_recipient','mint','bonding_curve','associated_bonding_curve','associated_user','user','system_program','token_program','creator_vault','event_authority','program','global_volume_accumulator','user_volume_accumulator','fee_config','fee_program','bonding_curve_v2','buyback_fee_recipient'];
 const addresses=[pda(pump,'global'),new PublicKey(FEE_RECIPIENT),mint,curve,getAssociatedTokenAddressSync(mint,curve,true,TOKEN_2022_PROGRAM_ID),getAssociatedTokenAddressSync(mint,user,false,TOKEN_2022_PROGRAM_ID),user,PublicKey.default,TOKEN_2022_PROGRAM_ID,pda(pump,'creator-vault',user),pda(pump,'__event_authority'),pump,pda(pump,'global_volume_accumulator'),pda(pump,'user_volume_accumulator',user),pda(fee,'fee_config',pump),fee,pda(pump,'bonding-curve-v2',mint),new PublicKey(BUYBACK_RECIPIENT)];
 return addresses.map((pubkey,i)=>({name:names[i],pubkey,isSigner:i===6,isWritable:[1,3,4,5,6,9,13,17].includes(i)}));
}
export function initialBuyInstructions(mint,launch){
 const amount=buyLamports(launch);if(!amount)return [];
 const keys=initialBuyAccounts(mint,launch.owner),data=Buffer.alloc(25);
 Buffer.from([56,252,116,8,158,223,205,95]).copy(data);data.writeBigUInt64LE(BigInt(amount),8);
 // Atomic creation of a new mint: no pre-existing curve can trade before this buy.
 // Require at least one base unit; reject failed/tiny buys rather than changing input.
 data.writeBigUInt64LE(1n,16);
 return [createAssociatedTokenAccountIdempotentInstruction(keys[6].pubkey,keys[5].pubkey,keys[6].pubkey,mint,TOKEN_2022_PROGRAM_ID),new TransactionInstruction({programId:pump,keys,data})];
}
