import {PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {LIGHTHOUSE_PROGRAM} from '../src/pump-wallet-final.js';
import {contextSlot} from './pump-execution-review.js';
import {readAtMinimumContext} from './pump-context-rpc.js';
const loader='BPFLoaderUpgradeab1e11111111111111111111111';
const fail=()=>{throw Object.assign(Error('M4_LIGHTHOUSE_DEPLOYMENT_CHANGED'),{code:'M4_LIGHTHOUSE_DEPLOYMENT_CHANGED',status:409});};
export async function readLighthouseDeployment(transport,minimum,expected=null){
 const request=async addresses=>{const r=await readAtMinimumContext(transport,'getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:minimum}]);minimum=contextSlot(r,minimum);if(!Array.isArray(r.value)||r.value.length!==addresses.length)fail();return r.value[0];};
 const program=await request([LIGHTHOUSE_PROGRAM]);
 const decode=a=>{if(a?.owner!==loader||!Array.isArray(a.data)||a.data[1]!=='base64'||typeof a.data[0]!=='string')fail();return Buffer.from(a.data[0],'base64');};
 const p=decode(program);if(program.executable!==true||p.length!==36||p.readUInt32LE(0)!==2)fail();
 const address=new PublicKey(p.subarray(4,36)).toBase58(),data=await request([address]),bytes=decode(data);
 if(data.executable!==false||bytes.length<=45||bytes.readUInt32LE(0)!==3||![0,1].includes(bytes[12]))fail();
 const slot=bytes.readBigUInt64LE(4);if(slot>BigInt(minimum))fail();
 const identity={program:LIGHTHOUSE_PROGRAM,programData:address,deployedSlot:Number(slot),upgradeAuthority:bytes[12]===1?new PublicKey(bytes.subarray(13,45)).toBase58():null,codeSha256:createHash('sha256').update(bytes.subarray(45)).digest('hex'),programDataSha256:createHash('sha256').update(bytes).digest('hex')};
 if(expected&&JSON.stringify(identity)!==JSON.stringify(expected))fail();
 return {identity,contextSlot:minimum};
}
