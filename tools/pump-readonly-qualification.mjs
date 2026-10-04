import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PublicKey} from '@solana/web3.js';
import {parse} from 'dotenv';
import {pumpSdk,swapSdk,sdkPin} from '../server/dex/pump-sdk-boundary.js';
import {GENESIS} from '../src/pump-readiness.js';
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
const methods=new Set(['getGenesisHash','getMultipleAccounts']);

export function createReadOnlyQualificationRpc(endpoint,{request=fetch}={}){
 const u=new URL(endpoint);if(u.protocol!=='https:')throw Error('QUALIFICATION_HTTPS_REQUIRED');
 let id=0;
 return async(method,params=[])=>{
  if(!methods.has(method))throw Error('QUALIFICATION_METHOD_DENIED');
  const requestId=++id;
  try{
   const response=await request(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error();const data=await response.json();if(data.error||data.id!==requestId||!Object.hasOwn(data,'result'))throw Error();return data.result;
  }catch{throw Error('QUALIFICATION_RPC_READ_FAILED');}
 };
}

export async function qualifyPumpProgramsReadOnly(rpc){
 if(await rpc('getGenesisHash')!==GENESIS)throw Error('QUALIFICATION_MAINNET_GENESIS_MISMATCH');
 const roles={curveProgram:pumpSdk.PUMP_PROGRAM_ID.toBase58(),swapProgram:swapSdk.PUMP_AMM_PROGRAM_ID.toBase58(),feeProgram:pumpSdk.PUMP_FEE_PROGRAM_ID.toBase58(),curveGlobal:pumpSdk.GLOBAL_PDA.toBase58(),curveFees:pumpSdk.PUMP_FEE_CONFIG_PDA.toBase58(),swapGlobal:swapSdk.GLOBAL_CONFIG_PDA.toBase58(),swapFees:swapSdk.PUMP_AMM_FEE_CONFIG_PDA.toBase58()};
 const keys=Object.values(roles),result=await rpc('getMultipleAccounts',[keys,{encoding:'base64',commitment:'finalized'}]);
 if(!Number.isSafeInteger(result?.context?.slot)||!Array.isArray(result.value)||result.value.length!==keys.length)throw Error('QUALIFICATION_ACCOUNT_RESPONSE_INVALID');
 const records=[],deployments=[];
 for(const [i,role]of Object.keys(roles).entries()){
  const a=result.value[i];if(!a){records.push({role,address:keys[i],exists:false});continue;}
  if(!Array.isArray(a.data)||a.data[1]!=='base64')throw Error('QUALIFICATION_ENCODING_INVALID');
  const bytes=Buffer.from(a.data[0],'base64'),row={role,address:keys[i],exists:true,owner:a.owner,executable:a.executable,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),slot:result.context.slot};
  if(role.endsWith('Program')){
   row.upgradeableLayoutVerified=a.owner===loader&&a.executable===true&&bytes.length===36&&bytes.readUInt32LE(0)===2;
   if(row.upgradeableLayoutVerified)deployments.push({role,address:new PublicKey(bytes.subarray(4)).toBase58()});
  }else{
   const expected=role==='curveGlobal'?pumpSdk.PUMP_PROGRAM_ID:role==='swapGlobal'?swapSdk.PUMP_AMM_PROGRAM_ID:pumpSdk.PUMP_FEE_PROGRAM_ID;
   row.ownerVerified=a.owner===expected.toBase58()&&a.executable===false;
   try{if(!row.ownerVerified)throw Error();const info={...a,data:bytes,owner:new PublicKey(a.owner)};const decoded=role==='curveGlobal'?pumpSdk.PUMP_SDK.decodeGlobal(info):role==='swapGlobal'?swapSdk.PUMP_AMM_SDK.decodeGlobalConfig(info):role==='curveFees'?pumpSdk.PUMP_SDK.decodeFeeConfig(info):swapSdk.PUMP_AMM_SDK.decodeFeeConfig(info);row.pinnedDecoderAccepted=!!decoded;row.initialized=role==='curveGlobal'?decoded.initialized:undefined;row.disableFlags=role==='swapGlobal'?decoded.disableFlags:undefined;row.feeTierCount=decoded.feeTiers?.length;}catch{row.pinnedDecoderAccepted=false;}
  }
  records.push(row);
 }
 let deploymentRecords=[];
 if(deployments.length){
  const data=await rpc('getMultipleAccounts',[deployments.map(d=>d.address),{encoding:'base64',commitment:'finalized',minContextSlot:result.context.slot}]);
  if(!Number.isSafeInteger(data?.context?.slot)||data.context.slot<result.context.slot||data.value?.length!==deployments.length)throw Error('QUALIFICATION_DEPLOYMENT_RESPONSE_INVALID');
  deploymentRecords=deployments.map((d,i)=>{const a=data.value[i],bytes=a?.data?.[1]==='base64'?Buffer.from(a.data[0],'base64'):Buffer.alloc(0);const verified=a?.owner===loader&&a.executable===false&&bytes.length>=45&&bytes.readUInt32LE(0)===3&&[0,1].includes(bytes[12]);return {...d,programDataLayoutVerified:verified,slot:data.context.slot,deploymentSlot:verified?bytes.readBigUInt64LE(4).toString():null,upgradeAuthorityPresent:verified?bytes[12]===1:null,elfSha256:verified?createHash('sha256').update(bytes.subarray(45)).digest('hex'):null};});
 }
 return {schema:'PUMP_READONLY_PROGRAM_QUALIFICATION_V1',source:'TEKKTEAM_CONFIGURED_RPC',genesisVerified:true,sdkPin,records,deploymentRecords,coinPoolQualified:false,reason:'NO_AUTHORITATIVE_LAUNCHED_ASSOCIATED_MINT_IN_PREVIEW',simulationPerformed:false,signatureRead:false,transactionRead:false,notSigned:true,notBroadcast:true,venueExecutionQualified:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const env=parse(fs.readFileSync('.env'));if(!env.MAINNET_RPC_URL)throw Error('TEKKTEAM_CONFIGURED_RPC_MISSING');
 try{const report=await qualifyPumpProgramsReadOnly(createReadOnlyQualificationRpc(env.MAINNET_RPC_URL));fs.writeFileSync('artifacts/launchpad-continuation/direct-delivery/pump-readonly-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:'READ_COMPLETE',records:report.records.length,deployments:report.deploymentRecords.length,coinPoolQualified:false}));}catch(e){console.error(e.message?.startsWith('QUALIFICATION_')?e.message:'QUALIFICATION_FAILED');process.exitCode=1;}
}
