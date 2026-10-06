import {PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {LIGHTHOUSE_PROGRAM} from '../src/pump-wallet-final.js';
import {contextSlot} from './pump-execution-review.js';
import {readAtMinimumContext} from './pump-context-rpc.js';
export const LIGHTHOUSE_LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
export const LIGHTHOUSE_PROGRAM_DATA=PublicKey.findProgramAddressSync([new PublicKey(LIGHTHOUSE_PROGRAM).toBuffer()],new PublicKey(LIGHTHOUSE_LOADER))[0].toBase58();
const hash=b=>createHash('sha256').update(b).digest('hex');
function check(ok,o,field,expected,actual,code){
 if(ok)return;
 const validationFailure={stage:'LIGHTHOUSE_ACCOUNT_STATE',phase:o.phase??null,slot:o.slot??null,pubkey:o.pubkey,field,expected,actual};
 throw Object.assign(Error(code),{code,status:409,validationFailure});
}
function decode(o,executable,code){
 const a=o.account;
 check(!!a,o,'exists',true,!!a,code);
 check(a.owner===LIGHTHOUSE_LOADER,o,'owner',LIGHTHOUSE_LOADER,a.owner??null,code);
 check(a.executable===executable,o,'executable',executable,a.executable??null,code);
 check(Number.isSafeInteger(a.lamports)&&a.lamports>=0,o,'lamports','nonnegative safe integer',a.lamports??null,code);
 check(a.rentEpoch===undefined||Number.isInteger(a.rentEpoch)&&a.rentEpoch>=0,o,'rentEpoch','nonnegative integer or absent',a.rentEpoch??null,code);
 check(Array.isArray(a.data)&&a.data.length===2&&a.data[1]==='base64'&&typeof a.data[0]==='string',o,'encoding','base64',a.data?.[1]??null,code);
 const b=Buffer.from(a.data[0],'base64');
 check(b.toString('base64')===a.data[0],o,'dataEncoding','canonical base64','invalid',code);
 check(a.space===undefined||a.space===b.length,o,'space',b.length,a.space??null,code);
 return b;
}
function programIdentity(o,code){
 check(o.pubkey===LIGHTHOUSE_PROGRAM,o,'pubkey',LIGHTHOUSE_PROGRAM,o.pubkey,code);
 const b=decode(o,true,code);
 check(b.length===36,o,'dataLength',36,b.length,code);
 check(b.readUInt32LE(0)===2,o,'loaderState',2,b.readUInt32LE(0),code);
 const pointer=new PublicKey(b.subarray(4,36)).toBase58();
 check(pointer===LIGHTHOUSE_PROGRAM_DATA,o,'programData',LIGHTHOUSE_PROGRAM_DATA,pointer,code);
 return {program:LIGHTHOUSE_PROGRAM,programData:pointer,programDataPointerSha256:hash(b)};
}
// A minimum context slot cannot select an exact bank. Read the related accounts
// together; only a valid loader PDA can establish this deployment's identity.
export async function readLighthouseDeployment(transport,minimum,expected=null,onObservation=()=>{}){
 const addresses=[LIGHTHOUSE_PROGRAM,LIGHTHOUSE_PROGRAM_DATA];
 const response=await readAtMinimumContext(transport,'getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:minimum}]);
 onObservation({addresses,response});
 const slot=contextSlot(response,minimum),code='M4_LIGHTHOUSE_DEPLOYMENT_CHANGED';
 const p={pubkey:addresses[0],slot,account:response.value?.[0]},d={pubkey:addresses[1],slot,account:response.value?.[1]};
 check(Array.isArray(response.value)&&response.value.length===2,p,'responseLength',2,response.value?.length??null,code);
 const identity=programIdentity(p,code),bytes=decode(d,false,code);
 check(bytes.length>45,d,'dataLength','greater than 45',bytes.length,code);
 check(bytes.readUInt32LE(0)===3,d,'loaderState',3,bytes.readUInt32LE(0),code);
 check(bytes[12]===0||bytes[12]===1,d,'authorityOption','0 or 1',bytes[12],code);
 const deployed=bytes.readBigUInt64LE(4);
 check(deployed<=BigInt(slot),d,'deployedSlot','at most context slot',deployed.toString(),code);
 Object.assign(identity,{deployedSlot:Number(deployed),upgradeAuthority:bytes[12]===1?new PublicKey(bytes.subarray(13,45)).toBase58():null,codeSha256:hash(bytes.subarray(45)),programDataSha256:hash(bytes)});
 if(expected)for(const field of Object.keys(identity))check(identity[field]===expected[field],field==='program'||field==='programDataPointerSha256'?p:d,field,expected[field]??null,identity[field],code);
 return {identity,contextSlot:slot};
}
export function validateLighthouseProgramSnapshots(observations,expected){
 const code='M4_LIGHTHOUSE_PROGRAM_OR_STATE_CHANGED';
 for(const o of observations){
  const identity=programIdentity(o,code);
  for(const field of Object.keys(identity))check(identity[field]===expected[field],o,field,expected[field]??null,identity[field],code);
  for(const prior of observations){
   // Across different banks, external credits and rent metadata do not identify
   // executable code. Same-simulation readonly balance deltas remain strict.
   if(prior===o||prior.slot!==o.slot)continue;
   for(const field of ['lamports','rentEpoch'])check(prior.account?.[field]===o.account[field],o,field,prior.account?.[field]??null,o.account[field]??null,code);
  }
 }
}
