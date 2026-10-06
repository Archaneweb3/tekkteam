import {readFileSync} from 'node:fs';import {PublicKey} from '@solana/web3.js';
import {MintLayout,AccountLayout,MetadataPointerLayout,ExtensionType,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {pack as packMetadata} from '@solana/spl-token-metadata';
import {curveProgram,BN,pumpSdk} from '../server/dex/pump-sdk-boundary.js';
import {encoded} from './pump-account-fixture.mjs';import {PUMP} from '../src/pump-readiness.js';import {COMPUTE_BUDGET} from '../src/pump-fee-policy.js';import {LIGHTHOUSE_PROGRAM} from '../src/pump-wallet-final.js';
// Complete synthetic decoded state for the actual oracle, standard non-Mayhem launch.
export async function finalOracleAccounts(r,proof){
 const mint=new PublicKey(r.mint),mintBytes=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintBytes);
 const pointer=Buffer.alloc(MetadataPointerLayout.span);MetadataPointerLayout.encode({authority:PublicKey.default,metadataAddress:mint},pointer);const metadata=Buffer.from(packMetadata({mint,name:r.launch.name,symbol:r.launch.symbol,uri:r.metadataUri,additionalMetadata:[]}));
 const tlv=(type,bytes)=>{const h=Buffer.alloc(4);h.writeUInt16LE(type);h.writeUInt16LE(bytes.length,2);return Buffer.concat([h,bytes]);};
 const mintAccount={owner:TOKEN_2022_PROGRAM_ID.toBase58(),executable:false,lamports:proof.simulation.value.accounts[0].lamports,data:[Buffer.concat([mintBytes,Buffer.alloc(83),Buffer.from([1]),tlv(ExtensionType.MetadataPointer,pointer),tlv(ExtensionType.TokenMetadata,metadata)]).toString('base64'),'base64']};
 const curveAccount={owner:PUMP,executable:false,lamports:proof.simulation.value.accounts[2].lamports,data:[(await encoded(curveProgram,'bondingCurve',{creator:new PublicKey(r.launch.owner),tokenTotalSupply:new BN('1000000000000000')},151)).toString('base64'),'base64']};
 const ataBytes=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint,owner:pumpSdk.bondingCurvePda(mint),amount:1000000000000000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},ataBytes);
 const ata={owner:TOKEN_2022_PROGRAM_ID.toBase58(),executable:false,lamports:proof.simulation.value.accounts[3].lamports,data:[ataBytes.toString('base64'),'base64']};
 const publicEvent=JSON.parse(readFileSync(new URL('./fixtures/pump-create-event.json',import.meta.url))),template=curveProgram.coder.events.decode(publicEvent.programData).data,event={...template,name:r.launch.name,symbol:r.launch.symbol,uri:r.metadataUri,mint,bondingCurve:pumpSdk.bondingCurvePda(mint),user:new PublicKey(r.launch.owner),creator:new PublicKey(r.launch.owner)};
 const definition=curveProgram.idl.events.find(e=>e.name==='createEvent'),eventBytes=Buffer.concat([Buffer.from(definition.discriminator),curveProgram.coder.types.encode('createEvent',event)]);
 const logs=[`Program ${COMPUTE_BUDGET} invoke [1]`,`Program ${COMPUTE_BUDGET} success`,`Program ${COMPUTE_BUDGET} invoke [1]`,`Program ${COMPUTE_BUDGET} success`,`Program ${PUMP} invoke [1]`,'Program log: Instruction: CreateV2','Program data: '+eventBytes.toString('base64'),`Program ${PUMP} success`,`Program ${LIGHTHOUSE_PROGRAM} invoke [1]`,`Program ${LIGHTHOUSE_PROGRAM} consumed 100 of 100000 compute units`,`Program ${LIGHTHOUSE_PROGRAM} success`];
 return {mintAccount,curveAccount,ata,logs};
}
