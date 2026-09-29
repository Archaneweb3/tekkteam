import {AddressLookupTableAccount,AddressLookupTableProgram,PublicKey,SystemProgram,VersionedTransaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ACCOUNT_SIZE,MINT_SIZE,unpackAccount,unpackMint,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {createHash} from 'node:crypto';
import {GENESIS} from '../../src/pump-readiness.js';
import {SOL_MINT,reject} from './intent.js';
import {decodeDexTransaction} from './transaction-validator.js';

const key=x=>new PublicKey(x),hash=x=>createHash('sha256').update(x).digest('hex');
const safeLamports=x=>{if(!Number.isSafeInteger(x)||x<0)reject('INVALID_RPC_LAMPORTS');return String(x);};
export async function assertMainnet(connection){if(await connection.getGenesisHash()!==GENESIS)reject('NETWORK_MISMATCH');}
export async function resolveMainnetTables(connection,message,{minContextSlot=0}={}){
 await assertMainnet(connection);const lookupTables=[],proofs=[];
 if(message.version!==0)return {lookupTables,proofs};
 const seen=new Set();
 for(const lookup of message.addressTableLookups){
  const address=lookup.accountKey.toBase58();if(seen.has(address))reject('DUPLICATE_LOOKUP_TABLE');seen.add(address);
  const {context,value}=await connection.getAccountInfoAndContext(lookup.accountKey,{commitment:'confirmed',minContextSlot});
  if(!value||value.executable||!value.owner.equals(AddressLookupTableProgram.programId)||!Number.isSafeInteger(context?.slot)||context.slot<minContextSlot)reject('ALT_PROVENANCE_INVALID');
  let state;try{state=AddressLookupTableAccount.deserialize(value.data);}catch{reject('ALT_DATA_INVALID');}
  if(state.deactivationSlot!==18446744073709551615n||state.lastExtendedSlot>=context.slot||state.addresses.length>256)reject('ALT_NOT_STABLE_ACTIVE');
  const indexes=[...lookup.writableIndexes,...lookup.readonlyIndexes];
  if(new Set(indexes).size!==indexes.length||indexes.some(i=>!Number.isSafeInteger(i)||i<0||i>=state.addresses.length))reject('ALT_INDEX_INVALID');
  lookupTables.push(new AddressLookupTableAccount({key:lookup.accountKey,state}));proofs.push({address,slot:context.slot,dataHash:hash(value.data),resolved:indexes.map(i=>state.addresses[i].toBase58())});
 }
 return {lookupTables,proofs};
}
export async function decodeMainnetTransaction(connection,encoded,options={}){
 let tx;try{if(typeof encoded!=='string'||encoded.length>1644)throw Error();tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));}catch{reject('DECODE_FAILURE');}
 const tables=await resolveMainnetTables(connection,tx.message,options);
 const decoded=decodeDexTransaction(encoded,tables);return {...decoded,...tables};
}
export async function inspectMainnetTokenAccounts(connection,intent,{now=Date.now,minContextSlot=0}={}){
 await assertMainnet(connection);const wallet=key(intent.agentWallet),inputMint=key(intent.inputMint),outputMint=key(intent.outputMint);
 if(inputMint.equals(outputMint))reject('SAME_MINT');
 const inputAta=getAssociatedTokenAddressSync(inputMint,wallet),outputAta=getAssociatedTokenAddressSync(outputMint,wallet);
 const addresses=[wallet,inputMint,outputMint,inputAta,outputAta];
 const result=await connection.getMultipleAccountsInfoAndContext(addresses,{commitment:'confirmed',minContextSlot});
 if(!Number.isSafeInteger(result.context?.slot)||result.context.slot<minContextSlot||result.value?.length!==5)reject('ACCOUNT_CONTEXT_INVALID');
 const [walletInfo,...infos]=result.value;if(!walletInfo||walletInfo.executable||!walletInfo.owner.equals(SystemProgram.programId)||walletInfo.data.length!==0)reject('AGENT_WALLET_PROVENANCE_INVALID');
 const mints=[inputMint,outputMint].map((mint,i)=>{
  const info=infos[i];if(!info||info.executable||info.data.length!==MINT_SIZE)reject('MINT_LAYOUT_UNSUPPORTED');
  let decoded;try{decoded=unpackMint(mint,info,TOKEN_PROGRAM_ID);}catch{reject('MINT_PROGRAM_INVALID');}
  if(!decoded.isInitialized||decoded.tlvData.length)reject('MINT_STATE_UNSUPPORTED');
  return {address:mint.toBase58(),decimals:decoded.decimals,freezeAuthority:decoded.freezeAuthority?.toBase58()??null,program:TOKEN_PROGRAM_ID.toBase58()};
 });
 const accounts=[inputAta,outputAta].map((ata,i)=>{
  const info=infos[i+2];if(!info)return {address:ata.toBase58(),exists:false,amount:'0',rentLamports:'0'};
  if(info.executable||info.data.length!==ACCOUNT_SIZE)reject('TOKEN_ACCOUNT_LAYOUT_UNSUPPORTED');
  let a;try{a=unpackAccount(ata,info,TOKEN_PROGRAM_ID);}catch{reject('TOKEN_ACCOUNT_PROGRAM_INVALID');}
  if(!a.owner.equals(wallet)||a.mint.toBase58()!==mints[i].address||!a.isInitialized||a.isFrozen||a.delegate||a.closeAuthority||a.tlvData.length)reject('TOKEN_ACCOUNT_PROVENANCE_INVALID');
  const native=mints[i].address===SOL_MINT;
  if(a.isNative!==native)reject('TOKEN_NATIVE_FLAG_INVALID');
  if(native&&a.amount!==0n)reject('EXISTING_WSOL_BALANCE_UNSUPPORTED');
  return {address:ata.toBase58(),exists:true,amount:a.amount.toString(),rentLamports:native?safeLamports(Number(a.rentExemptReserve)):safeLamports(info.lamports),program:TOKEN_PROGRAM_ID.toBase58()};
 });
 if(intent.direction==='SELL'&&!accounts[0].exists)reject('INPUT_TOKEN_ACCOUNT_MISSING');
 const rent=await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE,'confirmed');safeLamports(rent);
 if(rent<=0)reject('RENT_UNAVAILABLE');
 return {network:'solana:mainnet',slot:result.context.slot,observedAt:now(),agentWallet:intent.agentWallet,solBalanceLamports:safeLamports(walletInfo.lamports),inputMint:intent.inputMint,outputMint:intent.outputMint,inputTokenAccount:inputAta.toBase58(),outputTokenAccount:outputAta.toBase58(),mints,accounts,inputTokenBalance:accounts[0].amount,ataRentLamports:(BigInt(rent)*BigInt(accounts.filter(a=>!a.exists).length)).toString(),rentPerAccountLamports:String(rent),mintsVerified:true,tokenAccountsVerified:true};
}

// A mint/token owner check is NOT a pool-account proof. Only a pinned route
// decoder may add pool vault/state roles after checking their program data/PDAs.
export function assertAccountProvenance(decoded,roles){
 for(const account of decoded.accounts){const role=roles.get(account.address);if(!role||typeof role.kind!=='string')reject('UNKNOWN_ACCOUNT_PROVENANCE');if(account.writable&&!role.writable)reject('UNEXPLAINED_WRITABLE_ACCOUNT');if(account.signer&&!role.signer)reject('UNEXPECTED_ACCOUNT_SIGNER');}
 return true;
}
