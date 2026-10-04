import {mkdirSync,lstatSync,realpathSync,readFileSync,readdirSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {inspectCreation,GENESIS,PUMP} from '../src/pump-readiness.js';
import {assertExecutionReview} from './pump-execution-review.js';
const reject=()=>Object.assign(Error('PREPARATION_EVIDENCE_INVALID'),{code:'PREPARATION_EVIDENCE_INVALID'});
const conflict=()=>Object.assign(Error('PREPARATION_REQUEST_CONFLICT'),{code:'PREPARATION_REQUEST_CONFLICT',status:409});
const hash=value=>createHash('sha256').update(value).digest('hex');
export const preparationFingerprint=(identity,amount)=>hash(JSON.stringify({identity,amount}));
// Private unsigned evidence/request binding only; never a receipt or authorization.
export function createPreparationEvidenceWriter(root,{now=Date.now}={}){
 if(!isAbsolute(root))throw reject();root=resolve(root);
 const dir=join(root,'preparation-evidence');
 function checkRoot(){
  for(let p=root;;p=dirname(p)){const stat=lstatSync(p);if(!stat.isDirectory()||stat.isSymbolicLink())throw reject();if(dirname(p)===p)break;}
  if(realpathSync(root)!==root)throw reject();
 }
 function checkDir(){const stat=lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(dir)!==dir)throw reject();}
 function validate(result){
  if(result?.mode!=='M3_UNSIGNED_PREPARATION'||result.network!=='solana:101'||result.genesis!==GENESIS||result.programId!==PUMP||result.signingEnabled!==false||result.broadcastEnabled!==false||result.absoluteDebitBoundVerified!==false||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(result.id)||! /^[a-f0-9]{64}$/.test(result.transactionSha256)||result.launch?.owner!==result.feePayer||!Number.isSafeInteger(result.expiresAt)||!Number.isFinite(Date.parse(result.createdAt)))throw reject();
  const bytes=Buffer.from(result.transactionBase64,'base64');
  if(hash(bytes)!==result.transactionSha256||bytes.length!==result.transactionSize)throw reject();
  const structure=inspectCreation(bytes,{mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.network,launch:result.launch});
  if(structure.initialBuyLamports!==result.policy?.initialBuyLamports||JSON.stringify(structure)!==JSON.stringify(result.structure))throw reject();
  const {metadataUri,initialBuyLamports,...identity}=result.launch;
  // Historical artifacts remain readable as evidence; a current review's digest
  // is always verified, while freshness is enforced separately by its consumer.
  if(result.executionReview)assertExecutionReview(result,identity,{now:result.executionReview.startedAt});
  return preparationFingerprint(identity,initialBuyLamports);
 }
 const path=(owner,id)=>join(dir,hash(owner+':'+id)+'.json');
 function readFile(file){
  const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>256*1024)throw reject();
  const evidence=JSON.parse(readFileSync(file,'utf8'));
  if(evidence.formatVersion!==2||evidence.evidence!=='M3_UNSIGNED_PREPARATION'||evidence.authorizationGranted!==false||evidence.transactionsSigned!==0||evidence.broadcasts!==0||evidence.fingerprint!==validate(evidence.result))throw reject();
  return evidence;
 }
 const write=async result=>{
  const fingerprint=validate(result),evidence=Buffer.from(JSON.stringify({formatVersion:2,evidence:'M3_UNSIGNED_PREPARATION',authorizationGranted:false,transactionsSigned:0,broadcasts:0,fingerprint,result}));if(evidence.length>256*1024)throw reject();
  checkRoot();mkdirSync(dir,{recursive:true,mode:0o700});checkDir();
  const file=path(result.feePayer,result.id);
  try{const prior=readFile(file);if(prior.fingerprint!==fingerprint||!readFileSync(file).equals(evidence))throw conflict();return;}catch(e){if(e.code!=='ENOENT')throw e;}
  const temporary=join(dir,randomUUID()+'.tmp');let fd;
  // Atomic no-replace claim: a competing writer cannot overwrite this request's artifact.
  try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,evidence);fsyncSync(fd);closeSync(fd);fd=undefined;try{linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;const prior=readFile(file);if(prior.fingerprint!==fingerprint||!readFileSync(file).equals(evidence))throw conflict();}}
  finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{}}
 };
 write.read=(identity,amount,id)=>{
  checkRoot();let evidence;
  try{checkDir();evidence=readFile(path(identity.owner,id));}catch(e){
   if(e.code!=='ENOENT')throw e;
   // Format1 is historical only. Never rebuild/reinterpret its request as a new quote.
   let files;try{checkDir();files=readdirSync(dir);}catch(missing){if(missing.code==='ENOENT')return null;throw missing;}
   if(files.some(file=>file.startsWith(id+'-')&&/^[a-f0-9-]{36}-[a-f0-9]{64}\.json$/.test(file)))throw Object.assign(Error('PREPARATION_LEGACY_REQUEST'),{code:'PREPARATION_LEGACY_REQUEST',status:409});
   return null;
  }
  if(evidence.result.id!==id||evidence.result.feePayer!==identity.owner||evidence.fingerprint!==preparationFingerprint(identity,amount))throw conflict();
  if(evidence.result.expiresAt<=now())throw Object.assign(Error('PREPARATION_EXPIRED'),{code:'PREPARATION_EXPIRED',status:409});
  return evidence.result;
 };
 return write;
}
