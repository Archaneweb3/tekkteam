import {request} from './backend.js';
import {acceptanceFailureLabel} from './autonomous-acceptance-error.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sol=x=>x==null?'Unavailable':`${(Number(x)/1e9).toFixed(9)} SOL`;
const ACTIVE=new Set(['ARMED','BUYING','POSITION_OPEN','SELLING','UNKNOWN']);

export function mountAutonomousAcceptance(host,agent,{api=request,confirmAction=message=>window.confirm(message),showStop=true}={}){
 const base='/agents/'+encodeURIComponent(agent.id)+'/autonomous-acceptance';
 let dead=false,startBusy=false,stopBusy=false,recoveryBusy=false,state=null,error='',actionError='',timer,revision=0,advancedOpen=false;
 async function refresh(){
  if(dead)return;
  const seen=revision;
  try{const next=await api(base);if(dead||seen!==revision)return;state=next;error='';}
  catch(e){if(dead||seen!==revision)return;error=e.message;}
  render();
 }
 function render(){
  if(dead)return;
  const status=state?.status??'UNAVAILABLE',c=state?.candidate;
  const history=state?.history??[];
  const buyAttempt=history.find(r=>r.direction==='BUY'),sellAttempt=history.find(r=>r.direction==='SELL');
  const stopped=state?.emergencyStopped===true;
  host.className='tw-controlled-swap tw-acceptance-panel';
  host.innerHTML=`<div class="tw-dex-content">
   <header><div><p class="tw-dex-eyebrow">REAL MAINNET · AGENT STATUS</p><h3>Autonomous trading</h3></div><span class="tw-dex-badge">${esc(stopped?'EMERGENCY STOP ACTIVE':status.replaceAll('_',' '))}</span></header>
   <div class="tw-acceptance-summary"><div><span>Mode</span><strong>${esc(ACTIVE.has(status)&&!stopped?'Acceptance test active':stopped?'Stopped':'Live trading disabled')}</strong></div><div><span>Agent wallet</span><strong>${sol(state?.agentBalanceLamports)}</strong></div><div><span>Open position</span><strong>${state?.position&&state.position.quantity!=='0'?esc(state.position.quantity)+' token units':'None confirmed'}</strong></div><div><span>Floating PnL</span><strong>${state?.valuation?.available?sol(state.valuation.unrealizedPnlLamports):'Unavailable'}</strong></div></div>
   ${state?.strategyResult?`<p>Last decision: ${esc(state.strategyResult.side)} — ${esc(state.strategyResult.reason)}</p>`:''}
   ${state?.failureReason?`<p role="alert">${esc(acceptanceFailureLabel(state.failureReason,{status,signature:state.buySignature??state.sellSignature??buyAttempt?.signature??sellAttempt?.signature}))}</p>`:''}
   ${error?`<p role="alert">${esc(acceptanceFailureLabel(error,{status,signature:state?.buySignature??state?.sellSignature}))}</p>`:''}
   ${actionError?`<p role="alert">${esc(acceptanceFailureLabel(actionError,{status,signature:state?.buySignature??state?.sellSignature}))}</p>`:''}
   ${stopped?`<p class="tw-dex-warning" role="status">${state?.recoveryExit?'EMERGENCY STOP ACTIVE. Owner-authorized recovery permits only the existing position SELL; no BUY or normal Live execution.':'EMERGENCY STOP ACTIVE. No new real-money signing or broadcast is allowed. Any previously submitted or uncertain transaction must still be reconciled; it cannot be cancelled on-chain.'}</p>`:''}
   ${showStop?`<div class="tw-dex-actions tw-safety-actions"><button type="button" data-stop class="tw-emergency-stop" ${stopBusy||stopped?'disabled':''}>${stopBusy?'Stopping…':stopped?'EMERGENCY STOP ACTIVE':'EMERGENCY STOP'}</button></div>`:''}
   <p class="tw-dex-footnote">Emergency Stop blocks new execution, including when status data is unavailable. It does not erase an existing position or uncertain transaction.</p>
   <details class="tw-acceptance-advanced" ${advancedOpen?'open':''}><summary>Developer / Acceptance Testing</summary>
    <p class="tw-dex-warning"><strong>REAL SOL · MANUAL OWNER ACTIVATION</strong><br>One bounded BUY and SELL maximum. This is a mechanical acceptance test, not a profit signal.</p>
    <dl class="tw-dex-review"><div><dt>Token</dt><dd>USELESS · ${esc(c?.mint??'Unavailable')}</dd></div><div><dt>BUY limit</dt><dd>0.0001 SOL</dd></div><div><dt>Raydium CPMM pool</dt><dd>${esc(c?.pool??'Unavailable')}</dd></div><div><dt>Maximum hold</dt><dd>180 seconds</dd></div><div><dt>Token balance</dt><dd>${esc(state?.tokenBalanceRaw??'Unavailable')} raw units</dd></div><div><dt>Risk / network</dt><dd>${state?.networkVerified?'Mainnet verified':'Unavailable or unverified'}</dd></div></dl>
    ${state?.cycleId?`<p>Current cycle ${esc(state.cycleId)} · BUY ${esc(state.buyExecutionId??buyAttempt?.id??'not started')} · SELL ${esc(state.sellExecutionId??sellAttempt?.id??'not started')}</p>`:''}
    <div class="tw-dex-actions"><button type="button" data-start ${startBusy||stopBusy||state?.canStart!==true?'disabled':''}>START ONE-SHOT AUTONOMOUS TEST</button>${state?.recoveryCandidate===true?`<button type="button" data-recover-exit ${recoveryBusy||startBusy||stopBusy||state.recoveryEligible!==true?'disabled':''}>${recoveryBusy?'Recovering…':'RECOVER & EXIT POSITION'}</button>`:''}</div>
    ${state?.recoveryCandidate===true&&state.recoveryEligible!==true?`<p role="status">Recovery unavailable: ${esc(state.recoveryDisabledReason??'UNVERIFIED')}</p>`:''}
    <details><summary>Execution history</summary>${history.length?`<ul>${history.map(r=>`<li>${esc(r.direction)} · ${esc(r.status)} · ${esc(r.id)}${r.reason?' · '+esc(acceptanceFailureLabel(r.reason,{status:r.status,signature:r.signature})):''}</li>`).join('')}</ul>`:'<p>No executions in this cycle.</p>'}</details>
   </details></div>`;
  const advanced=host.querySelector('.tw-acceptance-advanced');
  advanced.ontoggle=()=>{advancedOpen=advanced.open;};
  host.querySelector('[data-start]').onclick=async()=>{
   if(startBusy||stopBusy||state?.canStart!==true)return;
   if(!confirmAction('THIS WILL USE REAL SOL ON SOLANA MAINNET. Authorize ONE BUY and ONE SELL maximum for USELESS?'))return;
   startBusy=true;render();
   try{await api(base+'/start',{method:'POST',body:'{}'});actionError='';revision++;await refresh();}
   catch(e){actionError=e.message;}
   finally{startBusy=false;render();}
  };
  const recover=host.querySelector('[data-recover-exit]');if(recover)recover.onclick=async()=>{
   if(recoveryBusy||state?.recoveryEligible!==true)return;
   if(!confirmAction('This will sell the existing 0.045962 USELESS position on Solana Mainnet. No new BUY will be created.'))return;
   recoveryBusy=true;render();
   try{await api(base+'/recover-exit',{method:'POST',body:'{}'});actionError='';revision++;await refresh();}
   catch(e){actionError=e.message;}
   finally{recoveryBusy=false;render();}
  };
  if(showStop)host.querySelector('[data-stop]').onclick=async()=>{
   if(stopBusy||state?.emergencyStopped===true)return;
   if(!confirmAction('Stop all new real-money execution?'))return;
   stopBusy=true;revision++;render();
   try{const result=await api(base+'/emergency-stop',{method:'POST',body:'{}'});state={...state,...result,emergencyStopped:true,canStart:false};error='';actionError='';revision++;}
   catch(e){actionError=e.message;}
   finally{stopBusy=false;render();}
  };
 }
 refresh();timer=setInterval(refresh,5000);
 return {destroy(){dead=true;revision++;clearInterval(timer);},refresh};
}
