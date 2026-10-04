import {PublicKey,SystemProgram} from '@solana/web3.js';
import {unpackAccount,getAssociatedTokenAddressSync,NATIVE_MINT,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {qualifiedPumpTokenAccountExtensions} from './pump-token-account-extension.js';
import {decodedPumpState} from './pump-account-decoder.js';
import {quotePumpVenue} from './pump-quote.js';
import {rejectPump} from './pump-sdk-boundary.js';

function lamports(value){if(!Number.isSafeInteger(value)||value<0)rejectPump('PUMP_WALLET_LAMPORTS_INVALID');return BigInt(value);}
export function readOfflinePumpWalletBalances({venue,executionWallet,accounts}={}){
 const s=decodedPumpState(venue),wallet=new PublicKey(executionWallet);
 if(!PublicKey.isOnCurve(wallet.toBytes())||wallet.equals(PublicKey.default))rejectPump('PUMP_EXECUTION_WALLET_INVALID');
 const account=(role,address,program)=>{
  const a=accounts?.[role];if(!a||a.exists!==true||a.slot!==venue.slot||a.address!==address.toBase58()||a.owner!==program.toBase58()||a.executable!==false||!Buffer.isBuffer(a.data)||a.data.length>16384)rejectPump('PUMP_WALLET_ACCOUNT_UNQUALIFIED');
  return {data:Buffer.from(a.data),owner:program,executable:false,lamports:Number(lamports(a.lamports)),rentEpoch:0};
 };
 const walletInfo=account('wallet',wallet,SystemProgram.programId);if(walletInfo.data.length!==0)rejectPump('PUMP_WALLET_SYSTEM_ACCOUNT_INVALID');
 const baseAddress=getAssociatedTokenAddressSync(s.mint,wallet,false,s.tokenProgram);
 let base;try{base=unpackAccount(baseAddress,account('base',baseAddress,s.tokenProgram),s.tokenProgram);}catch(e){if(e.code)throw e;rejectPump('PUMP_WALLET_BASE_DECODE_INVALID');}
 function token(a,mint,native){if(!a.owner.equals(wallet)||!a.mint.equals(mint)||!a.isInitialized||a.isFrozen||a.delegate||a.closeAuthority||a.isNative!==native||!qualifiedPumpTokenAccountExtensions(a.tlvData,native?TOKEN_PROGRAM_ID:s.tokenProgram))rejectPump('PUMP_WALLET_TOKEN_AUTHORITY_INVALID');}
 token(base,s.mint,false);if(base.amount>s.minted.supply)rejectPump('PUMP_WALLET_BASE_SUPPLY_INVALID');let quoteBalance=0n;
 if(venue.kind==='PUMPSWAP'){
  const address=getAssociatedTokenAddressSync(NATIVE_MINT,wallet),info=account('quote',address,TOKEN_PROGRAM_ID);let native;
  try{native=unpackAccount(address,info,TOKEN_PROGRAM_ID);}catch{rejectPump('PUMP_WALLET_QUOTE_DECODE_INVALID');}token(native,NATIVE_MINT,true);
  if(lamports(info.lamports)!==native.amount+native.rentExemptReserve)rejectPump('PUMP_WALLET_WSOL_UNSYNCED');quoteBalance=native.amount;
 }
 return Object.freeze({schema:'PUMP_OFFLINE_WALLET_BALANCES_V1',agentWallet:wallet.toBase58(),mint:venue.mint,slot:venue.slot,baseTokenAccount:baseAddress.toBase58(),baseBalance:base.amount.toString(),wsolBalance:quoteBalance.toString(),solBalance:lamports(walletInfo.lamports).toString(),provenance:'DERIVED',source:venue.source,ownershipAuthorized:false,executable:false});
}
export function inspectOfflinePumpWalletAccounts(options={}){
 const {venue,intent,networkFeeLamports,now=Date.now()}=options,quote=quotePumpVenue({venue,intent,now}),balances=readOfflinePumpWalletBalances(options);
 if(typeof networkFeeLamports!=='string'||! /^[0-9]{1,20}$/.test(networkFeeLamports)||BigInt(networkFeeLamports)>10000000n)rejectPump('PUMP_WALLET_FEE_CAP_INVALID');
 const input=BigInt(quote.inputAmount),fee=BigInt(networkFeeLamports),sol=BigInt(balances.solBalance);
 if(sol<fee||intent.side==='BUY'&&(venue.kind==='PUMPSWAP'?BigInt(balances.wsolBalance)<input:sol<input+fee)||intent.side==='SELL'&&BigInt(balances.baseBalance)<input)rejectPump('PUMP_WALLET_BALANCE_INSUFFICIENT');
 return Object.freeze({...balances,schema:'PUMP_OFFLINE_WALLET_INSPECTION_V1',networkFeeLamports,accountCreationIncluded:false,solWrapIncluded:false});
}
