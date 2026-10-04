import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {PUMP_COMMIT,PUMP} from '../src/pump-readiness.js';
const root='https://raw.githubusercontent.com/pump-fun/pump-public-docs/';
const summary=data=>({address:data.address,instructions:['create_v2','buy_exact_sol_in'].map(name=>{
 const instruction=data.instructions?.find(value=>value.name===name);
 if(!instruction)throw Error('Official instruction unavailable');
 return {name,discriminator:instruction.discriminator,args:instruction.args,accounts:instruction.accounts};
}),types:data.types?.filter(value=>['OptionBool','OptionU64'].includes(value.name))});
async function load(ref){
 const url=root+ref+'/idl/pump.json';const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Official IDL HTTP '+response.status);
 const bytes=await response.text();if(bytes.length>2*1024*1024)throw Error('IDL too large');
 const data=JSON.parse(bytes);if(data.address!==PUMP)throw Error('Official program identity mismatch');
 return {url,sha256:createHash('sha256').update(bytes).digest('hex'),contract:summary(data)};
}
const pinned=await load(PUMP_COMMIT),current=await load('main');
const report={checkedAt:new Date().toISOString(),source:'OFFICIAL_PUBLIC_DOCUMENTS_ONLY',pinnedCommit:PUMP_COMMIT,pinned,current,contractMatches:JSON.stringify(pinned.contract)===JSON.stringify(current.contract),onChainProgramVerified:false,rpcCalls:0,signing:false,broadcast:false,authorizationGranted:false};
writeFileSync('artifacts/launchpad-continuation/direct-delivery/pump-contract-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({contractMatches:report.contractMatches,pinnedCommit:PUMP_COMMIT,rpcCalls:0,onChainProgramVerified:false,authorizationGranted:false}));
process.exitCode=report.contractMatches?0:2;
