import {PublicKey} from '@solana/web3.js';
import {unpackAccount,NATIVE_MINT,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {curveProgram,swapProgram,pumpSdk,swapSdk,rejectPump} from './pump-sdk-boundary.js';
import {qualifiedPumpTokenAccountExtensions} from './pump-token-account-extension.js';

export async function qualifyOfflinePumpAuxiliary({role,raw,venue,state,roles,executionWallet}){
 const migrated=venue.kind==='PUMPSWAP',program=migrated?swapProgram:curveProgram;
 const programId=migrated?swapSdk.PUMP_AMM_PROGRAM_ID:pumpSdk.PUMP_PROGRAM_ID;
 if(['globalVolumeAccumulator','userVolumeAccumulator'].includes(role)){
  if(raw.owner!==programId.toBase58()||raw.executable!==false)rejectPump('PUMP_VOLUME_ACCOUNT_OWNER_INVALID');
  try{
   const decoded=program.coder.accounts.decode(role,raw.data),encoded=await program.coder.accounts.encode(role,decoded);
   if(!Buffer.from(encoded).equals(raw.data))rejectPump('PUMP_VOLUME_ACCOUNT_LAYOUT_INVALID');
   if(role==='userVolumeAccumulator'&&!decoded.user.equals(new PublicKey(executionWallet)))rejectPump('PUMP_VOLUME_USER_MISMATCH');
   if(role==='globalVolumeAccumulator'&&(decoded.startTime.isNeg()||decoded.endTime.lt(decoded.startTime)||decoded.secondsInADay.lten(0)))rejectPump('PUMP_VOLUME_WINDOW_INVALID');
   return true;
  }catch(e){if(e.code)throw e;rejectPump('PUMP_VOLUME_ACCOUNT_LAYOUT_INVALID');}
 }
 let mint,authority,tokenProgram;
 if(migrated&&['poolBaseTokenAccount','poolQuoteTokenAccount'].includes(role)){
  const native=role==='poolQuoteTokenAccount';mint=native?NATIVE_MINT:state.mint;authority=new PublicKey(venue.venue);tokenProgram=native?TOKEN_PROGRAM_ID:state.tokenProgram;
 }
 if(role==='associatedBondingCurve'){mint=state.mint;authority=new PublicKey(roles.get('bondingCurve'));tokenProgram=state.tokenProgram;}
 if(migrated&&['protocolFeeRecipientTokenAccount','coinCreatorVaultAta','remaining2'].includes(role)){
  mint=NATIVE_MINT;tokenProgram=TOKEN_PROGRAM_ID;
  authority=new PublicKey(roles.get(role==='protocolFeeRecipientTokenAccount'?'protocolFeeRecipient':role==='coinCreatorVaultAta'?'coinCreatorVaultAuthority':'remaining1'));
 }
 if(!mint)return false;
 if(raw.owner!==tokenProgram.toBase58()||raw.executable!==false||!Number.isSafeInteger(raw.lamports)||raw.lamports<0)rejectPump('PUMP_DESTINATION_BINDING_INVALID');
 const address=getAssociatedTokenAddressSync(mint,authority,true,tokenProgram);
 if(address.toBase58()!==raw.address)rejectPump('PUMP_DESTINATION_BINDING_INVALID');
 try{
  const account=unpackAccount(address,{data:raw.data,owner:tokenProgram,executable:false,lamports:raw.lamports,rentEpoch:0},tokenProgram),native=mint.equals(NATIVE_MINT);
  if(!account.mint.equals(mint)||!account.owner.equals(authority)||!account.isInitialized||account.isFrozen||account.delegate||account.closeAuthority||account.isNative!==native||!qualifiedPumpTokenAccountExtensions(account.tlvData,tokenProgram))rejectPump('PUMP_DESTINATION_AUTHORITY_INVALID');
  if(native&&BigInt(raw.lamports)!==account.amount+account.rentExemptReserve)rejectPump('PUMP_DESTINATION_WSOL_UNSYNCED');
  if(!native&&account.amount>state.minted.supply)rejectPump('PUMP_DESTINATION_SUPPLY_INVALID');
  return true;
 }catch(e){if(e.code)throw e;rejectPump('PUMP_DESTINATION_LAYOUT_INVALID');}
}
