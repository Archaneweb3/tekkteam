// Administrative, read-only classification. No RPC, signing, send or receipt writes.
import {createHash} from 'node:crypto';
import {PublicKey,Transaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {GENESIS,inspectCreation} from '../src/pump-readiness.js';

export const legacyHash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};

export function recoverLegacyTransaction(encoded,record){
 if(typeof encoded!=='string'||encoded.length>1800)fail('LEGACY_BYTES_INVALID');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.toString('base64')!==encoded)fail('LEGACY_BYTES_INVALID');
 const tx=Transaction.from(bytes);
 if(!tx.verifySignatures(true)||!tx.serialize().equals(bytes))fail('LEGACY_SIGNATURES_INVALID');
 if(tx.feePayer.toBase58()!==record.owner||tx.recentBlockhash!==record.blockhash)fail('LEGACY_TRANSACTION_BINDING');
 const unsigned=Transaction.from(bytes);for(const signer of unsigned.signatures)signer.signature=null;
 const unsignedBytes=unsigned.serialize({requireAllSignatures:false});
 if(!unsigned.serializeMessage().equals(tx.serializeMessage()))fail('LEGACY_MESSAGE_CHANGED');
 inspectCreation(unsignedBytes,{mint:new PublicKey(record.mint),blockhash:record.blockhash,genesis:GENESIS,chainId:'solana:101',launch:record});
 const signature=bs58.encode(tx.signature);
 if(record.signature&&record.signature!==signature)fail('LEGACY_SIGNATURE_MISMATCH');
 return {signature,messageSha256:legacyHash(tx.serializeMessage()),transactionSha256:legacyHash(bytes)};
}

export function classifyLegacyEvidence({record,genesis,status,transaction,preSendTerminal,blockhashValid,height}={}){
 const unknown={classification:'LEGACY_UNKNOWN_QUARANTINED',chainOutcome:'UNKNOWN',authorizationGranted:false};
 if(genesis!==GENESIS||record?.network!=='solana:101')return {...unknown,reason:'MAINNET_EVIDENCE_REQUIRED'};
 if(transaction&&status?.confirmationStatus==='finalized'&&Number.isSafeInteger(status.slot)&&status.slot>=0&&status.slot===transaction.slot){
  try{
   if(!Array.isArray(transaction.transaction)||transaction.transaction[1]!=='base64'||!transaction.meta||transaction.meta.err===undefined||!Number.isSafeInteger(transaction.meta.fee)||transaction.meta.fee<0)throw Error();
   const recovered=recoverLegacyTransaction(transaction.transaction[0],record);
   if(JSON.stringify(status.err)!==JSON.stringify(transaction.meta.err))throw Error();
   const failed=transaction.meta.err!==null;
   return {classification:failed?'FAILED_ONCHAIN':'CONFIRMED_ONCHAIN',chainOutcome:failed?'FAILED':'SUCCESS',authorizationGranted:false,signature:recovered.signature,slot:transaction.slot,feeLamports:transaction.meta.fee,...recovered};
  }catch{return {...unknown,reason:'FINALIZED_TRANSACTION_NOT_BOUND'};}
 }
 // Only an exact durable terminal execution snapshot qualifies. Missing fields,
 // a receipt label, timeout or absence of RPC history never prove no send.
 const p=preSendTerminal;
 if(!status&&!transaction&&p&&p.executionId===record.id&&p.target?.agentId===record.agentId&&p.target.owner===record.owner&&p.result?.mint===record.mint&&p.result.recentBlockhash===record.blockhash&&p.result.lastValidBlockHeight===record.lastValidBlockHeight&&Number.isSafeInteger(record.lastValidBlockHeight)&&p.broadcastAttempted===false&&p.submittedAt===null&&p.signature===null&&record.broadcastAttempted===false&&record.signature===null&&record.confirmed===false&&!['signedTransactionBase64','ownerApprovedTransactionBase64','signedDigest','confirmation','signedAt','ownerApprovedAt'].some(k=>p[k]!=null)&&['USER_REJECTED','TRANSACTION_EXPIRED'].includes(p.status)){
  try{
   const bytes=Buffer.from(p.result.transactionBase64,'base64');
   if(bytes.toString('base64')!==p.result.transactionBase64||legacyHash(bytes)!==p.result.transactionSha256)throw Error();
   inspectCreation(bytes,{mint:new PublicKey(record.mint),blockhash:record.blockhash,genesis:GENESIS,chainId:'solana:101',launch:record});
  }catch{return {...unknown,reason:'PRE_SEND_MESSAGE_UNPROVEN'};}
  const expired=p.status==='TRANSACTION_EXPIRED'&&blockhashValid===false&&Number.isSafeInteger(height)&&Number.isSafeInteger(record.lastValidBlockHeight)&&height>record.lastValidBlockHeight;
  if(p.status==='USER_REJECTED'||expired)return {classification:expired?'EXPIRED_BEFORE_BROADCAST':'DEFINITIVELY_NOT_BROADCAST',chainOutcome:'NOT_SENT',authorizationGranted:false};
 }
 return {...unknown,reason:'HISTORICAL_OUTCOME_UNPROVEN'};
}

// Review-only proposal: no approval field can activate execution through this API.
export function reviewFreshIsolation(candidate,quarantine){
 const old=quarantine.record,collisions=[];
 for(const [fresh,prior]of [['operationId','id'],['agentId','agentId'],['mint','mint'],['recentBlockhash','blockhash'],['idempotencyKey','id']])if(!candidate[fresh]||candidate[fresh]===old[prior])collisions.push(fresh);
 if(!candidate.messageSha256||!quarantine.oldMessageSha256)collisions.push('messageProofPending');
 else if(candidate.messageSha256===quarantine.oldMessageSha256)collisions.push('messageSha256');
 return {allowed:false,ownerPolicyApprovalRequired:true,collisions,requiresOldOperationResumeFence:true};
}
