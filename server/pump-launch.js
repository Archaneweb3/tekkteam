import express from 'express';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {Connection,PublicKey} from '@solana/web3.js';
import {unpackMint,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import bs58 from 'bs58';
import {GENESIS} from '../src/pump-readiness.js';
import {validateLaunchEvidence,verifyLaunchTransaction} from '../src/pump-launch-validation.js';
import {agentLaunchData,assertAgentLaunch} from '../src/agent-launch-data.js';
import {publishAgentMetadata} from './agent-metadata.js';
import {assertUnlaunchedDraft,removeDraftMetadata,verifyExpiredPreparation} from './draft-deletion.js';
import {readInternalAgent} from './internal-agent-request.js';
import {parseInitialBuy,buyLamports} from '../src/initial-buy.js';
import {createPrepareAttemptJournal,publicAttempt,safeDiagnosticMessage,PREPARE_STAGES} from './pump-prepare-diagnostics.js';
import {createReceiptJournal} from './launch-receipt-journal.js';

export function classifyLaunchPreparationFailure(stderr=''){
 const fatal=String(stderr).split(/\r?\n/).filter(line=>!/^\s*(?:\(node:|\(Use |Node\.js v|PUMP_EVENT |\s*at |\s*\^)/.test(line)).join(' ');
 if(/Insufficient Mainnet SOL for initial buy and launch costs|INSUFFICIENT_MAINNET_BALANCE/.test(fatal))return {code:'INSUFFICIENT_LAUNCH_BALANCE',message:'Insufficient Mainnet SOL for initial buy and launch costs'};
 if(/RPC HTTP 429|HTTP 429|Too Many Requests/.test(fatal))return {code:'RPC_RATE_LIMIT',message:'Read-only Mainnet RPC rate limit during preparation'};
 if(/Metadata mismatch|Public HTTPS metadata required|HTTP 404/.test(fatal))return {code:'METADATA_VERIFICATION_FAILED',message:'Public token metadata verification failed'};
 if(/Wrong cluster|Mainnet assertion failed/.test(fatal))return {code:'MAINNET_VERIFICATION_FAILED',message:'Mainnet verification failed'};
 if(/simulation|Simulate|Launch spending policy rejected/i.test(fatal))return {code:'SIMULATION_FAILED',message:'Launch simulation failed'};
 if(/IDL|schema mismatch|Non-executable program|Global owner mismatch/.test(fatal))return {code:'PUMP_READINESS_FAILED',message:'Pump readiness verification failed'};
 return {code:'LAUNCH_PREPARATION_FAILED',message:'Launch preparation failed'};
}

export function prepareLaunch(launch,onEvent=()=>{}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/pump-readiness.mjs','--simulate','--prepare-launch','--events'],{stdio:['ignore','pipe','pipe'],windowsHide:true,env:{...process.env,PUMP_AGENT_LAUNCH:JSON.stringify(launch)}});
  let output='',errors='',pending='',settled=false,stage='PUMP_READINESS';
  const emitLine=line=>{if(line.startsWith('PUMP_EVENT ')){try{const event=JSON.parse(line.slice(11));if(PREPARE_STAGES.has(event.stage)){stage=event.stage;onEvent({stage});}}catch{}}else if(/DEP0040|punycode/i.test(line))onEvent({warning:'DEP0040'});else if(line.trim()&&!/^\s*at |^\(node:|^Node\.js v|^\(Use |^\s*\^/.test(line))errors=(errors+' '+line).slice(-4096);};
  const timer=setTimeout(()=>{child.kill();if(!settled){settled=true;reject(Object.assign(Error('Preparation timed out. No retry.'),{code:'LAUNCH_SERVICE_TIMEOUT',stage:'PUMP_READINESS'}));}},45000);
  child.stdout.on('data',b=>{output+=b;if(output.length>4e6)child.kill();});
  child.stderr.on('data',b=>{pending+=b.toString();let i;while((i=pending.indexOf('\n'))>=0){emitLine(pending.slice(0,i).trimEnd());pending=pending.slice(i+1);}if(pending.length>8192)pending=pending.slice(-8192);});
  child.on('error',error=>{clearTimeout(timer);if(!settled){settled=true;reject(Object.assign(error,{code:'LAUNCH_SERVICE_UNAVAILABLE',stage:'PUMP_READINESS'}));}});
  child.on('close',code=>{clearTimeout(timer);if(pending)emitLine(pending);if(settled)return;settled=true;try{if(code!==0){const failure=classifyLaunchPreparationFailure(errors);const httpMatch=errors.match(/(?:RPC )?HTTP\s+(\d{3})/i),rpcMatch=errors.match(/"code"\s*:\s*(-?\d{1,6})/);throw Object.assign(Error(failure.message),{code:failure.code,stage,processExitCode:code,httpStatus:httpMatch?Number(httpMatch[1]):null,rpcCode:rpcMatch?Number(rpcMatch[1]):null,fatalStderr:safeDiagnosticMessage(errors)});}resolve(JSON.parse(output));}catch(e){reject(e);}});
 });
}

/** One controlled launch, persistent submission latch. Restart never rebroadcasts.
 * Public receipt only is journaled; no mint secret or signed transaction is saved.
 * /prepare prepares; /submit requires BOTH valid signatures; /status only reads.
 */
export function createPumpLaunch({journal,initializeJournal=false,journalOptions={},attemptJournal=journal.replace(/\.json$/,'-prepare-attempts.json'),rpc='https://api.mainnet-beta.solana.com',origins=['http://127.0.0.1:5188'],serviceHost='127.0.0.1:4193',prepare=prepareLaunch,connection,send,publishMetadata=publishAgentMetadata,removeMetadata=removeDraftMetadata,getAgent=async(id,req)=>{
 return readInternalAgent(id,req.headers.cookie||'');
}}={}){
 const c=connection??new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true});
 const attempts=createPrepareAttemptJournal(attemptJournal);
 const receiptJournal=createReceiptJournal(journal,{...journalOptions,initializeMissing:initializeJournal});
 const launches=new Map();
 for(const [id,record] of Object.entries(receiptJournal.read()))launches.set(id,{agentId:id,record,evidence:null,busy:false});
 const persist=(cell,record)=>{
  const records=Object.fromEntries([...launches].filter(([,v])=>v!==cell&&v.record).map(([id,v])=>[id,v.record]));
  if(record)records[cell.agentId]=record;
  const ack=receiptJournal.commit(records);cell.record=record;return ack;
 };
 const network=async()=>{if(await c.getGenesisHash()!==GENESIS)throw Error('Mainnet assertion failed');};
 const broadcast=send??(async bytes=>{
  const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[bytes.toString('base64'),{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]}),signal:AbortSignal.timeout(20000)});
  const body=await response.json();if(!response.ok||body.error)throw Error('Submission response failed; check signature status. Do not resubmit.');return body.result;
 });
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.headers.host!==serviceHost)return res.status(403).json({error:'Internal service only'});
  if(req.method!=='GET'&&!origins.includes(req.headers.origin))return res.status(403).json({error:'Untrusted origin'});
  next();
 });
 const responseAttempt=(attempt,status,classification)=>{if(!attempt)return null;attempts.update(attempt,{service:{...attempt.service,httpStatus:status,responseReceived:true,responseClassification:classification}});return publicAttempt(attempt);};
 const latestAttempt=agentId=>{const records=attempts.all().filter(item=>item.agentId===agentId);return publicAttempt(records.at(-1));};
 app.use(express.json({limit:'8kb'}));
 app.use((req,res,next)=>{
  if(req.method!=='POST'||req.path!=='/pump-launch/prepare')return next();
  const attempt=attempts.begin(req.body);req.prepareAttempt=attempt;
  attempts.stage(attempt,'OWNER_AUTH');
  res.on('finish',()=>{attempts.update(attempt,{service:{...attempt.service,httpStatus:res.statusCode,responseReceived:true,responseClassification:attempt.finalStatus==='PREPARED'?'PREPARED':attempt.finalStatus==='FAILED'?'FAILED':'REJECTED'}});});
  next();
 });
 app.use(async(req,res,next)=>{
  receiptJournal.assertAvailable();
  const id=req.body?.agentId??req.query.agentId;
  if(typeof id!=='string'||!id){if(req.prepareAttempt)attempts.fail(req.prepareAttempt,Object.assign(Error('Agent ID required'),{code:'AGENT_ID_REQUIRED'}),400);return res.status(400).json({error:'Agent ID required',attempt:responseAttempt(req.prepareAttempt,400,'FAILED')});}
  try{req.originalAgent=await getAgent(id,req);}catch(error){return next(error);}
  if(req.prepareAttempt)attempts.passed(req.prepareAttempt,'OWNER_AUTH');
  if(req.prepareAttempt)attempts.stage(req.prepareAttempt,'OWNERSHIP_CHECK');
  const agent=agentLaunchData(req.originalAgent);if(agent.agentId!==id)throw Error('Agent ID mismatch');
  if(req.prepareAttempt){attempts.passed(req.prepareAttempt,'OWNERSHIP_CHECK');attempts.update(req.prepareAttempt,{owner:typeof agent.owner==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(agent.owner)?agent.owner:null});}
  if(!launches.has(id))launches.set(id,{agentId:id,record:null,evidence:null,busy:false});
  if(launches.get(id).record?.owner&&launches.get(id).record.owner!==agent.owner)throw Error('Launch receipt owner mismatch');
  req.launchCell=launches.get(id);req.agentData=agent;next();
 });
 // Shares the existing per-agent latch, so deletion cannot race prepare/submit.
 // A durable tombstone rejects stale signed requests even after a restart.
 app.post('/pump-launch/delete-draft',async(req,res)=>{
  const cell=req.launchCell,r=cell.record;assertUnlaunchedDraft(req.originalAgent);
  if(cell.busy||r?.confirmed||r?.signature||r?.broadcastAttempted||r?.status==='Success')return res.status(409).json({error:'Launch pending or historical transaction exists. Draft preserved.'});
  cell.busy=true;
  try{
   await verifyExpiredPreparation(req.originalAgent);
   if(r?.mint){await network();if(!Number.isSafeInteger(r.lastValidBlockHeight)||await c.getBlockHeight('confirmed')<=r.lastValidBlockHeight)throw Error('Prepared launch has not expired; draft preserved');if(await c.getAccountInfo(new PublicKey(r.mint),'confirmed'))throw Error('Mainnet mint exists; draft preserved');}
   await removeMetadata(req.agentData.agentId);
   persist(cell,{agentId:req.agentData.agentId,owner:req.agentData.owner,network:'solana:101',status:'Deleted',deletedAt:Date.now()});cell.evidence=null;
   res.json(cell.record);
  }finally{cell.busy=false;}
 });
 app.post('/pump-launch/prepare',async(req,res)=>{
  const cell=req.launchCell;let {record}=cell;const attempt=req.prepareAttempt;
  const save=()=>persist(cell,record);
  const replace=['Prepared','Awaiting approval'].includes(record?.status)&&!record.signature&&!record.broadcastAttempted&&req.body.replacePreparationId===record.id;
  attempts.stage(attempt,'LAUNCH_STATE_CHECK');
  if(cell.busy||(record&&!replace)){attempts.fail(attempt,Object.assign(Error('Launch state conflict'),{code:'LAUNCH_STATE_CONFLICT'}),409);return res.status(409).json({code:'LAUNCH_STATE_CONFLICT',error:'A launch attempt already exists for this agent. No automatic retry.',receipt:record,attempt:responseAttempt(attempt,409,'FAILED')});}
  attempts.passed(attempt,'LAUNCH_STATE_CHECK');
  const initialBuyLamports=parseInitialBuy(req.body.initialBuy??'0');attempts.update(attempt,{initialBuyLamports});
  attempts.stage(attempt,'OWNER_AUTH');
  if(req.body.payer!==req.agentData.owner){attempts.fail(attempt,Object.assign(Error('Use this agent owner wallet'),{code:'OWNER_WALLET_MISMATCH'}),400);return res.status(400).json({error:'Use this agent owner wallet',attempt:responseAttempt(attempt,400,'FAILED')});}
  assertAgentLaunch(req.agentData,req.body.agent);
  cell.busy=true;
  try{
   // An approval prompt may still be open elsewhere. Recover only after its
   // blockhash expires and the prepared mint is absent on the verified network.
   if(replace&&record.status==='Awaiting approval'){
    await network();
    if(!Number.isSafeInteger(record.lastValidBlockHeight)||await c.getBlockHeight('confirmed')<=record.lastValidBlockHeight||await c.getAccountInfo(new PublicKey(record.mint),'confirmed')){
     attempts.stage(attempt,'LAUNCH_STATE_CHECK');attempts.fail(attempt,Object.assign(Error('Previous approval is not safely expired'),{code:'APPROVAL_RECOVERY_NOT_SAFE'}),409);
     return res.status(409).json({code:'APPROVAL_RECOVERY_NOT_SAFE',error:'Previous approval is not safely expired. Keep this receipt and check later.',receipt:record,attempt:responseAttempt(attempt,409,'FAILED')});
    }
   }
   // Invalidate the prior unsigned preparation before rebuilding; old IDs cannot submit.
   if(replace){cell.evidence=null;record=null;save();}
   attempts.stage(attempt,'MAINNET_VERIFY');await network();attempts.passed(attempt,'MAINNET_VERIFY');
   attempts.stage(attempt,'METADATA_VERIFY');const launch={...req.agentData,metadataUri:await publishMetadata(req.agentData),initialBuyLamports};
   if(!/^https:\/\//.test(launch.metadataUri))throw Error('Public HTTPS metadata required');
   attempts.update(attempt,{metadataPublished:true});attempts.passed(attempt,'METADATA_VERIFY');
   attempts.stage(attempt,'PUMP_READINESS');const e=await prepare(launch,event=>{if(event.warning)attempts.warn(attempt,event.warning);if(event.stage){const prior=attempt.currentStage;if(prior==='PAYER_BALANCE'||prior==='PUMP_READINESS'||prior==='TRANSACTION_BUILD'||prior==='VALIDATION')attempts.passed(attempt,prior);attempts.stage(attempt,event.stage);if(event.stage==='VALIDATION')attempts.update(attempt,{transactionBuilt:true});if(event.stage==='SIMULATION')attempts.update(attempt,{validationPassed:true});}});
   attempts.update(attempt,{transactionBuilt:true,validationPassed:true,simulationPassed:true});attempts.passed(attempt,'SIMULATION');
   delete e.rpc;attempts.stage(attempt,'VALIDATION');assertAgentLaunch(req.agentData,e.launch);if(e.launch?.metadataUri!==launch.metadataUri||buyLamports(e.launch)!==initialBuyLamports)throw Error('Prepared initial buy or metadata mismatch');validateLaunchEvidence(e);verifyLaunchTransaction(e.walletTransactionBase64,e,false);attempts.passed(attempt,'VALIDATION');
   if(await c.getBlockHeight('confirmed')>=e.lastValidBlockHeight-20)throw Error('Preparation expired. No wallet request made.');
   cell.evidence=e;record={...launch,id:randomUUID(),tokenName:launch.name,network:'solana:101',confirmed:false,signature:null,observedSpendLamports:null,confirmedAt:null,status:'Prepared',mint:e.mint,lastValidBlockHeight:e.lastValidBlockHeight,blockhash:e.recentBlockhash,createdAt:Date.now()};save();
   attempts.complete(attempt);res.json({id:record.id,evidence:e,persistence:receiptJournal.ack(),attempt:responseAttempt(attempt,200,'PREPARED')});
  }finally{cell.busy=false;}
 });
 app.post('/pump-launch/review',async(req,res)=>{
  const cell=req.launchCell,r=cell.record;
  if(cell.busy)return res.status(409).json({error:'Launch operation in progress'});
  if(r?.status!=='Prepared'||r.id!==req.body.id||!cell.evidence)throw Error('Preparation unavailable');
  if(parseInitialBuy(req.body.initialBuy)!==buyLamports(cell.evidence.launch))throw Error('Initial buy changed');
  assertAgentLaunch(req.agentData,cell.evidence.launch);validateLaunchEvidence(cell.evidence);
  const ack=persist(cell,{...r,status:'Awaiting approval'});res.json({id:r.id,persistence:ack});
 });
 app.post('/pump-launch/submit',async(req,res)=>{
  const cell=req.launchCell;let {record,evidence}=cell;const save=()=>persist(cell,record);
  if(cell.busy||!record||!['Prepared','Awaiting approval'].includes(record.status)||req.body.id!==record.id||!evidence)return res.status(409).json({error:'No eligible prepared launch. No resubmission.',receipt:record});
  assertAgentLaunch(req.agentData,evidence.launch);
  cell.busy=true;
  try{
   await network();
   const tx=verifyLaunchTransaction(req.body.transaction,evidence,true);
   if(await c.getBlockHeight('confirmed')>record.lastValidBlockHeight)throw Error('Blockhash expired; transaction not broadcast.');
   const bytes=tx.serialize();
   // Persist intent BEFORE touching the network: even ambiguous timeout cannot retry.
   record={...record,status:'Confirming',signature:bs58.encode(tx.signature),broadcastAttempted:true,submissionAcknowledged:false};save();cell.evidence=null;
   let acknowledged=false;
   try{const signature=await broadcast(bytes);if(signature!==record.signature)throw Error('RPC returned a different signature');acknowledged=true;}
   catch{/* Preserve the same signature; an RPC error does not authorize replay. */}
   record=acknowledged?{...record,submissionAcknowledged:true,submissionAcknowledgedAt:Date.now()}:{...record,notice:'Broadcast outcome unknown. Check confirmation; never resubmit this launch.'};
   save();res.json({...record,persistence:receiptJournal.ack()});
  }finally{cell.busy=false;}
 });
 app.get('/pump-launch/status',async(req,res)=>{
  const cell=req.launchCell;let {record}=cell;const save=()=>persist(cell,record);
  const view=()=>({...record,launchLifecycle:record.status==='Success'&&record.confirmed?'TOKEN_LAUNCHED':record.signature?'RECONCILIATION_REQUIRED':'PREVIOUS_ATTEMPT_ENDED',canStartFreshPreparation:false,resolutionReason:record.signature?'Previous signed transaction requires conclusive reconciliation before another launch.':'No signed transaction on this receipt.',latestAttempt:latestAttempt(req.agentData.agentId)});
  if(!record)return res.json({status:'Idle',launchLifecycle:'PREVIOUS_ATTEMPT_ENDED',canStartFreshPreparation:true,latestAttempt:latestAttempt(req.agentData.agentId)});
  if(!record.signature||record.status==='Success')return res.json(view());
  if(cell.busy)return res.status(409).json({error:'Launch operation in progress. Inspect the same receipt later.',receipt:record});
  cell.busy=true;
  try{
  await network();
  const status=(await c.getSignatureStatuses([record.signature],{searchTransactionHistory:true})).value[0];
  if(status?.err){record={...record,status:'Failed',error:'Transaction failed on-chain: '+JSON.stringify(status.err),resolution:'ONCHAIN_FAILURE'};save();}
  else if(['confirmed','finalized'].includes(status?.confirmationStatus)){
   const key=new PublicKey(record.mint),account=await c.getAccountInfo(key,'confirmed');
   if(!account)throw Error('Confirmed signature; mint account not yet available. Check confirmation again.');
   const mint=unpackMint(key,account,TOKEN_2022_PROGRAM_ID);
   if(!mint.isInitialized||mint.decimals!==6||mint.supply!==1000000000000000n||mint.mintAuthority!==null||mint.freezeAuthority!==null)throw Error('Confirmed transaction but mint verification failed');
   const landed=await c.getTransaction(record.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   if(!landed?.meta||landed.meta.err)throw Error('Confirmed transaction metadata unavailable. Check confirmation again.');
   const keys=landed.transaction.message.staticAccountKeys??landed.transaction.message.accountKeys;
   if(keys[0].toBase58()!==record.owner)throw Error('On-chain payer mismatch');
   record={...record,status:'Success',confirmed:true,confirmedAt:Date.now(),observedSpendLamports:landed.meta.preBalances[0]-landed.meta.postBalances[0],networkFeeLamports:landed.meta.fee,pumpUrl:`https://pump.fun/coin/${record.mint}`,explorerUrl:`https://explorer.solana.com/tx/${record.signature}`,mintExplorerUrl:`https://explorer.solana.com/address/${record.mint}`};save();
  }
  // A null status after blockhash expiry is not proof that a signed,
  // broadcast-attempted transaction never landed. Keep the launch blocked.
  res.json(view());
  }finally{cell.busy=false;}
 });
 app.use((err,req,res,next)=>{const known=err.code==='INSUFFICIENT_LAUNCH_BALANCE'||err.code==='RPC_RATE_LIMIT';const status=known&&err.code==='RPC_RATE_LIMIT'?503:err.status&&Number.isInteger(err.status)?err.status:400;const attempt=req.prepareAttempt;if(attempt){if(err.processExitCode!==undefined||err.fatalStderr)attempts.update(attempt,{service:{...attempt.service,processExitCode:Number.isInteger(err.processExitCode)?err.processExitCode:null,fatalStderr:err.fatalStderr||safeDiagnosticMessage(err)}});attempts.fail(attempt,err,err.httpStatus??status);}res.status(status).json({code:known?err.code:'LAUNCH_OPERATION_STOPPED',error:err.code==='INSUFFICIENT_LAUNCH_BALANCE'?"Your wallet doesn't have enough SOL for the initial buy and launch costs.":err.code==='RPC_RATE_LIMIT'?'Read-only Mainnet RPC rate limit during preparation. No transaction was sent.':'Launch operation stopped. Check launch status; do not retry automatically.',receipt:req.launchCell?.record,attempt:responseAttempt(attempt,status,'FAILED')});});
 return app;
}
