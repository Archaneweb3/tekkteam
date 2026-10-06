import {request,signFundingTransaction} from './backend.js';
import {esc} from './trading-pages.js';
import {createTransferIntentKeys} from './wallet-transfer-intent.js';
const sol=n=>n==null?'Unavailable':`${(n/1e9).toLocaleString('en-US',{maximumFractionDigits:9})} SOL`;
const short=a=>a?`${a.slice(0,6)}…${a.slice(-6)}`:'Not created';
const tokenAmount=(raw,decimals)=>{try{if(!/^\d+$/.test(String(raw))||!Number.isInteger(decimals)||decimals<0||decimals>18)return 'Unavailable';const scale=10n**BigInt(decimals),value=BigInt(raw),whole=value/scale,fraction=(value%scale).toString().padStart(decimals,'0').replace(/0+$/,'');return whole.toLocaleString('en-US')+(fraction?'.'+fraction:'');}catch{return 'Unavailable';}};
const assetsView=state=>{if(state.assetStatus!=='AVAILABLE')return '<p class="tw-wallet-assets-unavailable">ASSETS UNAVAILABLE · This does not mean zero. <button type="button" data-do="refresh">RETRY</button></p>';const rows=(state.assets??[]).map(asset=>`<li><span title="${esc(asset.mint)}">${esc(short(asset.mint))}</span><strong>${esc(tokenAmount(asset.amount,asset.decimals))}</strong></li>`).join('');return `<ul class="tw-wallet-assets"><li><span>SOL</span><strong>${state.balanceStatus==='AVAILABLE'?sol(state.balanceLamports):'Unavailable'}</strong></li>${rows||'<li><span>NO TOKEN ASSETS</span></li>'}</ul>`;};
export function parseSol(value){
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value))throw Error('Enter a positive SOL amount, up to 9 decimal places.');
 const [whole,fraction='']=value.split('.'),n=BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0'));
 if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Enter a positive, safe SOL amount.');
 return Number(n);
}
export function mountAgentWallet(host,agent,{api=request,sign=signFundingTransaction,isCurrent=()=>true,receiptRequired=false}={}){
 let dead=false,busy=false,refreshing=false,state=null,mode=null,review=null,amount='',error='',uncertain=false,copied=false;
 let copyTimer=null;
 const alive=()=>!dead&&isCurrent();
 const assertCurrent=()=>{if(!alive())throw Error('Wallet view changed. Recheck the saved request before continuing.');};
 const intentKeys=createTransferIntentKeys();
 const base='/agents/'+encodeURIComponent(agent.id)+'/trading',route=()=>review?.kind==='FUND'||mode==='FUND'?'funding':'withdrawal';
 const post=(path,body)=>{assertCurrent();return api(base+path,{method:'POST',body:JSON.stringify(body)});};
 function paint(){
  if(!alive())return;
  host.className='tw-agent-wallet';
  if(!state){host.innerHTML='<h3>Agent wallet</h3><p role="status">'+esc(error||'Loading Mainnet wallet…')+'</p>'+(error?'<button class="tw-button secondary" data-do="refresh">Try again</button>':'');bind();return;}
  const pending=state.activity.find(r=>['PREPARED','SUBMITTED','UNKNOWN'].includes(r.status));
  const deposit=state.depositCapability??{available:!!state.fundingEnabled,reason:'Deposit is not enabled by server policy'};
  const withdraw=state.withdrawCapability??{available:!!state.withdrawalEnabled,reason:'Withdrawal is not enabled by server policy'};
  const reason=cap=>pending?'A wallet transfer must resolve first':cap.reason;
  host.innerHTML=`<header><div><span class="tw-wallet-eyebrow">AGENT WALLET · SOLANA MAINNET</span><h3>${esc(agent.name||'Agent')} Wallet</h3></div><span class="tw-wallet-lock">Live Trading · Locked</span></header>
   <div class="tw-wallet-summary"><div><span>Agent address</span><code title="${esc(state.agentWallet||'')}">${esc(state.agentWallet||'Not created')}</code>${state.agentWallet?`<button class="tw-wallet-copy" data-do="copy">${copied?'COPIED ✓':'COPY'}</button>`:''}</div><div><span>Mainnet balance</span><strong>${state.balanceStatus==='AVAILABLE'?sol(state.balanceLamports):state.balanceStatus==='NO_WALLET'?'—':'Balance unavailable'}</strong></div></div>
   <div class="tw-wallet-actions">${!state.agentWallet?(receiptRequired?'<p class="tw-wallet-note">Your Agent wallet is created automatically after a confirmed token launch.</p>':'<button class="tw-button secondary" data-do="create">Create agent wallet</button>'):`<button class="tw-button primary" data-do="fund" title="${esc(reason(deposit)||'')}" ${!deposit.available||pending||mode||review||uncertain?'disabled':''}>DEPOSIT</button><button class="tw-button secondary" data-do="withdraw" title="${esc(reason(withdraw)||'')}" ${!withdraw.available||pending||mode||review||uncertain?'disabled':''}>WITHDRAW</button>`}<button class="tw-button ghost" data-do="refresh">${refreshing?'REFRESHING...':'REFRESH BALANCE & STATUS'}</button></div>
   <p class="tw-wallet-note">${!deposit.available?`Deposit: ${esc(reason(deposit))}. `:''}${!withdraw.available?`Withdraw: ${esc(reason(withdraw))}. `:''}Real SOL is separate from Paper capital. Funding never starts trading.</p>
   <div data-wallet-flow>${flow(pending)}</div><p role="alert" class="tw-error">${esc(error)}</p>
   <section class="tw-wallet-assets-section"><h4>ASSETS</h4>${assetsView(state)}</section>
   <section class="tw-wallet-activity"><h4>TRANSFER HISTORY</h4><p>Real wallet movements only · not Paper trades</p>${state.activity.length?'<ul>'+state.activity.slice(0,20).map(r=>`<li><div><b>${r.kind==='FUND'?'Deposit':'Withdraw'}</b><span>${r.kind==='FUND'?'Owner → Agent':'Agent → Owner'}</span></div><strong>${r.kind==='FUND'?'+':'−'}${sol(r.amountLamports)}</strong><div><span class="tw-wallet-status">${esc(r.status)}</span>${r.reason?`<small>${esc(r.reason)}</small>`:''}</div></li>`).join('')+'</ul>':'<p>No wallet transfers yet.</p>'}</section>`;
  bind();if(busy)host.querySelectorAll('button,input').forEach(x=>x.disabled=true);
 }
 function flow(pending){
  if(uncertain)return `<div class="tw-wallet-review"><h4>${pending?.status==='SUBMITTED'?'SUBMITTED':'VERIFYING TRANSFER'}</h4>${pending?.signature?`<p>Signature: ${esc(short(pending.signature))}</p>`:''}<p>The outcome is not yet confirmed. Check this same request; do not send another transfer.</p><button class="tw-button ghost" data-do="check-pending">CHECK STATUS</button></div>`;
  if(!mode&&!review){if(pending)return `<div class="tw-wallet-review"><h4>${esc(pending.status)} wallet request</h4>${pending.signature?`<p>Signature: ${esc(short(pending.signature))}</p>`:''}<p>${esc(pending.reason||'Resolve this request before starting another transfer.')}</p>${pending.status==='PREPARED'?'<button class="tw-button ghost" data-do="cancel-pending">Cancel unsigned request</button>':'<button class="tw-button ghost" data-do="check-pending">CHECK STATUS</button>'}</div>`;return '';}
  const r=review,kind=r?.kind||mode,from=kind==='FUND'?state.ownerWallet:state.agentWallet,to=kind==='FUND'?state.agentWallet:state.ownerWallet;
  return `<div class="tw-wallet-review"><h4>${r?(kind==='WITHDRAW'?`Withdraw ${sol(r.amountLamports)}?`:'Review funding'):(kind==='FUND'?'Fund ':'Withdraw from ')+esc(agent.name||'agent')}</h4>
   <dl><div><dt>From · ${kind==='FUND'?'Owner wallet':'Agent wallet'}</dt><dd>${esc(from)}</dd></div><div><dt>To · ${kind==='FUND'?'Agent wallet':'Owner wallet (locked)'}</dt><dd>${esc(to)}</dd></div></dl>
   <p>Network: Solana Mainnet</p>${!r?`<p>Available ${kind==='FUND'?'Owner':'Agent'} SOL: ${sol(kind==='FUND'?state.ownerBalanceLamports:state.balanceLamports)}</p>`:''}
   ${r?`<dl class="tw-wallet-quote"><div><dt>Transfer amount</dt><dd>${sol(r.amountLamports)}</dd></div><div><dt>${kind==='FUND'?'Owner balance':'Agent balance before'}</dt><dd>${sol(r.sourceBalanceLamports)}</dd></div><div><dt>Base fee</dt><dd>${sol(r.baseFeeLamports)}</dd></div><div><dt>Priority fee</dt><dd>${sol(r.priorityFeeLamports)}</dd></div><div><dt>Estimated / maximum network fee</dt><dd>${sol(r.feeLamports)}</dd></div><div><dt>${kind==='FUND'?'Expected owner remaining':'Expected agent remaining'}</dt><dd>${sol(r.remainingLamports)}</dd></div>${kind==='FUND'?`<div><dt>Expected agent balance</dt><dd>${sol(state.balanceStatus==='AVAILABLE'?state.balanceLamports+r.amountLamports:null)}</dd><small>Based on the last confirmed balance; excludes other transfers.</small></div>`:`<div><dt>Expected owner balance after</dt><dd>${sol(r.expectedDestinationBalanceLamports)}</dd><small>Based on the prepared Mainnet balance; excludes other transfers.</small></div>`}</dl><p>${kind==='FUND'?'Phantom approval does not mean confirmed funding.':'Only Confirm withdrawal authorizes the agent wallet to sign. No Phantom prompt is used.'}</p><button class="tw-button primary" data-do="confirm">${kind==='FUND'?'Review in Phantom':'Confirm withdrawal'}</button>`:`<label>Amount (SOL)<input aria-label="Amount (SOL)" inputmode="decimal" autocomplete="off" value="${esc(amount)}" placeholder="Enter amount" data-amount></label>${kind==='WITHDRAW'?'<button class="tw-wallet-max" data-do="max">MAX</button>':''}<p>Enter an amount to calculate the network fee and remaining balance.</p><button class="tw-button primary" data-do="prepare">${kind==='FUND'?'Review funding':'Review withdrawal'}</button>`}
   <button class="tw-button ghost" data-do="cancel">Cancel</button></div>`;
 }
 async function refresh(){if(!alive())return;try{const next=await api(base+'/wallet');if(!alive())return;state=next;if(uncertain&&!state.activity.some(r=>['SUBMITTED','UNKNOWN'].includes(r.status)))uncertain=false;error='';}catch(e){error=e.message;if(state)state={...state,balanceLamports:null,balanceStatus:'UNAVAILABLE',assetStatus:'UNAVAILABLE',assets:[],assetCount:null,depositCapability:{available:false,reason:'Wallet status is unavailable'},withdrawCapability:{available:false,reason:'Wallet status is unavailable'},fundingEnabled:false,withdrawalEnabled:false};}paint();}
 function bind(){host.querySelector('[data-amount]')?.addEventListener('input',e=>amount=e.target.value);host.querySelectorAll('[data-do]').forEach(button=>button.onclick=async()=>{
  if(busy||!alive())return;busy=true;refreshing=button.dataset.do==='refresh';error='';paint();
  try{switch(button.dataset.do){
   case 'copy':await navigator.clipboard.writeText(state.agentWallet);copied=true;clearTimeout(copyTimer);copyTimer=setTimeout(()=>{if(alive()){copied=false;paint();}},1600);break;
   case 'refresh':await refresh();break;
   case 'check-pending':await refresh();break;
   case 'max':{const maximum=await api(base+'/withdrawal/max');if(maximum.agentId!==agent.id||maximum.source!==state.agentWallet||maximum.destination!==state.ownerWallet||maximum.network!=='solana:mainnet'||!Number.isSafeInteger(maximum.maxLamports)||maximum.maxLamports<=0)throw Error('No withdrawable SOL after the network-fee reserve.');amount=(maximum.maxLamports/1e9).toFixed(9).replace(/0+$/,'').replace(/\.$/,'');break;}
   case 'create':if(receiptRequired)throw Error('Complete the token launch first.');await post('/wallet',{});await refresh();break;
   case 'fund':case 'withdraw':mode=button.dataset.do==='fund'?'FUND':'WITHDRAW';review=null;amount='';intentKeys.begin();break;
   case 'prepare':{
    const lamports=parseSol(amount);
    const requestKey=intentKeys.forPrepare({kind:mode,agentId:agent.id,source:mode==='FUND'?state.ownerWallet:state.agentWallet,destination:mode==='FUND'?state.agentWallet:state.ownerWallet,lamports,network:'solana:mainnet'});
    review=await post('/'+route()+'/prepare',{lamports,requestKey});assertCurrent();
    if(review.status!=='PREPARED'||review.feeLamports==null){review=null;mode=null;await refresh();throw Error('Request is not ready. Refresh its status before continuing.');}break;
   }
   case 'confirm':{
    const r=review;if(!r)throw Error('Review the amount first.');
    let body,path;
    if(r.kind==='FUND'){
     // Remove the prompt action BEFORE awaiting the wallet. Rejection/closure must stop,
     // not leave the same review button ready for another Phantom request.
     uncertain=true;review=null;mode=null;paint();
     const signedTransaction=await sign(r,state.ownerWallet,state.agentWallet,agent.id);assertCurrent();body={id:r.id,signedTransaction};path='/funding/submit';
    }
    else{body={id:r.id,confirm:true};path='/withdrawal/confirm';}
    // After a submit attempt, never expose a retry button; only reconcile reads.
    uncertain=true;review=null;mode=null;
    const result=await post(path,body);uncertain=['SUBMITTED','UNKNOWN'].includes(result.status);await refresh();break;
   }
   case 'cancel':if(review)await post('/'+route()+'/'+review.id+'/cancel',{});mode=null;review=null;amount='';await refresh();break;
   case 'cancel-pending':{const r=state.activity.find(x=>x.status==='PREPARED');if(r)await post('/'+(r.kind==='FUND'?'funding':'withdrawal')+'/'+r.id+'/cancel',{});await refresh();break;}
  }}catch(e){if(e.submissionState==='REJECTED_BEFORE_BROADCAST')uncertain=false;error=e.message;}finally{busy=false;refreshing=false;paint();}
 });}
 paint();refresh();const timer=setInterval(()=>{if(!busy&&!mode&&!review)refresh();},15000);
 return {refresh,destroy(){dead=true;clearInterval(timer);clearTimeout(copyTimer);}};
}

let activeDrawer=null;
export function openAgentWalletDrawer(agent,options={}){
 if(activeDrawer?.dialog?.open){if(activeDrawer.agentId!==agent.id)return activeDrawer.dialog;activeDrawer.controller.refresh();activeDrawer.dialog.querySelector('.tw-wallet-drawer-close')?.focus();return activeDrawer.dialog;}
 const dialog=document.createElement('dialog');dialog.className='tw-agent-wallet-drawer';dialog.setAttribute('aria-label',`${agent.name||'Agent'} wallet`);
 dialog.innerHTML='<div class="tw-agent-wallet-drawer-inner"><button type="button" class="tw-wallet-drawer-close" aria-label="Close Agent Wallet">×</button><div data-agent-wallet-content></div></div>';
 document.body.append(dialog);const opener=document.activeElement,controller=mountAgentWallet(dialog.querySelector('[data-agent-wallet-content]'),agent,options);
 dialog.querySelector('.tw-wallet-drawer-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{controller.destroy();dialog.remove();if(activeDrawer?.dialog===dialog)activeDrawer=null;if(opener?.isConnected)opener.focus();window.dispatchEvent(new CustomEvent('tekkwork:agent-wallet-closed',{detail:{agentId:agent.id}}));},{once:true});
 activeDrawer={dialog,agentId:agent.id,controller};dialog.showModal();return dialog;
}
