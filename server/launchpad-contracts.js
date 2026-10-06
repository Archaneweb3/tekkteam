import {strategyConfigFor,PROFILES} from '../public/app/strategy-config.js';
import {REGISTRY_VERSION,presetDisplayName} from './strategy-registry.js';
import {readReceiptJournal} from './launch-receipt-journal.js';
import {resolve} from 'node:path';
import {normalizeTokenDraft} from '../src/token-draft-schema.js';
import {confirmedReceiptDetails} from '../public/app/launch-receipt-summary.js';

// Pure projections: no reconciliation, state mutation, RPC, custody or execution.
export function readLaunchEvidence(agent,path=resolve(process.env.DATA_DIR||'server/data','pump-agent-launches.json'),reader){
 try{const data=reader?reader():readReceiptJournal(path);const r=data.receipts[agent.id];
  if(!r)return {receipt:null,available:true};
  if(r.agentId!==agent.id||r.owner!==agent.creator||r.network!=='solana:101')return {receipt:null,available:false};
  return {receipt:r,available:true};
 }catch{return {receipt:null,available:false};}
}
// Persisted workflow facts are owner read data, never delivery or retry authority.
const receiptStatuses=new Set(['Idle','Prepared','Awaiting approval','Submitted','Confirming','Unknown','Success','Failed','Deleted']);
function launchWorkflow(r,available,state){
 const signatureRecorded=available&&typeof r?.signature==='string'&&!!r.signature.trim();
 const receiptStatus=available&&receiptStatuses.has(r?.status)?r.status:null;
 const finality=signatureRecorded&&state==='CONFIRMED'&&typeof r?.mint==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint)?'CONFIRMED':signatureRecorded&&state==='FAILED'&&r?.resolution==='ONCHAIN_FAILURE'?'FAILED':'UNAVAILABLE';
 return {receiptStatus,signatureRecorded:!!signatureRecorded,deliveryStatus:available?'UNVERIFIED':'UNAVAILABLE',finality,
  workflowProvenance:available?'BACKEND VERIFIED':'UNAVAILABLE',
  provenanceReason:!available?'LAUNCH_EVIDENCE_UNAVAILABLE':finality!=='UNAVAILABLE'?'CANONICAL_FINALITY_RECORDED':signatureRecorded||r?.broadcastAttempted===true?'SIGNED_OUTCOME_REQUIRES_RECONCILIATION':r?'NO_DELIVERY_PROOF':'NO_LAUNCH_RECEIPT'};
}
export function lifecycleProjection(agent,{receipt=null,available=true,operation=null}={}){
 const bound=receipt&&receipt.agentId===agent.id&&receipt.owner===agent.creator&&receipt.network==='solana:101';
 if(receipt&&!bound)available=false;
 const r=bound?receipt:null;
 let state=agent.coin?'CONFIGURED_NOT_LAUNCHED':'NOT_CONFIGURED';
 if(!available)state='UNAVAILABLE';
 else if(r){
  if(r.status==='Success'&&r.confirmed===true&&r.signature&&r.mint)state='CONFIRMED';
  else if(r.status==='Failed'&&r.resolution==='ONCHAIN_FAILURE')state='FAILED';
  else if(r.signature||r.broadcastAttempted)state='RECONCILIATION_REQUIRED';
  else state=({'Prepared':'PREPARED','Awaiting approval':'AWAITING_OWNER_APPROVAL','Failed':'FAILED','Deleted':'NOT_CONFIGURED','Idle':agent.coin?'CONFIGURED_NOT_LAUNCHED':'NOT_CONFIGURED'})[r.status]??'UNAVAILABLE';
 }
 return {agent:{id:agent.id,state:'CREATED'},token:{state:state==='CONFIRMED'?'CONFIRMED':agent.coin?'CONFIGURED':'NOT_CONFIGURED',mint:state==='CONFIRMED'?r.mint:null},launch:{state,...launchWorkflow(r,available,state),receiptId:r?.id??null,signature:r?.signature??null,network:r?.network??null,receiptDetails:state==='CONFIRMED'?confirmedReceiptDetails(r,agent.id):null,reviewValidity:['PREPARED','AWAITING_OWNER_APPROVAL'].includes(state)?'UNVERIFIED':null,authorizationGranted:false},operation:{state:operation?.status??'PAUSED',mode:operation?.mode??null}};
}
export function operatingPlan(agent,paper=null){
 let c;try{c=strategyConfigFor(paper??agent);}catch{return {agentId:agent.id,available:false,reason:'CONFIGURATION_UNAVAILABLE',authorizationGranted:false};}
 const p=PROFILES[c.strategy];
 return {agentId:agent.id,available:true,strategyRegistryVersion:REGISTRY_VERSION,configurationRevision:paper?.strategyConfigVersion??0,riskRevision:null,strategyArchetype:'momentum-activity',presetId:c.strategy,presetDisplayName:presetDisplayName(c.strategy),
  personality:p.version?{version:p.version,tradePercent:p.tradeBps/100,basis:'TRADABLE_SOL_AFTER_PROTECTED_RESERVE',subjectToIndependentCaps:true}:null,
  entryBehavior:{minPriceChange5mPercent:c.signal.minPriceChange5mPercent,maxPriceChange5mPercent:p.maxChange,minBuySellRatio:p.minRatio,minVolume5mUsd:c.signal.minVolume5mUsd,minLiquidityUsd:c.signal.minLiquidityUsd},
  exitBehavior:{takeProfitPercent:c.position.takeProfitPercent,stopLossPercent:c.position.stopLossPercent,maxHoldSeconds:900,guaranteedFill:false,paperSellSizeCapped:true},
  effectiveExposure:{configuredPercent:c.risk.maxPositionPercent,ceilingPercent:10,basis:'STARTING_PAPER_CAPITAL'},capitalLimit:{maxSolPerTrade:c.risk.maxSolPerTrade,startingCapitalSol:paper?.initialSol??null},riskLimits:{...c.risk,...c.execution},timeHorizon:{maxHoldSeconds:900,editable:false},executionMode:'PAPER',operationStatus:paper?.enabled?'WORKING':'PAUSED',authorizationGranted:false};
}
// Owner-only advisory capability: all persistence/image facts supplied by trusted server reads.
export function ownerTokenDraftContract(agent,{configured=false,binding=null,scope=null,originalScope=false,tokenless=false,receiptAuthority=null,imageVerified=false}={}){
 const dto={version:1,agentId:agent.id,owner:agent.creator,state:'UNAVAILABLE',revision:null,savedDraft:null,save:{allowed:false,reason:'CONFIGURATION_UNAVAILABLE',expectedRevision:0,immutable:true},ownerAuthority:{available:false,provenance:'UNAVAILABLE'},image:{required:true,localAsset:'UNAVAILABLE',complete:false,publicDelivery:'UNAVAILABLE'},authorizationGranted:false};
 if(!configured)return dto;
 if(binding?.available!==true){dto.save.reason='FIRST_TOKEN_AUTHORITY_UNAVAILABLE';return dto;}
 if(scope?.available!==true||scope.scoped!==true||scope.reason!==null){dto.save.reason='LAUNCHPAD_SCOPE_UNAVAILABLE';return dto;}
 if(!originalScope){dto.save.reason='ORIGINAL_LAUNCHPAD_IDENTITY_REQUIRED';return dto;}
 if(binding.bound===true){
  try{if(binding.revision!==1||binding.token?.mint!==null)throw Error();const {mint,...draft}=binding.token;dto.savedDraft=normalizeTokenDraft(draft);if(!dto.savedDraft.image)throw Error();}catch{dto.savedDraft=null;dto.save.reason='FIRST_TOKEN_AUTHORITY_UNAVAILABLE';return dto;}
  dto.state='IMMUTABLE';dto.revision=1;dto.ownerAuthority={available:true,provenance:'BACKEND VERIFIED'};
  dto.image={required:true,localAsset:imageVerified?'VERIFIED':'UNAVAILABLE',complete:imageVerified===true,publicDelivery:'UNVERIFIED'};
  dto.save.reason=imageVerified?'TOKEN_ALREADY_CONFIGURED':'IMMUTABLE_IMAGE_UNAVAILABLE';return dto;
 }
 if(binding.bound!==false||binding.revision!==0){dto.save.reason='FIRST_TOKEN_AUTHORITY_UNAVAILABLE';return dto;}
 if(!tokenless){dto.save.reason='TOKENLESS_IDENTITY_REQUIRED';return dto;}
 dto.state='EMPTY';dto.revision=0;dto.ownerAuthority={available:true,provenance:'BACKEND VERIFIED'};dto.image={required:true,localAsset:'MISSING',complete:false,publicDelivery:'UNVERIFIED'};
 if(receiptAuthority?.available!==true||receiptAuthority.initialized!==true||receiptAuthority.agentId!==agent.id||receiptAuthority.owner!==agent.creator){dto.save.reason='LAUNCH_EVIDENCE_UNAVAILABLE';return dto;}
 if(receiptAuthority.receipt!==null){dto.save.reason='LAUNCH_RECEIPT_EXISTS';return dto;}
 dto.save={...dto.save,allowed:true,reason:null};return dto;
}
export function ownerAgentContract(agent,{wallet=null,paper=null,tokenDraft=null,...evidence}={}){
 return {...(tokenDraft?{tokenDraft}:{}),id:agent.id,owner:agent.creator,name:agent.name,character:agent.character,strategy:agent.strategy,description:agent.description??'',createdAt:agent.createdAt,coin:agent.coin?{name:agent.coin.name,ticker:agent.coin.ticker,image:agent.coin.image??null}:null,wallet:wallet?{address:wallet.address}:null,operatingPlan:operatingPlan(agent,paper),lifecycle:lifecycleProjection(agent,{...evidence,operation:paper?{status:paper.enabled?'WORKING':'PAUSED',mode:'PAPER'}:null})};
}
// No route or auto-publication in Phase A. Caller must supply explicit owner-bound opt-in.
export function publicLaunchProjection(agent,{publication,receipt}={}){
 if(publication?.enabled!==true||publication.agentId!==agent.id||publication.owner!==agent.creator)return null;
 const lifecycle=lifecycleProjection(agent,{receipt});
 if(lifecycle.launch.state!=='CONFIRMED')return null;
 return {agent:{id:agent.id,name:agent.name,character:agent.character},token:{mint:lifecycle.token.mint,name:agent.coin?.name??null,symbol:agent.coin?.ticker??null},launch:{network:'solana:101',signature:receipt.signature,confirmedAt:receipt.confirmedAt??null}};
}
