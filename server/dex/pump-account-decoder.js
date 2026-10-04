import {PublicKey} from '@solana/web3.js';
import {unpackMint,unpackAccount,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,NATIVE_MINT,getExtensionTypes,getExtensionData,ExtensionType,getMetadataPointerState,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {unpack as unpackMetadata,pack as packMetadata} from '@solana/spl-token-metadata';
import {createHash} from 'node:crypto';
import {GENESIS} from '../../src/pump-readiness.js';
import {pumpSdk,swapSdk,sdkPin,rejectPump} from './pump-sdk-boundary.js';
import {qualifiedPumpTokenAccountExtensions} from './pump-token-account-extension.js';

const internal=new WeakMap(),sol=NATIVE_MINT.toBase58(),zero=PublicKey.default.toBase58(),u64=(1n<<64n)-1n;
const address=value=>{try{return new PublicKey(value);}catch{rejectPump('PUMP_ACCOUNT_ADDRESS_INVALID');}};
const number=value=>Number.isSafeInteger(value)&&value>=0;
const amount=(value,{positive=false}={})=>{let n;try{n=BigInt(value.toString());}catch{rejectPump('PUMP_RESERVE_INVALID');}if(n<0n||n>u64||positive&&n===0n)rejectPump('PUMP_RESERVE_INVALID');return n;};
const modes=value=>{if(value.isMayhemMode!==false||value.isCashbackCoin!==false||value.isHolderReward===true)rejectPump('PUMP_MODE_UNQUALIFIED');};

export function decodePumpVenueBundle({agent,receipt,context,accounts}={}){
 if(!agent?.id||receipt?.agentId!==agent.id||receipt.owner!==agent.creator||receipt.network!=='solana:101'||receipt.status!=='Success'||receipt.confirmed!==true||typeof receipt.signature!=='string'||!receipt.signature.trim())rejectPump('PUMP_ASSOCIATION_UNVERIFIED');
 const mint=address(receipt.mint),owner=address(agent.creator),tokenProgram=address(accounts?.mint?.owner);
 if(mint.toBase58()===sol||mint.equals(PublicKey.default))rejectPump('PUMP_ASSOCIATED_MINT_INVALID');
 if(context?.network!=='solana:101'||context.genesis!==GENESIS||!['LOCAL_FIXTURE','BACKEND_RPC_READ'].includes(context.source)||!number(context.slot)||!number(context.currentSlot)||!number(context.maxAgeSlots)||context.maxAgeSlots>150||context.slot>context.currentSlot||context.currentSlot-context.slot>context.maxAgeSlots)rejectPump('PUMP_ACCOUNT_CONTEXT_INVALID');
 if(!tokenProgram.equals(TOKEN_PROGRAM_ID)&&!tokenProgram.equals(TOKEN_2022_PROGRAM_ID))rejectPump('PUMP_TOKEN_PROGRAM_UNQUALIFIED');
 const copied={},fingerprints={};
 function account(role,expected,program,{sizes}={}){
  const a=accounts?.[role];if(!a||a.slot!==context.slot||a.executable!==false||a.exists!==true||!Buffer.isBuffer(a.data)||a.data.length>16384||!address(a.address).equals(expected)||!address(a.owner).equals(program)||sizes&&!sizes.includes(a.data.length))rejectPump('PUMP_ACCOUNT_BINDING_INVALID');
  const info={data:Buffer.from(a.data),owner:program,executable:false,lamports:0,rentEpoch:0};copied[role]={address:expected.toBase58(),info};fingerprints[role]={address:expected.toBase58(),owner:program.toBase58(),hash:createHash('sha256').update(a.data).digest('hex')};return info;
 }
 let minted;try{minted=unpackMint(mint,account('mint',mint,tokenProgram),tokenProgram);}catch(e){if(e.code)throw e;rejectPump('PUMP_MINT_DECODE_INVALID');}
 if(!minted.isInitialized||minted.freezeAuthority||minted.mintAuthority||minted.decimals!==6||amount(minted.supply,{positive:true})===0n)rejectPump('PUMP_MINT_AUTHORITY_UNQUALIFIED');
 const extensions=getExtensionTypes(minted.tlvData);
 if(new Set(extensions).size!==extensions.length||extensions.some(type=>![ExtensionType.MetadataPointer,ExtensionType.TokenMetadata].includes(type)))rejectPump('PUMP_TOKEN_EXTENSION_UNQUALIFIED');
 const pointer=getMetadataPointerState(minted);if(pointer&&(!pointer.metadataAddress||!pointer.metadataAddress.equals(mint)))rejectPump('PUMP_METADATA_POINTER_INVALID');
 if(extensions.length){
  if(!pointer||!extensions.includes(ExtensionType.TokenMetadata))rejectPump('PUMP_METADATA_EXTENSION_UNQUALIFIED');
  try{const bytes=getExtensionData(ExtensionType.TokenMetadata,minted.tlvData),metadata=unpackMetadata(bytes);if(!metadata.mint.equals(mint)||!Buffer.from(packMetadata(metadata)).equals(bytes))rejectPump('PUMP_TOKEN_METADATA_INVALID');}catch(e){if(e.code)throw e;rejectPump('PUMP_TOKEN_METADATA_INVALID');}
 }
 const curveKey=pumpSdk.bondingCurvePda(mint);
 let curve;try{curve=pumpSdk.PUMP_SDK.decodeBondingCurve(account('curve',curveKey,pumpSdk.PUMP_PROGRAM_ID,{sizes:[49,81,82,83,115,124,125,151]}));}catch(e){if(e.code)throw e;rejectPump('PUMP_CURVE_DECODE_INVALID');}
 if(!curve.creator.equals(owner)||!curve.quoteMint.equals(PublicKey.default)&&!curve.quoteMint.equals(NATIVE_MINT))rejectPump('PUMP_CURVE_CREATOR_OR_QUOTE_INVALID');modes(curve);
 for(const field of ['virtualTokenReserves','virtualQuoteReserves','realTokenReserves','realQuoteReserves','tokenTotalSupply'])amount(curve[field]);
 if(amount(curve.tokenTotalSupply)!==minted.supply)rejectPump('PUMP_SUPPLY_DISAGREEMENT');
 let global,feeConfig,pool,baseVault,quoteVault,kind='PUMP_BONDING_CURVE',venueKey=curveKey;
 try{
  if(!curve.complete){
   amount(curve.virtualTokenReserves,{positive:true});amount(curve.virtualQuoteReserves,{positive:true});
   global=pumpSdk.PUMP_SDK.decodeGlobal(account('global',pumpSdk.GLOBAL_PDA,pumpSdk.PUMP_PROGRAM_ID,{sizes:[1045,1054,1087]}));
   feeConfig=pumpSdk.PUMP_SDK.decodeFeeConfig(account('feeConfig',pumpSdk.PUMP_FEE_CONFIG_PDA,pumpSdk.PUMP_FEE_PROGRAM_ID,{sizes:[2512,4073,4097]}));
   if(global.initialized!==true)rejectPump('PUMP_GLOBAL_UNINITIALIZED');
  }else{
   if(!accounts?.pool)rejectPump('MIGRATED_VENUE_UNVERIFIED');
   venueKey=swapSdk.canonicalPumpPoolPda(mint,NATIVE_MINT);
   pool=swapSdk.PUMP_AMM_SDK.decodePool(account('pool',venueKey,swapSdk.PUMP_AMM_PROGRAM_ID,{sizes:[211,243,244,245,261,270,300]}));modes(pool);
   if(pool.index!==0||!pool.creator.equals(swapSdk.pumpPoolAuthorityPda(mint))||!pool.coinCreator.equals(owner)||!pool.baseMint.equals(mint)||!pool.quoteMint.equals(NATIVE_MINT))rejectPump('PUMPSWAP_MIGRATION_BINDING_INVALID');
   const baseAddress=getAssociatedTokenAddressSync(mint,venueKey,true,tokenProgram),quoteAddress=getAssociatedTokenAddressSync(NATIVE_MINT,venueKey,true,TOKEN_PROGRAM_ID);
   if(!pool.poolBaseTokenAccount.equals(baseAddress)||!pool.poolQuoteTokenAccount.equals(quoteAddress))rejectPump('PUMPSWAP_VAULT_PDA_MISMATCH');
   const native=unpackMint(NATIVE_MINT,account('quoteMint',NATIVE_MINT,TOKEN_PROGRAM_ID),TOKEN_PROGRAM_ID);
   if(!native.isInitialized||native.decimals!==9||native.mintAuthority||native.freezeAuthority||native.tlvData.length)rejectPump('PUMPSWAP_QUOTE_MINT_INVALID');
   baseVault=unpackAccount(baseAddress,account('baseVault',baseAddress,tokenProgram),tokenProgram);quoteVault=unpackAccount(quoteAddress,account('quoteVault',quoteAddress,TOKEN_PROGRAM_ID),TOKEN_PROGRAM_ID);
   for(const [v,expected,program]of [[baseVault,mint,tokenProgram],[quoteVault,NATIVE_MINT,TOKEN_PROGRAM_ID]])if(!v.owner.equals(venueKey)||!v.mint.equals(expected)||!v.isInitialized||v.isFrozen||v.delegate||v.closeAuthority||!qualifiedPumpTokenAccountExtensions(v.tlvData,program))rejectPump('PUMPSWAP_VAULT_AUTHORITY_INVALID');
   if(baseVault.isNative||!quoteVault.isNative)rejectPump('PUMPSWAP_NATIVE_VAULT_INVALID');
   amount(baseVault.amount,{positive:true});amount(quoteVault.amount,{positive:true});
   if(baseVault.amount>minted.supply)rejectPump('PUMPSWAP_BASE_VAULT_SUPPLY_INVALID');
   if(!number(accounts.quoteVault.lamports)||BigInt(accounts.quoteVault.lamports)!==quoteVault.amount+quoteVault.rentExemptReserve)rejectPump('PUMPSWAP_WSOL_VAULT_UNSYNCED');
   const effective=quoteVault.amount+BigInt(pool.virtualQuoteReserves.toString());if(effective<=0n||effective>u64)rejectPump('PUMPSWAP_EFFECTIVE_RESERVE_INVALID');
   global=swapSdk.PUMP_AMM_SDK.decodeGlobalConfig(account('ammGlobal',swapSdk.GLOBAL_CONFIG_PDA,swapSdk.PUMP_AMM_PROGRAM_ID,{sizes:[907,940,949]}));
   feeConfig=swapSdk.PUMP_AMM_SDK.decodeFeeConfig(account('ammFeeConfig',swapSdk.PUMP_AMM_FEE_CONFIG_PDA,swapSdk.PUMP_FEE_PROGRAM_ID,{sizes:[2512,4073,4097]}));
   if(global.disableFlags!==0)rejectPump('PUMPSWAP_DISABLED_BY_GLOBAL');
   kind='PUMPSWAP';
  }
 }catch(e){if(e.code)throw e;rejectPump('PUMP_DEPENDENT_ACCOUNT_DECODE_INVALID');}
 if(!Array.isArray(feeConfig.feeTiers)||feeConfig.feeTiers.length===0)rejectPump('PUMP_FEE_SCHEDULE_UNAVAILABLE');
 let previous=-1n;for(const tier of feeConfig.feeTiers){const threshold=BigInt(tier.marketCapLamportsThreshold.toString());if(threshold<0n||threshold<=previous)rejectPump('PUMP_FEE_SCHEDULE_INVALID');previous=threshold;}
 const fees=[feeConfig.flatFees,...feeConfig.feeTiers.map(t=>t.fees)];for(const f of fees){const sum=['lpFeeBps','protocolFeeBps','creatorFeeBps'].reduce((n,k)=>n+amount(f[k]),0n);if(sum>=10000n)rejectPump('PUMP_FEE_SCHEDULE_INVALID');}
 const override=amount((pool??curve).creatorFeeBps??0);
 if(override>0n){const ceiling=amount(global.maxConfigurableCreatorFeeBps??0);if(global.creatorFeeConfigurable!==true||override>ceiling||ceiling>=10000n)rejectPump('PUMP_CREATOR_FEE_OVERRIDE_UNQUALIFIED');for(const f of fees)if(amount(f.lpFeeBps)+amount(f.protocolFeeBps)+override>=10000n)rejectPump('PUMP_FEE_SCHEDULE_INVALID');}
 const proofHash=createHash('sha256').update(JSON.stringify({agentId:agent.id,owner:owner.toBase58(),mint:mint.toBase58(),context,fingerprints,sdkPin})).digest('hex');
 const result=Object.freeze({schema:'PUMP_RAW_ACCOUNT_BUNDLE_V1',kind,state:'DISARMED',agentId:agent.id,owner:owner.toBase58(),mint:mint.toBase58(),tokenProgram:tokenProgram.toBase58(),quoteMint:sol,venue:venueKey.toBase58(),slot:context.slot,source:context.source,proofHash,sdkPin,provenance:'DERIVED',onChainVerified:false,enabled:false,authorizationGranted:false});
 internal.set(result,{mint,owner,tokenProgram,minted,curve,global,feeConfig,pool,baseVault,quoteVault,copied,context:{...context}});return result;
}

// Module-internal handoff: JSON copies and browser-authored descriptors are rejected.
function detached(value){
 if(Buffer.isBuffer(value))return Buffer.from(value);
 if(value instanceof PublicKey)return new PublicKey(value.toBuffer());
 if(pumpSdk.PUMP_SDK&&value?.constructor?.isBN?.(value))return value.clone();
 if(Array.isArray(value))return value.map(detached);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,detached(v)]));
 return value;
}
export function decodedPumpState(venue){const state=internal.get(venue);if(!state)rejectPump('PUMP_DECODED_STATE_REQUIRED');return detached(state);}
