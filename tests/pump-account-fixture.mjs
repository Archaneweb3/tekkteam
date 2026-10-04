import {PublicKey,SystemProgram} from '@solana/web3.js';
import {MintLayout,AccountLayout,MetadataPointerLayout,ExtensionType,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,NATIVE_MINT,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {pack as packMetadata} from '@solana/spl-token-metadata';
import {GENESIS} from '../src/pump-readiness.js';
import {pumpSdk,swapSdk,curveProgram,swapProgram,BN} from '../server/dex/pump-sdk-boundary.js';
const key=n=>new PublicKey(Buffer.alloc(32,n));
export const fixtureMint=key(21),fixtureOwner=key(22),fixtureWallet=key(23),fixtureBlockhash=key(24).toBase58();
function value(program,type){
 if(typeof type==='string'){if(type==='bool')return false;if(type==='pubkey')return PublicKey.default;if(['u8','u16','u32','i8','i16','i32'].includes(type))return 0;if(type==='string')return '';if(type==='bytes')return Buffer.alloc(0);return new BN(0);}
 if(type.array)return Array.from({length:type.array[1]},()=>value(program,type.array[0]));if(type.vec)return [];if(type.option)return null;
 if(type.defined){const t=program.idl.types.find(t=>t.name===type.defined.name);if(t?.type.kind!=='struct')throw Error('Unsupported fixture type');return Object.fromEntries(t.type.fields.map(f=>[f.name,value(program,f.type)]));}throw Error('Unsupported fixture layout');
}
function state(program,name){return value(program,{defined:{name}});}
export async function encoded(program,name,overrides,size){
 const fields={...state(program,name),...overrides};let bytes;
 // Anchor's public encoder allocates1000 bytes. Test-only IDL layout encoding
 // permits the official1087-byte Global without modifying the SDK/runtime.
 if(size>1000){const layout=program.coder.accounts.accountLayouts.get(name),buffer=Buffer.alloc(size);const length=layout.layout.encode(fields,buffer);bytes=Buffer.concat([Buffer.from(layout.discriminator),buffer.subarray(0,length)]);}
 else bytes=await program.coder.accounts.encode(name,fields);
 if(size&&bytes.length>size)throw Error('Fixture size too small');return size?Buffer.concat([bytes,Buffer.alloc(size-bytes.length)]):bytes;
}
const raw=(address,owner,data)=>({address:address.toBase58(),owner:owner.toBase58(),data,slot:100,exists:true,executable:false});
function mintBytes(supply=1000000000000000n,decimals=6){const data=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply,decimals,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},data);return data;}
function vaultBytes(mint,owner,amount,isNative){const data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner,amount,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:isNative?1:0,isNative:isNative?2039280n:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);return data;}
export function pumpWalletFixture(venue,executionWallet){
 const wallet=new PublicKey(executionWallet),mint=new PublicKey(venue.mint),program=new PublicKey(venue.tokenProgram);
 return {wallet:{...raw(wallet,SystemProgram.programId,Buffer.alloc(0)),lamports:200000000},base:{...raw(getAssociatedTokenAddressSync(mint,wallet,false,program),program,vaultBytes(mint,wallet,2000000000n,false)),lamports:2039280},quote:{...raw(getAssociatedTokenAddressSync(NATIVE_MINT,wallet),TOKEN_PROGRAM_ID,vaultBytes(NATIVE_MINT,wallet,150000000n,true)),lamports:152039280}};
}

export async function pumpAccountFixture({migrated=false,virtualQuote='-5000000000',classic=false,creatorFeeBps='0',creatorFeeConfigurable=false,creatorFeeCeiling='500',metadata=false,metadataMint=fixtureMint}={}){
 const tokenProgram=classic?TOKEN_PROGRAM_ID:TOKEN_2022_PROGRAM_ID,mint=fixtureMint,owner=fixtureOwner;
 const fees={lpFeeBps:new BN(20),protocolFeeBps:new BN(30),creatorFeeBps:new BN(50)},tiers=[{marketCapLamportsThreshold:new BN(0),fees}];
 const feeFields={flatFees:fees,feeTiers:tiers};
 const accounts={mint:raw(mint,tokenProgram,mintBytes()),curve:raw(pumpSdk.bondingCurvePda(mint),pumpSdk.PUMP_PROGRAM_ID,await encoded(curveProgram,'bondingCurve',{virtualTokenReserves:new BN('1073000000000000'),virtualQuoteReserves:new BN('30000000000'),realTokenReserves:new BN('793100000000000'),realQuoteReserves:new BN('1000000000'),tokenTotalSupply:new BN('1000000000000000'),creator:owner,complete:migrated,creatorFeeBps:new BN(creatorFeeBps)},151))};
 if(metadata){const pointer=Buffer.alloc(MetadataPointerLayout.span);MetadataPointerLayout.encode({authority:PublicKey.default,metadataAddress:mint},pointer);const tokenMetadata=Buffer.from(packMetadata({mint:metadataMint,name:'Fixture',symbol:'FIX',uri:'https://tekkteam-fixture.invalid/fixture',additionalMetadata:[]}));const tlv=(type,bytes)=>{const h=Buffer.alloc(4);h.writeUInt16LE(type,0);h.writeUInt16LE(bytes.length,2);return Buffer.concat([h,bytes]);};accounts.mint.data=Buffer.concat([mintBytes(),Buffer.alloc(83),Buffer.from([1]),tlv(ExtensionType.MetadataPointer,pointer),tlv(ExtensionType.TokenMetadata,tokenMetadata)]);}
 if(!migrated){
  accounts.global=raw(pumpSdk.GLOBAL_PDA,pumpSdk.PUMP_PROGRAM_ID,await encoded(curveProgram,'global',{initialized:true,feeRecipient:key(31),feeRecipients:Array.from({length:8},(_,i)=>key(31+i)),buybackFeeRecipients:Array.from({length:8},(_,i)=>key(41+i)),creatorFeeConfigurable,maxConfigurableCreatorFeeBps:new BN(creatorFeeCeiling)},1087));
  accounts.feeConfig=raw(pumpSdk.PUMP_FEE_CONFIG_PDA,pumpSdk.PUMP_FEE_PROGRAM_ID,await encoded(curveProgram,'feeConfig',feeFields,4097));
 }else{
  const pool=swapSdk.canonicalPumpPoolPda(mint,NATIVE_MINT),baseVault=getAssociatedTokenAddressSync(mint,pool,true,tokenProgram),quoteVault=getAssociatedTokenAddressSync(NATIVE_MINT,pool,true,TOKEN_PROGRAM_ID);
  accounts.pool=raw(pool,swapSdk.PUMP_AMM_PROGRAM_ID,await encoded(swapProgram,'pool',{index:0,poolBump:PublicKey.findProgramAddressSync([Buffer.from('pool'),Buffer.alloc(2),swapSdk.pumpPoolAuthorityPda(mint).toBuffer(),mint.toBuffer(),NATIVE_MINT.toBuffer()],swapSdk.PUMP_AMM_PROGRAM_ID)[1],creator:swapSdk.pumpPoolAuthorityPda(mint),baseMint:mint,quoteMint:NATIVE_MINT,coinCreator:owner,lpMint:swapSdk.lpMintPda(pool),poolBaseTokenAccount:baseVault,poolQuoteTokenAccount:quoteVault,lpSupply:new BN('100000000'),virtualQuoteReserves:new BN(virtualQuote),creatorFeeBps:new BN(creatorFeeBps)},270));
  accounts.quoteMint=raw(NATIVE_MINT,TOKEN_PROGRAM_ID,mintBytes(0n,9));
  accounts.baseVault=raw(baseVault,tokenProgram,vaultBytes(mint,pool,793100000000000n,false));
  accounts.quoteVault=raw(quoteVault,TOKEN_PROGRAM_ID,vaultBytes(NATIVE_MINT,pool,20000000000n,true));
  accounts.quoteVault.lamports=20002039280;
  accounts.ammGlobal=raw(swapSdk.GLOBAL_CONFIG_PDA,swapSdk.PUMP_AMM_PROGRAM_ID,await encoded(swapProgram,'globalConfig',{protocolFeeRecipients:Array.from({length:8},(_,i)=>key(31+i)),buybackFeeRecipients:Array.from({length:8},(_,i)=>key(41+i)),creatorFeeConfigurable,maxConfigurableCreatorFeeBps:new BN(creatorFeeCeiling)},949));
  accounts.ammFeeConfig=raw(swapSdk.PUMP_AMM_FEE_CONFIG_PDA,swapSdk.PUMP_FEE_PROGRAM_ID,await encoded(swapProgram,'feeConfig',feeFields,4097));
 }
 return {agent:{id:'pump-fixture',creator:owner.toBase58()},receipt:{agentId:'pump-fixture',owner:owner.toBase58(),network:'solana:101',status:'Success',confirmed:true,signature:'synthetic-canonical-launch',mint:mint.toBase58()},context:{network:'solana:101',genesis:GENESIS,source:'LOCAL_FIXTURE',slot:100,currentSlot:101,maxAgeSlots:10},accounts};
}
