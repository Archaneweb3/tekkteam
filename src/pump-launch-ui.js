import {Buffer} from 'buffer';
import {agentLaunchData,assertAgentLaunch} from './agent-launch-data.js';
import {validateLaunchEvidence,verifyLaunchTransaction} from './pump-launch-validation.js';
import {parseInitialBuy,buyLamports} from './initial-buy.js';

async function api(path,body){
 const r=await fetch('/api/pump-launch/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Launch service unavailable'),{receipt:data.receipt});return data;
}
export function mountPumpLaunch(host,{agent,isCurrent=()=>true}={}){
 const identity=agentLaunchData(agent),owner=identity.owner;
 const selected=()=>{if(!host.isConnected||!isCurrent())throw Error('Selected agent changed. Launch stopped.');};
 const freshIdentity=async()=>{selected();const r=await fetch('/api/agents/'+encodeURIComponent(identity.agentId));if(!r.ok)throw Error('Agent owner session unavailable');assertAgentLaunch(identity,agentLaunchData(await r.json()));selected();};
 const endpoint=path=>path+'?agentId='+encodeURIComponent(identity.agentId);
 host.innerHTML=`<span class="tw-eyebrow">TOKEN LAUNCH</span><h2 data-heading>Launch on pump.fun</h2><p>Solana Mainnet</p><p data-token></p><label class="tw-field tw-initial-buy">Initial buy (SOL)<input data-buy type="number" min="0" step="0.000000001" value="0" inputmode="decimal"></label><div class="tw-launch-summary" data-summary><h3>Launch summary</h3><p>Prepare to calculate current network and account costs.</p></div><p>Real SOL is used only after your manual Phantom approval. Launch overhead is validated separately from your initial buy.</p><p data-status role="status" aria-live="polite">Checking this agent's launch state…</p><button class="tw-button primary" data-prepare disabled>Connect wallet & prepare</button> <button class="tw-button primary" data-approve hidden>Review in Phantom & launch</button> <button class="tw-button" data-check hidden>Check confirmation</button><p class="tw-error" role="alert" data-error></p><div data-result></div>`;
 const q=s=>host.querySelector(s),status=s=>q('[data-status]').textContent=s;
 q('[data-token]').textContent=identity.name+' / $'+identity.symbol;
 let prepared=null,used=false,approvalStarted=false,replaceId=null,preparing=false,confirmedNotified=false;
 q('[data-buy]').oninput=()=>{if(approvalStarted||preparing)return;replaceId=prepared?.id??replaceId;prepared=null;used=false;q('[data-approve]').hidden=true;q('[data-summary]').textContent='Initial buy changed. Prepare again to update the launch summary.';status('Preparation required');try{parseInitialBuy(q('[data-buy]').value);q('[data-error]').textContent='';q('[data-prepare]').disabled=false;}catch(e){q('[data-error]').textContent=e.message;q('[data-prepare]').disabled=true;}};
 const showError=e=>{q('[data-error]').textContent=e.code===4001?'Rejected in Phantom. Nothing broadcast. No automatic retry.':e.message+' No automatic retry.';status('Stopped');q('[data-approve]').hidden=true;if(e.receipt?.signature)showReceipt(e.receipt);};
 function showReceipt(r){
  if(r.agentId!==identity.agentId||r.owner!==owner||r.network!=='solana:101')throw Error('Receipt identity mismatch');
  q('[data-prepare]').hidden=true;q('[data-approve]').hidden=true;
  q('[data-buy]').disabled=true;
  if(r.status==='Success'){q('[data-heading]').textContent='TOKEN LIVE';q('[data-token]').textContent=r.tokenName+' / $'+r.symbol;q('[data-buy]').closest('label').hidden=true;if(!confirmedNotified){confirmedNotified=true;window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));}}
  const result=q('[data-result]');result.replaceChildren();
  for(const [label,value] of [['Mint',r.mint],['Initial buy',r.initialBuyLamports==null?null:(r.initialBuyLamports/1e9).toFixed(9)+' SOL'],['Transaction',r.signature],['Observed SOL spent',r.observedSpendLamports==null?null:(r.observedSpendLamports/1e9).toFixed(9)]])if(value){const p=document.createElement('p');p.style.overflowWrap='anywhere';p.textContent=`${label}: ${value}`;result.append(p);}
  for(const [label,url] of [['Solana Explorer',r.signature?`https://explorer.solana.com/tx/${encodeURIComponent(r.signature)}`:null],['Pump.fun token',r.status==='Success'?`https://pump.fun/coin/${encodeURIComponent(r.mint)}`:null]])if(url){const a=document.createElement('a');a.className='tw-button';a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';result.append(a);}
  status(r.status);if(r.error||r.notice)q('[data-error]').textContent=r.error||r.notice;
  q('[data-check]').hidden=!r.signature||['Success','Failed'].includes(r.status);
 }
 async function check(){const r=await api(endpoint('status'));showReceipt(r);return r;}
 q('[data-check]').onclick=async e=>{e.target.disabled=true;try{await check();}catch(err){showError(err);}finally{e.target.disabled=false;}};
 q('[data-prepare]').onclick=async e=>{
  if(used||preparing)return;used=true;preparing=true;e.target.disabled=true;q('[data-buy]').disabled=true;status('Preparing');q('[data-error]').textContent='';
  try{
   const initialBuy=q('[data-buy]').value,amount=parseInitialBuy(initialBuy);
   await freshIdentity();
   const provider=window.phantom?.solana;if(!provider?.isPhantom)throw Error('Open this page with Phantom installed');
   if(!provider.isConnected)await provider.connect();
   if(provider.publicKey?.toBase58()!==owner)throw Error('Select this agent owner wallet '+owner);
   selected();prepared=await api('prepare',{agentId:identity.agentId,agent:identity,payer:owner,initialBuy,replacePreparationId:replaceId});replaceId=prepared.id;selected();assertAgentLaunch(identity,prepared.evidence.launch);if(buyLamports(prepared.evidence.launch)!==amount)throw Error('Initial buy mismatch');const policy=validateLaunchEvidence(prepared.evidence);
   verifyLaunchTransaction(prepared.evidence.walletTransactionBase64,prepared.evidence,false);
   const summary=q('[data-summary]');summary.replaceChildren();
   const sol=n=>(n/1e9).toFixed(9)+' SOL';
   const heading=document.createElement('h3');heading.textContent='Launch summary';summary.append(heading);
   for(const [label,value] of [['Token',identity.name+' / $'+identity.symbol],['Initial buy',sol(amount)],['Network / account costs','~'+sol(policy.validatedOverheadLamports)],['Estimated total','~'+sol(policy.estimatedPayerDebitLamports)],['Wallet balance',sol(policy.payerPreBalance)],['Estimated remaining',sol(policy.payerPostBalance)],['Network','Solana Mainnet / solana:101'],['Spending policy','PASS — selected buy + validated overhead'],['Mint',prepared.evidence.mint]]){const p=document.createElement('p');p.style.overflowWrap='anywhere';p.textContent=`${label}: ${value}`;summary.append(p);}
   status('Review final summary');q('[data-approve]').hidden=false;
  }catch(err){showError(err);used=false;e.target.disabled=false;}finally{preparing=false;q('[data-buy]').disabled=false;}
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
   const provider=window.phantom?.solana;
   if(!provider?.isConnected||provider.publicKey?.toBase58()!==owner)throw Error('Wallet disconnected or changed');
   if(Date.now()-Date.parse(prepared.evidence.createdAt)>45000)throw Error('Review expired. Nothing signed or broadcast.');
   const tx=verifyLaunchTransaction(prepared.evidence.walletTransactionBase64,prepared.evidence,false);
   await api('review',{agentId:identity.agentId,id:prepared.id,initialBuy:q('[data-buy]').value});
   selected();q('[data-buy]').disabled=true;
   status('Awaiting wallet approval');
   const signed=await provider.signTransaction(tx);
   const serialized=Buffer.from(signed.serialize({requireAllSignatures:true,verifySignatures:true})).toString('base64');
   verifyLaunchTransaction(serialized,prepared.evidence,true);
   selected();if(provider.publicKey?.toBase58()!==owner)throw Error('Wallet changed. Nothing broadcast.');
   status('Broadcasting');
   const submitted=await api('submit',{agentId:identity.agentId,id:prepared.id,transaction:serialized});showReceipt(submitted);
   status('Confirming');
   // Polling is read-only. It NEVER submits/retries a transaction.
   for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,2000));if(!host.isConnected)return;const r=await check();if(['Success','Failed'].includes(r.status))return;}
   q('[data-error]').textContent='Confirmation pending. Use Check confirmation; no transaction will be resent.';
  }catch(err){showError(err);q('[data-check]').hidden=false;}
 };
 // Restore a public receipt after navigation/reload, never resume signing or sending.
 api(endpoint('status')).then(r=>{if(!host.isConnected)return;if(r.status==='Prepared'&&!r.signature&&!r.broadcastAttempted){replaceId=r.id;q('[data-buy]').value=String((r.initialBuyLamports??0)/1e9);q('[data-prepare]').disabled=false;status('Prepare again for a fresh simulation');}else if(r.status!=='Idle'){used=true;showReceipt(r);}else{q('[data-prepare]').disabled=false;status('Ready to prepare this agent');}}).catch(e=>{q('[data-error]').textContent=e.message+' No wallet request has been made.';});
}
