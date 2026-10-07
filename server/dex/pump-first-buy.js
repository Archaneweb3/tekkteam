import {GENESIS} from '../../src/pump-readiness.js';
import {createHash} from 'node:crypto';
import {PublicKey,SystemProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,ExtensionType,getAccountLen} from '@solana/spl-token';
import {decodedPumpState} from './pump-account-decoder.js';
import {buildOfflinePumpInstruction} from './pump-offline-instruction.js';
import {readOfflinePumpWalletBalances} from './pump-wallet-accounts.js';
import {pumpSdk,rejectPump} from './pump-sdk-boundary.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const uint=v=>{if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(v)||BigInt(v)>18446744073709551615n)rejectPump('FIRST_BUY_AMOUNT_INVALID');return BigInt(v);};
// A new, explicitly unqualified candidate. Existing V1 envelopes and finalized
// receipt verification keep their one-instruction/existing-account contract.
// No SDK online client, keypair, signing, sending or activation is available here.
export async function buildFirstBuyCandidate(options){
 options={...options,intent:structuredClone(options.intent),accounts:Object.fromEntries(Object.entries(options.accounts??{}).map(([role,a])=>[role,{...a,...(Buffer.isBuffer(a?.data)?{data:Buffer.from(a.data)}:{})}]))};
 const {venue,intent,executionWallet,accounts,blockhash}=options,s=decodedPumpState(venue);
 if(venue.kind!=='PUMP_BONDING_CURVE'||intent?.side!=='BUY'||intent.agentWallet!==executionWallet)rejectPump('FIRST_BUY_SCOPE');
 const wallet=new PublicKey(executionWallet),ata=getAssociatedTokenAddressSync(s.mint,wallet,false,s.tokenProgram,ASSOCIATED_TOKEN_PROGRAM_ID);
 const validateRaw=(raw,address)=>{
  if(!raw||raw.address!==address.toBase58()||raw.slot!==venue.slot||typeof raw.exists!=='boolean')rejectPump('FIRST_BUY_ACCOUNT_CONTEXT');
  if(raw.exists===false){if(Object.keys(raw).some(k=>!['address','slot','exists'].includes(k)))rejectPump('FIRST_BUY_ABSENCE_INVALID');return false;}
  if(raw.executable!==false||!Buffer.isBuffer(raw.data)||raw.data.length>16384||!Number.isSafeInteger(raw.lamports)||raw.lamports<0)rejectPump('FIRST_BUY_ACCOUNT_INVALID');return true;
 };
 const walletExists=validateRaw(accounts?.wallet,wallet),ataExists=validateRaw(accounts?.base,ata);
 if(walletExists&&(accounts.wallet.owner!==SystemProgram.programId.toBase58()||accounts.wallet.data.length!==0))rejectPump('FIRST_BUY_WALLET_INVALID');
 if(ataExists){
  if(!walletExists)rejectPump('FIRST_BUY_WALLET_UNFUNDED');
  readOfflinePumpWalletBalances({venue,executionWallet,accounts});
 }
 const result=await buildOfflinePumpInstruction(options),instructions=[];
 // Explicit token-program derivation is essential for Token-2022. Do not use
 // the SDK convenience wrapper which defaults ATA derivation to classic SPL.
 if(!ataExists)instructions.push(createAssociatedTokenAccountIdempotentInstruction(wallet,ata,wallet,s.mint,s.tokenProgram,ASSOCIATED_TOKEN_PROGRAM_ID));
 instructions.push(result.instruction);
 let recent;try{recent=new PublicKey(blockhash);if(recent.equals(PublicKey.default))throw Error();}catch{rejectPump('FIRST_BUY_BLOCKHASH_INVALID');}
 const message=new TransactionMessage({payerKey:wallet,recentBlockhash:recent.toBase58(),instructions}).compileToV0Message(),tx=new VersionedTransaction(message),bytes=Buffer.from(tx.serialize());
 if(bytes.length>1232||tx.signatures.length!==1||tx.signatures.some(v=>v.some(n=>n!==0)))rejectPump('FIRST_BUY_ENVELOPE_INVALID');
 const ataSize=s.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)?getAccountLen([ExtensionType.ImmutableOwner]):getAccountLen([]);
 return {schema:'PUMP_FIRST_BUY_CANDIDATE_V1',source:venue.source,agentId:venue.agentId,owner:venue.owner,agentWallet:executionWallet,mint:venue.mint,network:'solana:101',slot:venue.slot,proofHash:venue.proofHash,
  method:result.method,quote:result.quote,accountRoles:result.accountRoles,unsignedTransaction:bytes.toString('base64'),messageBase64:Buffer.from(message.serialize()).toString('base64'),messageHash:hash(message.serialize()),transactionHash:hash(bytes),serializedSize:bytes.length,instructionCount:instructions.length,
  wallet:{exists:walletExists,lamports:walletExists?String(accounts.wallet.lamports):'0'},base:{address:ata.toBase58(),exists:ataExists,createIdempotent:!ataExists,allocationBytes:ataSize},
  rentCandidates:[{role:'base',address:ata.toBase58(),allocationBytes:ataSize,allocationProvenance:'SPL_ATA_PINNED_SOURCE'},{role:'userVolumeAccumulator',address:pumpSdk.userVolumeAccumulatorPda(wallet).toBase58(),allocationBytes:137,allocationProvenance:'PUMP_BUY_V2_DOCS_NOT_LEGACY_EXECUTION_PROOF'},{role:'creatorVault',address:pumpSdk.creatorVaultPda(s.curve.creator).toBase58(),allocationBytes:0,allocationProvenance:'PINNED_BUY_EXACT_SOL_IN_IDL'}],
  qualification:'UNQUALIFIED_CANDIDATE',simulationVerified:false,finalizedEffectsQualified:false,executable:false,authorizationGranted:false,notSigned:true,notBroadcast:true};
}

export async function validateFirstBuyCandidate(encoded,options){
 const expected=await buildFirstBuyCandidate(options);
 if(typeof encoded!=='string'||encoded!==expected.unsignedTransaction)rejectPump('FIRST_BUY_CANONICAL_MISMATCH');
 return {messageHash:expected.messageHash,transactionHash:expected.transactionHash,executable:false,notSigned:true,notBroadcast:true};
}

// Estimates remain diagnostic even with RPC-derived fees/rent. Missing volume
// allocation and Pump CPI proof must never become a zero-rent assumption.
export function inspectFirstBuyCosts({candidate,rentQuotes,auxiliary,feeQuote,protectedReserveLamports,sessionCapLamports,dailyCapLamports,now=Date.now()}){
 if(candidate?.schema!=='PUMP_FIRST_BUY_CANDIDATE_V1'||candidate.executable!==false||!Number.isSafeInteger(now)||!Number.isSafeInteger(candidate.quote?.expiresAt)||candidate.quote.expiresAt<=now)rejectPump('FIRST_BUY_CANDIDATE_INVALID');
 if(!feeQuote||feeQuote.messageHash!==candidate.messageHash||feeQuote.genesis!==GENESIS||feeQuote.commitment!=='finalized'||feeQuote.source!==candidate.source||!Number.isSafeInteger(feeQuote.observedAt)||feeQuote.observedAt>now||now-feeQuote.observedAt>30000)rejectPump('FIRST_BUY_FEE_QUOTE_INVALID');
 const fee=uint(feeQuote.lamports),reserve=uint(protectedReserveLamports),input=uint(candidate.quote.inputAmount),blockers=['PUMP_FIRST_BUY_FINALIZED_EFFECTS_UNQUALIFIED','BOUNDED_EXECUTION_COORDINATOR_UNMOUNTED'];let rent=0n,unknownRent=false;
 const rows=candidate.rentCandidates.map(r=>{
  const raw=r.role==='base'?{address:candidate.base.address,slot:candidate.slot,exists:candidate.base.exists}:auxiliary?.[r.role];
  if(!raw||raw.address!==r.address||raw.slot!==candidate.slot||typeof raw.exists!=='boolean')rejectPump('FIRST_BUY_ACCOUNT_CONTEXT');
  if(!raw.exists&&Object.keys(raw).some(k=>!['address','slot','exists'].includes(k)))rejectPump('FIRST_BUY_ABSENCE_INVALID');
  const creatorLayout=raw.exists&&r.role==='creatorVault'&&raw.owner===SystemProgram.programId.toBase58()&&raw.executable===false&&Buffer.isBuffer(raw.data)&&raw.data.length===0&&Number.isSafeInteger(raw.lamports)&&raw.lamports>=0;
  const unknown=raw.exists&&r.role!=='base'&&!creatorLayout;
  if(unknown){unknownRent=true;blockers.push('EXISTING_'+r.role.toUpperCase()+'_LAYOUT_AND_RENT_REQUIRE_QUALIFICATION');}
  const q=rentQuotes?.[r.allocationBytes];
  if(!q||q.commitment!=='finalized'||q.allocationBytes!==r.allocationBytes||!Number.isSafeInteger(q.observedAt)||q.observedAt>now||now-q.observedAt>30000)rejectPump('FIRST_BUY_RENT_QUOTE_INVALID');
  const amount=uint(q.lamports),needed=creatorLayout?(amount>BigInt(raw.lamports)?amount-BigInt(raw.lamports):0n):raw.exists?0n:amount;if(amount===0n)rejectPump('FIRST_BUY_RENT_QUOTE_INVALID');rent+=needed;
  if(r.role==='userVolumeAccumulator'&&!raw.exists)blockers.push('LEGACY_BUY_VOLUME_ALLOCATION_NOT_INDEPENDENTLY_VERIFIED');
  return {...r,exists:raw.exists,...(creatorLayout?{layoutVerified:'SYSTEM_ZERO_DATA_CREATOR_VAULT',observedLamports:String(raw.lamports)}:{}),rentEstimateLamports:unknown?null:needed.toString(),rentCommitment:q.commitment};
 });
 const total=input+fee+rent,required=total+reserve;
 if(uint(candidate.wallet.lamports)<required)blockers.push('AGENT_WALLET_INSUFFICIENT_FOR_CANDIDATE_AND_RESERVE');
 if(fee>10000n)blockers.push('NETWORK_FEE_EXCEEDS_CURRENT_CEILING');
 if(total>uint(sessionCapLamports))blockers.push('TOTAL_DEBIT_EXCEEDS_CURRENT_SESSION_CEILING');
 if(total>uint(dailyCapLamports))blockers.push('TOTAL_DEBIT_EXCEEDS_CURRENT_DAILY_CEILING');
 return {schema:'PUMP_FIRST_BUY_COST_INSPECTION_V1',agentId:candidate.agentId,mint:candidate.mint,agentWallet:candidate.agentWallet,slot:candidate.slot,messageHash:candidate.messageHash,accountRentCandidates:rows,inputLamports:input.toString(),networkFeeLamports:fee.toString(),rentEstimateLamports:unknownRent?null:rent.toString(),knownRentSubtotalLamports:rent.toString(),estimatedDebitLamports:unknownRent?null:total.toString(),knownDebitSubtotalLamports:total.toString(),protectedReserveLamports:reserve.toString(),estimatedBalanceRequiredLamports:unknownRent?null:required.toString(),walletLamports:candidate.wallet.lamports,blockers,exactMaximumDebitVerified:false,simulationVerified:false,executable:false,authorizationGranted:false,notSigned:true,notBroadcast:true};
}
