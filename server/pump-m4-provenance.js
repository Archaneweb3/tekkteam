import {PublicKey} from '@solana/web3.js';
import {unpackMint,unpackAccount,TOKEN_2022_PROGRAM_ID,getExtensionTypes,getExtensionData,ExtensionType,getMetadataPointerState} from '@solana/spl-token';
import {unpack as unpackMetadata,pack as packMetadata} from '@solana/spl-token-metadata';
import {pumpSdk,curveProgram} from './dex/pump-sdk-boundary.js';
import {PUMP} from '../src/pump-readiness.js';
const fail=code=>{throw Object.assign(Error(code),{code,status:409});};
export function decodeM4CreationAccounts(r,mintAccount,curveAccount){
 const mint=new PublicKey(r.mint),curveKey=pumpSdk.bondingCurvePda(mint),info=a=>({...a,data:Buffer.from(a.data[0],'base64'),owner:new PublicKey(a.owner)});
 if(!mintAccount||mintAccount.owner!==TOKEN_2022_PROGRAM_ID.toBase58()||mintAccount.executable!==false||!curveAccount||curveAccount.owner!==PUMP||curveAccount.executable!==false)fail('M4_MINT_PROGRAM_MISMATCH');
 const minted=unpackMint(mint,info(mintAccount),TOKEN_2022_PROGRAM_ID),pointer=getMetadataPointerState(minted),metadataBytes=getExtensionData(ExtensionType.TokenMetadata,minted.tlvData);
 if(!minted.isInitialized||minted.decimals!==6||minted.supply!==1000000000000000n||minted.mintAuthority||minted.freezeAuthority||pointer?.authority||!pointer?.metadataAddress?.equals(mint)||!metadataBytes)fail('M4_MINT_STATE_MISMATCH');
 const extensions=getExtensionTypes(minted.tlvData);if(new Set(extensions).size!==extensions.length||extensions.some(e=>![ExtensionType.MetadataPointer,ExtensionType.TokenMetadata].includes(e)))fail('M4_UNEXPECTED_MINT_EXTENSION');
 const metadata=unpackMetadata(metadataBytes);if(metadata.updateAuthority||!Buffer.from(packMetadata(metadata)).equals(metadataBytes)||!metadata.mint.equals(mint)||metadata.name!==r.launch.name||metadata.symbol!==r.launch.symbol||metadata.uri!==r.metadataUri)fail('M4_ONCHAIN_METADATA_MISMATCH');
 const curveInfo=info(curveAccount);if(curveInfo.data.length<81||!curveInfo.data.subarray(0,8).equals(Buffer.from([23,183,248,55,96,216,172,96])))fail('M4_CURVE_SCHEMA_MISMATCH');
 const curve=pumpSdk.PUMP_SDK.decodeBondingCurve(curveInfo);if(!curve.creator.equals(new PublicKey(r.launch.owner))||BigInt(curve.tokenTotalSupply.toString())!==minted.supply||curve.isMayhemMode!==false||curve.isCashbackCoin!==false||curve.isHolderReward===true||!curve.quoteMint.equals(PublicKey.default))fail('M4_CREATOR_PROVENANCE_MISMATCH');
 return {mint,curveKey,metadata};
}
export function verifyM4CreateEvent(r,logs){
 const events=(logs??[]).filter(l=>l.startsWith('Program data: ')).map(l=>{try{return curveProgram.coder.events.decode(l.slice(14));}catch{return null;}}).filter(e=>e?.name==='createEvent');
 const curveKey=pumpSdk.bondingCurvePda(new PublicKey(r.mint));
 if(events.length!==1)fail('M4_CREATE_EVENT_MISSING');const e=events[0].data;
 if(e.name!==r.launch.name||e.symbol!==r.launch.symbol||e.uri!==r.metadataUri||e.mint?.toBase58()!==r.mint||e.bondingCurve?.toBase58()!==curveKey.toBase58()||e.user?.toBase58()!==r.launch.owner||e.creator?.toBase58()!==r.launch.owner||e.tokenProgram?.toBase58()!==TOKEN_2022_PROGRAM_ID.toBase58()||e.isMayhemMode!==false||e.isCashbackEnabled!==false||e.isHolderReward!==false||!e.quoteMint?.equals(PublicKey.default))fail('M4_CREATE_EVENT_MISMATCH');return true;
}
export function verifyM4TokenAccounts(r,accounts){
 const absent=r.structure.accounts.findIndex(a=>a.name==='mayhem_token_vault');
 const vault=accounts[absent],empty=vault===null||vault?.lamports===0&&vault.owner==='11111111111111111111111111111111'&&vault.executable===false&&Array.isArray(vault.data)&&vault.data[0]===''&&vault.data[1]==='base64';
 if(absent<0||!empty)fail('M4_DISABLED_MAYHEM_ACCOUNT_CHANGED');
 for(const [name,ownerName]of [['associated_bonding_curve','bonding_curve']]){
  const index=r.structure.accounts.findIndex(a=>a.name===name),address=r.structure.accounts[index]?.address,authority=r.structure.accounts.find(a=>a.name===ownerName)?.address,info=accounts[index];
  if(!info||info.owner!==TOKEN_2022_PROGRAM_ID.toBase58()||info.executable!==false||!address||!authority)fail('M4_TOKEN_ACCOUNT_STATE_MISMATCH');
  const a=unpackAccount(new PublicKey(address),{...info,owner:new PublicKey(info.owner),data:Buffer.from(info.data[0],'base64')},TOKEN_2022_PROGRAM_ID);
  if(!a.mint.equals(new PublicKey(r.mint))||!a.owner.equals(new PublicKey(authority))||!a.isInitialized||a.isFrozen||a.isNative||a.delegate||a.delegatedAmount!==0n||a.closeAuthority||a.amount<0n||a.amount>1000000000000000n||getExtensionTypes(a.tlvData).some(e=>e!==ExtensionType.ImmutableOwner))fail('M4_TOKEN_ACCOUNT_AUTHORITY_CHANGED');
 }
 return true;
}
