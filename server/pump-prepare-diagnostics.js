import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

export const PREPARE_STAGES=new Set(['REQUEST_RECEIVED','OWNER_AUTH','OWNERSHIP_CHECK','MAINNET_VERIFY','PAYER_BALANCE','METADATA_VERIFY','PUMP_READINESS','LAUNCH_STATE_CHECK','TRANSACTION_BUILD','VALIDATION','SIMULATION','PREPARED']);
const publicKey=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)?value:null;
const safeStatus=value=>Number.isInteger(value)&&value>=100&&value<=599?value:null;
const safeCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(value)?value:'PREPARATION_FAILED';
export function safeDiagnosticMessage(value){
 const input=String(value?.message??value??'');
 if(/(?:429|too many requests|rate limit)/i.test(input))return 'Read-only RPC rate limit during preparation';
 if(/insufficient.*(?:balance|sol)|not enough sol/i.test(input))return 'Insufficient Mainnet SOL for launch preparation';
 if(/(?:fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|unavailable)/i.test(input))return 'A required service or read-only request was unavailable';
 if(/wrong cluster|mainnet assertion/i.test(input))return 'Mainnet verification failed';
 if(/metadata mismatch|metadata.*(?:unavailable|not publicly accessible|verification failed)/i.test(input))return 'Public token metadata verification failed';
 if(/simulation/i.test(input))return 'Launch simulation failed';
 if(/IDL|account|transaction|policy|signature|blockhash/i.test(input))return 'Launch transaction validation or build failed';
 return 'Launch preparation failed; see failure code and stage';
}
export function safeFailure(error,stage){
 const rpcCode=Number.isInteger(error?.rpcCode)?error.rpcCode:null;
 const reportedStage=PREPARE_STAGES.has(error?.stage)?error.stage:stage;
 return {failureStage:PREPARE_STAGES.has(reportedStage)?reportedStage:'PUMP_READINESS',failureCode:safeCode(error?.code),sanitizedMessage:safeDiagnosticMessage(error),rpcCode,processExitCode:Number.isInteger(error?.processExitCode)?error.processExitCode:null};
}
export function createPrepareAttemptJournal(path){
 let records=[];try{const saved=JSON.parse(readFileSync(path,'utf8'));if(Array.isArray(saved.attempts))records=saved.attempts;}catch(error){if(error.code!=='ENOENT')throw error;}
 const persist=()=>{mkdirSync(dirname(path),{recursive:true});const temporary=`${path}.${process.pid}.tmp`;writeFileSync(temporary,JSON.stringify({version:1,attempts:records}),{mode:0o600});renameSync(temporary,path);};
 const begin=body=>{const now=new Date().toISOString();const proposed=typeof body?.attemptId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.attemptId)?body.attemptId:null;const record={attemptId:proposed&&!records.some(x=>x.attemptId===proposed)?proposed:randomUUID(),agentId:typeof body?.agentId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.agentId)?body.agentId:null,owner:null,payer:publicKey(body?.payer),initialBuyLamports:null,createdAt:now,currentStage:'REQUEST_RECEIVED',finalStatus:'IN_PROGRESS',completedAt:null,stages:[{stage:'REQUEST_RECEIVED',at:now}],passedStages:[],warnings:[],metadataPublished:false,transactionBuilt:false,validationPassed:false,simulationPassed:false,preparedReceiptPersisted:false,service:{requestStarted:true,reachable:true,httpStatus:null,responseReceived:false,responseClassification:null,processExitCode:null,fatalStderr:null}};records.push(record);persist();return record;};
 const stage=(record,name)=>{if(!PREPARE_STAGES.has(name))return;record.currentStage=name;record.stages.push({stage:name,at:new Date().toISOString()});persist();};
 const passed=(record,name)=>{if(PREPARE_STAGES.has(name)&&!record.passedStages.includes(name)){record.passedStages.push(name);persist();}};
 const update=(record,fields)=>{Object.assign(record,fields);persist();};
 const warn=(record,code)=>{if(code==='DEP0040'&&!record.warnings.includes(code)){record.warnings.push(code);persist();}};
 const fail=(record,error,status)=>{if(record.finalStatus!=='IN_PROGRESS')return;const failure=safeFailure(error,record.currentStage);if(failure.failureStage!==record.currentStage)stage(record,failure.failureStage);Object.assign(record,failure,{finalStatus:'FAILED',completedAt:new Date().toISOString(),httpStatus:safeStatus(status)});persist();};
 const complete=record=>{stage(record,'PREPARED');record.finalStatus='PREPARED';record.completedAt=new Date().toISOString();record.preparedReceiptPersisted=true;passed(record,'PREPARED');persist();};
 return {begin,stage,passed,update,warn,fail,complete,all:()=>structuredClone(records)};
}
export function publicAttempt(record){if(!record)return null;const {attemptId,finalStatus,currentStage,failureStage,failureCode,sanitizedMessage,httpStatus,rpcCode,processExitCode,warnings,metadataPublished,transactionBuilt,validationPassed,simulationPassed,preparedReceiptPersisted,service}=record;const passed=name=>record.passedStages.includes(name);return {attemptId,status:finalStatus,stage:currentStage,failureStage:failureStage??null,failureCode:failureCode??null,sanitizedMessage:sanitizedMessage??null,httpStatus:httpStatus??null,rpcCode:rpcCode??null,processExitCode:processExitCode??null,warnings,ownerAuth:passed('OWNER_AUTH'),mainnet:passed('MAINNET_VERIFY'),balance:passed('PAYER_BALANCE'),metadata:metadataPublished,build:transactionBuilt,validation:validationPassed,simulation:simulationPassed,prepared:preparedReceiptPersisted,service};}
