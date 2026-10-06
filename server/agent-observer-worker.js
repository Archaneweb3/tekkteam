import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {realpathSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {observerState} from './agent-observer-state.js';
import {readAgentSetupFacts} from './agent-setup.js';

const has=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// No custody, RPC, execution adapter or signing/broadcast dependency is accepted.
export function readObservedAgent(db,id){
 if(!has(db,'canonical_launch_receipts'))throw Error('CANONICAL_RECEIPTS_UNAVAILABLE');
 const row=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(id),record=db.prepare('SELECT * FROM canonical_launch_receipts WHERE agent_id=?').get(id);
 if(!row||!record)throw Error('CANONICAL_BINDING_UNAVAILABLE');
 const agent=JSON.parse(row.data),receipt=JSON.parse(record.payload);
 if(agent.id!==id||record.agent_id!==id||receipt.agentId!==id||record.execution_id!==receipt.executionId||record.signature!==receipt.signature||record.mint!==receipt.mint)throw Error('CANONICAL_RECEIPT_MISMATCH');
 const facts=readAgentSetupFacts({db,agent,owner:row.owner,evidence:{available:true,receipt}});
 if(!facts.available||!facts.launched)throw Error(facts.reason??'BINDING_UNAVAILABLE');
 const pending=[];
 for(const table of ['dex_executions','pump_runtime_executions','agent_funding']){
  if(!has(db,table)){if(table!=='pump_runtime_executions')throw Error('EXECUTION_HISTORY_UNAVAILABLE');continue;}
  // Schema is checked; unknown ledgers must not be mistaken for an empty queue.
  const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name);
  if(!columns.includes('agent_id')||!columns.includes('data')||!columns.includes('id'))throw Error('EXECUTION_SCHEMA_UNAVAILABLE');
  for(const item of db.prepare(`SELECT id,data${columns.includes('status')?',status':''} FROM ${table} WHERE agent_id=?`).all(id)){
   const record=JSON.parse(item.data),status=String(record.status??'UNKNOWN').toUpperCase();
   if(columns.includes('status')&&item.status!==record.status)throw Error('EXECUTION_STATUS_MISMATCH');
   if(!['CONFIRMED','FAILED','EXPIRED','CANCELLED','REJECTED_BEFORE_SIGNING'].includes(status))pending.push({source:table,id:item.id,status});
  }
 }
 return {agentId:id,owner:row.owner,mint:facts.launch.mint,agentWallet:facts.wallet,network:'solana:101',receiptExecutionId:facts.launch.executionId,receiptSignature:facts.launch.signature,pending,mode:'OBSERVER_ONLY',executionAllowed:false,state:pending.length?'RECONCILIATION_REQUIRED':'EXECUTION_OFF'};
}

export function createAgentObserver({productDb,stateDb,now=Date.now,afterRead=async()=>{}}){
 productDb.exec('PRAGMA query_only=ON');const state=observerState(stateDb,{now});let leader=null,busy=false,closed=false;
 return {state,async tick(){
  if(closed||busy)return;busy=true;
  try{
   if(leader)try{leader=state.renew(leader);}catch{leader=null;}
   leader??=state.leader();if(!leader){state.heartbeat('STANDBY');return;}
   if(!has(productDb,'launch_agent_bindings'))throw Error('BINDINGS_UNAVAILABLE');
   for(const {agent_id:id} of productDb.prepare('SELECT agent_id FROM launch_agent_bindings').all()){
    const lock=state.agent(leader,id);if(!lock)continue;
    try{const observation=readObservedAgent(productDb,id),before=fingerprint(observation);await afterRead(observation);if(closed)break;
     if(fingerprint(readObservedAgent(productDb,id))!==before)throw Error('BINDING_CHANGED');
     state.commit(leader,lock,observation);
    }finally{state.release(lock);}
   }
   state.heartbeat('HEALTHY_OBSERVER_ONLY');
  }catch(error){state.heartbeat('DEGRADED');throw error;}finally{busy=false;}
 },stop(){closed=true;if(leader)state.release(leader);state.heartbeat('STOPPED');}};
}

export async function startAgentObserver(){
 const product=process.env.TEKKTEAM_OBSERVER_PRODUCT_DB,statePath=process.env.TEKKTEAM_OBSERVER_STATE_DB;
 if(!product||!statePath||process.env.TEKKTEAM_OBSERVER_MODE!=='OBSERVER_ONLY'||process.env.TEKKTEAM_OBSERVER_EXECUTION_ENABLED!=='false')throw Error('Explicit observer-only paths/configuration required');
 if(resolve(product)===resolve(statePath)||realpathSync(product)===resolve(statePath))throw Error('Separate worker state required');
 if(existsSync(statePath)){const a=statSync(product),b=statSync(statePath);if(realpathSync(product)===realpathSync(statePath)||a.dev===b.dev&&a.ino===b.ino)throw Error('Separate worker state required');}
 process.umask(0o077);
 const productDb=new DatabaseSync(product,{readOnly:true}),stateDb=new DatabaseSync(statePath),worker=createAgentObserver({productDb,stateDb});
 const run=()=>worker.tick().then(()=>console.log(JSON.stringify({at:new Date().toISOString(),status:'OBSERVER_ONLY',executionAllowed:false}))).catch(()=>console.error(JSON.stringify({at:new Date().toISOString(),status:'OBSERVER_DEGRADED',executionAllowed:false})));
 await run();const timer=setInterval(run,10000);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(timer);worker.stop();setTimeout(()=>process.exit(0),20).unref();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await startAgentObserver();
