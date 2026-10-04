// Owner-scoped pure projection of the CURRENT /agents/:id/contract read DTO.
import {confirmedReceiptDetails} from './launch-receipt-summary.js';
const text=value=>typeof value==='string'?value:'';
const mint=value=>typeof value==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)?value:null;
const states=new Set(['NOT_CONFIGURED','CONFIGURED_NOT_LAUNCHED','PREPARED','AWAITING_OWNER_APPROVAL','CONFIRMED','FAILED','RECONCILIATION_REQUIRED','UNAVAILABLE']);
const receiptPhases=new Set(['Idle','Prepared','Awaiting approval','Submitted','Confirming','Unknown','Success','Failed','Deleted']);
const workflowReasons=new Set(['LAUNCH_EVIDENCE_UNAVAILABLE','CANONICAL_FINALITY_RECORDED','SIGNED_OUTCOME_REQUIRES_RECONCILIATION','NO_DELIVERY_PROOF','NO_LAUNCH_RECEIPT']);
const unavailableWorkflow=()=>({available:false,receiptStatus:null,signatureRecorded:null,deliveryStatus:'UNAVAILABLE',finality:'UNAVAILABLE',provenance:'UNAVAILABLE',reason:'LAUNCH_EVIDENCE_UNAVAILABLE'});
function workflowProjection(launch){
 const unavailable=unavailableWorkflow();
 if(launch.authorizationGranted!==false||launch.workflowProvenance!=='BACKEND VERIFIED'||launch.deliveryStatus!=='UNVERIFIED'||typeof launch.signatureRecorded!=='boolean'||!(launch.receiptStatus===null||receiptPhases.has(launch.receiptStatus))||!['CONFIRMED','FAILED','UNAVAILABLE'].includes(launch.finality)||!workflowReasons.has(launch.provenanceReason))return unavailable;
 const signed=typeof launch.signature==='string'&&!!launch.signature.trim();
 if(launch.signatureRecorded!==signed||(launch.provenanceReason!=='NO_LAUNCH_RECEIPT'&&launch.network!=='solana:101'))return unavailable;
 if(launch.finality==='CONFIRMED'&&(!signed||launch.state!=='CONFIRMED'||launch.receiptStatus!=='Success'||launch.provenanceReason!=='CANONICAL_FINALITY_RECORDED'))return unavailable;
 if(launch.finality==='FAILED'&&(!signed||launch.state!=='FAILED'||launch.receiptStatus!=='Failed'||launch.provenanceReason!=='CANONICAL_FINALITY_RECORDED'))return unavailable;
 if(launch.finality==='UNAVAILABLE'&&(launch.state==='CONFIRMED'||launch.provenanceReason==='CANONICAL_FINALITY_RECORDED'||(signed&&(launch.state!=='RECONCILIATION_REQUIRED'||launch.provenanceReason!=='SIGNED_OUTCOME_REQUIRES_RECONCILIATION'))))return unavailable;
 if(launch.provenanceReason==='SIGNED_OUTCOME_REQUIRES_RECONCILIATION'&&(launch.state!=='RECONCILIATION_REQUIRED'||launch.finality!=='UNAVAILABLE'))return unavailable;
 if(launch.provenanceReason==='NO_LAUNCH_RECEIPT'&&(signed||launch.receiptStatus!==null||launch.network!==null||!['NOT_CONFIGURED','CONFIGURED_NOT_LAUNCHED'].includes(launch.state)))return unavailable;
 if(launch.provenanceReason==='LAUNCH_EVIDENCE_UNAVAILABLE')return unavailable;
 return {available:true,receiptStatus:launch.receiptStatus,signatureRecorded:signed,deliveryStatus:launch.deliveryStatus,finality:launch.finality,provenance:launch.workflowProvenance,reason:launch.provenanceReason};
}
export function launchpadUnit(agent,contractResult){
 const coin=agent?.coin,configured=!!(text(coin?.name)&&text(coin?.ticker));
 const unit={agentId:text(agent?.id),name:text(agent?.name),character:text(agent?.character),token:{configured,name:text(coin?.name)||null,symbol:text(coin?.ticker)||null,image:/^https:\/\//i.test(text(coin?.image))?coin.image:null,mint:null},launch:{state:'UNAVAILABLE',confirmed:false,signature:null,network:null,provenance:'UNAVAILABLE',workflow:unavailableWorkflow()},operation:{state:'UNAVAILABLE',mode:null},available:false,scope:{available:false,scoped:null,reason:'LAUNCHPAD_SCOPE_UNAVAILABLE'}};
 const dto=contractResult,lifecycle=dto?.lifecycle;
 if(!unit.agentId||!text(agent?.creator)||dto?.id!==unit.agentId||dto?.owner!==agent.creator||lifecycle?.agent?.id!==unit.agentId||!states.has(lifecycle?.launch?.state))return unit;
 const launch=lifecycle.launch,token=lifecycle.token;
 if(launch.state==='UNAVAILABLE')return unit;
 const confirmed=launch.state==='CONFIRMED';
 if(confirmed&&(token?.state!=='CONFIRMED'||!mint(token.mint)||!text(launch.signature)||launch.network!=='solana:101'))return unit;
 if(!confirmed&&(!token||!['CONFIGURED','NOT_CONFIGURED'].includes(token.state)))return unit;
 const scope=dto.launchpadScope;if(scope?.available===true&&typeof scope.scoped==='boolean'&&scope.reason===null)unit.scope={available:true,scoped:scope.scoped,reason:null};
 unit.available=true;unit.launch={state:launch.state,confirmed,signature:confirmed?launch.signature:null,network:confirmed?launch.network:null,receiptDetails:confirmed?confirmedReceiptDetails(launch.receiptDetails,unit.agentId):null,provenance:'BACKEND VERIFIED',workflow:workflowProjection(launch)};
 if(confirmed)unit.token.mint=token.mint;
 unit.operation={state:text(lifecycle.operation?.state)||'UNAVAILABLE',mode:text(lifecycle.operation?.mode)||null};
 return unit;
}
