import {launchpadUnit} from './launchpad-view-model.js';
// Owner inventory only. All reads and lifecycle projection are injected by the shell.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = value => typeof value === 'string' && value.trim().length > 0;
const labels = {CONFIRMED:'LAUNCH CONFIRMED',CONFIGURED_NOT_LAUNCHED:'NOT LAUNCHED',NOT_CONFIGURED:'TOKEN NOT CONFIGURED',PREPARED:'PREPARED',AWAITING_OWNER_APPROVAL:'AWAITING OWNER APPROVAL',RECONCILIATION_REQUIRED:'RECONCILIATION REQUIRED',PENDING:'PENDING',FAILED:'FAILED',UNAVAILABLE:'UNAVAILABLE'};
const explanations = {
 CONFIGURED_NOT_LAUNCHED:'Token metadata is a draft, not a verified minted token.',
 PREPARED:'Preparation is not confirmation. Open the related Agent to inspect the current review and expiry.',
 AWAITING_OWNER_APPROVAL:'Wallet approval is a separate manual action. Open the related Agent to inspect the existing launch review.',
 PENDING:'The transaction outcome is pending, not confirmed. Open the related Agent to inspect the existing receipt. Do not start a fresh launch or rebroadcast.',
 RECONCILIATION_REQUIRED:'The transaction outcome is uncertain. Open the related Agent to reconcile the existing receipt. Do not start a fresh launch or rebroadcast.',
 FAILED:'Inspect the existing result in the related Agent before considering any new attempt.',
 UNAVAILABLE:'Launch evidence is unavailable. This does not prove success or failure. Open the related Agent to inspect its current state.'
};
const link = (route,id) => `#/${route}/${encodeURIComponent(id)}`;

function workflowEvidence(launch){
 const workflow=launch.workflow;
 if(workflow?.available!==true)return '<p>Recorded launch workflow · UNAVAILABLE</p>';
 const pending=launch.state==='RECONCILIATION_REQUIRED'&&workflow.finality==='UNAVAILABLE';
 return '<div data-token-workflow><p>'+esc(workflow.provenance)+' · Recorded launch workflow</p><p>Recorded receipt phase · '+esc(workflow.receiptStatus??'No phase recorded')+' (workflow only)</p><p>Signature recorded · '+(workflow.signatureRecorded?'YES':'NO')+'</p><p>Transaction delivery · '+esc(workflow.deliveryStatus)+'</p><p>Recorded finality · '+esc(workflow.finality)+(pending?' · Reconciliation pending':workflow.finality==='CONFIRMED'?' · Canonical confirmed receipt':workflow.finality==='FAILED'?' · Canonical failed receipt':'')+'</p>'+(pending?'<p>'+(workflow.signatureRecorded?'Signed outcome':'Transaction outcome')+' is unknown. '+(workflow.signatureRecorded?'Inspect the existing same-signature status':'Inspect the recorded launch status')+' in the related Agent; do not start a fresh launch or rebroadcast.</p>':'')+'<p>Workflow recording does not prove transaction delivery or independently verify the chain.</p></div>';
}

export function mountTokensPage(host,{agents,owner,config,selectedAgentId=null,isCurrent=()=>true,loadContract,projectUnit}={}) {
 let destroyed=false;
 const current=()=>!destroyed && isCurrent();
 const shell=body=>`<div class="tw-world tw-world-tokens"><section class="tw-world-hero"><div class="tw-world-hero-copy"><span class="tw-world-eyebrow">OWNER TOKEN INVENTORY</span><h1>YOUR TOKENS.<br><em>LINKED TO AGENTS.</em></h1><p>Inspect token configuration and canonical launch receipts. A confirmed launch does not authorize trading.</p><div class="tw-world-actions"><a class="tw-world-cta primary" href="#/launch">OPEN LAUNCHPAD →</a><a class="tw-world-cta secondary" href="#/agents">VIEW AGENTS →</a></div></div></section><section class="tw-world-section"><div class="tw-world-section-head"><h2>${selectedAgentId?'TOKEN DETAIL':'YOUR TOKENS'}</h2></div>${body}</section></div>`;
 const notice=(state,title,copy)=>`<div class="tw-world-empty" data-token-state="${state}" role="status"><div><h3>${title}</h3><p>${copy}</p><a class="tw-world-card-action" href="#/agents">VIEW AGENTS →</a></div></div>`;
 const paint=body=>{if(current())host.innerHTML=shell(body);};
 const stop=(state,title,copy)=>{paint(notice(state,title,copy));return {destroy(){destroyed=true;}};};
 if(!text(owner))return stop('visitor','OWNER INVENTORY','Sign in through the workspace wallet control to view your inventory. Public opt-in token discovery is not available yet.');
 if(config?.preview===true || !Array.isArray(agents))return stop('unavailable','INVENTORY UNAVAILABLE','Owner inventory could not be loaded. This is not an empty inventory.');
 const ids=new Set();
 if(agents.some(a=>!a || !text(a.id) || a.creator!==owner || ids.has(a.id) || !ids.add(a.id)))return stop('error','INVENTORY ERROR','Owner or Agent identity does not match. Inventory reads were blocked.');
 if(typeof loadContract!=='function'||typeof projectUnit!=='function')return stop('unavailable','CONTRACT READ UNAVAILABLE','Launch evidence is unavailable. No mint or launch success can be inferred.');
 const roster=selectedAgentId?agents.filter(a=>a.id===selectedAgentId):agents;
 if(selectedAgentId && !roster.length)return stop('unavailable','TOKEN DETAIL UNAVAILABLE','The related Agent is not in this owner inventory.');
 if(!roster.length)return stop('empty','NO TOKENS YET','There are no Agents in this owner inventory. Create or inspect an Agent from Launchpad.');
 const records=new Map(roster.map(a=>[a.id,{agent:a,status:'loading'}]));
 function card({agent,status,unit}) {
  const token=unit?.token;
  const name=text(token?.name)?token.name:text(agent.coin?.name)?agent.coin.name:'Token metadata unavailable';
  const symbol=token?.symbol ?? agent.coin?.ticker;
  const state=status==='loading'?'LOADING':status==='error'?'ERROR':status==='unavailable'?'UNAVAILABLE':unit.launch.state;
  const image=token?.image;
  const artwork=typeof image==='string' && /^https:\/\//i.test(image)?`<img src="${esc(image)}" alt="${esc(name)} token image" loading="lazy" referrerpolicy="no-referrer">`:'<span aria-hidden="true">◇</span>';
  const confirmed=status==='ready' && unit.launch.confirmed;
  const proof=confirmed?`<p class="tw-token-mint" style="overflow-wrap:anywhere">MINT · ${esc(token.mint)}</p><p class="tw-token-mint" style="overflow-wrap:anywhere">RECEIPT SIGNATURE · ${esc(unit.launch.signature)}</p><p>Mainnet · solana:101 · BACKEND VERIFIED</p><a class="tw-text-link" href="https://pump.fun/coin/${encodeURIComponent(token.mint)}" target="_blank" rel="noopener noreferrer">VIEW ON PUMP.FUN ↗</a>`:'';
  const transaction=confirmed && selectedAgentId?`<p>The launch receipt associates this Agent and mint with the transaction below. BACKEND VERIFIED; no independent on-chain verification was performed here.</p><a class="tw-text-link" href="https://explorer.solana.com/tx/${encodeURIComponent(unit.launch.signature)}" target="_blank" rel="noopener noreferrer">VIEW LAUNCH TRANSACTION ↗</a>`:'';
  const explanation=status==='ready' && explanations[state]?`<p>${explanations[state]}</p>`:'';
  return `<article class="tw-token-card" data-token-state="${esc(state)}"><a class="tw-token-art" href="${link('tokens',agent.id)}" aria-label="Inspect ${esc(name)}">${artwork}</a><div class="tw-token-card-body"><span class="tw-status">${esc(labels[state]??state)}</span><h3>${esc(name)}</h3>${symbol?`<strong>$${esc(symbol)}</strong>`:''}<p>RELATED AGENT · ${esc(unit?.name??agent.name)}</p><p>${status==='loading'?'Reading owner launch evidence…':status==='error'?'Contract read failed. Return to Tokens to retry.':status==='unavailable'?'Launch evidence unavailable or does not match this Agent.':'Launch evidence · '+esc(unit.launch.provenance)}</p>${explanation}${status==='ready'?workflowEvidence(unit.launch):''}${proof}${transaction}${selectedAgentId?'<p>Market values, fees and token-holder rights · UNAVAILABLE</p><p>Price and chart data · UNAVAILABLE. No sourced market adapter is connected to this view.</p><a class="tw-text-link" href="#/tokens">ALL TOKENS →</a>':`<a class="tw-text-link" href="${link('tokens',agent.id)}">TOKEN DETAIL →</a>`}<a class="tw-world-card-action" href="${link('agent',agent.id)}">VIEW RELATED AGENT →</a></div></article>`;
 }
 function render(){
  const rows=[...records.values()];
  // Missing metadata does not erase a sourced launch/recovery lifecycle.
  const visible=rows.filter(r=>r.status!=='ready'||r.unit.token.configured||r.unit.launch.state!=='NOT_CONFIGURED');
  const identity=rows.length-visible.length;
  paint((identity?`<p>${identity} Agent${identity===1?'':'s'} with TOKEN NOT CONFIGURED. <a class="tw-world-card-action" href="#/agents">VIEW AGENTS →</a></p>`:'')+(visible.length?`<div class="tw-token-grid">${visible.map(card).join('')}</div>`:notice('empty','NO TOKENS CONFIGURED','Your identity-only Agents remain available in Agents.')));
 }
 render();
 for(const agent of roster) {
  Promise.resolve().then(()=>current()?loadContract(agent.id):null).then(dto=>{
   if(!current())return;
   if(!dto || dto.id!==agent.id || dto.owner!==owner || dto.lifecycle?.agent?.id!==agent.id){records.set(agent.id,{agent,status:'unavailable'});render();return;}
   const projected=projectUnit(agent,dto);
   if(!projected || projected.agentId!==agent.id || projected.available!==true || !projected.token || !projected.launch){records.set(agent.id,{agent,status:'unavailable'});render();return;}
   // The projector cannot override receipt authority or promote draft/prepared mints.
   const confirmed=dto.lifecycle.launch?.state==='CONFIRMED' && dto.lifecycle.token?.state==='CONFIRMED' && dto.lifecycle.launch.network==='solana:101' && text(dto.lifecycle.launch.signature) && text(dto.lifecycle.token.mint) && projected.launch.confirmed===true && projected.token.mint===dto.lifecycle.token.mint && projected.launch.signature===dto.lifecycle.launch.signature && projected.launch.network==='solana:101';
   const state=confirmed?'CONFIRMED':projected.launch.state==='CONFIRMED'?'UNAVAILABLE':projected.launch.state;
   // Reuse the accepted owner workflow projection; injected adapters cannot invent proof.
   const canonical=launchpadUnit(agent,dto);
   const workflow=canonical.launch.state===state&&canonical.launch.confirmed===confirmed?canonical.launch.workflow:null;
   const unit={...projected,token:{...projected.token,mint:confirmed?dto.lifecycle.token.mint:null},launch:{...projected.launch,state,confirmed,workflow,signature:confirmed?dto.lifecycle.launch.signature:null,provenance:confirmed?'BACKEND VERIFIED':projected.launch.provenance==='BACKEND VERIFIED'?'BACKEND VERIFIED':'UNAVAILABLE'}};
   records.set(agent.id,{agent,status:'ready',unit});render();
  }).catch(()=>{if(current()){records.set(agent.id,{agent,status:'error'});render();}});
 }
 return {destroy(){destroyed=true;}};
}
