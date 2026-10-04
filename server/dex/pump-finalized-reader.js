import {createHash} from 'node:crypto';
import {VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {GENESIS} from '../../src/pump-readiness.js';
import {digest,reject} from './intent.js';

const fail=reason=>reject('PUMP_FINALITY_'+reason);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const slot=value=>Number.isSafeInteger(value)&&value>0;
const error=value=>value===null||typeof value==='string'&&value.length>0||value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
function transaction(encoded){
 if(typeof encoded!=='string'||encoded.length>1644||Buffer.from(encoded,'base64').toString('base64')!==encoded)fail('TRANSACTION_ENCODING');
 try{
  const bytes=Buffer.from(encoded,'base64'),tx=VersionedTransaction.deserialize(bytes),m=tx.message;
  if(bytes.length>1232||!Buffer.from(tx.serialize()).equals(bytes))fail('TRANSACTION_NONCANONICAL');
  if(m.version!==0||m.addressTableLookups.length||m.header.numRequiredSignatures!==1||tx.signatures.length!==1)fail('MESSAGE_SHAPE');
  return tx;
 }catch(e){if(e.code?.startsWith('PUMP_FINALITY_'))throw e;fail('TRANSACTION_INVALID');}
}

// Unmounted read-only DI hook. rpc(method, params) returns the JSON-RPC result.
// The caller supplies a trusted transport and an existing ledger record, never a
// user-supplied signature. No URL/env lookup, retry, signer, sender or storage port.
// Explicit ON_CHAIN is a trust boundary, not venue/execution qualification.
export function createPumpFinalizedReader({rpc,source='LOCAL_FIXTURE'}={}){
 if(typeof rpc!=='function'||!['LOCAL_FIXTURE','ON_CHAIN'].includes(source))fail('DEPENDENCY');
 const read=async(method,params)=>{
  try{return structuredClone(await rpc(method,params));}
  catch(e){
   // Do not propagate provider messages, URLs, headers or credentials.
   const out=Object.assign(Error('PUMP_FINALITY_RPC_UNAVAILABLE'),{code:'PUMP_FINALITY_RPC_UNAVAILABLE',status:503});
   let info;try{info=Object.getOwnPropertyDescriptors(e);}catch{}
   const httpStatus=info?.httpStatus?.value,rpcCode=info?.rpcCode?.value;
   if(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599)out.httpStatus=httpStatus;
   if(Number.isInteger(rpcCode))out.rpcCode=rpcCode;
   throw out;
  }
 };
 return async function readFinalized(signature,record){
  let r;try{r=structuredClone(record);}catch{fail('RECORD_INVALID');}
  if(!r||typeof r.id!=='string'||!r.id||r.status!=='UNKNOWN'||r.signature!==signature||r.source!==source||r.plan?.source!==source||r.plan?.venueKind!=='PUMP_BONDING_CURVE'||r.intent?.network!=='solana:101'||r.intent?.genesis!==GENESIS||!slot(r.plan.snapshotSlot))fail('TRACKED_RECORD_REQUIRED');
  if(r.planDigest!==digest(r.plan)||r.fingerprint!==digest(r.intent))fail('PLAN_INTEGRITY');
  let sig;try{sig=bs58.decode(signature);if(sig.length!==64||bs58.encode(sig)!==signature||sig.every(n=>n===0))throw Error();}catch{fail('SIGNATURE_INVALID');}
  const unsigned=transaction(r.plan.unsignedTransaction),m=unsigned.message;
  if(unsigned.signatures.some(s=>s.some(n=>n!==0))||m.staticAccountKeys[0].toBase58()!==r.intent.agentWallet||hash(m.serialize())!==r.plan.messageHash)fail('PREPARED_MESSAGE');
  if(await read('getGenesisHash',[])!==GENESIS)fail('WRONG_MAINNET');
  const statuses=await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]);
  if(!statuses||!slot(statuses.context?.slot)||!Array.isArray(statuses.value)||statuses.value.length!==1)fail('STATUS_INVALID');
  const status=statuses.value[0];
  if(status===null)return null;
  if(!status||!['processed','confirmed','finalized'].includes(status.confirmationStatus)||!slot(status.slot)||statuses.context.slot<status.slot||!Object.hasOwn(status,'err')||!error(status.err))fail('STATUS_INVALID');
  if(status.confirmationStatus!=='finalized')return null;
  if(status.confirmations!==null||status.slot<r.plan.snapshotSlot)fail('STATUS_CONTEXT');
  const landed=await read('getTransaction',[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  // Pruned/missing data remains UNKNOWN. It never becomes a failed receipt.
  if(landed===null)return null;
  if(!landed||!slot(landed.slot)||landed.slot!==status.slot||landed.version!==0||!landed.meta||!Object.hasOwn(landed.meta,'err')||!error(landed.meta.err)||digest(landed.meta.err)!==digest(status.err)||landed.blockTime!==null&&(!Number.isSafeInteger(landed.blockTime)||landed.blockTime<0))fail('LANDED_CONTEXT');
  if(!Array.isArray(landed.transaction)||landed.transaction.length!==2||landed.transaction[1]!=='base64')fail('LANDED_ENCODING');
  const tx=transaction(landed.transaction[0]),bytes=tx.message.serialize();
  if(!Buffer.from(bytes).equals(Buffer.from(m.serialize()))||hash(bytes)!==r.plan.messageHash||!Buffer.from(tx.signatures[0]).equals(Buffer.from(sig))||!nacl.sign.detached.verify(bytes,sig,m.staticAccountKeys[0].toBytes()))fail('SIGNED_MESSAGE');
  return {source,network:'solana:101',genesis:GENESIS,signature,finalized:true,slot:landed.slot,error:landed.meta.err,transaction:landed.transaction[0],meta:landed.meta,blockTime:landed.blockTime,venueExecutionQualified:false,authorizationGranted:false};
 };
}
