import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteFlowContent,deleteFlowPresentation} from '../public/app/agent-delete-flow.js';

const agent={name:'LPAD TEST'};
const blocked=(code,rest={})=>({agentId:'fixture',canDelete:false,deleteEligible:false,deleteBlockedReasons:[{code,message:'server-only detail'}],...rest});

test('real SOL, tokens, Paper and Real positions appear as separate actionable blockers',()=>{
 const response={...blocked('AGENT_WALLET_HAS_SOL',{solLamports:5401560}),deleteBlockedReasons:['AGENT_WALLET_HAS_SOL','AGENT_WALLET_HAS_TOKENS','PAPER_POSITION_OPEN','REAL_POSITION_OPEN'].map(code=>({code,message:'server detail'}))};
 const view=deleteFlowPresentation(response);
 assert.equal(view.eligible,false);assert.equal(view.blockers.length,4);
 assert.equal(view.blockers[0].balance,'0.005402 SOL');
 assert.deepEqual(view.blockers.map(x=>x.action),['wallet','wallet','trading','trading']);
 const html=deleteFlowContent(agent,response);
 assert.match(html,/MANAGE WALLET/);assert.match(html,/VIEW TRADING/);
 assert.match(html,/RESOLVE TO DELETE/);
 assert.doesNotMatch(html,/data-delete-confirm|server detail/);
});
test('guided stage shows blockers without making a value-moving request',()=>{
 const response={...blocked('AGENT_WALLET_HAS_SOL',{solLamports:5401560}),deleteBlockedReasons:['AGENT_WALLET_HAS_SOL','AGENT_WALLET_HAS_TOKENS','REAL_POSITION_OPEN','CUSTODY_OR_AUDIT_RECORDS'].map(code=>({code}))};
 const html=deleteFlowContent(agent,response,{stage:'resolve'});
 assert.match(html,/PREPARE FOR DELETION/);assert.match(html,/REFRESH STATUS/);
 assert.match(html,/VIEW POSITION/);assert.match(html,/Token withdrawal is required/);
 assert.match(html,/ARCHIVAL REQUIRED/);assert.doesNotMatch(html,/data-delete-confirm/);
});
test('reservation, UNKNOWN execution, pending launch and immutable audit remain blocked',()=>{
 for(const code of ['ACTIVE_RESERVATION','UNRESOLVED_EXECUTION','PENDING_TOKEN_SUBMISSION','CUSTODY_OR_AUDIT_RECORDS']){
  const html=deleteFlowContent(agent,blocked(code));
  assert.match(html,new RegExp(`data-blocker="${code}"`));
  assert.doesNotMatch(html,/data-delete-confirm/);
 }
});
test('only authoritative eligible state presents deliberate confirmation',()=>{
 const eligible={canDelete:true,deleteEligible:true,deleteBlockedReasons:[]};
 const html=deleteFlowContent(agent,eligible);
 assert.match(html,/Type DELETE to confirm/);assert.match(html,/data-delete-confirm disabled/);
 assert.match(html,/Pending operations<\/dt><dd>✓ None/);
 assert.equal(deleteFlowPresentation({...eligible,deleteBlockedReasons:[{code:'ACTIVE_RESERVATION'}]}).eligible,false);
 assert.equal(deleteFlowPresentation({...eligible,canDelete:false}).eligible,false);
});
test('server messages and agent names are escaped and unknown blockers fail closed',()=>{
 const html=deleteFlowContent({name:'<script>'},blocked('UNRECOGNIZED',{reason:'<secret>'}));
 assert.doesNotMatch(html,/<script>|<secret>|server-only detail/);
 assert.match(html,/DELETE BLOCKED/);
});
