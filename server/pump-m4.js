import {Keypair,Transaction} from '@solana/web3.js';
import {createPumpLaunchPreparation} from './pump-launch-preparation.js';
import {createReceiptJournal} from './launch-receipt-journal.js';
import {assertReviewedExecutionRequest,assertExecutionReview} from './pump-execution-review.js';
import {assertM4Target,M4_TARGET,verifyM4Signed,completeM4OwnerApproval,revalidateM4,checkM4Blockhash,m4Fail,sha} from './pump-m4-guard.js';
import {confirmM4} from './pump-m4-confirmation.js';
import {decodeM4CreationAccounts,verifyM4CreateEvent} from './pump-m4-provenance.js';
import {proveM4ExpiredRecovery,M4_REJECTED_RECOVERY_IDS} from './pump-m4-recovery.js';
import {assertM4ReviewLifetime} from '../src/pump-review-lifetime.js';
import {isActionTimePackage,MIN_WALLET_BLOCKS} from '../src/pump-action-time.js';
import {FINAL_MESSAGE_POLICY,validateFinalWalletMessage} from '../src/pump-wallet-final.js';
import {createEphemeralMintSigner} from './pump-mint-signer.js';
import bs58 from 'bs58';
import {readLighthouseDeployment} from './pump-lighthouse-program.js';
export function createM4Execution({db,transport,publishMetadata,journalPath,now=Date.now,prepareFactory=createPumpLaunchPreparation,revalidate=revalidateM4,confirm=confirmM4,target=M4_TARGET,verifyCreatedAccounts=decodeM4CreationAccounts,verifyEvent=verifyM4CreateEvent,captureDiagnostics,provisionAgent,recoverExecutionId=null,actionTimeEnabled=false,lighthouseEnabled=false,signerStore,receiptAuthority}){
 if(!db||!transport?.submitOnce||typeof publishMetadata!=='function')throw m4Fail('M4_EXPLICIT_CAPABILITY_REQUIRED');
 if(lighthouseEnabled&&(!actionTimeEnabled||signerStore?.db!==db))throw m4Fail('M4_LIGHTHOUSE_CAPABILITY_REQUIRED');
 const mintSigner=lighthouseEnabled?createEphemeralMintSigner(signerStore):null;
 db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS m4_execution (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS m4_execution_history (execution_id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TRIGGER IF NOT EXISTS m4_history_no_update BEFORE UPDATE ON m4_execution_history BEGIN SELECT RAISE(ABORT,'Immutable M4 history'); END; CREATE TRIGGER IF NOT EXISTS m4_history_no_delete BEFORE DELETE ON m4_execution_history BEGIN SELECT RAISE(ABORT,'Immutable M4 history'); END;");
 const isolation=receiptAuthority?.isolation;
 const journal=receiptAuthority?{read:()=>receiptAuthority.read().receipts}:createReceiptJournal(journalPath);let busy=false,fenced=false;
 const read=()=>{const row=db.prepare('SELECT payload FROM m4_execution WHERE id=1').get();if(!row)return null;const s=JSON.parse(row.payload);if(JSON.stringify(s.target)!==JSON.stringify(target))throw m4Fail('M4_AUTHORIZATION_CHANGED');return s;};
 const save=(s,archive=null,signerWrite=null,receiptWrite=null)=>{
  if(fenced)throw m4Fail('M4_WRITER_FENCED');const revision=s.revision??0;s.revision=revision+1;
  try{db.exec('BEGIN IMMEDIATE');if(archive){db.prepare('INSERT INTO m4_execution_history(execution_id,payload) VALUES(?,?)').run(archive.executionId,JSON.stringify(archive));mintSigner?.discard(archive.executionId);}const changed=revision===0?db.prepare('INSERT OR IGNORE INTO m4_execution(id,payload) VALUES(1,?)').run(JSON.stringify(s)):db.prepare("UPDATE m4_execution SET payload=? WHERE id=1 AND json_extract(payload,'$.revision')=?").run(JSON.stringify(s),revision);if(changed.changes!==1)throw m4Fail('M4_STALE_EXECUTION_WRITER');signerWrite?.();receiptWrite?.();if(mintSigner&&s.walletMessagePolicy===FINAL_MESSAGE_POLICY&&!['AWAITING_WALLET_APPROVAL','OWNER_APPROVED'].includes(s.status))mintSigner.discard(s.executionId);if(JSON.stringify(read())!==JSON.stringify(s))throw m4Fail('M4_PERSISTENCE_UNCERTAIN');db.exec('COMMIT');}
  catch(error){try{db.exec('ROLLBACK');}catch{}fenced=true;throw error;}
 };
 const publicState=s=>s?{...(isolation?{isolation:isolation.state()}:{}),status:s.status,executionId:s.executionId,signingOrder:s.signingOrder??null,walletMessagePolicy:s.walletMessagePolicy??null,result:s.result??null,signature:s.signature??null,signedDigest:s.signedDigest??null,submittedAt:s.submittedAt??null,confirmation:s.confirmation??null,provisioning:s.provisioning??null,error:s.error??null,integrity:s.integrity??null,finalMessageProof:s.finalMessageProof??null,walletApprovalOpened:s.walletApprovalOpened===true,ownerSigned:!!s.signature,broadcastAttempted:s.broadcastAttempted===true,approvalCapability:s.status==='AWAITING_WALLET_APPROVAL'&&s.walletApprovalOpened&&!s.broadcastAttempted?{mode:'M4_CONTROLLED_SINGLE_LAUNCH',controlledOwnerApproval:true,m4Target:target,walletMessagePolicy:s.walletMessagePolicy??null}:null}: {status:'NOT_STARTED'};
 const provision=s=>{
  if(s.status!=='LAUNCHED'||typeof provisionAgent!=='function'||s.provisioning?.status==='READY')return;
  try{
   const receipt=journal.read()[s.target.agentId];
   if(!receipt||receipt.executionId!==s.executionId||receipt.signature!==s.signature||receipt.mint!==s.result.mint||receipt.owner!==s.target.owner)throw m4Fail('M4_RECEIPT_CONFLICT');
   s.provisioning=provisionAgent(receipt);
  }catch{s.provisioning={status:'RECONCILIATION_REQUIRED'};}
  save(s);
 };
 const bound=(s,identity,request)=>{assertM4Target(identity,target);if(!s||request?.requestId!==s.executionId)throw m4Fail('M4_EXECUTION_MISMATCH');assertReviewedExecutionRequest(s.result,identity,{...request,now:now()});};
 async function run(action,identity,request={},verifyIdentity=()=>{}){
  assertM4Target(identity,target);if(fenced)throw m4Fail('M4_WRITER_FENCED');if(busy)throw m4Fail('M4_IN_PROGRESS');busy=true;
  try{
   let s=read();
   if(isolation&&s?.executionId===isolation.state().executionId&&['wallet-status','wallet-claim','submit','reject','status'].includes(action))isolation.assertExecution(s.executionId);
   if(['estimate','wallet-prepare','wallet-status','wallet-claim'].includes(action)&&!actionTimeEnabled)throw m4Fail('M4_ACTION_TIME_DISABLED');
   if(actionTimeEnabled&&['prepare','recover','review'].includes(action))throw m4Fail('M4_USE_ACTION_TIME_PREPARATION');
   if(action==='estimate'){
    if(request.initialBuy!=='0'||! /^[a-f0-9-]{36}$/.test(request.requestId??''))throw m4Fail('M4_ZERO_BUY_REQUEST_REQUIRED');
    if(s?.broadcastAttempted||s?.signature||s?.status==='LAUNCHED'||(isolation?!isolation.available():Object.keys(journal.read()).length))throw m4Fail('M4_PRIOR_EXECUTION_REQUIRES_RECONCILIATION');
    const prepare=prepareFactory({transport,publishMetadata,executionReview:true,explicitM4Fees:true,now,captureDiagnostics});
    const result=await prepare(identity,'0',request.requestId);verifyIdentity();assertExecutionReview(result,identity,{now:now()});
    return {status:'INFORMATIONAL_REVIEW',result,approvalCapability:null};
   }
   if(action==='wallet-status'){
    if(!s||s.status!=='AWAITING_WALLET_APPROVAL'||!isActionTimePackage(s.result))return publicState(s);
    try{const walletValidity=await checkM4Blockhash(s.result,{transport,now,minimumRemainingBlocks:MIN_WALLET_BLOCKS});verifyIdentity();return {...publicState(s),walletValidity};}
    catch(error){if(error.code==='M4_BLOCKHASH_EXPIRED'&&!s.signature&&!s.broadcastAttempted){s.status='TRANSACTION_EXPIRED';s.error=error.code;save(s);return publicState(s);}throw error;}
   }
   if(action==='wallet-claim'){
    if(!s||s.status!=='AWAITING_WALLET_APPROVAL'||!isActionTimePackage(s.result)||s.walletDeliveryClaimed||s.broadcastAttempted||s.signature)throw m4Fail('M4_APPROVAL_ALREADY_OPENED');
    bound(s,identity,request);const walletValidity=await checkM4Blockhash(s.result,{transport,now,minimumRemainingBlocks:MIN_WALLET_BLOCKS});verifyIdentity();
    isolation?.assertExecution(s.executionId);s.walletDeliveryClaimed=true;s.walletDeliveryClaimedAt=now();save(s);return {...publicState(s),walletValidity};
   }
   if(action==='prepare'||action==='recover'||action==='wallet-prepare'){
    const actionTime=action==='wallet-prepare';
    if(request.initialBuy!=='0'||! /^[a-f0-9-]{36}$/.test(request.requestId??''))throw m4Fail('M4_ZERO_BUY_REQUEST_REQUIRED');
    if(s&&s.executionId===request.requestId){
     isolation?.assertExecution(s.executionId);
     if((action==='recover'||actionTime)&&s.recovery?.fromExecutionId!==request.previousExecutionId)throw m4Fail('M4_RECOVERY_REQUEST_MISMATCH');
     if(actionTime&&s.status==='AWAITING_WALLET_APPROVAL'&&!s.walletDeliveryClaimed&&!s.broadcastAttempted&&!s.signature){const walletValidity=await checkM4Blockhash(s.result,{transport,now,minimumRemainingBlocks:MIN_WALLET_BLOCKS});verifyIdentity();isolation?.assertExecution(s.executionId);return {...publicState(s),walletValidity,walletTransactionBase64:s.result.transactionBase64};}
     return {...publicState(s),...(actionTime?{walletRequestAlreadyIssued:true}:{})};
    }
    const archivedRequest=db.prepare('SELECT payload FROM m4_execution_history WHERE execution_id=?').get(request.requestId);
    if(archivedRequest){const prior=JSON.parse(archivedRequest.payload);if(action==='recover'&&recoverExecutionId&&prior.recovery?.grantExecutionId===recoverExecutionId&&prior.recovery.fromExecutionId===request.previousExecutionId&&s?.recovery?.grantExecutionId===recoverExecutionId)return publicState(s);throw m4Fail('M4_ARCHIVED_EXECUTION_DENIED');}
    if(isolation){if(!actionTime)throw m4Fail('POLICY101_ACTION_TIME_REQUIRED');isolation.beforePrepare(request.requestId,request.previousExecutionId);}else if(Object.keys(journal.read()).length)throw m4Fail('M4_PRIOR_RECEIPT_REQUIRES_RECONCILIATION');
    let recovery=null;
    if(actionTime&&s){
     if(request.previousExecutionId!==s.executionId)throw m4Fail('M4_EXECUTION_MISMATCH');
     if(s.status==='READY_FOR_REVIEW'&&!s.walletApprovalOpened&&!s.broadcastAttempted&&!s.signature){recovery={fromExecutionId:s.executionId,source:'UNEXPOSED_INFORMATIONAL_CANDIDATE'};}
     else{recovery={fromExecutionId:s.executionId,source:'EXPLICIT_ACTION_TIME_RETRY',proof:await proveM4ExpiredRecovery(s,identity,{transport,now,unsigned:!s.signature,actionTime:true})};verifyIdentity();}
    }else if(actionTime&&request.previousExecutionId!=null)throw m4Fail('M4_EXECUTION_MISMATCH');
    else if(action==='recover'){
     const rejectedGrant=M4_REJECTED_RECOVERY_IDS.includes(recoverExecutionId);
     const unsigned=rejectedGrant?s?.executionId===recoverExecutionId&&s.status==='USER_REJECTED':s?.recovery?.grantExecutionId===recoverExecutionId&&s.status==='AWAITING_WALLET_APPROVAL'&&!s.signature;
     if(!recoverExecutionId||!s||request.previousExecutionId!==s.executionId||s.executionId!==recoverExecutionId&&!unsigned)throw m4Fail('M4_RECOVERY_NOT_AUTHORIZED');
     if(rejectedGrant&&!unsigned)throw m4Fail('M4_RECOVERY_NOT_AUTHORIZED');
     recovery={grantExecutionId:recoverExecutionId,fromExecutionId:s.executionId,proof:await proveM4ExpiredRecovery(s,identity,{transport,now,unsigned})};verifyIdentity();
    }else if(s){
     if(s.status!=='READY_FOR_REVIEW'||s.walletApprovalOpened||s.broadcastAttempted||s.signature||(s.result.expiresAt>now()&&request.replaceExecutionId!==s.executionId)||(request.replaceExecutionId!==undefined&&request.replaceExecutionId!==s.executionId))throw m4Fail('M4_AUTHORIZATION_ALREADY_CONSUMED');
    }
    const archive=s;
    let signer=Keypair.generate(),proof,walletTransactionBase64;
    try{
     const prepare=prepareFactory({transport,publishMetadata,executionReview:true,explicitM4Fees:true,actionTime,now,captureDiagnostics,mintFactory:()=>signer.publicKey,captureProof:(r,p)=>{verifyCreatedAccounts(r,p.simulation.value.accounts[0],p.simulation.value.accounts[2]);verifyEvent(r,p.simulation.value.logs);proof=p;const tx=Transaction.from(Buffer.from(r.transactionBase64,'base64'));tx.partialSign(signer);walletTransactionBase64=tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64');}});
     const result=await prepare(identity,'0',request.requestId);assertExecutionReview(result,identity,{now:now()});isolation?.assertFresh(result);
     verifyIdentity();if(archive&&(result.mint===archive.result.mint||result.transactionBase64===archive.result.transactionBase64||(M4_REJECTED_RECOVERY_IDS.includes(recovery?.grantExecutionId)||actionTime&&archive.walletApprovalOpened)&&result.recentBlockhash===archive.result.recentBlockhash))throw m4Fail('M4_RECOVERY_BYTES_REUSED');s={target,revision:archive?.revision??0,executionId:request.requestId,signingOrder:'OWNER_FIRST_MINT_AFTER_APPROVAL',status:actionTime?'AWAITING_WALLET_APPROVAL':'READY_FOR_REVIEW',result,proof,walletTransactionBase64,walletApprovalOpened:actionTime,broadcastAttempted:false,...(recovery?{recovery}:archive?.recovery?{recovery:archive.recovery}:{})};verifyM4Signed(walletTransactionBase64,s,false);
     if(actionTime){s.walletValidity=await checkM4Blockhash(result,{transport,now,minimumRemainingBlocks:MIN_WALLET_BLOCKS});s.reviewContext={contextSlot:result.simulation.slot,checkedAt:now(),height:s.walletValidity.height};verifyIdentity();}
     if(lighthouseEnabled&&actionTime)s.walletMessagePolicy=FINAL_MESSAGE_POLICY;
     isolation?.assertFresh(result);
     save(s,archive,lighthouseEnabled&&actionTime?()=>mintSigner.stage(s,signer.secretKey):null);return {...publicState(s),...(actionTime?{walletValidity:s.walletValidity,walletTransactionBase64:result.transactionBase64}:{})};
    }finally{if(signer)signer.secretKey.fill(0);signer=null;}
   }
   if(action==='status'){
    if(s?.status==='LAUNCHED'){provision(s);return publicState(s);}
    if(!s||!s.broadcastAttempted||s.status==='FAILED_ON_CHAIN')return publicState(s);
    try{
     const confirmation=await confirm(s,{transport,now});s.confirmation=confirmation;s.status=confirmation.status;let receiptWrite=null;
     if(s.status==='LAUNCHED'){
      const r=s.result,receipt={...r.launch,id:s.executionId,executionId:s.executionId,coinDraftAgentId:identity.agentId,coinDraftRevision:1,reviewDigest:r.executionReview.digest,signedTransactionDigest:s.signedDigest,submittedAt:s.submittedAt,contextSlot:s.reviewContext.contextSlot,confirmedSlot:confirmation.confirmedSlot,blockTime:confirmation.blockTime,pumpProvenance:confirmation.pumpProvenance,tokenName:r.launch.name,mint:r.mint,network:'solana:101',status:'Success',signature:s.signature,confirmed:true,createdAt:Date.parse(r.createdAt),confirmedAt:confirmation.confirmedAt,observedSpendLamports:confirmation.observedSpendLamports,networkFeeLamports:confirmation.networkFeeLamports,broadcastAttempted:true,blockhash:r.recentBlockhash,lastValidBlockHeight:r.lastValidBlockHeight,pumpUrl:'https://pump.fun/coin/'+r.mint,explorerUrl:'https://explorer.solana.com/tx/'+s.signature};
      // Verified receipt is the relationship authority. Never change agents.coin.
      const records=journal.read(),prior=records[identity.agentId];if(prior&&JSON.stringify(prior)!==JSON.stringify(receipt))throw m4Fail('M4_RECEIPT_CONFLICT');if(receiptAuthority)receiptWrite=()=>receiptAuthority.commit(receipt,s);else journal.commit({...records,[identity.agentId]:receipt});
     }
     save(s,null,null,receiptWrite);
    }catch(error){s.status='RECONCILIATION_REQUIRED';s.error=error.code??'M4_CONFIRMATION_FAILED';save(s);}
    provision(s);return publicState(s);
   }
   if(action==='reject'){
    if(!s||s.status!=='AWAITING_WALLET_APPROVAL'||request.requestId!==s.executionId)throw m4Fail('M4_REJECTION_STATE_INVALID');
    s.status='USER_REJECTED';save(s);return publicState(s);
   }
   if(action!=='submit')bound(s,identity,request);
   if(action==='review'){
    if(s.status!=='READY_FOR_REVIEW'||s.walletApprovalOpened||s.broadcastAttempted)throw m4Fail('M4_APPROVAL_ALREADY_OPENED');
    assertM4ReviewLifetime(s.result,now(),22000);const fresh=await revalidate(s,identity,request,{transport,now,captureDiagnostics});verifyIdentity();assertM4ReviewLifetime(s.result,now(),22000);s.reviewContext=fresh;s.status='AWAITING_WALLET_APPROVAL';s.walletApprovalOpened=true;save(s);
    return {...publicState(s),walletTransactionBase64:s.signingOrder==='OWNER_FIRST_MINT_AFTER_APPROVAL'?s.result.transactionBase64:s.walletTransactionBase64};
   }
   if(action==='submit'){
    if(!s||request?.requestId!==s.executionId)throw m4Fail('M4_EXECUTION_MISMATCH');
    if(s.status!=='AWAITING_WALLET_APPROVAL'||!s.walletApprovalOpened||s.broadcastAttempted||s.signature)throw m4Fail('M4_SUBMISSION_ALREADY_CONSUMED');
    if(isActionTimePackage(s.result)&&!s.walletDeliveryClaimed)throw m4Fail('M4_WALLET_DELIVERY_NOT_CLAIMED');
    // Preserve a late valid signature as consumed, but NEVER broadcast it.
    assertReviewedExecutionRequest(s.result,identity,{...request,now:s.result.executionReview.startedAt});
    let signed;
    if(s.walletMessagePolicy===FINAL_MESSAGE_POLICY){
     if(!mintSigner)throw m4Fail('M4_LIGHTHOUSE_CAPABILITY_REQUIRED');
     const final=validateFinalWalletMessage(s.result.transactionBase64,request.signedTransactionBase64,s.result,{Transaction,Buffer},false);
     verifyIdentity();
     s.status='OWNER_APPROVED';s.ownerApprovedTransactionBase64=request.signedTransactionBase64;s.signature=bs58.encode(final.tx.signature);s.ownerApprovedAt=now();
     s.integrity={preparedIntentFingerprint:sha(final.preparedMessage),walletFinalMessageFingerprint:sha(final.finalMessage),allowedMessageDiff:final.allowedDiff,assertion:final.assertion,ownerApprovedPayloadSha256:sha(Buffer.from(request.signedTransactionBase64,'base64'))};save(s);
     try{await checkM4Blockhash(s.result,{transport,now});verifyIdentity();const completeBase64=mintSigner.sign(s,final.tx);signed={...verifyM4Signed(completeBase64,s,true),completeBase64,integrity:{...s.integrity,finalSignedPayloadSha256:sha(Buffer.from(completeBase64,'base64'))}};}
     catch(error){s.status='OWNER_APPROVED_NOT_BROADCAST';s.error=error.code??'M4_MINT_SIGNER_FAILED';save(s);return publicState(s);}
    }else signed=completeM4OwnerApproval(request.signedTransactionBase64,s);
    verifyIdentity();s.status='SIGNED';s.signature=signed.signature;s.signedDigest=signed.signedDigest;s.signedTransactionBase64=signed.completeBase64;s.integrity=signed.integrity??null;s.signedAt=now();save(s);
    let finalContext;
    try{assertReviewedExecutionRequest(s.result,identity,{...request,now:now()});finalContext=await revalidate(s,identity,request,{transport,now,captureDiagnostics});verifyIdentity();assertReviewedExecutionRequest(s.result,identity,{...request,now:now()});if(s.walletMessagePolicy===FINAL_MESSAGE_POLICY){if(finalContext?.finalMessageProof?.messageSha256!==s.integrity.walletFinalMessageFingerprint||finalContext.finalMessageProof.signedPayloadSha256!==s.signedDigest||finalContext.finalMessageProof.simulationStatus!=='PASS'||finalContext.finalMessageProof.signatureVerification!==true)throw m4Fail('M4_FINAL_MESSAGE_PROOF_REQUIRED');s.finalMessageProof=finalContext.finalMessageProof;s.finalMessageEvidence=finalContext.finalMessageEvidence;save(s);}}
    catch(error){s.status='SIGNED_NOT_BROADCAST';s.error=error.code??'M4_REVALIDATION_FAILED';if(error.code==='M4_LIGHTHOUSE_PROGRAM_OR_STATE_CHANGED'&&error.validationFailure)s.validationFailure=error.validationFailure;save(s);return publicState(s);}
    // Claim only after the last native check succeeds, immediately before the
    // transport's ONLY network send. A pre-claim rejection is provably unsent;
    // crashes/timeouts after the durable claim stay uncertain and never retry.
    const claimSend=()=>{isolation?.assertExecution(s.executionId);isolation?.assertFresh(s.result);s.status='SUBMITTED';s.submittedAt=now();s.broadcastAttempted=true;save(s);};
    const actionTime=isActionTimePackage(s.result);
    if(!actionTime)claimSend();
    const authorize=(bytes,signature)=>{verifyIdentity();isolation?.assertExecution(s.executionId);const durable=read();assertReviewedExecutionRequest(durable.result,identity,{...request,now:now()});return durable.status==='SUBMITTED'&&durable.signature===signature&&durable.signedDigest===sha(Buffer.from(bytes,'base64'))&&durable.signedTransactionBase64===bytes;};
    try{await transport.submitOnce(s.signedTransactionBase64,s.signature,actionTime?async(bytes,signature)=>{if(s.finalMessageProof?.lighthouseDeployment)await readLighthouseDeployment(transport,s.finalMessageProof.slot,s.finalMessageProof.lighthouseDeployment);await checkM4Blockhash(s.result,{transport,now,minimumContextSlot:finalContext?.blockhashValidity?.contextSlot??finalContext?.contextSlot??s.result.executionReview.validitySlot});verifyIdentity();const durable=read();if(durable.status!=='SIGNED'||durable.executionId!==s.executionId||durable.signedTransactionBase64!==bytes||durable.signature!==signature)throw m4Fail('M4_SEND_AUTHORITY_REQUIRED');claimSend();return authorize(bytes,signature);}:authorize);s.status='CONFIRMING';}
    catch(error){s.status=s.broadcastAttempted?'CONFIRMATION_UNKNOWN':'SIGNED_NOT_BROADCAST';s.error=error.code??(s.broadcastAttempted?'M4_SUBMISSION_UNCERTAIN':'M4_PRESEND_VALIDATION_FAILED');}
    save(s);return publicState(s);
   }
   throw m4Fail('M4_ACTION_DENIED');
  }finally{busy=false;}
 }
 return Object.freeze({run,status:()=>publicState(read())});
}
