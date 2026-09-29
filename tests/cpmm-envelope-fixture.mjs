import fs from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {CPMM_ENVELOPE} from '../server/dex/cpmm-envelope.js';
export const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-messages.json',import.meta.url)));
export const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/concrete-cpmm-mainnet.json',import.meta.url)));
export function tokenInfo(mint,owner,amount,{native=false}={}){
 const data=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(data,0);new PublicKey(owner).toBuffer().copy(data,32);data.writeBigUInt64LE(BigInt(amount),64);data[108]=1;
 if(native){data.writeUInt32LE(1,109);data.writeBigUInt64LE(BigInt(captured.ataRentLamports),113);}
 return {owner:TOKEN_PROGRAM_ID.toBase58(),executable:false,lamports:captured.ataRentLamports,data:data.toString('base64')};
}
export function fixture(direction='BUY'){
 const f=captured.messages.find(m=>m.direction===direction);
 const p={envelope:CPMM_ENVELOPE,intent:{...f.intent,slippageBps:100},snapshot:structuredClone(snapshot),agentAccounts:captured.accountProofs.map(a=>({address:a.address,info:null})),rentLamports:String(captured.ataRentLamports),networkFeeCapLamports:'10000',agentBalanceLamports:String(captured.agentBalance),computeBudget:{units:200000,microLamports:0},blockhash:captured.block.blockhash};
 // Explicitly synthetic test-only holding. Never written to Mainnet or local DB.
 if(direction==='SELL')p.agentAccounts[1].info=tokenInfo(p.intent.inputMint,p.intent.agentWallet,'10000');
 return p;
}
