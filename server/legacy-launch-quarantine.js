import * as fs from 'node:fs';
import {dirname,resolve} from 'node:path';
import {PublicKey} from '@solana/web3.js';
import {legacyHash} from './legacy-launch-reconciliation.js';
import {validateReceiptJournal} from './launch-receipt-journal.js';

const fail=code=>{throw Object.assign(Error(code),{code,status:503});};
const digest=x=>/^[a-f0-9]{64}$/.test(x??'');
export function createLegacyQuarantine(raw,agentId,evidence){
 const journal=validateReceiptJournal(JSON.parse(raw)),record=journal.receipts[agentId];
 if(!record?.id||!record.signature||record.broadcastAttempted!==true||record.confirmed===true)fail('LEGACY_QUARANTINE_SCOPE');
 if(!Number.isSafeInteger(record.lastValidBlockHeight)||record.lastValidBlockHeight<0||typeof record.blockhash!=='string')fail('LEGACY_QUARANTINE_VALIDITY_REQUIRED');
 try{if(new PublicKey(record.blockhash).toBase58()!==record.blockhash)throw Error();}catch{fail('LEGACY_QUARANTINE_VALIDITY_REQUIRED');}
 if(!digest(evidence?.sha256)||!Number.isSafeInteger(evidence.height)||evidence.height<=record.lastValidBlockHeight||evidence.blockhashValid!==false||!Number.isFinite(Date.parse(evidence.observedAt)))fail('LEGACY_QUARANTINE_EVIDENCE');
 return {version:1,classification:'LEGACY_UNKNOWN_QUARANTINED',chainOutcome:'UNKNOWN',authorizationGranted:false,isolationPolicyApproved:false,resumeAllowed:false,journalSha256:legacyHash(raw),recordSha256:legacyHash(JSON.stringify(record)),record,evidence,oldMessageSha256:null,oldSignedTransactionRecovered:false,recordedBlockhashExpired:true,signatureBlockhashBindingProven:false};
}
function safeFile(path){
 const s=fs.lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('LEGACY_QUARANTINE_UNSAFE_PATH');
}
export function loadLegacyQuarantine(journalPath,{required=false}={}){
 journalPath=resolve(journalPath);const path=journalPath+'.quarantine.json';
 let expected=null,seen=required;
 function read(){
  let raw;
  try{safeFile(path);raw=fs.readFileSync(path);}catch(error){if(error.code==='ENOENT'&&!seen)return null;throw error;}
  seen=true;const hash=legacyHash(raw);if(expected&&expected!==hash)fail('LEGACY_QUARANTINE_CHANGED');
  const q=JSON.parse(raw);safeFile(journalPath);const journalRaw=fs.readFileSync(journalPath);
  if(q.version!==1||q.classification!=='LEGACY_UNKNOWN_QUARANTINED'||q.chainOutcome!=='UNKNOWN'||q.authorizationGranted!==false||q.isolationPolicyApproved!==false||q.resumeAllowed!==false||q.oldSignedTransactionRecovered!==false||q.oldMessageSha256!==null||q.signatureBlockhashBindingProven!==false||legacyHash(journalRaw)!==q.journalSha256)fail('LEGACY_QUARANTINE_INVALID');
  const rebuilt=createLegacyQuarantine(journalRaw,q.record?.agentId,q.evidence);
  if(JSON.stringify(rebuilt)!==JSON.stringify(q))fail('LEGACY_QUARANTINE_BINDING');
  expected=hash;return q;
 }
 read();
 return Object.freeze({read,assertMutation(agentId){const q=read();if(q)fail(q.record.agentId===agentId?'LEGACY_OPERATION_QUARANTINED':'LEGACY_JOURNAL_FROZEN');},projection(agentId){const q=read();return q?.record.agentId===agentId?{classification:q.classification,chainOutcome:q.chainOutcome,resumeAllowed:false,isolationPolicyApproved:false}:null;}});
}

// Apply only with the legacy writer stopped. Exclusive creation, fsync, read-back;
// raw history is never edited. Reapplying identical evidence is idempotent.
export function writeLegacyQuarantine(journalPath,quarantine){
 journalPath=resolve(journalPath);const path=journalPath+'.quarantine.json',raw=fs.readFileSync(journalPath);
 if(legacyHash(raw)!==quarantine.journalSha256)fail('LEGACY_QUARANTINE_JOURNAL_CHANGED');
 const bytes=Buffer.from(JSON.stringify(quarantine));let fd;
 try{fd=fs.openSync(path,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}catch(error){if(error.code!=='EEXIST')throw error;safeFile(path);if(!fs.readFileSync(path).equals(bytes))fail('LEGACY_QUARANTINE_CONFLICT');}finally{if(fd!==undefined)fs.closeSync(fd);}
 if(process.platform!=='win32'){const d=fs.openSync(dirname(path),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
 loadLegacyQuarantine(journalPath,{required:true});return {sha256:legacyHash(bytes),path,authorizationGranted:false};
}
