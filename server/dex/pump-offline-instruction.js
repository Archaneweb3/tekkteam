import {PublicKey,SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,NATIVE_MINT,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {decodedPumpState} from './pump-account-decoder.js';
import {quotePumpVenue} from './pump-quote.js';
import {pumpSdk,swapSdk,curveProgram,swapProgram,BN,rejectPump} from './pump-sdk-boundary.js';

const extra=(pubkey,isWritable=false)=>({pubkey,isSigner:false,isWritable});
function recipient(values){
 const keys=values.filter(p=>p instanceof PublicKey&&!p.equals(PublicKey.default));
 if(!keys.length)rejectPump('PUMP_FEE_RECIPIENT_UNAVAILABLE');return keys[0];
}

// An ABI fixture artifact, not an execution plan. No wallet funding/ATA side effects.
export async function buildOfflinePumpInstruction({venue,intent,executionWallet,now=Date.now()}={}){
 const quote=quotePumpVenue({venue,intent,now}),s=decodedPumpState(venue),buy=intent.side==='BUY';
 let user;try{user=new PublicKey(executionWallet);}catch{rejectPump('PUMP_EXECUTION_WALLET_INVALID');}
 if(user.equals(PublicKey.default)||!PublicKey.isOnCurve(user.toBytes()))rejectPump('PUMP_EXECUTION_WALLET_INVALID');
 const ata=(mint,owner,program=TOKEN_PROGRAM_ID)=>getAssociatedTokenAddressSync(mint,owner,true,program);
 const buyback=recipient(s.global.buybackFeeRecipients??[]),amount=new BN(quote.inputAmount),minimum=new BN(quote.minimumOutput);
 let accounts,remaining,program,method;
 if(venue.kind==='PUMP_BONDING_CURVE'){
  const curve=pumpSdk.bondingCurvePda(s.mint);
  accounts={global:pumpSdk.GLOBAL_PDA,feeRecipient:recipient([s.global.feeRecipient,...s.global.feeRecipients]),mint:s.mint,bondingCurve:curve,associatedBondingCurve:ata(s.mint,curve,s.tokenProgram),associatedUser:ata(s.mint,user,s.tokenProgram),user,systemProgram:SystemProgram.programId,tokenProgram:s.tokenProgram,creatorVault:pumpSdk.creatorVaultPda(s.curve.creator),eventAuthority:pumpSdk.PUMP_EVENT_AUTHORITY_PDA,program:pumpSdk.PUMP_PROGRAM_ID,feeConfig:pumpSdk.PUMP_FEE_CONFIG_PDA,feeProgram:pumpSdk.PUMP_FEE_PROGRAM_ID};
  if(buy)Object.assign(accounts,{globalVolumeAccumulator:pumpSdk.GLOBAL_VOLUME_ACCUMULATOR_PDA,userVolumeAccumulator:pumpSdk.userVolumeAccumulatorPda(user)});
  remaining=[extra(pumpSdk.bondingCurveV2Pda(s.mint)),extra(buyback,true)];program=curveProgram;method=buy?'buyExactSolIn':'sell';
 }else{
  const fee=recipient(s.global.protocolFeeRecipients),authority=swapSdk.coinCreatorVaultAuthorityPda(s.pool.coinCreator);
  accounts={pool:new PublicKey(venue.venue),user,globalConfig:swapSdk.GLOBAL_CONFIG_PDA,baseMint:s.mint,quoteMint:NATIVE_MINT,userBaseTokenAccount:ata(s.mint,user,s.tokenProgram),userQuoteTokenAccount:ata(NATIVE_MINT,user),poolBaseTokenAccount:s.pool.poolBaseTokenAccount,poolQuoteTokenAccount:s.pool.poolQuoteTokenAccount,protocolFeeRecipient:fee,protocolFeeRecipientTokenAccount:ata(NATIVE_MINT,fee),baseTokenProgram:s.tokenProgram,quoteTokenProgram:TOKEN_PROGRAM_ID,systemProgram:SystemProgram.programId,associatedTokenProgram:ASSOCIATED_TOKEN_PROGRAM_ID,eventAuthority:swapSdk.PUMP_AMM_EVENT_AUTHORITY_PDA,program:swapSdk.PUMP_AMM_PROGRAM_ID,coinCreatorVaultAta:ata(NATIVE_MINT,authority),coinCreatorVaultAuthority:authority,feeConfig:swapSdk.PUMP_AMM_FEE_CONFIG_PDA,feeProgram:swapSdk.PUMP_FEE_PROGRAM_ID};
  if(buy)Object.assign(accounts,{globalVolumeAccumulator:swapSdk.GLOBAL_VOLUME_ACCUMULATOR_PDA,userVolumeAccumulator:swapSdk.userVolumeAccumulatorPda(user)});
  remaining=[extra(swapSdk.poolV2Pda(s.mint)),extra(buyback),extra(ata(NATIVE_MINT,buyback),true)];program=swapProgram;method=buy?'buyExactQuoteIn':'sell';
 }
 const builder=buy?program.methods[method](amount,minimum,{0:false}):program.methods[method](amount,minimum);
 const instruction=await builder.accountsStrict(accounts).remainingAccounts(remaining).instruction();
 const accountRoles=Object.freeze([...Object.entries(accounts).map(([role,key])=>Object.freeze({role,address:key.toBase58()})),...remaining.map((meta,index)=>Object.freeze({role:`remaining${index}`,address:meta.pubkey.toBase58()}))]);
 return {instruction,accountRoles,quote,method,executionWallet:user.toBase58(),provenance:'DERIVED',walletAuthorityVerified:false,walletAccountsVerified:false,simulationVerified:false,executable:false,authorizationGranted:false};
}
