// Private, append-only observations. Never an execution, receipt or replay source.
import {createHash,randomUUID} from 'node:crypto';
import {VersionedTransaction,VersionedMessage,Transaction} from '@solana/web3.js';
import {LIGHTHOUSE_PROGRAM,validateFinalWalletMessage} from '../src/pump-wallet-final.js';
import {COMPUTE_BUDGET} from '../src/pump-fee-policy.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const fail=code=>Object.assign(Error(code),{code,status:409});
const safeRule=code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(code)?code:'M4_VALIDATION_FAILED';
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
const digest=value=>hash(JSON.stringify(sorted(value)));
function bytes(input){if(typeof input!=='string'||input.length>8192)throw fail('M4_DIAGNOSTIC_INPUT_INVALID');const b=Buffer.from(input,'base64');if(b.toString('base64')!==input)throw fail('M4_DIAGNOSTIC_INPUT_INVALID');return b;}
function decoded(program,data){
 if(program===COMPUTE_BUDGET&&data.length===5&&data[0]===2)return {kind:'SetComputeUnitLimit',units:data.readUInt32LE(1)};
 if(program===COMPUTE_BUDGET&&data.length===9&&data[0]===3)return {kind:'SetComputeUnitPrice',microLamports:data.readBigUInt64LE(1).toString()};
 if(program===LIGHTHOUSE_PROGRAM&&data.length===26&&data.subarray(0,4).equals(Buffer.from([6,4,3,0]))&&data.subarray(12).equals(Buffer.from([4,3,0,0,1,0,0,0,0,0,0,0,0,0])))return {kind:'AssertAccountInfoMulti',minimumLamports:data.readBigUInt64LE(4).toString(),ownerProgram:'11111111111111111111111111111111',dataLength:0};
 return {kind:'HASH_ONLY',length:data.length};
}
export function describeDiagnosticMessage(base64,result,{messageOnly=false}={}){
 let b;try{b=bytes(base64);}catch{return {available:false,error:'M4_DIAGNOSTIC_INPUT_INVALID'};}
 try{
  const tx=messageOnly?null:VersionedTransaction.deserialize(b),m=tx?.message??VersionedMessage.deserialize(b),raw=Buffer.from(m.serialize());
  const keys=(m.staticAccountKeys??m.accountKeys).map(k=>k.toBase58()),roles=new Map((result.structure?.accounts??[]).map(a=>[a.address,a.name]));roles.set(LIGHTHOUSE_PROGRAM,'lighthouse_program');
  const lookups=(m.addressTableLookups??[]).map(l=>({table:l.accountKey.toBase58(),writableIndexes:Array.from(l.writableIndexes),readonlyIndexes:Array.from(l.readonlyIndexes)}));
  const accountKeys=keys.map((pubkey,index)=>({pubkey,signer:m.isAccountSigner(index),writable:m.isAccountWritable(index),role:roles.get(pubkey)??'UNRECOGNIZED'}));
  const instructions=m.compiledInstructions.map((ix,index)=>{const indexes=Array.from(ix.accountKeyIndexes),program=keys[ix.programIdIndex]??null,data=Buffer.from(ix.data);return {index,programIdIndex:ix.programIdIndex,programId:program,accountIndexes:indexes,accounts:indexes.map(i=>accountKeys[i]??{pubkey:null,unresolvedIndex:i}),dataSha256:hash(data),dataLength:data.length,decoded:decoded(program,data)};});
  return {available:true,version:m.version,messageSha256:hash(raw),payloadSha256:messageOnly?null:hash(b),serializedSize:messageOnly?null:b.length,messageSize:raw.length,recentBlockhash:m.recentBlockhash,feePayer:keys[0]??null,signerSet:accountKeys.filter(a=>a.signer).map(a=>a.pubkey).sort(),writableSet:accountKeys.filter(a=>a.writable).map(a=>a.pubkey).sort(),readonlySet:accountKeys.filter(a=>!a.writable).map(a=>a.pubkey).sort(),accountKeys:[...accountKeys].sort((a,b)=>a.pubkey.localeCompare(b.pubkey)),compiledAccountOrder:keys,instructions,programIds:[...new Set(instructions.map(i=>i.programId))],computeBudget:instructions.filter(i=>i.programId===COMPUTE_BUDGET),lighthouse:instructions.filter(i=>i.programId===LIGHTHOUSE_PROGRAM),addressLookupTables:lookups,lookupResolution:lookups.length?'UNRESOLVED_NOT_AUTHORIZED':'NOT_USED',signaturesPresent:tx?.signatures.map(s=>s.some(b=>b!==0))??null};
 }catch{return {available:false,error:'M4_DIAGNOSTIC_PARSE_FAILED',payloadSha256:hash(b),serializedSize:b.length};}
}
export function diagnosticMessageDiff(a,b){
 if(!a.available||!b.available)return {available:false};
 const index=new Map(a.accountKeys.map(v=>[v.pubkey,v])),final=new Map(b.accountKeys.map(v=>[v.pubkey,v]));
 const semantic=i=>({programId:i.programId,accounts:i.accounts,dataSha256:i.dataSha256});
 return {available:true,versionChanged:a.version!==b.version,blockhashChanged:a.recentBlockhash!==b.recentBlockhash,feePayerChanged:a.feePayer!==b.feePayer,signerSetChanged:digest(a.signerSet)!==digest(b.signerSet),accountOrderChanged:digest(a.compiledAccountOrder)!==digest(b.compiledAccountOrder),addedAccounts:b.accountKeys.filter(v=>!index.has(v.pubkey)),removedAccounts:a.accountKeys.filter(v=>!final.has(v.pubkey)),privilegeOrRoleChanges:b.accountKeys.filter(v=>index.has(v.pubkey)&&digest(v)!==digest(index.get(v.pubkey))),originalInstructionChanges:a.instructions.filter((v,i)=>!b.instructions[i]||digest(semantic(v))!==digest(semantic(b.instructions[i]))).map(v=>v.index),addedInstructions:b.instructions.slice(a.instructions.length),computeBudgetChanged:digest(a.computeBudget.map(semantic))!==digest(b.computeBudget.map(semantic)),lookupTablesChanged:digest(a.addressLookupTables)!==digest(b.addressLookupTables)};
}
function account(a){
 if(a===null)return null;if(!a||typeof a!=='object')return {unavailable:true};
 let data=null;try{if(Array.isArray(a.data)&&a.data[1]==='base64'){const b=Buffer.from(a.data[0],'base64');data={encoding:'base64',length:b.length,sha256:hash(b)};}}catch{}
 return {fields:Object.keys(a).sort(),owner:typeof a.owner==='string'?a.owner:null,executable:typeof a.executable==='boolean'?a.executable:null,lamports:valid(a.lamports)?a.lamports:null,rentEpoch:typeof a.rentEpoch==='number'?a.rentEpoch:null,space:valid(a.space)?a.space:null,data,allFieldsSha256:digest(a)};
}
export function walletDiagnostic(record,{returnedTransactionBase64,returnedMessageBase64,stage,rule,evidence=null,now=Date.now,source='SERVER'}={}){
 const result=record.result,prepared=describeDiagnosticMessage(result.transactionBase64,result),final=describeDiagnosticMessage(returnedTransactionBase64??returnedMessageBase64??'',result,{messageOnly:!returnedTransactionBase64}),v=evidence?.simulation?.value;
 const addresses=evidence?.addresses??[],keyOrder=final.compiledAccountOrder??[],ownerIndex=keyOrder.indexOf(result.launch.owner),atomic=Array.isArray(v?.preBalances)&&Array.isArray(v?.postBalances)&&v.preBalances.length===keyOrder.length&&v.postBalances.length===keyOrder.length&&[...v.preBalances,...v.postBalances].every(valid);
 const accounts=addresses.map((pubkey,i)=>{const at=keyOrder.indexOf(pubkey);return {pubkey,role:prepared.accountKeys?.find(a=>a.pubkey===pubkey)?.role??(pubkey===LIGHTHOUSE_PROGRAM?'lighthouse_program':'UNRECOGNIZED'),before:account(evidence.before?.value?.[i]),simulation:account(v?.accounts?.[i]),after:account(evidence.afterRead?.value?.[i]),atomicDeltaLamports:atomic&&at>=0?v.postBalances[at]-v.preBalances[at]:null};});
 const review=result.executionReview;
 return {formatVersion:1,evidence:'WALLET_FINAL_DIAGNOSTIC',authorizationGranted:false,source,operationId:record.executionId,timestamp:new Date(now()).toISOString(),stage:safeRule(stage),rule:safeRule(rule),owner:result.launch.owner,agentId:result.launch.agentId,network:result.network,lastValidBlockHeight:result.lastValidBlockHeight,reviewDigest:review.digest,prepared,final,diff:diagnosticMessageDiff(prepared,final),expectedDebitLamports:review.reviewedDebitLamports,ceilingLamports:review.ceilingLamports,initialBuyLamports:result.launch.initialBuyLamports,reviewedNetworkFeeLamports:review.networkFeeLamports,priorityFeeLamports:review.priorityFeeLamports??null,rentAccounts:(result.policy?.rentAccounts??[]).map(a=>({name:a.name,dataLength:a.dataLength,minimumRentExemptionLamports:a.minimumRentExemptionLamports,fundedLamports:a.fundedLamports})),finalFeeLamports:valid(evidence?.fee?.value)?evidence.fee.value:null,simulation:v?{status:v.err===null?'PASS':'FAIL',errorSha256:v.err===null?null:digest(v.err),slot:evidence.simulation.context?.slot??null,feeLamports:valid(v.fee)?v.fee:null,logsSha256:digest(v.logs??[]),signatureVerificationRequested:evidence.sigVerify===true,replaceRecentBlockhash:false}:null,finalSimulatedDebitLamports:atomic&&ownerIndex>=0?v.preBalances[ownerIndex]-v.postBalances[ownerIndex]:null,atomicBalancesAvailable:atomic,context:{before:evidence?.before?.context?.slot??null,after:evidence?.afterRead?.context?.slot??null},accounts};
}
export function createWalletDiagnosticStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS m4_wallet_diagnostics(id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(operation_id,fingerprint));
 CREATE TRIGGER IF NOT EXISTS m4_diagnostic_no_update BEFORE UPDATE ON m4_wallet_diagnostics BEGIN SELECT RAISE(ABORT,'Immutable wallet diagnostic'); END;
 CREATE TRIGGER IF NOT EXISTS m4_diagnostic_no_delete BEFORE DELETE ON m4_wallet_diagnostics BEGIN SELECT RAISE(ABORT,'Immutable wallet diagnostic'); END;
 CREATE TRIGGER IF NOT EXISTS m4_diagnostic_no_replace BEFORE INSERT ON m4_wallet_diagnostics WHEN EXISTS(SELECT 1 FROM m4_wallet_diagnostics WHERE id=NEW.id OR(operation_id=NEW.operation_id AND fingerprint=NEW.fingerprint)) BEGIN SELECT RAISE(ABORT,'Immutable wallet diagnostic'); END;`);
 return snapshot=>{
  const {timestamp,...stable}=snapshot,fingerprint=digest(stable),existing=db.prepare('SELECT id FROM m4_wallet_diagnostics WHERE operation_id=? AND fingerprint=?').get(snapshot.operationId,fingerprint);if(existing)return {diagnosticId:existing.id,persisted:true};
  if(snapshot.source==='CLIENT_RETURN_OBSERVATION'&&db.prepare("SELECT COUNT(*) n FROM m4_wallet_diagnostics WHERE operation_id=? AND json_extract(payload,'$.source')='CLIENT_RETURN_OBSERVATION'").get(snapshot.operationId).n>=8)throw fail('M4_DIAGNOSTIC_LIMIT');
  const payload=JSON.stringify(snapshot);if(Buffer.byteLength(payload)>256*1024)throw fail('M4_DIAGNOSTIC_TOO_LARGE');const id=randomUUID();db.prepare('INSERT INTO m4_wallet_diagnostics(id,operation_id,fingerprint,payload) VALUES(?,?,?,?)').run(id,snapshot.operationId,fingerprint,payload);return {diagnosticId:id,persisted:true};
 };
}
export function diagnoseWalletReturn(record,input,write,now){
 if(!record?.walletDeliveryClaimed||input.requestId!==record.executionId||input.reviewDigest!==record.result?.executionReview?.digest)throw fail('M4_DIAGNOSTIC_BINDING_REQUIRED');
 if(!['WALLET_RETURNED','FRONTEND_VALIDATION'].includes(input.clientStage)||typeof input.returnedTransactionBase64!=='string'&&typeof input.returnedMessageBase64!=='string')throw fail('M4_DIAGNOSTIC_INPUT_INVALID');
 if(input.returnedTransactionBase64!==undefined)bytes(input.returnedTransactionBase64);if(input.returnedMessageBase64!==undefined)bytes(input.returnedMessageBase64);
 let rule='M4_WALLET_MESSAGE_ONLY';if(input.returnedTransactionBase64){try{validateFinalWalletMessage(record.result.transactionBase64,input.returnedTransactionBase64,record.result,{Transaction,Buffer},false);rule='SEMANTIC_PASS';}catch(e){rule=safeRule(e.code);}}
 return write(walletDiagnostic(record,{...input,now,stage:input.clientStage,rule,source:'CLIENT_RETURN_OBSERVATION'}));
}
