// Shared product composition. No listener, workers, environment mutation or store
// initialization here. The caller owns the canonical DB, vault and explicit gates.
import {createPolicy101Authority,loadPolicy101Approval} from './policy101-isolation.js';
import {createM4Execution} from './pump-m4.js';
import {M4_TARGET} from './pump-m4-guard.js';
import {provisionLaunchAgent} from './launch-agent-provisioning.js';
import {readReceiptJournal} from './launch-receipt-journal.js';
import {createMetadataPublisher} from './agent-metadata.js';
import {createPumpLaunchPreparation} from './pump-launch-preparation.js';
import {preparationAssetReader} from './preparation-assets.js';
import {createPreparationEvidenceWriter} from './preparation-evidence.js';
import {createPreparationDiagnosticWriter} from './pump-preparation-diagnostics.js';
import {resolveTokenDraftConfiguration} from './launchpad-token-configuration.js';

export function createReviewedLaunchServices({tokenDraftConfiguration,transport,authorization=null}){
 const normalized=resolveTokenDraftConfiguration(tokenDraftConfiguration);
 if(!normalized.options)throw Error(normalized.reason);
 const {assetRoot,journalPath}=normalized.options;
 readReceiptJournal(journalPath); // Missing history is never an empty history.
 if(typeof transport?.rpc!=='function'||typeof transport?.publicRequest!=='function')throw Error('REVIEWED_LAUNCH_TRANSPORT_REQUIRED');
 if(authorization){
  const target=authorization.target;
  if(!target||Object.keys(target).length!==Object.keys(M4_TARGET).length||Object.keys(M4_TARGET).some(k=>target[k]!==M4_TARGET[k]))throw Error('M4_EXACT_TARGET_CONFIG_REQUIRED');
  if(typeof transport.submitOnce!=='function')throw Error('M4_CONTROLLED_TRANSPORT_REQUIRED');
  if(authorization.lighthouse===true&&authorization.actionTime!==true)throw Error('M4_LIGHTHOUSE_CONFIG_INVALID');
 }
 const approval=authorization?.isolation?loadPolicy101Approval(authorization.isolation):null;
 const evidence=createPreparationEvidenceWriter(assetRoot),captureDiagnostics=createPreparationDiagnosticWriter(assetRoot);
 const publishMetadata=createMetadataPublisher(tokenDraftConfiguration,{request:transport.publicRequest});
 const serverOptions={launchReceiptAuthorityFactory:({db})=>createPolicy101Authority({db,journalPath,approval}),tokenDraftConfiguration,launchPreparation:createPumpLaunchPreparation({transport,publishMetadata,readPreparation:evidence.read,executionReview:true,captureDiagnostics}),launchPreparationEvidence:evidence};
 if(authorization)serverOptions.m4ExecutionFactory=({db,store,receiptAuthority})=>createM4Execution({db,transport,publishMetadata,journalPath,captureDiagnostics,provisionAgent:receipt=>provisionLaunchAgent(store,receipt),recoverExecutionId:authorization.recoverExecutionId??null,actionTimeEnabled:authorization.actionTime===true,lighthouseEnabled:authorization.lighthouse===true,signerStore:store,receiptAuthority:receiptAuthority?.policyPresent?receiptAuthority:undefined});
 return {serverOptions,readPublicAsset:preparationAssetReader(assetRoot)};
}
