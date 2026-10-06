import {Buffer} from 'buffer';
import {Transaction} from '@solana/web3.js';
import {agentLaunchData,assertAgentLaunch} from './agent-launch-data.js';
import {validatePreparation} from './pump-preparation-ui.js';
import {assertActionTimeHandoff} from './pump-action-time.js';
import {FINAL_MESSAGE_POLICY,validateFinalWalletMessage} from './pump-wallet-final.js';
const sol=n=>Number.isSafeInteger(n)?(n/1e9).toFixed(9)+' SOL':'Unavailable';
async function api(id,action,body){
 const response=await fetch('/api/launchpad/agents/'+encodeURIComponent(id)+'/execution/'+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});
 let result;try{result=await response.json();}catch{throw Error('Launch service unavailable. Recheck before another action.');}
 if(!response.ok)throw Object.assign(Error(result.code||result.error||'Launch unavailable'),{code:result.code});return result;
}
export function mountM4ActionTimeLaunch(host,{agent,isCurrent,getM4Wallet,capability}){
 const identity=agentLaunchData(agent),target=capability.m4Target,alive=()=>host.isConnected&&isCurrent();
 if(Object.keys(identity).filter(k=>Object.hasOwn(target,k)).some(k=>identity[k]!==target[k])){host.textContent='Launch is unavailable for this saved Agent.';return;}
 let pending=false,current=null,estimate=null,uncertain=false;
 host.innerHTML='<div class="tw-launch-head"><h2>Review your launch</h2><p>Solana Mainnet · Initial buy 0 SOL · Review ceiling 0.01 SOL. Confirm manually in your wallet.</p></div><div class="tw-launch-summary" data-summary></div><p role="status" data-status>Checking launch state…</p><p role="alert" data-error></p><div class="tw-launch-actions"><button class="tw-button primary" data-prepare disabled>Review launch costs</button><button class="tw-button primary" data-approve disabled>Continue to Wallet</button><button class="tw-button" data-check>Recheck status</button></div>';
 const q=s=>host.querySelector(s),status=text=>{if(alive())q('[data-status]').textContent=text;},error=text=>{if(alive())q('[data-error]').textContent=text;};
 const canPrepare=()=>!uncertain&&current&&!current.isolation?.attemptConsumed&&!current.broadcastAttempted&&(!current.signature&&['NOT_STARTED','READY_FOR_REVIEW','USER_REJECTED','TRANSACTION_EXPIRED'].includes(current.status)||['SIGNED','SIGNED_NOT_BROADCAST','OWNER_APPROVED','OWNER_APPROVED_NOT_BROADCAST'].includes(current.status));
 const local=()=>{if(!alive())throw Error('Launch dialog or selected Agent changed');getM4Wallet(identity.owner).assertBound();};
 const bound=async()=>{local();const response=await fetch('/api/agents/'+encodeURIComponent(identity.agentId));if(!response.ok)throw Error('Owner session unavailable');assertAgentLaunch(identity,agentLaunchData(await response.json()));local();};
 function render(){
  if(!alive())return;
  q('[data-prepare]').disabled=pending||!canPrepare()||!!current?.signature;q('[data-approve]').disabled=pending||!canPrepare();q('[data-check]').disabled=pending;
  q('[data-approve]').textContent=['TRANSACTION_EXPIRED','SIGNED','SIGNED_NOT_BROADCAST','OWNER_APPROVED','OWNER_APPROVED_NOT_BROADCAST'].includes(current?.status)?'Prepare Again':'Continue to Wallet';
  const r=estimate??current?.result,v=r?.executionReview,root=q('[data-summary]');root.replaceChildren();
  const row=(label,value,where=root)=>{const el=document.createElement('div'),key=document.createElement('span'),text=document.createElement('strong');key.textContent=label;text.textContent=value;text.style.overflowWrap='anywhere';el.append(key,text);where.append(el);};
  row('AGENT',identity.agentName);row('COIN',identity.name+' / '+identity.symbol);row('NETWORK','Solana Mainnet Beta');row('OWNER',identity.owner);
  if(r){
   row('NETWORK FEE',sol(v.networkFeeLamports));row('OTHER REQUIRED DEBIT',sol(v.otherRequiredDebitLamports));row('ESTIMATED TOTAL DEBIT',sol(v.reviewedDebitLamports));row('REVIEW CEILING',sol(v.ceilingLamports));row('INITIAL BUY','0 SOL');row('BALANCE AFTER LAUNCH · estimate',sol(v.expectedRemainingBalanceLamports));
   const note=document.createElement('p');note.textContent='This estimate stays readable. Continue to Wallet prepares a new transaction and checks current fees, balance and simulation. Your wallet shows the final transaction.';root.append(note);
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Advanced transaction details';details.append(summary);
   for(const [label,value]of [['Prepared',r.createdAt],['Mint · candidate until confirmed',r.mint],['Metadata',r.metadataUri],['Base fee',sol(v.baseFeeLamports??r.policy?.baseFeeLamports)],['Priority fee',sol(v.priorityFeeLamports)],['Simulation',r.simulation.status],['Review digest',v.digest],['Message SHA256',v.messageSha256??'Historical message; see operator evidence'],['Last valid block height',String(r.lastValidBlockHeight)],['Validity',v.version===2?'Solana blockhash; checked again before broadcast':'Informational snapshot; not execution permission']])row(label,value,details);
   root.append(details);
  }
  const labels={NOT_STARTED:'Review costs, then continue to your wallet.',READY_FOR_REVIEW:'Estimate available. Continue prepares a fresh transaction.',USER_REJECTED:'Wallet request cancelled. Your Agent and draft are saved.',TRANSACTION_EXPIRED:'TRANSACTION EXPIRED — PREPARE AGAIN',AWAITING_WALLET_APPROVAL:'Waiting for wallet. Do not open a second request.',SIGNED_NOT_BROADCAST:'Transaction was signed but not broadcast. Recheck before another action.',SUBMITTED:'Submitting…',CONFIRMING:'Confirming on Solana…',CONFIRMATION_UNKNOWN:'Confirmation pending. Recheck the same transaction.',RECONCILIATION_REQUIRED:'Launch needs reconciliation. Do not launch again.',FAILED_ON_CHAIN:'Transaction failed on Solana. No new launch was started.',LAUNCHED:'Token launched. Set up your Agent next. Trading remains off.'};
  status(labels[current?.status]??'Checking launch state…');
  if(['SIGNED','OWNER_APPROVED','OWNER_APPROVED_NOT_BROADCAST'].includes(current?.status))status('Signed transaction recorded; broadcast was not claimed. Prepare Again first verifies expiry and absence on Solana.');
  if(current?.status==='SIGNED_NOT_BROADCAST'&&['M4_BLOCKHASH_EXPIRED','EXECUTION_REVIEW_EXPIRED'].includes(current.error))status('TRANSACTION EXPIRED — PREPARE AGAIN');
  if(current?.isolation?.attemptConsumed&&['USER_REJECTED','TRANSACTION_EXPIRED','SIGNED','SIGNED_NOT_BROADCAST','OWNER_APPROVED_NOT_BROADCAST'].includes(current.status)){status('This one-operation approval has been consumed. No retry is authorized. Recheck the existing transaction only.');q('[data-approve]').textContent='Attempt consumed';}
  if(uncertain)status('Launch state unavailable. Recheck before another action.');
  if(current?.signature)row('TRANSACTION',current.signature);
  if(current?.status==='LAUNCHED'){
   row('MINT / CA',current.result.mint);const link=document.createElement('a');link.className='tw-button primary';link.href='#/agent/'+encodeURIComponent(identity.agentId);link.textContent='View Agent';root.append(link);
   if(current.provisioning?.status!=='READY')status('Token launched. Agent setup is reconciling; do not launch again.');
   window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));
  }
 }
 const refresh=async()=>{try{let next=await api(identity.agentId,'wallet-status');if(next.broadcastAttempted||next.status==='LAUNCHED')next=await api(identity.agentId,'status');current=next;uncertain=false;render();}catch(e){uncertain=true;render();throw e;}};
 const explain=e=>['M4_RECOVERY_BLOCKHASH_STILL_VALID','M4_RECOVERY_REVIEW_STILL_VALID'].includes(e.code)?'The previous transaction can still be valid. Wait for it to expire, then choose Prepare Again.':e.code==='M4_WALLET_BLOCKHASH_TOO_OLD'?'The transaction is too close to expiry. Recheck status, then prepare again.':e.code==='M4_BLOCKHASH_EXPIRED'?'TRANSACTION EXPIRED — PREPARE AGAIN':e.message;
 refresh().catch(e=>error(explain(e)));
 q('[data-prepare]').onclick=async()=>{
  if(pending||!alive()||!canPrepare()||current.signature)return;pending=true;render();error('');status('Preparing review…');
  try{await bound();const s=await api(identity.agentId,'estimate',{initialBuy:'0',requestId:crypto.randomUUID()});await validatePreparation(s.result,identity,0);local();estimate=s.result;}
  catch(e){error(explain(e));}finally{pending=false;render();}
 };
 q('[data-approve]').onclick=async()=>{
  if(pending||!alive()||!canPrepare())return;pending=true;render();error('');status('Preparing transaction…');let prepared,request;
  try{
   await bound();
   prepared=await api(identity.agentId,'wallet-prepare',{initialBuy:'0',requestId:crypto.randomUUID(),...(current.executionId?{previousExecutionId:current.executionId}:{})});
   current=prepared;estimate=null;render();local();
   if(prepared.status!=='AWAITING_WALLET_APPROVAL'||typeof prepared.walletTransactionBase64!=='string')throw Error('Wallet request already recorded. Recheck status; no duplicate request was opened.');
   await validatePreparation(prepared.result,identity,0);assertActionTimeHandoff(prepared.result,prepared.walletValidity);local();
   request={requestId:prepared.executionId,reviewDigest:prepared.result.executionReview.digest,transactionBase64:prepared.result.transactionBase64};
   status('Opening wallet… Confirm the transaction manually.');
   const signedTransactionBase64=await getM4Wallet(identity.owner).signTransaction(prepared.walletTransactionBase64,prepared,local);
   local();const signed=Transaction.from(Buffer.from(signedTransactionBase64,'base64')),unsigned=Transaction.from(Buffer.from(request.transactionBase64,'base64'));
   if(prepared.walletMessagePolicy===FINAL_MESSAGE_POLICY)validateFinalWalletMessage(request.transactionBase64,signedTransactionBase64,prepared.result,{Transaction,Buffer},false);
   else if(!signed.signature||!signed.verifySignatures(false)||signed.signatures.length!==2||signed.signatures[1].signature!==null||!signed.serializeMessage().equals(unsigned.serializeMessage()))throw Error('Wallet changed the reviewed transaction. Nothing was broadcast.');
   status('Submitting…');current=await api(identity.agentId,'submit',{...request,signedTransactionBase64});render();
   for(let count=0;count<15&&alive()&&current.broadcastAttempted&&['SUBMITTED','CONFIRMING','CONFIRMATION_UNKNOWN'].includes(current.status);count++){await new Promise(resolve=>setTimeout(resolve,5000));current=await api(identity.agentId,'status');render();}
  }catch(e){
   if(request&&e.walletRequestOpened===true&&(e.code===4001||/reject|denied|declin/i.test(e.message))){try{current=await api(identity.agentId,'reject',{requestId:request.requestId});}catch{}}
   try{await refresh();}catch{status('Launch state unavailable. Recheck before another action.');}
   error(explain(e));
  }finally{pending=false;render();}
 };
 q('[data-check]').onclick=async()=>{if(pending||!alive())return;pending=true;render();try{await refresh();error('');}catch(e){error(explain(e));}finally{pending=false;render();}};
}
