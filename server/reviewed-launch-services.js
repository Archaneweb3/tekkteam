// Shared product composition. No listener, workers, environment mutation or store
// initialization here. The caller owns the canonical DB, vault and explicit gates.
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
 const evidence=createPreparationEvidenceWriter(assetRoot),captureDiagnostics=createPreparationDiagnosticWriter(assetRoot);
 const publishMetadata=createMetadataPublisher(tokenDraftConfiguration,{request:transport.publicRequest});
 const serverOptions={tokenDraftConfiguration,launchPreparation:createPumpLaunchPreparation({transport,publishMetadata,readPreparation:evidence.read,executionReview:true,captureDiagnostics}),launchPreparationEvidence:evidence};
 if(authorization)serverOptions.m4ExecutionFactory=({db,store})=>createM4Execution({db,transport,publishMetadata,journalPath,captureDiagnostics,provisionAgent:receipt=>provisionLaunchAgent(store,receipt),recoverExecutionId:authorization.recoverExecutionId??null,actionTimeEnabled:authorization.actionTime===true,lighthouseEnabled:authorization.lighthouse===true,signerStore:store});
 return {serverOptions,readPublicAsset:preparationAssetReader(assetRoot)};
}
