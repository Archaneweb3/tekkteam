import {resolve,join,sep} from 'node:path';
import {readdir,readFile,rm,lstat} from 'node:fs/promises';
// Local lifecycle evidence only: expired, never submitted and never confirmed.
// Receipt and submission checks remain separate mandatory deletion gates.
export function isStaleTestState(agent){
 return agent.network==='devnet'&&['PREPARED','FAILED'].includes(agent.status)&&
 Number.isFinite(agent.launch?.expiresAt)&&agent.launch.expiresAt<Date.now()&&
 (agent.status==='PREPARED'||agent.launch.failure==='expired')&&
 !agent.launch.signature&&!agent.launch.confirmed&&!agent.launch.broadcastAttempted&&
 !agent.coin?.mint&&!agent.token?.mint;
}
export async function verifyExpiredPreparation(agent){
 if(agent.status==='PREPARED'&&!isStaleTestState(agent))throw Error('Preparation active or pending; deletion locked');
}

export function assertUnlaunchedDraft(agent){
 const expiredTest=isStaleTestState(agent);
 if((agent.status!=='DRAFT'&&!expiredTest)||agent.coin?.mint||agent.token?.mint||agent.launch?.signature||agent.launch?.confirmed)throw Object.assign(Error('Only an unlaunched draft can be deleted. Token and transaction history are preserved.'),{status:409});
}
export async function deletionEligibility(agent,root=resolve(process.env.DATA_DIR||'server/data'),verifyPreparation=verifyExpiredPreparation){
 const result=(canDelete,launchState,reason=null)=>({agentId:agent.id,canDelete,launchState,reason});
 const read=async name=>{try{return JSON.parse(await readFile(join(root,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 try{
  const journal=await read('pump-agent-launches.json'),legacy=await read('pump-mainnet-launch.json');
  if(journal&&(journal.version!==2||!journal.receipts||typeof journal.receipts!=='object'||Array.isArray(journal.receipts)))throw Error('Invalid launch journal');
  const records=[journal?.receipts[agent.id],legacy?.agentId===agent.id?legacy:null].filter(Boolean);
  const mints=[agent.coin?.mint,agent.token?.mint,agent.network==='mainnet'?agent.launch?.mint:null].filter(Boolean);
  if(legacy?.mint&&(mints.includes(legacy.mint)||agent.launch?.mint===legacy.mint))records.push(legacy);
  if(records.some(r=>r.confirmed||r.status==='Success')||agent.launch?.confirmed||mints.length)return result(false,'launched','Token and transaction history are preserved.');
  if(records.some(r=>r.status!=='Deleted'))return result(false,'unknown','Launch preparation or transaction record exists; deletion is locked.');
  try{assertUnlaunchedDraft(agent);}catch(e){return result(false,'unknown',e.message);}
  try{await verifyPreparation(agent);}catch{return result(false,'unknown','Active or pending preparation; deletion remains locked.');}
  return result(true,isStaleTestState(agent)?'stale_test_state':'unlaunched');
 }catch{return result(false,'unknown','Launch storage unavailable or invalid. Deletion is locked.');}
}
// Deletes local generated metadata only. Published immutable metadata cannot be
// recalled from third-party caches; no deployment or on-chain deletion occurs.
export async function removeDraftMetadata(agentId,root=resolve(process.env.DATA_DIR||'server/data','pump-metadata-site')){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(agentId))throw Error('Invalid agent ID');
 const base=resolve(root,'public/metadata/agents'),target=resolve(base,agentId);
 if(!target.startsWith(base+sep)||target===base)throw Error('Unsafe metadata path');
 try{if((await lstat(target)).isSymbolicLink())throw Error('Metadata symlink rejected');await rm(target,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const name of await readdir(root).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  if(!/^[a-f0-9]{64}\.receipt\.json$/.test(name))continue;
  const file=join(root,name),data=JSON.parse(await readFile(file,'utf8'));
  if(new URL(data.uri).pathname.startsWith('/metadata/agents/'+agentId+'/'))await rm(file);
 }
}
export async function reserveDraftDeletion(agent,req){
 const r=await fetch((process.env.LAUNCH_INTERNAL_URL||'http://127.0.0.1:4193')+'/pump-launch/delete-draft',{method:'POST',headers:{'Content-Type':'application/json',origin:req.headers.origin,cookie:req.headers.cookie||''},body:JSON.stringify({agentId:agent.id}),signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Cannot verify launch state; draft preserved'),{status:409});
 if(data.status!=='Deleted'||data.agentId!==agent.id)throw Error('Deletion interlock unavailable');
}
