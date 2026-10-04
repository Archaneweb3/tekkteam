import {Buffer} from 'buffer';
import {agentLaunchData,assertAgentLaunch} from './agent-launch-data.js';
import {validateLaunchEvidence,verifyLaunchTransaction} from './pump-launch-validation.js';
import {parseInitialBuy,buyLamports} from './initial-buy.js';
import {launchBalancePreflight,launchProductError,launchDiagnostics} from './pump-launch-preflight.js';
import {deriveLaunchViewState} from './pump-launch-view-state.js';
import {mountPumpPreparation} from './pump-preparation-ui.js';

async function api(path,body){
 let r;try{r=await fetch('/api/pump-launch/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});}catch{throw Object.assign(Error('Launch service unavailable'),{code:'LAUNCH_SERVICE_UNAVAILABLE'});}
 let data;try{data=await r.json();}catch{throw Object.assign(Error('Launch service unavailable'),{code:'LAUNCH_SERVICE_UNAVAILABLE'});}
 if(!r.ok)throw Object.assign(Error(data.error||'Launch service unavailable'),{code:data.code||([502,503,504].includes(r.status)?'LAUNCH_SERVICE_UNAVAILABLE':undefined),receipt:data.receipt,attempt:data.attempt});return data;
}
export function mountPumpLaunch(host,{agent,isCurrent=()=>true,preparationOnly=globalThis.window?.TekkworkWalletTestOnly===true,getWallet=()=>{throw Error('Owner wallet signing context unavailable');}}={}){
 if(preparationOnly)return mountPumpPreparation(host,{agent,isCurrent,getWallet});
 const identity=agentLaunchData(agent),owner=identity.owner;
 const alive=()=>host.isConnected&&isCurrent();
 const selected=()=>{if(!alive())throw Error('Selected agent changed. Launch stopped.');};
 const freshIdentity=async()=>{selected();const r=await fetch('/api/agents/'+encodeURIComponent(identity.agentId));if(!r.ok)throw Error('Agent owner session unavailable');assertAgentLaunch(identity,agentLaunchData(await r.json()));selected();};
 const endpoint=path=>path+'?agentId='+encodeURIComponent(identity.agentId);
 host.innerHTML=`<header class="tw-launch-head tw-world-section-head"><div><span class="tw-world-eyebrow">TOKEN LAUNCH</span><h2 data-heading>LAUNCH TOKEN</h2><p data-token></p></div><span class="tw-launch-network">SOLANA MAINNET</span></header><ol class="tw-launch-steps" aria-label="Launch steps"><li data-launch-step="review"><b>01</b> REVIEW</li><li data-launch-step="prepare"><b>02</b> PREPARE</li><li data-launch-step="approve"><b>03</b> APPROVE</li></ol><div class="tw-launch-payer"><span>PAYER</span><strong>Owner Wallet · ${owner.slice(0,5)}…${owner.slice(-6)}</strong></div><label class="tw-field tw-initial-buy">INITIAL BUY <button type="button" class="tw-launch-help" title="Optional SOL purchase at launch. Zero is supported." aria-label="About initial buy">?</button><span class="tw-launch-input"><input data-buy type="number" min="0" step="0.000000001" value="0" inputmode="decimal"><span>SOL</span></span><small>Optional · 0 SOL is supported</small></label><section class="tw-launch-summary" data-summary aria-label="Launch cost"></section><p class="tw-launch-note">Your Owner Wallet approves the final Mainnet transaction. No approval happens during preparation.</p><p data-status role="status" aria-live="polite">Checking this agent's launch state…</p><div class="tw-launch-actions"><button class="tw-world-cta primary" data-prepare disabled>CONNECT WALLET &amp; PREPARE</button><button class="tw-world-cta primary" data-approve hidden>APPROVE IN WALLET →</button><button class="tw-world-cta primary" data-check hidden>RECHECK STATUS →</button><button class="tw-world-cta primary" data-try-again hidden>TRY AGAIN →</button><button class="tw-world-cta secondary" data-refresh-balance hidden>REFRESH BALANCE</button></div><div class="tw-launch-error" role="alert" data-error hidden></div><div data-result></div>`;
 const q=s=>host.querySelector(s),status=s=>{if(alive())q('[data-status]').textContent=s;};
 host.dataset.launchPhase='review';
 q('[data-token]').textContent=identity.name+' / $'+identity.symbol;
 let prepared=null,used=false,approvalStarted=false,replaceId=null,preparing=false,confirmedNotified=false,balance=null,statusReady=false,rechecking=false;
 const sol=n=>(n/1e9).toFixed(9)+' SOL';
 const setError=(title,message,code)=>{if(!alive())return;const box=q('[data-error]');box.replaceChildren();box.hidden=!title;if(title){const heading=document.createElement('strong'),copy=document.createElement('span');heading.textContent=title;copy.textContent=message;box.append(heading,copy);if(typeof code==='string'&&/^[A-Z0-9_]{3,60}$/.test(code)){const details=document.createElement('details'),summary=document.createElement('summary'),technical=document.createElement('code');summary.textContent='Technical details';technical.textContent='Code: '+code;details.append(summary,technical);box.append(details);}}};
 const preflight=()=>launchBalancePreflight(q('[data-buy]').value,balance?.lamports);
 function renderPreflight(){const panel=q('[data-summary]');panel.replaceChildren();const heading=document.createElement('h3');heading.textContent='LAUNCH COST';panel.append(heading);let check;try{check=preflight();}catch{check=null;}
  for(const [label,value] of [['Initial buy',check?sol(check.buyLamports):'Enter a valid amount'],['Estimated launch costs','Calculated during preparation'],['Network / account costs','Calculated during preparation'],['Required balance',check?`More than ${sol(check.minimumKnownLamports)}; exact costs pending simulation`:'Unavailable'],['Available balance',balance?sol(balance.lamports):'Unavailable']]){const row=document.createElement('div'),name=document.createElement('span'),amount=document.createElement('strong');name.textContent=label;amount.textContent=value;row.append(name,amount);panel.append(row);}
  if(check?.insufficient){setError('NOT ENOUGH SOL',"Your wallet doesn't have enough SOL for the initial buy and launch costs. Reduce the initial buy or add SOL to your wallet.");}else if(!check){setError('INVALID INITIAL BUY','Enter a non-negative SOL amount with at most 9 decimals.');}
 }
 function syncPrepare(){if(!alive())return;let valid=true;try{valid=!preflight().insufficient;}catch{valid=false;}q('[data-prepare]').disabled=!statusReady||!balance||!valid||used||preparing||approvalStarted;q('[data-prepare]').textContent=preparing?'PREPARING...':'PREPARE LAUNCH';q('[data-refresh-balance]').hidden=!!balance;if(!prepared)renderPreflight();}
 async function refreshBalance(){if(!alive())return;balance=null;syncPrepare();try{const r=await fetch('/api/wallet/mainnet-balance?refresh=1',{signal:AbortSignal.timeout(15000)}),data=await r.json();selected();if(!r.ok||data.owner!==owner||data.network!=='solana:101'||!Number.isSafeInteger(data.lamports)||data.lamports<0||!Number.isFinite(data.checkedAt)||Date.now()-data.checkedAt>30000)throw Error('Balance unavailable');balance=data;setError('','');}catch{if(!alive())return;balance=null;setError('BALANCE UNAVAILABLE','Could not verify your Owner Wallet balance on Solana Mainnet. Refresh balance before preparing.');}syncPrepare();}
 q('[data-refresh-balance]').onclick=refreshBalance;
 q('[data-buy]').oninput=()=>{if(approvalStarted||preparing)return;replaceId=prepared?.id??replaceId;prepared=null;used=false;q('[data-approve]').hidden=true;setError('','');status('Preparation required');syncPrepare();};
 const showError=e=>{
  if(!alive())return;
  const product=launchProductError(e);setError(product.title,product.message,e.code);status('Stopped');q('[data-approve]').hidden=true;
  const report=launchDiagnostics(e);
  if(Object.keys(report).length){
   const box=q('[data-error]'),details=document.createElement('details'),summary=document.createElement('summary'),technical=document.createElement('pre'),copy=document.createElement('button'),feedback=document.createElement('span');
   const brief=document.createElement('span');brief.textContent=`Failure stage: ${report.failureStage??'Service unavailable'} · Error: ${report.failureCode??report.code??'UNKNOWN'} · Attempt: ${report.attemptId??'Not received by launch service'}`;box.append(brief);
   summary.textContent='Preparation diagnostics';technical.textContent=JSON.stringify(report,null,2);technical.style.whiteSpace='pre-wrap';technical.style.overflowWrap='anywhere';
   copy.type='button';copy.className='tw-button ghost';copy.textContent='Copy diagnostics';feedback.setAttribute('role','status');
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(technical.textContent);feedback.textContent='Diagnostics copied.';}catch{details.open=true;feedback.textContent='Clipboard unavailable. Select and copy the diagnostics below.';}};
   details.append(summary,technical);box.append(copy,feedback,details);
  }
  if(e.receipt?.signature)showReceipt(e.receipt);
 };
 function showReceipt(r){
  if(!alive())return;
  if(r.agentId!==identity.agentId||r.owner!==owner||r.network!=='solana:101')throw Error('Receipt identity mismatch');
  const view=deriveLaunchViewState({receipt:r});
  q('[data-prepare]').hidden=true;q('[data-approve]').hidden=true;
  q('[data-buy]').disabled=true;
  q('[data-buy]').closest('label').hidden=true;q('[data-summary]').hidden=true;
  if(view.showSuccess){host.dataset.launchPhase='success';q('[data-heading]').textContent='TOKEN LAUNCHED';q('[data-token]').textContent=r.tokenName+' / $'+r.symbol;if(!confirmedNotified){confirmedNotified=true;window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));}}
  else if(view.showPending){host.dataset.launchPhase='pending';q('[data-heading]').textContent='CHECKING LAUNCH STATUS';}
  else if(view.hasHistoricalTransaction){host.dataset.launchPhase='recovery';q('[data-heading]').textContent=r.canStartFreshPreparation===true?'TOKEN NOT LAUNCHED':'VERIFYING PREVIOUS LAUNCH';}
  q('.tw-launch-steps').hidden=view.hasHistoricalTransaction||view.showSuccess;
  const result=q('[data-result]');result.replaceChildren();
  const heading=document.createElement('strong');heading.className='tw-launch-result-heading';heading.textContent=view.showSuccess?'TOKEN LAUNCHED':view.hasHistoricalTransaction?(r.canStartFreshPreparation===true?'TOKEN NOT LAUNCHED':'VERIFYING PREVIOUS LAUNCH'):'LAUNCH STATUS';result.append(heading);
  if(r.latestAttempt?.status){const attempt=document.createElement('p');attempt.className='tw-launch-attempt';attempt.textContent='Latest preparation attempt: '+r.latestAttempt.status+(r.latestAttempt.status==='FAILED'&&r.latestAttempt.failureCode?' · '+r.latestAttempt.failureCode:'');result.append(attempt);}
  if(view.hasHistoricalTransaction&&!view.showSuccess){const note=document.createElement('p');note.textContent=r.canStartFreshPreparation===true?'The previous attempt ended. No token was created. Review a fresh launch before preparing.':"The previous transaction wasn't confirmed. Verify its status before trying again.";result.append(note);}
  for(const [label,value] of [['Mint',r.mint],['Initial buy',r.initialBuyLamports==null?null:(r.initialBuyLamports/1e9).toFixed(9)+' SOL'],['Transaction',r.signature],['Observed SOL spent',r.observedSpendLamports==null?null:(r.observedSpendLamports/1e9).toFixed(9)+' SOL']])if(value!=null){if(view.hasHistoricalTransaction&&!view.showSuccess&&label==='Initial buy')continue;const p=document.createElement('p'),caption=document.createElement('span'),text=document.createElement('strong');caption.textContent=(label==='Mint'&&!view.showSuccess?'Prepared mint · unverified':label)+': ';text.textContent=label==='Mint'||label==='Transaction'?value.slice(0,6)+'…'+value.slice(-6):value;text.title=value;p.append(caption,text);if(label==='Mint'||label==='Transaction'){const copy=document.createElement('button');copy.type='button';copy.className='tw-launch-copy';copy.textContent='COPY';copy.setAttribute('aria-label','Copy full '+label.toLowerCase());copy.onclick=async()=>{try{await navigator.clipboard.writeText(value);copy.textContent='COPIED ✓';setTimeout(()=>{if(copy.isConnected)copy.textContent='COPY';},1700);}catch{copy.textContent='COPY FAILED';}};p.append(copy);}result.append(p);}
  for(const [label,url] of [['VIEW ON SOLANA ↗',r.signature?`https://explorer.solana.com/tx/${encodeURIComponent(r.signature)}`:null],['VIEW ON PUMP.FUN ↗',view.showSuccess?`https://pump.fun/coin/${encodeURIComponent(r.mint)}`:null]])if(url){const a=document.createElement('a');a.className='tw-button';a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';result.append(a);}
  status(view.showSuccess?'Confirmed on Mainnet':view.hasHistoricalTransaction?(r.canStartFreshPreparation===true?'Previous attempt ended':'Reconciliation required'):r.status);
  setError('','');
  if(r.error||r.notice){const details=document.createElement('details'),summary=document.createElement('summary'),copy=document.createElement('p');summary.textContent='Technical details';copy.textContent=String(r.error||r.notice).slice(0,220);details.append(summary,copy);result.append(details);}
  q('[data-check]').hidden=!r.signature||view.showSuccess||r.canStartFreshPreparation===true;
  q('[data-try-again]').hidden=!view.hasHistoricalTransaction||view.showSuccess||r.canStartFreshPreparation!==true;
 }
 async function restoreUnsigned(r){
  if(!['Prepared','Awaiting approval'].includes(r.status)||r.signature||r.broadcastAttempted)return false;
  if(r.agentId!==identity.agentId||r.owner!==owner||r.network!=='solana:101')throw Error('Receipt identity mismatch');
  replaceId=r.id;prepared=null;used=false;approvalStarted=false;statusReady=true;
  q('[data-buy]').value=String((r.initialBuyLamports??0)/1e9);q('[data-buy]').disabled=false;q('[data-buy]').closest('label').hidden=false;q('[data-summary]').hidden=false;q('[data-prepare]').hidden=false;q('[data-approve]').hidden=true;
  status(r.status==='Awaiting approval'?'Previous approval must expire before a fresh preparation. Nothing will be retried automatically.':'Prepare again for a fresh simulation');
  await refreshBalance();return true;
 }
 async function check(){selected();const r=await api(endpoint('status'));selected();if(!await restoreUnsigned(r))showReceipt(r);return r;}
 q('[data-check]').onclick=async e=>{if(rechecking||!alive())return;rechecking=true;e.target.disabled=true;e.target.textContent='RECHECKING...';try{await check();}catch(err){showError(err);}finally{rechecking=false;if(alive()){e.target.disabled=false;e.target.textContent='RECHECK STATUS →';}}};
 q('[data-try-again]').onclick=async()=>{
  if(!alive())return;
  try{const r=await api(endpoint('status'));selected();if(r.canStartFreshPreparation!==true||r.confirmed||!r.signature){showReceipt(r);return;}
   used=false;prepared=null;replaceId=null;approvalStarted=false;statusReady=true;q('[data-try-again]').hidden=true;q('[data-check]').hidden=true;q('[data-result]').replaceChildren();q('[data-buy]').value='';q('[data-buy]').disabled=false;q('[data-buy]').closest('label').hidden=false;q('[data-summary]').hidden=false;q('.tw-launch-steps').hidden=false;q('[data-heading]').textContent='LAUNCH TOKEN';host.dataset.launchPhase='review';status('Review a new initial buy before preparing');renderPreflight();await refreshBalance();if(alive())q('[data-prepare]').hidden=false;
  }catch(error){showError(error);}
 };
 q('[data-prepare]').onclick=async e=>{
  if(used||preparing)return;used=true;preparing=true;e.target.disabled=true;q('[data-buy]').disabled=true;status('Checking Mainnet balance');setError('','');
  host.dataset.launchPhase='prepare';
  const attemptId=crypto.randomUUID();let attemptStage='PAYER_BALANCE';
  const remember=(state,stage,code)=>{try{localStorage.setItem('tekkwork:pump-prepare-last:'+identity.agentId,JSON.stringify({attemptId,agentId:identity.agentId,createdAt:new Date().toISOString(),status:state,stage,code}));}catch{}};
  remember('IN_PROGRESS',attemptStage,null);
  try{
   const initialBuy=q('[data-buy]').value,amount=parseInitialBuy(initialBuy);
   await refreshBalance();
   if(!balance)throw Object.assign(Error('Mainnet balance unavailable'),{code:'BALANCE_UNAVAILABLE'});
   if(preflight().insufficient)throw Object.assign(Error('Insufficient Mainnet SOL for initial buy and launch costs'),{code:'INSUFFICIENT_LAUNCH_BALANCE'});
   attemptStage='OWNER_AUTH';remember('IN_PROGRESS',attemptStage,null);
   await freshIdentity();
   const provider=getWallet(owner);
   attemptStage='OWNERSHIP_CHECK';remember('IN_PROGRESS',attemptStage,null);
   provider.assertBound();
   attemptStage='REQUEST_RECEIVED';remember('IN_PROGRESS',attemptStage,null);
   selected();prepared=await api('prepare',{attemptId,agentId:identity.agentId,agent:identity,payer:owner,initialBuy,replacePreparationId:replaceId});attemptStage='FRONTEND_VALIDATION';remember('IN_PROGRESS',attemptStage,null);replaceId=prepared.id;selected();assertAgentLaunch(identity,prepared.evidence.launch);if(buyLamports(prepared.evidence.launch)!==amount)throw Error('Initial buy mismatch');const policy=validateLaunchEvidence(prepared.evidence);
   verifyLaunchTransaction(prepared.evidence.walletTransactionBase64,prepared.evidence,false);
   const summary=q('[data-summary]');summary.replaceChildren();
   const sol=n=>(n/1e9).toFixed(9)+' SOL';
   const heading=document.createElement('h3');heading.textContent='Launch summary';summary.append(heading);
   for(const [label,value] of [['Token',identity.name+' / $'+identity.symbol],['Initial buy',sol(amount)],['Validated launch overhead',sol(policy.validatedOverheadLamports)],['Estimated total',sol(policy.estimatedPayerDebitLamports)],['Owner Wallet balance',sol(policy.payerPreBalance)],['Estimated remaining',sol(policy.payerPostBalance)],['Network','Solana Mainnet / solana:101'],['Spending policy','PASS — selected buy + validated overhead'],['Mint',prepared.evidence.mint]]){const row=document.createElement('div'),name=document.createElement('span'),valueNode=document.createElement('strong');name.textContent=label;valueNode.textContent=value;row.append(name,valueNode);summary.append(row);}
   remember('PREPARED','PREPARED',null);host.dataset.launchPhase='approve';status('READY FOR APPROVAL · review before opening your wallet');q('[data-approve]').hidden=false;
  }catch(err){if(!alive())return;host.dataset.launchPhase='review';const code=typeof err.code==='string'&&/^[A-Z0-9_]{3,60}$/.test(err.code)?err.code:'FRONTEND_PREPARE_FAILED';if(!err.attempt)err.attempt={attemptId,status:attemptStage==='FRONTEND_VALIDATION'?'PREPARED_SERVER_REJECTED_CLIENT':'FAILED',failureStage:attemptStage,failureCode:code};remember(err.attempt.status,err.attempt.failureStage??attemptStage,err.attempt.failureCode??code);showError(err);used=false;}finally{preparing=false;if(alive()){q('[data-buy]').disabled=false;syncPrepare();}}
 };
 q('[data-approve]').onclick=async e=>{
  if(approvalStarted||!prepared)return;approvalStarted=true;e.target.disabled=true;
  try{
   await freshIdentity();
   const receipt=await api(endpoint('status'));selected();
   if(receipt.agentId!==identity.agentId||receipt.id!==prepared.id||receipt.status!=='Prepared'||receipt.confirmed)throw Error('Agent already launched or preparation changed');
   assertAgentLaunch(identity,prepared.evidence.launch);
   if(parseInitialBuy(q('[data-buy]').value)!==buyLamports(prepared.evidence.launch))throw Error('Initial buy changed. Prepare again.');
   if(prepared.evidence.metadataUri!==receipt.metadataUri)throw Error('Metadata identity mismatch');
   const provider=getWallet(owner);
   if(Date.now()-Date.parse(prepared.evidence.createdAt)>45000)throw Error('Review expired. Nothing signed or broadcast.');
   const tx=verifyLaunchTransaction(prepared.evidence.walletTransactionBase64,prepared.evidence,false);
   await api('review',{agentId:identity.agentId,id:prepared.id,initialBuy:q('[data-buy]').value});
   selected();q('[data-buy]').disabled=true;
   status('Awaiting wallet approval');
   const serialized=await provider.signTransaction(Buffer.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})).toString('base64'));
   verifyLaunchTransaction(serialized,prepared.evidence,true);
   selected();provider.assertBound();
   status('Broadcasting');
   const submitted=await api('submit',{agentId:identity.agentId,id:prepared.id,transaction:serialized});selected();showReceipt(submitted);
   status('Confirming');
   // Polling is read-only. It NEVER submits/retries a transaction.
   for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,2000));if(!alive())return;const r=await check();if(['Success','Failed'].includes(r.status))return;}
   setError('CONFIRMATION PENDING','Use Check confirmation; no transaction will be resent.');
  }catch(err){if(!alive())return;showError(err);q('[data-check]').hidden=false;}
 };
 // Restore a public receipt after navigation/reload, never resume signing or sending.
 api(endpoint('status')).then(async r=>{if(!alive())return;if(await restoreUnsigned(r))return;if(r.status!=='Idle'){used=true;showReceipt(r);}else{status('Ready to prepare this agent');statusReady=true;await refreshBalance();if(alive()&&r.latestAttempt?.status==='FAILED')setError('LATEST PREPARATION FAILED',r.latestAttempt.sanitizedMessage||'The previous preparation stopped before a transaction was submitted.',r.latestAttempt.failureCode);}}).catch(e=>{if(!alive())return;const product=launchProductError(e);setError(product.title,product.message,e.code);status('Launch status unavailable');});
}
