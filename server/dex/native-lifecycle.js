import {PublicKey,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {SOL_MINT,integer,reject} from './intent.js';

// Narrow canonical classic-SPL WSOL ATA lifecycle only. Temporary keypairs,
// createWithSeed, nonzero existing WSOL balances and shared custody are rejected.
// This verifies SETUP/CLEANUP, never grants approval to the central route.
export function validateNativeLifecycle({intent,setup,cleanup,accounts}){
 const wallet=new PublicKey(intent.agentWallet),nativeMint=new PublicKey(SOL_MINT),wsol=getAssociatedTokenAddressSync(nativeMint,wallet).toBase58();
 const buy=intent.direction==='BUY',output=new PublicKey(intent.outputMint),outputAta=getAssociatedTokenAddressSync(output,wallet).toBase58();
 const sourceProof=accounts.find(a=>a.address===wsol);if(!sourceProof||sourceProof.amount!=='0')reject('WSOL_ACCOUNT_UNVERIFIED');
 const required=new Set(accounts.filter(a=>!a.exists).map(a=>a.address)),created=new Set();let funded=false,synced=false;
 for(const ix of setup){
  const keys=ix.keys.map(k=>k.pubkey.toBase58());
  if(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)){
   if(ix.data.length!==1||ix.data[0]!==1||keys.length!==6||keys[0]!==intent.agentWallet||keys[2]!==intent.agentWallet||keys[4]!==SystemProgram.programId.toBase58()||keys[5]!==TOKEN_PROGRAM_ID.toBase58())reject('ATA_CREATION_INVALID');
   const mint=keys[3];if(mint!==SOL_MINT&&mint!==intent.outputMint)reject('UNRELATED_ATA');
   const derived=getAssociatedTokenAddressSync(new PublicKey(mint),wallet).toBase58();
   if(keys[1]!==derived||!accounts.some(a=>a.address===derived)||created.has(derived))reject('ATA_DERIVATION_INVALID');
   if(!ix.keys[0].isSigner||!ix.keys[0].isWritable||!ix.keys[1].isWritable||ix.keys[1].isSigner||ix.keys.slice(3).some(k=>k.isSigner||k.isWritable))reject('ATA_PRIVILEGES_INVALID');created.add(derived);
  }else if(ix.programId.equals(SystemProgram.programId)){
   if(!buy||funded||synced||ix.data.length!==12||ix.data.readUInt32LE(0)!==2||keys.length!==2||keys[0]!==intent.agentWallet||keys[1]!==wsol||!ix.keys[0].isSigner||!ix.keys[0].isWritable||!ix.keys[1].isWritable||ix.keys[1].isSigner||ix.data.readBigUInt64LE(4)!==integer(intent.inputAmount)||(!sourceProof.exists&&!created.has(wsol)))reject('UNEXPECTED_SOL_TRANSFER');funded=true;
  }else if(ix.programId.equals(TOKEN_PROGRAM_ID)){
   if(!buy||!funded||synced||ix.data.length!==1||ix.data[0]!==17||keys.length!==1||keys[0]!==wsol||!ix.keys[0].isWritable||ix.keys[0].isSigner)reject('UNEXPECTED_TOKEN_SETUP');synced=true;
  }else reject('UNKNOWN_SETUP_PROGRAM');
 }
 if([...required].some(a=>!created.has(a))||(buy&&(!funded||!synced))||(!buy&&(funded||synced)))reject('INCOMPLETE_NATIVE_SETUP');
 if(cleanup.length!==1)reject('NATIVE_CLOSE_REQUIRED');
 const ix=cleanup[0],keys=ix.keys.map(k=>k.pubkey.toBase58());
 if(!ix.programId.equals(TOKEN_PROGRAM_ID)||ix.data.length!==1||ix.data[0]!==9||keys.length!==3||keys[0]!==wsol||keys[1]!==intent.agentWallet||keys[2]!==intent.agentWallet||!ix.keys[0].isWritable||ix.keys[0].isSigner||!ix.keys[1].isWritable||!ix.keys[2].isSigner)reject('WSOL_CLOSE_DESTINATION_INVALID');
 return {wsolAccount:wsol,outputTokenAccount:outputAta,inputMaximum:intent.inputAmount,closeDestination:intent.agentWallet,setupVerified:true,routeVerified:false};
}
