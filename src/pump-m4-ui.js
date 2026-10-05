import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {agentLaunchData,assertAgentLaunch} from './agent-launch-data.js';
import {validatePreparation} from './pump-preparation-ui.js';
import {assertM4ReviewLifetime} from './pump-review-lifetime.js';
const sol=n=>Number.isSafeInteger(n)?(n/1e9).toFixed(9)+' SOL':'UNAVAILABLE';
async function api(id,action,body){const response=await fetch('/api/launchpad/agents/'+encodeURIComponent(id)+'/execution/'+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});let result;try{result=await response.json();}catch{throw Error('Launch service unavailable (HTTP '+response.status+')');}if(!response.ok)throw Object.assign(Error(result.code||result.error||'Controlled launch unavailable'),{code:result.code});return result;}
export function mountM4Launch(host,{agent,isCurrent,getM4Wallet,capability}){
 const identity=agentLaunchData(agent),target=capability.m4Target,alive=()=>host.isConnected&&isCurrent();
 if(Object.keys(identity).filter(k=>Object.hasOwn(target,k)).some(k=>identity[k]!==target[k])){host.textContent='M4 is authorized for a different saved Agent and coin. No transaction is available.';return;}
 let pending=false,current=null,opened=false,timer;
 host.innerHTML='<div class="tw-launch-head"><h2>Review your launch</h2><p>Manual owner approval · Mainnet · initial buy 0 SOL · review ceiling 0.01 SOL. Agent funding and trading remain disabled.</p></div><div class="tw-launch-summary" data-summary></div><p role="status" data-status>Checking execution state…</p><p role="alert" data-error></p><div class="tw-launch-actions"><button class="tw-button primary" data-prepare disabled>Review launch costs</button><button class="tw-button primary" data-approve disabled>Approve one launch in Phantom</button><button class="tw-button" data-check hidden>Recheck confirmation</button></div>';
 const q=s=>host.querySelector(s),status=t=>{if(alive())q('[data-status]').textContent=t;},error=t=>{if(alive())q('[data-error]').textContent=t;};
 const technical=new Set(['METADATA URI','FRESH CONTEXT SLOT','SIMULATION RESULT','TRANSACTION DIGEST','REVIEW EXPIRY','GUARANTEE']);
 const rows=items=>{q('[data-summary]').replaceChildren();const details=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Advanced transaction details';details.append(heading);for(const [label,value]of items){const row=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;text.style.overflowWrap='anywhere';row.append(name,text);(technical.has(label)?details:q('[data-summary]')).append(row);}q('[data-summary]').append(details);};
 function show(s){
  current=s;clearTimeout(timer);opened=s.walletApprovalOpened===true;status(s.status);q('[data-approve]').disabled=true;q('[data-prepare]').disabled=true;q('[data-approve]').textContent='Approve one launch in Phantom';
  const r=s.result,v=r?.executionReview;
  if(r)rows([['OWNER',identity.owner],['AGENT',identity.agentName],['COIN',identity.name+' / '+identity.symbol],['MINT',r.mint],['NETWORK','Solana Mainnet Beta'],['METADATA URI',r.metadataUri],['FRESH CONTEXT SLOT',String(v.simulationSlot)],['SIMULATION RESULT',r.simulation.status],['NETWORK FEE',sol(v.networkFeeLamports)],['OTHER REQUIRED DEBIT',sol(v.otherRequiredDebitLamports)],['TOTAL REVIEWED DEBIT',sol(v.reviewedDebitLamports)],['REVIEW CEILING',sol(v.ceilingLamports)],['PROJECTED BALANCE AFTER LAUNCH',sol(v.expectedRemainingBalanceLamports)],['REQUIRED RESERVE',sol(v.minimumReserveLamports)],['INITIAL BUY','0 SOL'],['TRANSACTION DIGEST',v.digest],['REVIEW EXPIRY',new Date(v.expiresAt).toISOString()],['GUARANTEE','EXECUTION_GUARDED · no absolute on-chain maximum']]);
  if(s.signature){const p=document.createElement('p');p.textContent='Transaction: '+s.signature;p.style.overflowWrap='anywhere';q('[data-summary]').append(p);}
  if(s.status==='SIGNED_NOT_BROADCAST'){status('Owner signed. Broadcast prevented; no launch receipt. No automatic retry.');error(s.error||'Execution revalidation failed');q('[data-check]').hidden=false;if(s.error==='EXECUTION_REVIEW_EXPIRED'&&s.broadcastAttempted===false&&typeof capability.m4RecoveryExecutionId==='string'&&capability.m4RecoveryExecutionId===s.executionId){q('[data-prepare]').disabled=false;q('[data-prepare]').textContent='Refresh launch review';q('[data-approve]').disabled=false;q('[data-approve]').textContent='Refresh review & approve in Phantom';}return;}
  if(s.status==='LAUNCHED'){status('LAUNCHED · finalized Pump receipt verified. Next: Configure / Fund Agent. Trading remains OFF.');const p=document.createElement('p');p.textContent='Confirmed slot '+s.confirmation.confirmedSlot+' · '+new Date(s.confirmation.confirmedAt).toISOString();q('[data-summary]').append(p);const link=document.createElement('a');link.className='tw-button primary';link.href='#/agent/'+encodeURIComponent(identity.agentId);link.textContent='View Agent';q('[data-summary]').append(link);if(s.provisioning?.status==='READY'){const ready=document.createElement('p');ready.textContent='Agent wallet ready. Funding and trading require separate approval.';q('[data-summary]').append(ready);}else if(s.provisioning?.status==='RECONCILIATION_REQUIRED'){status('Coin launched. Agent wallet setup needs reconciliation; do not launch again.');q('[data-check]').hidden=false;}window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));return;}
  if(s.broadcastAttempted){q('[data-check]').hidden=false;return;}
  if(s.status==='AWAITING_WALLET_APPROVAL'){q('[data-check]').hidden=false;timer=setTimeout(()=>{if(alive())status('Review expired during approval. Do not approve the wallet request. Recheck state.');},Math.max(0,v.expiresAt-Date.now()));return;}
  if(s.status==='NOT_STARTED'){q('[data-prepare]').disabled=false;return;}
  if(s.status==='READY_FOR_REVIEW'&&!opened){
   if(v.expiresAt>Date.now()){q('[data-approve]').disabled=false;status('Launch review ready. Approval generates a fresh review immediately before Phantom.');timer=setTimeout(()=>{if(alive()){q('[data-approve]').disabled=true;q('[data-prepare]').disabled=opened;status(opened?'Review expired during approval. Do not approve the wallet request. Recheck state.':'Review expired. Refresh launch review; no wallet prompt opened.');if(opened)q('[data-check]').hidden=false;}},v.expiresAt-Date.now());}
   else{q('[data-prepare]').disabled=false;status('Review expired. Prepare a fresh review.');}
  }
 }
 const assertCurrent=async()=>{if(!alive())throw Error('Selected Agent changed');const response=await fetch('/api/agents/'+encodeURIComponent(identity.agentId));if(!response.ok)throw Error('Owner session unavailable');assertAgentLaunch(identity,agentLaunchData(await response.json()));getM4Wallet(identity.owner).assertBound();if(!alive())throw Error('Dialog closed');};
 const assertLocal=()=>{if(!alive())throw Error('Selected Agent or dialog changed');getM4Wallet(identity.owner).assertBound();};
 const recoverable=()=>current?.status==='SIGNED_NOT_BROADCAST'&&current.error==='EXECUTION_REVIEW_EXPIRED'&&current.broadcastAttempted===false&&typeof capability.m4RecoveryExecutionId==='string'&&capability.m4RecoveryExecutionId===current.executionId;
 const freshPreparation=async()=>{const recovery=recoverable(),request={initialBuy:'0',requestId:crypto.randomUUID(),...(recovery?{previousExecutionId:current.executionId}:current?.status==='READY_FOR_REVIEW'?{replaceExecutionId:current.executionId}:{})};const s=await api(identity.agentId,recovery?'recover':'prepare',request);await validatePreparation(s.result,identity,0);assertLocal();show(s);return s;};
 api(identity.agentId,'status').then(s=>{if(alive())show(s);}).catch(e=>error(e.message));
 q('[data-prepare]').onclick=async()=>{if(pending||(opened&&!recoverable())||!alive())return;pending=true;clearTimeout(timer);q('[data-prepare]').disabled=true;q('[data-approve]').disabled=true;error('');status('Preparing fresh finalized metadata, fees, rent and unsigned simulation…');try{await assertCurrent();await freshPreparation();}catch(e){error(e.message);status('Preparation stopped. No new owner signature or broadcast.');q('[data-check]').hidden=false;}finally{pending=false;}};
 q('[data-approve]').onclick=async()=>{
  if(pending||!alive()||!recoverable()&&(opened||current?.status!=='READY_FOR_REVIEW'))return;pending=true;clearTimeout(timer);q('[data-approve]').disabled=true;q('[data-prepare]').disabled=true;error('');
  let r,request,awaiting=false;
  try{
   await assertCurrent();status('Preparing a fresh launch review now…');
   let reviewed;
   for(let refresh=0;refresh<2;refresh++){
    const prepared=await freshPreparation();r=prepared.result;request={requestId:prepared.executionId,reviewDigest:r.executionReview.digest,transactionBase64:r.transactionBase64};
    q('[data-approve]').disabled=true;q('[data-prepare]').disabled=true;
    try{assertM4ReviewLifetime(r);status('Launch review ready. Checking this exact review immediately before Phantom…');reviewed=await api(identity.agentId,'review',request);break;}
    catch(e){if(e.code!=='M4_REVIEW_LIFETIME_TOO_SHORT'||refresh===1)throw e;status('Refreshing a slow launch review before opening the wallet…');}
   }
   awaiting=true;opened=true;show(reviewed);assertLocal();
   let signedTransactionBase64;
   for(let walletTry=0;walletTry<2;walletTry++){
    const partial=Transaction.from(Buffer.from(reviewed.walletTransactionBase64,'base64')),unsigned=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
    if(partial.signature!==null||!partial.verifySignatures(false)||!partial.serializeMessage().equals(unsigned.serializeMessage()))throw Error('Mint signature or reviewed message changed');
    if(reviewed.signingOrder==='OWNER_FIRST_MINT_AFTER_APPROVAL'&&(reviewed.walletTransactionBase64!==r.transactionBase64||partial.signatures.some(s=>s.signature!==null)))throw Error('Owner-first transaction changed');
    try{
     assertLocal();try{assertM4ReviewLifetime(reviewed.result);}catch(e){e.walletRequestOpened=false;throw e;}
     await validatePreparation(reviewed.result,identity,0);assertLocal();
     status('AWAITING_WALLET_APPROVAL · approve manually in Phantom. Exactly one create_v2; initial buy 0 SOL.');
     signedTransactionBase64=await getM4Wallet(identity.owner).signTransaction(reviewed.walletTransactionBase64,reviewed,assertLocal);break;
    }catch(e){
     if(e.code!=='M4_REVIEW_LIFETIME_TOO_SHORT'||e.walletRequestOpened!==false||walletTry!==0||!capability.m4RecoveryExecutionId)throw e;
     clearTimeout(timer);
     // No provider request occurred. Still wait for old bytes to be unable to land;
     // an owner could have copied their mint-partial transaction outside this UI.
     const renewal={initialBuy:'0',requestId:crypto.randomUUID(),previousExecutionId:reviewed.executionId};let renewed;
     for(let wait=0;wait<20;wait++){
      assertLocal();status('Wallet not opened. Refreshing after expired-blockhash safety verification…');
      try{renewed=await api(identity.agentId,'recover',renewal);break;}
      catch(waitError){if(!['M4_RECOVERY_BLOCKHASH_STILL_VALID','M4_RECOVERY_REVIEW_STILL_VALID'].includes(waitError.code)||wait===19)throw waitError;await new Promise(ok=>setTimeout(ok,5000));}
     }
     await validatePreparation(renewed.result,identity,0);assertLocal();show(renewed);r=renewed.result;request={requestId:renewed.executionId,reviewDigest:r.executionReview.digest,transactionBase64:r.transactionBase64};assertM4ReviewLifetime(r);
     reviewed=await api(identity.agentId,'review',request);awaiting=true;opened=true;show(reviewed);
    }
   }
   assertLocal();const signed=Transaction.from(Buffer.from(signedTransactionBase64,'base64')),unsigned=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
   const ownerFirst=reviewed.signingOrder==='OWNER_FIRST_MINT_AFTER_APPROVAL';
   if(!signed.signature||!signed.verifySignatures(!ownerFirst)||!signed.serializeMessage().equals(unsigned.serializeMessage())||ownerFirst&&(signed.signatures.length!==2||signed.signatures[1].signature!==null))throw Error('Wallet changed reviewed bytes');
   status('Submitting exactly once. No automatic retry.');const s=await api(identity.agentId,'submit',{...request,signedTransactionBase64});if(alive())show(s);
   for(let attempt=0;attempt<15&&alive()&&current.broadcastAttempted===true&&['SUBMITTED','CONFIRMING','CONFIRMATION_UNKNOWN'].includes(current.status);attempt++){await new Promise(ok=>setTimeout(ok,5000));const state=await api(identity.agentId,'status');if(alive())show(state);}
  }catch(e){if(awaiting&&e.walletRequestOpened===true&&(e.code===4001||/reject|denied|declin/i.test(e.message))){try{const rejected=await api(identity.agentId,'reject',{requestId:request.requestId});if(alive())show(rejected);}catch{status('Approval stopped. Reconciliation required.');}}else{status('Execution stopped. No retry or new wallet approval. Recheck state.');try{const authoritative=await api(identity.agentId,'status');if(alive())show(authoritative);}catch{status('Execution state unavailable. Recheck before any further action.');}}error(e.message);q('[data-check]').hidden=false;}
  finally{pending=false;}
 };
 q('[data-check]').onclick=async()=>{if(pending||!alive())return;pending=true;try{const s=await api(identity.agentId,'status');if(alive())show(s);}catch(e){error(e.message);}finally{pending=false;}};
}
