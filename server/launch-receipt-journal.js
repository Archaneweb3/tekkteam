import * as fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const statuses=new Set(['Idle','Prepared','Awaiting approval','Submitted','Confirming','Unknown','Success','Failed','Deleted']);
const fields=new Set(['agentId','agentName','name','symbol','description','image','character','owner','tokenDraftRevision','tokenDescriptionPresent','website','twitter','telegram','metadataUri','initialBuyLamports','id','tokenName','network','confirmed','signature','observedSpendLamports','confirmedAt','status','mint','lastValidBlockHeight','blockhash','createdAt','deletedAt','notice','error','resolution','networkFeeLamports','pumpUrl','explorerUrl','mintExplorerUrl','submissionAcknowledged','submissionAcknowledgedAt']);
for(const field of ['executionId','reviewDigest','signedTransactionDigest','submittedAt','contextSlot','confirmedSlot','blockTime','pumpProvenance','coinDraftAgentId','coinDraftRevision'])fields.add(field);
const address=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
const failure=(code)=>Object.assign(Error(code),{code,status:503});
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateReceiptJournal(data){
 if(!data||data.version!==2||Object.keys(data).some(k=>!['version','receipts'].includes(k))||!data.receipts||typeof data.receipts!=='object'||Array.isArray(data.receipts))throw failure('RECEIPT_JOURNAL_INVALID');
 for(const [id,r]of Object.entries(data.receipts)){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!r||typeof r!=='object'||Array.isArray(r)||r.agentId!==id||!address(r.owner)||r.network!=='solana:101'||!statuses.has(r.status)||Object.keys(r).some(k=>!fields.has(k)&&k!=='broadcastAttempted'))throw failure('RECEIPT_JOURNAL_INVALID');
  if(Object.values(r).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v))||Object.values(r).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw failure('RECEIPT_JOURNAL_INVALID');
  if(r.signature!=null&&(typeof r.signature!=='string'||!r.signature.trim())||r.mint!=null&&!address(r.mint)||r.broadcastAttempted!==undefined&&typeof r.broadcastAttempted!=='boolean'||r.confirmed!==undefined&&typeof r.confirmed!=='boolean')throw failure('RECEIPT_JOURNAL_INVALID');
  if(['Prepared','Awaiting approval','Deleted','Idle'].includes(r.status)&&(r.signature||r.broadcastAttempted||r.confirmed))throw failure('RECEIPT_JOURNAL_INVALID');
  if(['Submitted','Confirming','Success'].includes(r.status)&&!r.signature||r.confirmed===true&&r.status!=='Success'||r.status==='Success'&&(r.confirmed!==true||!address(r.mint)))throw failure('RECEIPT_JOURNAL_INVALID');
  if(r.submissionAcknowledged!==undefined&&typeof r.submissionAcknowledged!=='boolean'||r.submissionAcknowledged===true&&(!r.signature||r.broadcastAttempted!==true||!Number.isSafeInteger(r.submissionAcknowledgedAt)))throw failure('RECEIPT_JOURNAL_INVALID');
  if(r.executionId!==undefined&&(r.executionId!==r.id||r.coinDraftAgentId!==id||r.coinDraftRevision!==1||! /^[a-f0-9]{64}$/.test(r.reviewDigest??'')||! /^[a-f0-9]{64}$/.test(r.signedTransactionDigest??'')||['submittedAt','contextSlot','confirmedSlot','blockTime'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0)||r.status!=='Success'||r.confirmed!==true||r.pumpProvenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'))throw failure('RECEIPT_JOURNAL_INVALID');
 }
 return data;
}
function decode(bytes){
 if(bytes.length>8*1024*1024)throw failure('RECEIPT_JOURNAL_TOO_LARGE');
 let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw failure('RECEIPT_JOURNAL_INVALID');}
 // Existing v2 writers/readers use compact JSON; reject duplicate-key/noncanonical bytes.
 if(JSON.stringify(data)!==bytes.toString('utf8').trim())throw failure('RECEIPT_JOURNAL_NONCANONICAL');
 return validateReceiptJournal(data);
}

export function readReceiptJournal(path){
 const stat=fs.lstatSync(path);
 if(stat.isSymbolicLink()||stat.nlink>1||!stat.isFile())throw failure('RECEIPT_JOURNAL_UNSAFE_PATH');
 return decode(fs.readFileSync(path));
}

/** Cooperating writers only. Never remove an abandoned lock automatically.
 * Windows lacks portable directory fsync; file sync/rename are not power-loss proof.
 */
export function createReceiptJournal(path,{initializeMissing=false,io=fs,checkpoint=()=>{},platform=process.platform}={}){
 if(typeof path!=='string'||!path)throw failure('RECEIPT_JOURNAL_PATH_REQUIRED');
 path=resolve(path);const lock=path+'.write-lock';
 for(let directory=dirname(path);;directory=dirname(directory)){
  try{if(io.lstatSync(directory).isSymbolicLink())throw failure('RECEIPT_JOURNAL_UNSAFE_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(dirname(directory)===directory)break;
 }
 let baseline=null,records={},fenced=false,lastAck=null;
 const safePath=target=>{try{const s=io.lstatSync(target);if(s.isSymbolicLink()||s.nlink>1||!s.isFile())throw failure('RECEIPT_JOURNAL_UNSAFE_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}};
 safePath(path);safePath(lock);
 try{const bytes=io.readFileSync(path);records=decode(bytes).receipts;baseline=fingerprint(bytes);}catch(error){if(error.code!=='ENOENT'||!initializeMissing)throw error;}
 function commit(next){
  if(fenced)throw failure('RECEIPT_JOURNAL_FENCED');
  validateReceiptJournal({version:2,receipts:next});
  const bytes=Buffer.from(JSON.stringify({version:2,receipts:next})),temporary=path+'.'+randomUUID()+'.tmp';
  if(bytes.length>8*1024*1024)throw failure('RECEIPT_JOURNAL_TOO_LARGE');
  let lockFd=null,tempFd=null,renamed=false,renameStarted=false;
  try{
   io.mkdirSync(dirname(path),{recursive:true});safePath(path);safePath(lock);
   checkpoint('lock');lockFd=io.openSync(lock,'wx',0o600);
   let current=null;try{current=fingerprint(io.readFileSync(path));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(current!==baseline){fenced=true;throw failure('RECEIPT_JOURNAL_STALE_WRITER');}
   checkpoint('open');tempFd=io.openSync(temporary,'wx',0o600);
   checkpoint('write');io.writeFileSync(tempFd,bytes);
   checkpoint('file-sync');io.fsyncSync(tempFd);
   checkpoint('close');io.closeSync(tempFd);tempFd=null;
   checkpoint('rename');renameStarted=true;io.renameSync(temporary,path);renamed=true;
   checkpoint('directory-sync');
   if(platform!=='win32'){const dirFd=io.openSync(dirname(path),'r');try{io.fsyncSync(dirFd);}finally{io.closeSync(dirFd);}}
   checkpoint('verify');const observed=io.readFileSync(path);decode(observed);
   if(!observed.equals(bytes))throw failure('RECEIPT_JOURNAL_COMMIT_DISAGREEMENT');
   baseline=fingerprint(bytes);records=structuredClone(next);
   lastAck=Object.freeze({persistence:'VERIFIED_LOCAL',fileSynced:true,atomicReplacement:true,directorySynced:platform!=='win32',powerLossDurability:platform==='win32'?'UNVERIFIED':'FILESYSTEM_DEPENDENT',authorizationGranted:false});
   return lastAck;
  }catch(error){
   if(renameStarted||renamed)fenced=true;
   if(error.code==='EEXIST')throw failure('RECEIPT_JOURNAL_WRITER_BUSY');
   throw Object.assign(error,{status:503,code:error.code??'RECEIPT_JOURNAL_WRITE_FAILED'});
  }finally{
   if(tempFd!==null)try{io.closeSync(tempFd);}catch{fenced=true;}
   if(!renamed)try{io.unlinkSync(temporary);}catch{}
   if(lockFd!==null){try{io.closeSync(lockFd);io.unlinkSync(lock);}catch{fenced=true;lastAck=null;throw failure('RECEIPT_JOURNAL_LOCK_RELEASE_FAILED');}}
  }
 }
 if(baseline===null)commit({});
 function assertAvailable(){
  if(fenced)throw failure('RECEIPT_JOURNAL_FENCED');
  try{safePath(path);const bytes=io.readFileSync(path);decode(bytes);if(fingerprint(bytes)!==baseline)throw failure('RECEIPT_JOURNAL_EXTERNAL_CHANGE');}
  catch(error){fenced=true;lastAck=null;throw Object.assign(error,{status:503});}
 }
 return {read(){assertAvailable();return structuredClone(records);},commit,assertAvailable,ack:()=>lastAck};
}
