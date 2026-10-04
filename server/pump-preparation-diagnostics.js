// Private simulation telemetry. Never a receipt, execution permit or secret dump.
import {Transaction,PublicKey} from '@solana/web3.js';
import {unpackAccount,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync,readFileSync} from 'node:fs';
import {isAbsolute,resolve,join,dirname} from 'node:path';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=()=>Object.assign(Error('PREPARATION_DIAGNOSTIC_INVALID'),{code:'PREPARATION_DIAGNOSTIC_INVALID'});
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const balance=a=>a===null?0:valid(a?.lamports)?a.lamports:null;
const sol=n=>n===null?null:(n/1e9).toFixed(9);
function token(address,a){
 if(!a||![TOKEN_PROGRAM_ID.toBase58(),TOKEN_2022_PROGRAM_ID.toBase58()].includes(a.owner))return null;
 try{const data=Buffer.from(a.data[0],'base64');if(data.length<165)return null;
  const t=unpackAccount(new PublicKey(address),{...a,owner:new PublicKey(a.owner),data},new PublicKey(a.owner));
  return {mint:t.mint.toBase58(),authority:t.owner.toBase58(),amount:t.amount.toString(),initialized:t.isInitialized,frozen:t.isFrozen};
 }catch{return {decode:'UNRESOLVED'};}
}
export function preparationDiagnostic(result,{before,afterRead,simulation,feeResponse,latestResponse,validity,stage='PREPARATION'}){
 const bytes=Buffer.from(result.transactionBase64,'base64'),tx=Transaction.from(bytes),keys=tx.compileMessage().accountKeys.map(p=>p.toBase58());
 if(hash(bytes)!==result.transactionSha256||tx.signatures.some(s=>s.signature!==null))throw fail();
 const v=simulation.value,atomic=Array.isArray(v.preBalances)&&Array.isArray(v.postBalances)&&v.preBalances.length===keys.length&&v.postBalances.length===keys.length&&[...v.preBalances,...v.postBalances].every(valid);
 const accounts=result.structure.accounts.map((a,i)=>{
  const pre=before.value[i],post=v.accounts?.[i],after=afterRead.value[i],index=keys.indexOf(a.address),preLamports=balance(pre),postLamports=balance(post),externalDeltaLamports=preLamports!==null&&postLamports!==null?postLamports-preLamports:null;
  const atomicPreLamports=atomic?v.preBalances[index]:null,atomicPostLamports=atomic?v.postBalances[index]:null,atomicDeltaLamports=atomic?atomicPostLamports-atomicPreLamports:null;
  const delta=atomic?atomicDeltaLamports:externalDeltaLamports;
  let classification=null,expectedness='NO_NEGATIVE_DELTA';
  if(delta<0){classification='UNRESOLVED';expectedness='EXTERNAL_BANK_DIFFERENCE_OR_UNKNOWN_EFFECT';
   if(a.name==='user'&&(atomic||result.policy.prestateSameBank===true)&&-delta===result.policy.validatedOverheadLamports){classification='EXPECTED_OWNER_DEBIT';expectedness='OWNER_CPI_FUNDING_PLUS_QUOTED_FEE';}
   else if(atomic&&a.name!=='user'){classification='UNEXPECTED_DEBIT';expectedness='ZERO_BUY_CREATE_V2_HAS_NO_MODELED_NONOWNER_DEBIT';}
  }
  return {pubkey:a.address,role:a.name,writable:a.writable,signer:a.signer,compiledAccountIndex:index,
   preLamports,postLamports,postAccountReturned:post!==undefined,preSol:sol(preLamports),postSol:sol(postLamports),externalDeltaLamports,externalDeltaSol:sol(externalDeltaLamports),
   atomicPreLamports,atomicPostLamports,atomicDeltaLamports,atomicPostMatchesReturnedAccount:atomic?atomicPostLamports===postLamports:null,
   afterReadLamports:balance(after),ownerProgram:{pre:pre?.owner??null,post:post?.owner??null,afterRead:after?.owner??null},
   executable:{pre:pre?.executable??null,post:post?.executable??null},token:{pre:token(a.address,pre),post:token(a.address,post),afterRead:token(a.address,after)},
   classification,expectedness,externalClassification:externalDeltaLamports<0?'UNRESOLVED':null,
   externalExpectedness:externalDeltaLamports<0&&atomicDeltaLamports===0?'EXTERNAL_BANK_DRIFT_ATOMIC_EFFECT_ZERO':'EXTERNAL_OBSERVATION_NOT_EXECUTION_PROOF',
   simulationSlot:simulation.context.slot,preReadSlot:before.context.slot,postReadSlot:afterRead.context.slot,transactionSha256:result.transactionSha256};
 });
 return {formatVersion:1,evidence:'UNSIGNED_SIMULATION_DIAGNOSTIC',authorizationGranted:false,transactionsSigned:0,broadcasts:0,
  requestId:result.id,stage,createdAt:result.createdAt,owner:result.launch.owner,agentId:result.launch.agentId,tokenDraftRevision:result.launch.tokenDraftRevision??null,
  network:result.network,genesis:result.genesis,programId:result.programId,mint:result.mint,transactionSha256:result.transactionSha256,
  transactionSize:bytes.length,initialBuyLamports:result.launch.initialBuyLamports,context:{latestSlot:latestResponse?.context?.slot??null,feeSlot:feeResponse.context.slot,preReadSlot:before.context.slot,simulationSlot:simulation.context.slot,postReadSlot:afterRead.context.slot,validitySlot:validity?.context?.slot??null},
  atomicBalancesAvailable:atomic,accounts,feeLamports:feeResponse.value,simulationFeeLamports:valid(v.fee)?v.fee:null,
  policy:{allowed:result.policy.allowed,reasons:result.policy.reasons,warnings:result.policy.warnings,validatedOverheadLamports:result.policy.validatedOverheadLamports,estimatedPayerDebitLamports:result.policy.estimatedPayerDebitLamports},
  simulationError:v.err,logs:v.logs??[],innerInstructions:v.innerInstructions??null,
  tokenBalances:{pre:v.preTokenBalances??null,post:v.postTokenBalances??null},rentAccounts:result.policy.rentAccounts};
}
export function createPreparationDiagnosticWriter(root){
 if(!isAbsolute(root))throw fail();root=resolve(root);const dir=join(root,'preparation-diagnostics');
 const check=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(p)!==p)throw fail();};
 return async(result,proof)=>{
  const record=preparationDiagnostic(result,proof),bytes=Buffer.from(JSON.stringify(record));
  if(bytes.length>512*1024||! /^[a-f0-9-]{36}$/.test(record.requestId))throw fail();
  for(let p=root;;p=dirname(p)){check(p);if(dirname(p)===p)break;}
  mkdirSync(dir,{recursive:true,mode:0o700});check(dir);
  const file=join(dir,hash(record.owner+':'+record.requestId+':'+record.transactionSha256+':'+record.stage+':'+hash(bytes))+'.json'),temporary=join(dir,randomUUID()+'.tmp');let fd;
  try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;
   try{linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;const s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!readFileSync(file).equals(bytes))throw fail();}
  }finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{}}
  if(process.platform!=='win32'){fd=openSync(dir,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
  console.info(JSON.stringify({event:'UNSIGNED_SIMULATION_DIAGNOSTIC_PERSISTED',requestId:record.requestId,transactionSha256:record.transactionSha256,simulationSlot:record.context.simulationSlot}));
  return record;
 };
}
