const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const known={
 AGENT_WALLET_HAS_SOL:['AGENT WALLET BALANCE','Real SOL remains in this Agent Wallet.','wallet'],
 WALLET_BALANCE_UNAVAILABLE:['WALLET BALANCE','Mainnet balance could not be verified.','wallet'],
 AGENT_WALLET_HAS_TOKENS:['TOKEN HOLDINGS','Real tokens remain. Token withdrawal is required before deletion; this product does not yet offer it.','wallet'],
 PAPER_POSITION_OPEN:['PAPER POSITION','A simulated position is open. Review it in Trading; deletion never closes it automatically.','trading'],
 REAL_POSITION_OPEN:['REAL POSITION','A real position is open. Resolve it through the existing position flow.','trading'],
 ACTIVE_RESERVATION:['ACTIVE RESERVATION','A real-money reservation is active.','none'],
 UNRESOLVED_EXECUTION:['UNRESOLVED EXECUTION','An execution has an uncertain outcome. Reconcile it before deletion.','none'],
 ACTIVE_EXECUTION:['ACTIVE EXECUTION','A real-money execution is still active.','none'],
 PENDING_TOKEN_SUBMISSION:['TOKEN LAUNCH','A token preparation or submission is pending.','launch'],
 TOKEN_LAUNCHED:['LAUNCHED TOKEN','This Agent has launched-token history.','none'],
 CUSTODY_OR_AUDIT_RECORDS:['RECORD RETENTION','Required real-money records must be preserved. Safe Agent archival is not yet available.','none'],
 LAUNCH_OR_DRAFT_STATE:['AGENT LIFECYCLE','The current server deletion path permits only an unlaunched draft.','none']
};

export function deleteFlowPresentation(eligibility){
 const reasons=Array.isArray(eligibility?.deleteBlockedReasons)?eligibility.deleteBlockedReasons:[];
 const eligible=eligibility?.deleteEligible===true&&eligibility?.canDelete===true&&reasons.length===0;
 const blockers=eligible?[]:(reasons.length?reasons:[{code:'LAUNCH_OR_DRAFT_STATE',message:eligibility?.reason||'Deletion eligibility could not be verified.'}]).map(item=>{
  const [title,description,action]=known[item.code]||['DELETE BLOCKED','The server reports a deletion blocker.','none'];
  const balance=item.code==='AGENT_WALLET_HAS_SOL'&&Number.isSafeInteger(eligibility?.solLamports)?`${(eligibility.solLamports/1e9).toFixed(6)} SOL`:null;
  return {code:item.code,title,description,balance,action};
 });
 return {eligible,blockers};
}

export function deleteFlowContent(agent,eligibility,{changed=false,stage='review'}={}){
 const {eligible,blockers}=deleteFlowPresentation(eligibility),name=escapeHtml(agent.name.toUpperCase());
 if(!eligible){
  const guided=stage==='resolve',actions=blockers.filter(b=>b.code!=='CUSTODY_OR_AUDIT_RECORDS');
  const rows=actions.map((blocker,index)=>`<section class="tw-delete-blocker" data-blocker="${escapeHtml(blocker.code)}"><div><span>${guided?String(index+1).padStart(2,'0')+' · ':''}${escapeHtml(blocker.title)} · ACTION REQUIRED</span>${blocker.balance?`<strong>${escapeHtml(blocker.balance)}</strong>`:''}<p>${escapeHtml(blocker.description)}</p></div>${blocker.action!=='none'?`<button type="button" class="tw-text-link" data-delete-resolve="${blocker.action}">${blocker.code==='AGENT_WALLET_HAS_SOL'?'MANAGE WALLET':blocker.code==='AGENT_WALLET_HAS_TOKENS'?'VIEW WALLET':blocker.code==='REAL_POSITION_OPEN'?'VIEW POSITION':blocker.action==='trading'?'VIEW TRADING':'VIEW LAUNCH STATUS'} →</button>`:''}</section>`).join('');
  const retention=blockers.some(b=>b.code==='CUSTODY_OR_AUDIT_RECORDS')?'<section class="tw-delete-blocker" data-blocker="CUSTODY_OR_AUDIT_RECORDS"><div><span>RECORD RETENTION · ARCHIVAL REQUIRED</span><p>Transaction and custody history must remain preserved. This Agent cannot be removed until safe archival is implemented.</p></div></section>':'<section class="tw-delete-blocker"><div><span>RECORD RETENTION · SAFE</span><p>Required history remains preserved.</p></div></section>';
  return `<button type="button" class="tw-delete-close" data-cancel aria-label="Close deletion review">×</button><span class="tw-world-eyebrow">OWNER ACCESS · DELETE AGENT</span><h2 id="tw-delete-title">${guided?'PREPARE FOR DELETION':`DELETE ${name}?`}</h2><p>${changed?'Deletion status changed. Review the current blockers.':guided?'Resolve each blocker through its existing owner-controlled flow. Nothing is moved automatically.':"This Agent isn't ready to delete yet."}</p>${guided?`<p class="tw-delete-progress">${blockers.length} REQUIRE${blockers.length===1?'MENT':'MENTS'} REMAINING</p>`:''}<div class="tw-delete-blockers">${rows}${retention}</div><div class="tw-dialog-actions"><button type="button" class="tw-button secondary" data-cancel>CANCEL</button>${guided?'<button type="button" class="tw-button secondary" data-delete-refresh>REFRESH STATUS</button>':'<button type="button" class="tw-button primary" data-delete-setup>RESOLVE TO DELETE →</button>'}</div>`;
 }
 return `<button type="button" class="tw-delete-close" data-cancel aria-label="Close deletion review">×</button><span class="tw-world-eyebrow">OWNER CONFIRMATION · READY TO DELETE</span><h2 id="tw-delete-title">DELETE ${name}?</h2><p>This permanently removes this Agent from your active workforce. Required transaction and audit history remains preserved. No funds or tokens will be moved.</p><dl class="tw-delete-summary"><div><dt>Agent Wallet</dt><dd>✓ Empty</dd></div><div><dt>Token holdings</dt><dd>✓ None</dd></div><div><dt>Real positions</dt><dd>✓ None</dd></div><div><dt>Pending operations</dt><dd>✓ None</dd></div></dl><label class="tw-delete-confirm">Type DELETE to confirm<input data-delete-word autocomplete="off" spellcheck="false" aria-label="Type DELETE to confirm"></label><p class="tw-error" role="alert"></p><div class="tw-dialog-actions"><button type="button" class="tw-button secondary" data-cancel>CANCEL</button><button type="button" class="tw-button destructive" data-delete-confirm disabled>DELETE AGENT</button></div>`;
}
