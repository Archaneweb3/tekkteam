import express from 'express';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
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

export function prepareLaunch(launch){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/pump-readiness.mjs','--simulate','--prepare-launch'],{stdio:['ignore','pipe','pipe'],windowsHide:true,env:{...process.env,PUMP_AGENT_LAUNCH:JSON.stringify(launch)}});
  let output='',errors='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Preparation timed out. No retry.'));},45000);
  child.stdout.on('data',b=>{output+=b;if(output.length>4e6)child.kill();});
  child.stderr.on('data',b=>{errors+=b;});
  child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Preparation failed: '+errors.slice(-1000));resolve(JSON.parse(output));}catch(e){reject(e);}});
 });
}

/** One controlled launch, persistent submission latch. Restart never rebroadcasts.
 * Public receipt only is journaled; no mint secret or signed transaction is saved.
 * /prepare prepares; /submit requires BOTH valid signatures; /status only reads.
 */
export function createPumpLaunch({journal,rpc='https://api.mainnet-beta.solana.com',origins=['http://127.0.0.1:5188'],serviceHost='127.0.0.1:4193',prepare=prepareLaunch,connection,send,publishMetadata=publishAgentMetadata,removeMetadata=removeDraftMetadata,getAgent=async(id,req)=>{
 return readInternalAgent(id,req.headers.cookie||'');
}}={}){
 const c=connection??new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true});
 const launches=new Map();let saved={};
 try{const data=JSON.parse(readFileSync(journal,'utf8'));saved=data.version===2?data.receipts:{};}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const [id,record] of Object.entries(saved))launches.set(id,{record,evidence:null,busy:false});
 const persist=()=>{mkdirSync(dirname(journal),{recursive:true});writeFileSync(journal,JSON.stringify({version:2,receipts:Object.fromEntries([...launches].filter(([,v])=>v.record).map(([id,v])=>[id,v.record]))}),{mode:0o600});};
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
 app.use(express.json({limit:'8kb'}));
 app.use(async(req,res,next)=>{
  const id=req.body?.agentId??req.query.agentId;
  if(typeof id!=='string'||!id)return res.status(400).json({error:'Agent ID required'});
  req.originalAgent=await getAgent(id,req);
  const agent=agentLaunchData(req.originalAgent);if(agent.agentId!==id)throw Error('Agent ID mismatch');
  if(!launches.has(id))launches.set(id,{record:null,evidence:null,busy:false});
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
   cell.record={agentId:req.agentData.agentId,owner:req.agentData.owner,network:'solana:101',status:'Deleted',deletedAt:Date.now()};cell.evidence=null;persist();
   res.json(cell.record);
  }finally{cell.busy=false;}
 });
 app.post('/pump-launch/prepare',async(req,res)=>{
  const cell=req.launchCell;let {record}=cell;
  const save=()=>{cell.record=record;persist();};
  const replace=record?.status==='Prepared'&&!record.signature&&!record.broadcastAttempted&&req.body.replacePreparationId===record.id;
  if(cell.busy||(record&&!replace))return res.status(409).json({error:'A launch attempt already exists for this agent. No automatic retry.',receipt:record});
  const initialBuyLamports=parseInitialBuy(req.body.initialBuy??'0');
  if(req.body.payer!==req.agentData.owner)return res.status(400).json({error:'Use this agent owner wallet'});
  assertAgentLaunch(req.agentData,req.body.agent);
  cell.busy=true;
  try{
   // Invalidate the prior unsigned preparation before rebuilding; old IDs cannot submit.
   if(replace){cell.evidence=null;record=null;save();}
   await network();const launch={...req.agentData,metadataUri:await publishMetadata(req.agentData),initialBuyLamports};
   if(!/^https:\/\//.test(launch.metadataUri))throw Error('Public HTTPS metadata required');
   const e=await prepare(launch);delete e.rpc;assertAgentLaunch(req.agentData,e.launch);if(e.launch?.metadataUri!==launch.metadataUri||buyLamports(e.launch)!==initialBuyLamports)throw Error('Prepared initial buy or metadata mismatch');validateLaunchEvidence(e);verifyLaunchTransaction(e.walletTransactionBase64,e,false);
   if(await c.getBlockHeight('confirmed')>=e.lastValidBlockHeight-20)throw Error('Preparation expired. No wallet request made.');
   cell.evidence=e;record={...launch,id:randomUUID(),tokenName:launch.name,network:'solana:101',confirmed:false,signature:null,observedSpendLamports:null,confirmedAt:null,status:'Prepared',mint:e.mint,lastValidBlockHeight:e.lastValidBlockHeight,blockhash:e.recentBlockhash,createdAt:Date.now()};save();
   res.json({id:record.id,evidence:e});
  }finally{cell.busy=false;}
 });
 app.post('/pump-launch/review',async(req,res)=>{
  const cell=req.launchCell,r=cell.record;
  if(cell.busy||r?.status!=='Prepared'||r.id!==req.body.id||!cell.evidence)throw Error('Preparation unavailable');
  if(parseInitialBuy(req.body.initialBuy)!==buyLamports(cell.evidence.launch))throw Error('Initial buy changed');
  assertAgentLaunch(req.agentData,cell.evidence.launch);validateLaunchEvidence(cell.evidence);
  r.status='Awaiting approval';persist();res.json({id:r.id});
 });
 app.post('/pump-launch/submit',async(req,res)=>{
  const cell=req.launchCell;let {record,evidence}=cell;const save=()=>{cell.record=record;persist();};
  if(cell.busy||!record||!['Prepared','Awaiting approval'].includes(record.status)||req.body.id!==record.id||!evidence)return res.status(409).json({error:'No eligible prepared launch. No resubmission.',receipt:record});
  assertAgentLaunch(req.agentData,evidence.launch);
  cell.busy=true;
  try{
   await network();
   const tx=verifyLaunchTransaction(req.body.transaction,evidence,true);
   if(await c.getBlockHeight('confirmed')>record.lastValidBlockHeight)throw Error('Blockhash expired; transaction not broadcast.');
   const bytes=tx.serialize();
   // Persist intent BEFORE touching the network: even ambiguous timeout cannot retry.
   record={...record,status:'Confirming',signature:bs58.encode(tx.signature),broadcastAttempted:true};save();cell.evidence=null;
   try{const signature=await broadcast(bytes);if(signature!==record.signature)throw Error('RPC returned a different signature');}
   catch{record.notice='Broadcast outcome unknown. Check confirmation; never resubmit this launch.';save();}
   res.json(record);
  }finally{cell.busy=false;}
 });
 app.get('/pump-launch/status',async(req,res)=>{
  const cell=req.launchCell;let {record}=cell;const save=()=>{cell.record=record;persist();};
  if(!record)return res.json({status:'Idle'});
  if(!record.signature||record.status==='Success'||record.status==='Failed')return res.json(record);
  await network();
  const status=(await c.getSignatureStatuses([record.signature],{searchTransactionHistory:true})).value[0];
  if(status?.err){record.status='Failed';record.error='Transaction failed on-chain: '+JSON.stringify(status.err);save();}
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
  }else if(!status&&await c.getBlockHeight('confirmed')>record.lastValidBlockHeight){record.status='Failed';record.error='Blockhash expired without a recorded confirmation. No retry performed.';save();}
  res.json(record);
 });
 app.use((err,req,res,next)=>res.status(400).json({error:process.env.NODE_ENV==='production'?'Launch operation stopped. Check launch status; do not retry automatically.':err.message,receipt:req.launchCell?.record}));
 return app;
}
