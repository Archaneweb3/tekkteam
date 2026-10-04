import {createPumpRuntimeLedger} from './pump-runtime-ledger.js';
import {createPumpRuntimeExecutor} from './pump-runtime-executor.js';
import {reject} from './intent.js';

export function installPumpRuntimeRoutes(app,{db,auth,owned,sessionValid,assertTarget,now=Date.now,dependencies}={}){
 // Registration is not readiness. Environment flags cannot supply dependencies.
 const installed=dependencies!==undefined;
 if(installed&&(dependencies.source!=='LOCAL_FIXTURE'||dependencies.localDisarmed!==true||!dependencies.adapter||typeof dependencies.readAuthority!=='function'||typeof dependencies.associatedMint!=='function'))reject('PUMP_RUNTIME_DI_CONTRACT');
 const ledger=installed?createPumpRuntimeLedger(db,{source:'LOCAL_FIXTURE',now}):null;
 const context=async(req,id)=>{
  if(!sessionValid(req)||req.params.id!==id)reject('OWNER_AUTH_REQUIRED');
  const {agent}=owned(req),wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(agent.id);
  if(!wallet||agent.tradingWallet!==wallet.address)reject('AGENT_WALLET_UNAVAILABLE');
  const policy=assertTarget({agentId:agent.id,owner:req.session.address,direction:'BUY',inputMint:'So11111111111111111111111111111111111111112',outputMint:dependencies.associatedMint(agent.id)});
  if(policy.kind!=='ASSOCIATED_COIN'||policy.mint!==dependencies.associatedMint(agent.id))reject('PUMP_RUNTIME_ASSOCIATION');
  const a=await dependencies.readAuthority(agent);
  if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');
  const current=owned(req).agent,currentWallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(agent.id);
  if(current.creator!==agent.creator||current.tradingWallet!==wallet.address||currentWallet?.address!==wallet.address)reject('PUMP_RUNTIME_AUTHORITY_CHANGED');
  const latest=assertTarget({agentId:agent.id,owner:req.session.address,direction:'BUY',inputMint:'So11111111111111111111111111111111111111112',outputMint:policy.mint});
  if(latest.kind!=='ASSOCIATED_COIN'||latest.mint!==policy.mint)reject('PUMP_RUNTIME_ASSOCIATION');
  const control=ledger.control(agent.id);
  return {...a,paused:a.paused!==false||control.paused===1,controlRevision:control.revision,authenticated:true,owner:req.session.address,agentId:agent.id,agentWallet:wallet.address,associatedMint:policy.mint};
 };
 const engine=installed?createPumpRuntimeExecutor({ledger,adapter:dependencies.adapter,readContext:context,source:'LOCAL_FIXTURE',now}):null;
 const safe=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const base='/api/agents/:id/pump-runtime';
 app.get(base,auth,safe((req,res)=>{owned(req);res.json({registration:'REGISTERED_DISARMED',enabled:false,liveEnabled:false,broadcastEnabled:false,signingAvailable:false,adapterInjected:installed,venueQualified:false,source:installed?'LOCAL_FIXTURE':'UNAVAILABLE',reason:installed?'LOCAL_DI_ONLY':'PUMP_RUNTIME_DEPENDENCIES_UNAVAILABLE'});}));
 const requireEngine=()=>{if(!engine)reject('PUMP_RUNTIME_DISABLED');return engine;};
 app.get(base+'/positions',auth,safe((req,res)=>{if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');const {agent}=owned(req);requireEngine();const mints=new Set(ledger.list(agent.id).map(r=>r.intent.side==='BUY'?r.intent.outputMint:r.intent.inputMint));res.json({mode:'REAL',source:'LOCAL_FIXTURE',actualChainVerified:false,positions:[...mints].map(m=>ledger.position(agent.id,m)).filter(Boolean),expenses:ledger.expenses(agent.id),liveEnabled:false});}));
 app.get(base+'/:executionId',auth,safe(async(req,res)=>{const result=await requireEngine().read(req,req.params.executionId),r=result.record;res.json({id:r.id,status:r.status,mode:r.mode,source:r.source,provenance:r.provenance,side:r.intent.side,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,inputAsset:r.inputAsset,unspentInput:r.unspentInput??null,receipt:result.receipt?{finalized:true,source:result.receipt.source,actualChainVerified:result.receipt.actualChainVerified,slot:result.receipt.evidence.slot,effects:result.receipt.evidence.effects}:null,holdStatus:result.reservation?.status??null,notBroadcast:true});}));
 app.post(base+'/pause',auth,safe((req,res)=>{if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');const {agent}=owned(req);if(Object.keys(req.body??{}).length)reject('UNEXPECTED_FIELD');requireEngine();const control=ledger.pause(agent.id);res.json({paused:true,revision:control.revision,notBroadcast:true});}));
 app.post(base+'/prepare',auth,safe(async(req,res)=>{const e=requireEngine(),{agent}=owned(req);if(req.body.agentId!==agent.id||req.body.owner!==req.session.address)reject('PUMP_RUNTIME_REQUEST_BINDING');const r=await e.prepare(req,req.body);res.json({id:r.id,status:r.status,source:r.source,notBroadcast:true});}));
 app.post(base+'/:executionId/reconcile',auth,safe(async(req,res)=>{if(Object.keys(req.body??{}).length)reject('UNEXPECTED_FIELD');const r=await requireEngine().reconcile(req,req.params.executionId);res.json({id:r.id,status:r.status,source:r.source,notBroadcast:true});}));
 app.post(base+'/:executionId/cancel',auth,safe(async(req,res)=>{if(Object.keys(req.body??{}).length)reject('UNEXPECTED_FIELD');const r=await requireEngine().cancel(req,req.params.executionId);res.json({id:r.id,status:r.status,source:r.source,notBroadcast:true});}));
 return {engine,ledger,status:'REGISTERED_DISARMED'};
}
