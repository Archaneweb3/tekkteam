import {Transaction,PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {GENESIS,PUMP} from '../src/pump-readiness.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {assertReviewedExecutionRequest,contextSlot} from './pump-execution-review.js';
import {verifyLaunchTransaction,validateLaunchEvidence} from '../src/pump-launch-validation.js';
import {readAtMinimumContext} from './pump-context-rpc.js';
import {tokenMetadata} from '../src/agent-launch-data.js';
import {decodeM4CreationAccounts,verifyM4CreateEvent} from './pump-m4-provenance.js';
import {atomicExecutionEffects} from './pump-atomic-effects.js';
import {isActionTimePackage} from '../src/pump-action-time.js';
export const M4_TARGET=Object.freeze({owner:'C2nddai75FJZWWkNdUF7csEBryRCMikJyTTZZqYcMiBv',agentId:'8fc6fe77-16a0-4fed-8ca0-ddd1f6ef9fa7',agentName:'aaaaada',name:'ret',symbol:'3ED',tokenDraftRevision:1,initialBuyLamports:0,ceilingLamports:10000000});
export const m4Fail=code=>Object.assign(Error(code),{code,status:409});
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function assertM4Target(identity,target=M4_TARGET){for(const k of ['owner','agentId','agentName','name','symbol','tokenDraftRevision'])if(identity[k]!==target[k])throw m4Fail('M4_TARGET_MISMATCH');}
export function launchEvidence(result,proof){return {...result,chainId:result.network,before:proof.before,afterRead:proof.afterRead,simulation:proof.simulation,feeQuote:proof.feeResponse};}
export function verifyM4Signed(base64,record,requireOwner=true){
 const tx=verifyLaunchTransaction(base64,launchEvidence(record.result,record.proof),requireOwner);
 if(tx.signatures.length!==2||tx.instructions.length!==(record.result.feePolicy?3:1)||tx.instructions[record.result.feePolicy?2:0].programId.toBase58()!==PUMP)throw m4Fail('M4_SIGNATURE_STRUCTURE_CHANGED');
 const mintSignature=tx.signatures.find(s=>s.publicKey.toBase58()===record.result.mint)?.signature;
 const trusted=Transaction.from(Buffer.from(record.walletTransactionBase64,'base64')).signatures.find(s=>s.publicKey.toBase58()===record.result.mint)?.signature;
 if(!mintSignature||!trusted||!mintSignature.equals(trusted))throw m4Fail('M4_MINT_SIGNATURE_CHANGED');
 if(!requireOwner&&tx.signature!==null)throw m4Fail('M4_OWNER_SIGNATURE_PREMATURE');
 return {tx,signature:tx.signature?bs58.encode(tx.signature):null,signedDigest:sha(Buffer.from(base64,'base64'))};
}
// Phantom receives no pre-existing signature. Collect the stored mint signature
// only AFTER verifying the owner approved this exact canonical reviewed message.
// No secret retention, signature generation or message alteration occurs here.
export function completeM4OwnerApproval(base64,record){
 if(record.signingOrder!=='OWNER_FIRST_MINT_AFTER_APPROVAL')return {...verifyM4Signed(base64,record,true),completeBase64:base64};
 validateLaunchEvidence(launchEvidence(record.result,record.proof));
 const bytes=Buffer.from(base64,'base64'),tx=Transaction.from(bytes),trusted=Transaction.from(Buffer.from(record.walletTransactionBase64,'base64'));
 if(!tx.serialize({requireAllSignatures:false,verifySignatures:false}).equals(bytes)||!tx.serializeMessage().equals(trusted.serializeMessage())||tx.feePayer.toBase58()!==record.target.owner||tx.signatures.length!==2||!tx.signature||!tx.verifySignatures(false))throw m4Fail('M4_OWNER_APPROVAL_INVALID');
 const mint=tx.signatures.find(s=>s.publicKey.toBase58()===record.result.mint),mintSignature=trusted.signatures.find(s=>s.publicKey.toBase58()===record.result.mint)?.signature;
 if(!mint||mint.signature!==null||!mintSignature||!trusted.verifySignatures(false)||trusted.signature!==null)throw m4Fail('M4_OWNER_FIRST_SIGNATURE_REQUIRED');
 tx.addSignature(new PublicKey(record.result.mint),mintSignature);
 const completeBase64=tx.serialize({requireAllSignatures:true,verifySignatures:true}).toString('base64');
 return {...verifyM4Signed(completeBase64,record,true),completeBase64,integrity:{preparedMessageSha256:sha(Transaction.from(Buffer.from(record.result.transactionBase64,'base64')).serializeMessage()),deliveredMessageSha256:sha(trusted.serializeMessage()),returnedMessageSha256:sha(tx.serializeMessage()),returnedOwnerPayloadSha256:sha(bytes),finalSignedPayloadSha256:sha(Buffer.from(completeBase64,'base64')),allowedWalletMutation:'SIGNATURES_ONLY',feeModel:record.result.feePolicy?.model??'LEGACY_NO_EXPLICIT_PRIORITY'}};
}
// A native validity observation never replaces any transaction/message fields.
export async function checkM4Blockhash(result,{transport,now=Date.now,minimumRemainingBlocks=0,minimumContextSlot=result.executionReview.validitySlot}){
 if(!Number.isSafeInteger(minimumContextSlot)||minimumContextSlot<result.executionReview.validitySlot)throw m4Fail('M4_CONTEXT_STALE');
 const minimum=minimumContextSlot,rpc=(m,p)=>readAtMinimumContext(transport,m,p);
 if(await rpc('getGenesisHash',[])!==GENESIS)throw m4Fail('M4_WRONG_MAINNET');
 const validity=await rpc('isBlockhashValid',[result.recentBlockhash,{commitment:'finalized',minContextSlot:minimum}]);
 const slot=contextSlot(validity,minimum),height=await rpc('getBlockHeight',[{commitment:'finalized',minContextSlot:slot}]);
 if(validity.value!==true||!Number.isSafeInteger(height)||height>result.lastValidBlockHeight)throw m4Fail('M4_BLOCKHASH_EXPIRED');
 const remainingBlocks=result.lastValidBlockHeight-height;
 if(remainingBlocks<minimumRemainingBlocks)throw m4Fail('M4_WALLET_BLOCKHASH_TOO_OLD');
 return {recentBlockhash:result.recentBlockhash,lastValidBlockHeight:result.lastValidBlockHeight,reviewDigest:result.executionReview.digest,commitment:'finalized',height,remainingBlocks,contextSlot:slot,checkedAt:now()};
}
// Revalidate the immutable reviewed economics. Legacy v1 retains its 30s TTL;
// v2 is valid only while its native hash remains live, including after this work.
export async function revalidateM4(record,identity,request,{transport,now=Date.now,captureDiagnostics}){
 const r=record.result,review=r.executionReview;
 assertM4Target(identity,record.target??M4_TARGET);assertReviewedExecutionRequest(r,identity,{...request,now:now()});
 const rpc=(m,p)=>readAtMinimumContext(transport,m,p),addresses=r.structure.accounts.map(a=>a.address),tx=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
 if(await rpc('getGenesisHash',[])!==GENESIS)throw m4Fail('M4_WRONG_MAINNET');
 const validity=await rpc('isBlockhashValid',[r.recentBlockhash,{commitment:'finalized',minContextSlot:review.validitySlot}]);if(validity.value!==true)throw m4Fail('M4_BLOCKHASH_EXPIRED');
 const height=await rpc('getBlockHeight',[{commitment:'finalized',minContextSlot:contextSlot(validity,review.validitySlot)}]);if(!Number.isSafeInteger(height)||height>r.lastValidBlockHeight)throw m4Fail('M4_BLOCKHASH_EXPIRED');
 const fee=await rpc('getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized',minContextSlot:contextSlot(validity)}]);
 const before=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:contextSlot(fee,contextSlot(validity))}]);
 const simulation=await rpc('simulateTransaction',[r.transactionBase64,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:contextSlot(before,contextSlot(fee)),innerInstructions:true,accounts:{encoding:'base64',addresses}}]);
 const afterRead=await rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:contextSlot(simulation,contextSlot(before))}]);contextSlot(afterRead,contextSlot(simulation));
 const policy=evaluateSimulation(Buffer.from(r.transactionBase64,'base64'),{mint:new PublicKey(r.mint),blockhash:r.recentBlockhash,genesis:r.genesis,chainId:r.network,launch:r.launch,feePolicy:r.feePolicy??null},{before,afterRead,simulation,fee:fee.value});
 if(captureDiagnostics)await captureDiagnostics({...r,createdAt:new Date(now()).toISOString(),policy:{...r.policy,...policy}},{before,afterRead,simulation,feeResponse:fee,validity,stage:'M4_REVALIDATION'});
 if(!policy.allowed||simulation.value.err!==null||!Array.isArray(simulation.value.innerInstructions)||before.value[0]!==null||fee.value!==review.networkFeeLamports||policy.validatedOverheadLamports!==review.reviewedDebitLamports||policy.estimatedPayerDebitLamports!==review.reviewedDebitLamports||before.value[5]?.lamports!==review.observedBalanceLamports||afterRead.value[5]?.lamports!==review.observedBalanceLamports||simulation.value.accounts[5]?.lamports!==review.expectedRemainingBalanceLamports)throw m4Fail('M4_ECONOMICS_CHANGED_REPREPARE');
 const payer=a=>JSON.stringify({owner:a?.owner,executable:a?.executable,data:a?.data});
 if(before.value[5]?.owner!=='11111111111111111111111111111111'||before.value[5]?.executable!==false||payer(before.value[5])!==payer(afterRead.value[5])||payer(before.value[5])!==payer(simulation.value.accounts[5]))throw m4Fail('M4_PAYER_CHANGED');
 atomicExecutionEffects(r,{simulation,feeResponse:fee,before,afterRead},policy);
 decodeM4CreationAccounts(r,simulation.value.accounts[0],simulation.value.accounts[2]);verifyM4CreateEvent(r,simulation.value.logs);
 for(const account of r.policy.rentAccounts)if(await rpc('getMinimumBalanceForRentExemption',[account.dataLength,{commitment:'finalized'}])!==account.minimumRentExemptionLamports)throw m4Fail('M4_RENT_CHANGED');
 const metadata=await (await transport.publicRequest(r.metadataUri)).json();if(JSON.stringify(metadata)!==JSON.stringify(tokenMetadata(identity)))throw m4Fail('M4_METADATA_CHANGED');
 const image=await transport.publicRequest(metadata.image),imageBytes=Buffer.from(await image.arrayBuffer());if(!image.headers.get('content-type')?.startsWith('image/png')||sha(imageBytes)!==new URL(metadata.image).pathname.split('/').at(-1)?.replace('.png',''))throw m4Fail('M4_IMAGE_UNAVAILABLE');
 assertReviewedExecutionRequest(r,identity,{...request,now:now()});
 const finalValidity=isActionTimePackage(r)?await checkM4Blockhash(r,{transport,now,minimumContextSlot:contextSlot(afterRead,contextSlot(simulation))}):null;
 return {contextSlot:simulation.context.slot,checkedAt:now(),height:finalValidity?.height??height,...(finalValidity?{blockhashValidity:finalValidity}:{})};
}
