import {PublicKey,Transaction} from '@solana/web3.js';
import {pumpSdk} from './dex/pump-sdk-boundary.js';
import {GENESIS,PUMP,inspectCreation} from '../src/pump-readiness.js';
import {verifyM4Signed,m4Fail,sha} from './pump-m4-guard.js';
import {assertExecutionReview,contextSlot} from './pump-execution-review.js';
import {decodeM4CreationAccounts,verifyM4CreateEvent,verifyM4TokenAccounts} from './pump-m4-provenance.js';
import {FINAL_MESSAGE_POLICY,LIGHTHOUSE_PROGRAM} from '../src/pump-wallet-final.js';
export async function confirmM4(record,{transport,now=Date.now}){
 const r=record.result;assertExecutionReview(r,r.launch,{now:r.executionReview.startedAt});if(await transport.rpc('getGenesisHash',[])!==GENESIS)throw m4Fail('M4_WRONG_MAINNET');
 const statuses=await transport.rpc('getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}]),status=statuses.value?.[0];
 if(!status||status.confirmationStatus!=='finalized')return {status:'CONFIRMATION_UNKNOWN'};
 const landed=await transport.rpc('getTransaction',[record.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(!landed)return {status:'RECONCILIATION_REQUIRED'};
 if(!landed.meta||!Object.hasOwn(landed.meta,'err')||!Object.hasOwn(status,'err'))throw m4Fail('M4_CONFIRMATION_METADATA_UNAVAILABLE');
 if(landed.meta.err!==null||status.err!==null)return {status:'FAILED_ON_CHAIN',error:JSON.stringify(landed.meta.err??status.err),networkFeeLamports:landed.meta.fee??null};
 if(!Array.isArray(landed.transaction)||landed.transaction[1]!=='base64'||landed.transaction[0]!==record.signedTransactionBase64||!Number.isSafeInteger(landed.slot)||landed.slot<r.executionReview.simulationSlot||!Number.isSafeInteger(landed.blockTime))throw m4Fail('M4_LANDED_BYTES_OR_CONTEXT_MISMATCH');
 const {tx,signature,signedDigest}=verifyM4Signed(landed.transaction[0],record,true);if(signature!==record.signature||signedDigest!==record.signedDigest||tx.feePayer.toBase58()!==r.launch.owner||status.slot!==landed.slot)throw m4Fail('M4_LANDED_OWNER_OR_DIGEST_MISMATCH');
 const finalPolicy=record.walletMessagePolicy===FINAL_MESSAGE_POLICY;
 if(finalPolicy&&(record.finalMessageProof?.messageSha256!==sha(tx.serializeMessage())||record.finalMessageProof?.signedPayloadSha256!==signedDigest||record.finalMessageProof?.simulationStatus!=='PASS'||record.finalMessageProof?.reviewedDebitLamports!==r.executionReview.reviewedDebitLamports||record.finalMessageProof?.feeLamports!==r.executionReview.networkFeeLamports))throw m4Fail('M4_FINAL_MESSAGE_PROOF_REQUIRED');
 inspectCreation(Buffer.from(r.transactionBase64,'base64'),{mint:new PublicKey(r.mint),blockhash:r.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch:r.launch,feePolicy:r.feePolicy??null});
 if(!landed.meta.logMessages?.includes(`Program ${PUMP} success`)||!landed.meta.logMessages?.some(l=>/Instruction: CreateV2/.test(l)))throw m4Fail('M4_PUMP_PROVENANCE_MISSING');
 verifyM4CreateEvent(r,landed.meta.logMessages);
 const mint=new PublicKey(r.mint),curveKey=pumpSdk.bondingCurvePda(mint);
 const addresses=[r.mint,curveKey.toBase58(),r.launch.owner,...(finalPolicy?r.structure.accounts.filter(a=>['associated_bonding_curve','mayhem_token_vault'].includes(a.name)).map(a=>a.address):[])];
 const response=await transport.rpc('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:landed.slot}]);contextSlot(response,landed.slot);
 if(!Array.isArray(response.value)||response.value.length!==addresses.length)throw m4Fail('M4_ACCOUNT_PROOF_INCOMPLETE');
 if(finalPolicy){const mapped=r.structure.accounts.map(a=>response.value[addresses.indexOf(a.address)]);verifyM4TokenAccounts(r,mapped);const programs=new Set(record.finalMessageProof.programs),invoked=landed.meta.logMessages?.flatMap(l=>{const m=/^Program (\w+) invoke \[\d+\]$/.exec(l);return m?[m[1]]:[];})??[];if(!programs.size||invoked.some(p=>!programs.has(p))||landed.meta.logMessages.some(l=>/truncat/i.test(l))||record.integrity.allowedMessageDiff==='PHANTOM_LIGHTHOUSE_ADDED'&&landed.meta.logMessages.at(-1)!==`Program ${LIGHTHOUSE_PROGRAM} success`)throw m4Fail('M4_LANDED_UNEXPECTED_PROGRAM');}
 const {metadata}=decodeM4CreationAccounts(r,response.value[0],response.value[1]);
 if(response.value[2]?.owner!=='11111111111111111111111111111111'||response.value[2]?.executable!==false||!Number.isSafeInteger(response.value[2]?.lamports)||response.value[2].lamports<0)throw m4Fail('M4_FINAL_BALANCE_UNAVAILABLE');
 const keys=tx.compileMessage().accountKeys,ownerIndex=keys.findIndex(k=>k.toBase58()===r.launch.owner),pre=landed.meta.preBalances?.[ownerIndex],post=landed.meta.postBalances?.[ownerIndex],spent=pre-post;
 if([landed.meta.preBalances,landed.meta.postBalances].some(a=>!Array.isArray(a)||a.length!==keys.length||a.some(n=>!Number.isSafeInteger(n)||n<0)))throw m4Fail('M4_BALANCE_PROOF_INCOMPLETE');
 if(!Number.isSafeInteger(pre)||!Number.isSafeInteger(post)||!Number.isSafeInteger(spent)||spent<0||spent>10000000||spent!==r.executionReview.reviewedDebitLamports||landed.meta.fee!==r.executionReview.networkFeeLamports||post<r.executionReview.requiredRemainingBalanceLamports)throw m4Fail('M4_LANDED_DEBIT_MISMATCH');
 for(let i=0;i<keys.length;i++)if(i!==ownerIndex&&tx.compileMessage().isAccountWritable(i)&&landed.meta.postBalances[i]<landed.meta.preBalances[i])throw m4Fail('M4_LANDED_UNEXPECTED_DEBIT');
 if(finalPolicy){if(landed.meta.postBalances.reduce((n,b,i)=>n+BigInt(b)-BigInt(landed.meta.preBalances[i]),0n)!==-BigInt(landed.meta.fee)||keys.some((_,i)=>!tx.compileMessage().isAccountWritable(i)&&landed.meta.postBalances[i]!==landed.meta.preBalances[i]))throw m4Fail('M4_LANDED_ACCOUNT_EFFECTS_MISMATCH');}
 return {status:'LAUNCHED',confirmedSlot:landed.slot,blockTime:landed.blockTime,confirmedAt:landed.blockTime*1000,observedSpendLamports:spent,networkFeeLamports:landed.meta.fee,finalOwnerBalanceLamports:response.value[2]?.lamports??null,metadataUri:metadata.uri,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR',network:'solana:101'};
}
