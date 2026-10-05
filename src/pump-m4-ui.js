import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {agentLaunchData,assertAgentLaunch} from './agent-launch-data.js';
import {validatePreparation} from './pump-preparation-ui.js';
const sol=n=>Number.isSafeInteger(n)?(n/1e9).toFixed(9)+' SOL':'UNAVAILABLE';
async function api(id,action,body){const response=await fetch('/api/launchpad/agents/'+encodeURIComponent(id)+'/execution/'+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.code||result.error||'Controlled launch unavailable'),{code:result.code});return result;}
export function mountM4Launch(host,{agent,isCurrent,getM4Wallet,capability}){
 const identity=agentLaunchData(agent),target=capability.m4Target,alive=()=>host.isConnected&&isCurrent();
 if(Object.keys(identity).filter(k=>Object.hasOwn(target,k)).some(k=>identity[k]!==target[k])){host.textContent='M4 is authorized for a different saved Agent and coin. No transaction is available.';return;}
 let pending=false,current=null,opened=false,timer;
 host.innerHTML='<div class="tw-launch-head"><h2>Review your launch</h2><p>Manual owner approval · Mainnet · initial buy 0 SOL · review ceiling 0.01 SOL. Agent funding and trading remain disabled.</p></div><div class="tw-launch-summary" data-summary></div><p role="status" data-status>Checking execution state…</p><p role="alert" data-error></p><div class="tw-launch-actions"><button class="tw-button primary" data-prepare disabled>Review launch costs</button><button class="tw-button primary" data-approve disabled>Approve one launch in Phantom</button><button class="tw-button" data-check hidden>Recheck confirmation</button></div>';
 const q=s=>host.querySelector(s),status=t=>{if(alive())q('[data-status]').textContent=t;},error=t=>{if(alive())q('[data-error]').textContent=t;};
 const technical=new Set(['METADATA URI','FRESH CONTEXT SLOT','SIMULATION RESULT','TRANSACTION DIGEST','REVIEW EXPIRY','GUARANTEE']);
 const rows=items=>{q('[data-summary]').replaceChildren();const details=document.createElement('details'),heading=document.createElement('summary');heading.textContent='Advanced transaction details';details.append(heading);for(const [label,value]of items){const row=document.createElement('div'),name=document.createElement('span'),text=document.createElement('strong');name.textContent=label;text.textContent=value;text.style.overflowWrap='anywhere';row.append(name,text);(technical.has(label)?details:q('[data-summary]')).append(row);}q('[data-summary]').append(details);};
 function show(s){
  current=s;clearTimeout(timer);opened=s.walletApprovalOpened===true;status(s.status);q('[data-approve]').disabled=true;q('[data-prepare]').disabled=true;
  const r=s.result,v=r?.executionReview;
  if(r)rows([['OWNER',identity.owner],['AGENT',identity.agentName],['COIN',identity.name+' / '+identity.symbol],['MINT',r.mint],['NETWORK','Solana Mainnet Beta'],['METADATA URI',r.metadataUri],['FRESH CONTEXT SLOT',String(v.simulationSlot)],['SIMULATION RESULT',r.simulation.status],['NETWORK FEE',sol(v.networkFeeLamports)],['OTHER REQUIRED DEBIT',sol(v.otherRequiredDebitLamports)],['TOTAL REVIEWED DEBIT',sol(v.reviewedDebitLamports)],['REVIEW CEILING',sol(v.ceilingLamports)],['PROJECTED BALANCE AFTER LAUNCH',sol(v.expectedRemainingBalanceLamports)],['REQUIRED RESERVE',sol(v.minimumReserveLamports)],['INITIAL BUY','0 SOL'],['TRANSACTION DIGEST',v.digest],['REVIEW EXPIRY',new Date(v.expiresAt).toISOString()],['GUARANTEE','EXECUTION_GUARDED · no absolute on-chain maximum']]);
  if(s.signature){const p=document.createElement('p');p.textContent='Transaction: '+s.signature;p.style.overflowWrap='anywhere';q('[data-summary]').append(p);}
  if(s.status==='LAUNCHED'){status('LAUNCHED · finalized Pump receipt verified. Next: Configure / Fund Agent. Trading remains OFF.');const p=document.createElement('p');p.textContent='Confirmed slot '+s.confirmation.confirmedSlot+' · '+new Date(s.confirmation.confirmedAt).toISOString();q('[data-summary]').append(p);const link=document.createElement('a');link.className='tw-button primary';link.href='#/agent/'+encodeURIComponent(identity.agentId);link.textContent='View Agent';q('[data-summary]').append(link);if(s.provisioning?.status==='READY'){const ready=document.createElement('p');ready.textContent='Agent wallet ready. Funding and trading require separate approval.';q('[data-summary]').append(ready);}else if(s.provisioning?.status==='RECONCILIATION_REQUIRED'){status('Coin launched. Agent wallet setup needs reconciliation; do not launch again.');q('[data-check]').hidden=false;}window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));return;}
  if(s.broadcastAttempted){q('[data-check]').hidden=false;return;}
  if(s.status==='NOT_STARTED'){q('[data-prepare]').disabled=false;return;}
  if(s.status==='READY_FOR_REVIEW'&&!opened){
   if(v.expiresAt>Date.now()){q('[data-approve]').disabled=false;timer=setTimeout(()=>{if(alive()){q('[data-approve]').disabled=true;q('[data-prepare]').disabled=false;status('Review expired. Prepare and inspect a fresh review; no wallet prompt opened.');}},v.expiresAt-Date.now());}
   else{q('[data-prepare]').disabled=false;status('Review expired. Prepare a fresh review.');}
  }
 }
 const assertCurrent=async()=>{if(!alive())throw Error('Selected Agent changed');const response=await fetch('/api/agents/'+encodeURIComponent(identity.agentId));if(!response.ok)throw Error('Owner session unavailable');assertAgentLaunch(identity,agentLaunchData(await response.json()));getM4Wallet(identity.owner).assertBound();if(!alive())throw Error('Dialog closed');};
 api(identity.agentId,'status').then(s=>{if(alive())show(s);}).catch(e=>error(e.message));
 q('[data-prepare]').onclick=async()=>{if(pending||opened||!alive())return;pending=true;q('[data-prepare]').disabled=true;q('[data-approve]').disabled=true;error('');status('Preparing fresh finalized metadata, fees, rent and unsigned simulation…');try{await assertCurrent();const s=await api(identity.agentId,'prepare',{initialBuy:'0',requestId:crypto.randomUUID()});await validatePreparation(s.result,identity,0);await assertCurrent();if(alive())show(s);}catch(e){error(e.message);status('Preparation stopped. No owner signature or broadcast.');if(alive()&&!opened)q('[data-prepare]').disabled=false;}finally{pending=false;}};
 q('[data-approve]').onclick=async()=>{
  if(pending||opened||!alive()||current?.status!=='READY_FOR_REVIEW')return;pending=true;opened=true;q('[data-approve]').disabled=true;q('[data-prepare]').disabled=true;error('');
  const r=current.result,request={requestId:current.executionId,reviewDigest:r.executionReview.digest,transactionBase64:r.transactionBase64};let awaiting=false;
  try{
   await assertCurrent();await validatePreparation(r,identity,0);status('Revalidating this exact review before ONE manual wallet approval…');
   const reviewed=await api(identity.agentId,'review',request);awaiting=true;await assertCurrent();await validatePreparation(reviewed.result,identity,0);
   const partial=Transaction.from(Buffer.from(reviewed.walletTransactionBase64,'base64')),unsigned=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
   if(partial.signature!==null||!partial.verifySignatures(false)||!partial.serializeMessage().equals(unsigned.serializeMessage()))throw Error('Mint signature or reviewed message changed');
   status('AWAITING_WALLET_APPROVAL · approve manually in Phantom. Exactly one create_v2; initial buy 0 SOL.');
   const signedTransactionBase64=await getM4Wallet(identity.owner).signTransaction(reviewed.walletTransactionBase64,reviewed);
   await assertCurrent();const signed=Transaction.from(Buffer.from(signedTransactionBase64,'base64'));
   if(!signed.verifySignatures(true)||!signed.serializeMessage().equals(unsigned.serializeMessage()))throw Error('Wallet changed reviewed bytes');
   status('Submitting exactly once. No automatic retry.');const s=await api(identity.agentId,'submit',{...request,signedTransactionBase64});if(alive())show(s);
   for(let attempt=0;attempt<30&&alive()&&current.status!=='LAUNCHED'&&current.status!=='FAILED_ON_CHAIN';attempt++){await new Promise(ok=>setTimeout(ok,2000));const state=await api(identity.agentId,'status');if(alive())show(state);}
  }catch(e){if(awaiting&&(e.code===4001||/reject|denied|declin/i.test(e.message))){try{const rejected=await api(identity.agentId,'reject',{requestId:request.requestId});if(alive())show(rejected);}catch{status('Approval stopped. Reconciliation required.');}}else{status('Execution stopped. No retry or new wallet approval. Recheck state.');try{const authoritative=await api(identity.agentId,'status');if(alive())show(authoritative);}catch{status('Execution state unavailable. Recheck before any further action.');}}error(e.message);q('[data-check]').hidden=false;}
  finally{pending=false;}
 };
 q('[data-check]').onclick=async()=>{if(pending||!alive())return;pending=true;try{const s=await api(identity.agentId,'status');if(alive())show(s);}catch(e){error(e.message);}finally{pending=false;}};
}
