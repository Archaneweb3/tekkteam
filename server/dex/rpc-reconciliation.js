import {VersionedTransaction,PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {createHash} from 'node:crypto';
import {assertMainnet} from './mainnet-accounts.js';
import {SOL_MINT,integer,reject} from './intent.js';

const delta=(pre,post,i)=>{if(!Number.isSafeInteger(pre?.[i])||!Number.isSafeInteger(post?.[i])||pre[i]<0||post[i]<0)reject('RPC_BALANCE_INVALID');return BigInt(post[i])-BigInt(pre[i]);};
export function extractFinalizedSwapEffects(response,intent,expected){
 const {meta,transaction,slot}=response;if(!meta||!transaction||!Number.isSafeInteger(slot)||slot<0)reject('RPC_TRANSACTION_INCOMPLETE');
 const message=transaction.message,messageBytes=Buffer.from(message.serialize()),hash=createHash('sha256').update(messageBytes).digest('hex');
 if(hash!==expected.messageHash||transaction.signatures?.length!==1||transaction.signatures[0]!==expected.signature)reject('RPC_MESSAGE_SIGNATURE_MISMATCH');
 const wallet=new PublicKey(intent.agentWallet),keys=message.getAccountKeys(message.version===0?{accountKeysFromLookups:meta.loadedAddresses}:undefined),addresses=Array.from({length:keys.length},(_,i)=>keys.get(i).toBase58());
 if(addresses[0]!==intent.agentWallet||message.header.numRequiredSignatures!==1||!nacl.sign.detached.verify(messageBytes,bs58.decode(expected.signature),wallet.toBytes()))reject('RPC_AGENT_SIGNATURE_INVALID');
 if(JSON.stringify(addresses)!==JSON.stringify(expected.resolvedAccounts))reject('RPC_RESOLVED_ACCOUNTS_MISMATCH');
 if(meta.preBalances.length!==addresses.length||meta.postBalances.length!==addresses.length)reject('RPC_BALANCE_LENGTH_MISMATCH');
 const fee=integer(String(meta.fee),{zero:true});if(fee>integer(expected.maxNetworkFeeLamports))reject('RPC_FEE_LIMIT');
 const agentSolDelta=delta(meta.preBalances,meta.postBalances,0);
 const mint=intent.direction==='BUY'?intent.outputMint:intent.inputMint,ata=getAssociatedTokenAddressSync(new PublicKey(mint),wallet).toBase58(),index=addresses.indexOf(ata);
 if(index<0)reject('RPC_TARGET_ATA_MISSING');
 const tokenBalance=(rows)=>{
  if(!Array.isArray(rows))reject('RPC_TOKEN_BALANCES_MISSING');
  const entries=rows.filter(r=>r.accountIndex===index);if(entries.length>1)reject('RPC_DUPLICATE_TOKEN_BALANCE');
  if(!entries.length)return 0n;
  const r=entries[0];if(r.mint!==mint||r.owner!==intent.agentWallet||r.programId!==TOKEN_PROGRAM_ID.toBase58())reject('RPC_TOKEN_PROVENANCE_MISMATCH');
  return integer(r.uiTokenAmount?.amount,{zero:true});
 };
 const tokenDelta=tokenBalance(meta.postTokenBalances)-tokenBalance(meta.preTokenBalances);
 // Other agent-owned token balances cannot be changed by an approved one-pair swap.
 const allAgent=new Set([...meta.preTokenBalances,...meta.postTokenBalances].filter(r=>r.owner===intent.agentWallet).map(r=>r.accountIndex));
 const wsol=getAssociatedTokenAddressSync(new PublicKey(SOL_MINT),wallet).toBase58();
 for(const i of allAgent){if(i===index)continue;const pre=meta.preTokenBalances.find(r=>r.accountIndex===i),post=meta.postTokenBalances.find(r=>r.accountIndex===i);if(addresses[i]===wsol&&(pre??post).mint===SOL_MINT&&[pre,post].every(r=>!r||(r.owner===intent.agentWallet&&r.programId===TOKEN_PROGRAM_ID.toBase58()&&r.mint===SOL_MINT&&r.uiTokenAmount?.amount==='0')))continue;if(pre?.mint!==post?.mint||pre?.uiTokenAmount?.amount!==post?.uiTokenAmount?.amount)reject('RPC_UNRELATED_TOKEN_CHANGE');}
 if(meta.err){if(agentSolDelta!==-fee||tokenDelta!==0n||addresses.some((_,i)=>i>0&&delta(meta.preBalances,meta.postBalances,i)!==0n)||JSON.stringify(meta.preTokenBalances)!==JSON.stringify(meta.postTokenBalances))reject('RPC_FAILED_EFFECTS_INVALID');return {failed:true,signature:expected.signature,slot,networkFeeLamports:fee.toString(),agentSolDelta:agentSolDelta.toString(),agentTokenDelta:'0',failureReason:JSON.stringify(meta.err).slice(0,300),messageHash:hash};}
 let netRent=0n;const allowedRent=new Set([ata,getAssociatedTokenAddressSync(new PublicKey(SOL_MINT),wallet).toBase58()]);
 if(new Set(expected.rentAccounts??[]).size!==(expected.rentAccounts??[]).length)reject('RPC_DUPLICATE_RENT_ACCOUNT');
 for(const address of expected.rentAccounts??[]){if(!allowedRent.has(address))reject('RPC_UNAUTHORIZED_RENT_ACCOUNT');const i=addresses.indexOf(address);if(i<0)reject('RPC_RENT_ACCOUNT_MISSING');netRent+=delta(meta.preBalances,meta.postBalances,i);}
 if(netRent.toString()!==expected.netRentLamports)reject('RPC_RENT_EFFECT_MISMATCH');
 const actualInput=intent.direction==='BUY'?-agentSolDelta-fee-netRent:-tokenDelta;
 const actualOutput=intent.direction==='BUY'?tokenDelta:agentSolDelta+fee+netRent;
 if(actualInput!==integer(intent.inputAmount)||actualOutput<integer(expected.minimumOutput))reject('RPC_SWAP_ECONOMICS_MISMATCH');
 return {failed:false,actualInput:actualInput.toString(),actualOutput:actualOutput.toString(),networkFeeLamports:fee.toString(),rentLamports:netRent.toString(),agentSolDelta:agentSolDelta.toString(),agentTokenDelta:tokenDelta.toString(),messageHash:hash,slot};
}
export async function readFinalizedSwap(connection,record,expected){
 await assertMainnet(connection);
 const status=(await connection.getSignatureStatuses([record.signature],{searchTransactionHistory:true})).value?.[0];if(!status||status.confirmationStatus!=='finalized')return null;
 const response=await connection.getTransaction(record.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});if(!response)return null;
 if(status.slot!==response.slot)reject('RPC_SLOT_MISMATCH');
 const effects=extractFinalizedSwapEffects(response,record.intent,{...expected,signature:record.signature,messageHash:record.messageHash});
 const tx=new VersionedTransaction(response.transaction.message,response.transaction.signatures.map(s=>bs58.decode(s)));
 return {signature:record.signature,finalized:true,slot:response.slot,chainBlockTime:Number.isSafeInteger(response.blockTime)&&response.blockTime>=0?response.blockTime:null,error:response.meta.err,transaction:Buffer.from(tx.serialize()).toString('base64'),networkFeeLamports:effects.networkFeeLamports,effects};
}
