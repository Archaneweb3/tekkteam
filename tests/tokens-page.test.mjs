import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTokensPage} from '../public/app/tokens-page.js';
import {launchpadUnit} from '../public/app/launchpad-view-model.js';

const agent=(id='agent/one',coin={name:'Actual token',ticker:'ACT'})=>({id,creator:'owner',name:'Actual Agent',coin});
const dto=(a,state='CONFIRMED')=>({id:a.id,owner:a.creator,lifecycle:{agent:{id:a.id},token:{state:state==='CONFIRMED'?'CONFIRMED':a.coin?'CONFIGURED':'NOT_CONFIGURED',mint:state==='CONFIRMED'?'CANONICAL_RECEIPT_MINT':null},launch:{state,network:'solana:101',signature:state==='CONFIRMED'?'CANONICAL_SIGNATURE':null}}});
const project=(a,d)=>({agentId:a.id,name:a.name,token:{configured:!!a.coin,name:a.coin?.name,symbol:a.coin?.ticker,image:a.coin?.image,mint:d.lifecycle.token.mint},launch:{...d.lifecycle.launch,confirmed:d.lifecycle.launch.state==='CONFIRMED',provenance:'BACKEND VERIFIED'},operation:{mode:'PAPER',state:'PAUSED'},available:true});
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(overrides={}){const a=agent(),host={innerHTML:''},reads=[];const opts={agents:[a],owner:'owner',loadContract:async id=>{reads.push(id);return dto(a);},projectUnit:project,...overrides};const page=mountTokensPage(host,opts);return {host,reads,page};}

test('loading becomes receipt-backed list with exact Agent/detail links and full mint',async()=>{const f=fixture();assert.match(f.host.innerHTML,/LOADING/);await flush();assert.deepEqual(f.reads,['agent/one']);assert.match(f.host.innerHTML,/CANONICAL_RECEIPT_MINT/);assert.match(f.host.innerHTML,/BACKEND VERIFIED/);assert.match(f.host.innerHTML,/#\/tokens\/agent%2Fone/);assert.match(f.host.innerHTML,/#\/agent\/agent%2Fone/);assert.match(f.host.innerHTML,/https:\/\/pump.fun\/coin\/CANONICAL_RECEIPT_MINT/);assert.doesNotMatch(f.host.innerHTML,/ON-CHAIN VERIFIED|LIVE/);});
test('detail keeps full receipt and related identity, with unavailable economics',async()=>{const f=fixture({selectedAgentId:'agent/one'});await flush();assert.match(f.host.innerHTML,/TOKEN DETAIL/);assert.match(f.host.innerHTML,/CANONICAL_SIGNATURE/);assert.match(f.host.innerHTML,/Market values, fees and token-holder rights · UNAVAILABLE/);assert.match(f.host.innerHTML,/ALL TOKENS/);});
test('confirmed diagnostics are closed by default and injected finalized detail cannot promote canonical missing proof',async()=>{
 const f=fixture({projectUnit:(a,d)=>({...project(a,d),launch:{...project(a,d).launch,receiptDetails:{bindingProvenance:'FINALIZED_M4_RECEIPT'}}})});await flush();
 assert.match(f.host.innerHTML,/<details><summary>Advanced · launch receipt<\/summary>/);assert.doesNotMatch(f.host.innerHTML,/<details open|Finalized launch receipt/);assert.match(f.host.innerHTML,/Confirmed launch receipt/);
 const primary=f.host.innerHTML.replace(/<details>[\s\S]*?<\/details>/g,'');assert.doesNotMatch(primary,/CANONICAL_SIGNATURE|Transaction delivery|Recorded receipt phase/);assert.match(primary,/VIEW ON PUMP.FUN/);
});
test('complete canonical finalized receipt earns precise primary label while workflow diagnostics stay secondary',async()=>{
 const a=agent('finalized'),d=dto(a);d.lifecycle.token.mint='So11111111111111111111111111111111111111112';
 d.lifecycle.launch.receiptDetails={executionId:'11111111-2222-3333-4444-555555555555',coinDraftAgentId:a.id,coinDraftRevision:1,metadataUri:'https://fixture.invalid/metadata',confirmedSlot:100,confirmedAt:1800000000000,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 const f=fixture({agents:[a],loadContract:async()=>d,projectUnit:launchpadUnit});await flush();assert.match(f.host.innerHTML,/Solana Mainnet · Pump.fun · Finalized launch receipt/);const primary=f.host.innerHTML.replace(/<details>[\s\S]*?<\/details>/g,'');assert.doesNotMatch(primary,/UNVERIFIED|CANONICAL_SIGNATURE|Recorded launch workflow/);assert.match(primary,/VIEW RELATED AGENT/);
});
test('visitor never reads or exposes private roster',async()=>{const f=fixture({owner:null});await flush();assert.equal(f.reads.length,0);assert.match(f.host.innerHTML,/Public opt-in token discovery is not available/);assert.doesNotMatch(f.host.innerHTML,/Actual Agent|Actual token/);});
test('mixed owner or duplicate IDs reject entire roster before reads',async()=>{for(const agents of [[agent(),{...agent('other'),creator:'wrong'}],[agent(),agent()]]){const f=fixture({agents});await flush();assert.equal(f.reads.length,0);assert.match(f.host.innerHTML,/INVENTORY ERROR/);}});
test('null roster, missing adapter, preview and unknown detail are unavailable rather than empty',async()=>{for(const overrides of [{agents:null},{loadContract:null},{projectUnit:null},{config:{preview:true}},{selectedAgentId:'not-owned'}]){const f=fixture(overrides);await flush();assert.match(f.host.innerHTML,/UNAVAILABLE/);assert.equal(f.reads.length,0);assert.doesNotMatch(f.host.innerHTML,/NO TOKENS YET/);}});
test('actual empty roster and identity-only inventory retain Agents link',async()=>{const empty=fixture({agents:[]});assert.match(empty.host.innerHTML,/NO TOKENS YET/);const a=agent('identity',null),f=fixture({agents:[a],loadContract:async()=>dto(a,'NOT_CONFIGURED')});await flush();assert.match(f.host.innerHTML,/NO TOKENS CONFIGURED/);assert.match(f.host.innerHTML,/1 Agent with TOKEN NOT CONFIGURED/);assert.doesNotMatch(f.host.innerHTML,/tw-token-card|pump.fun/);assert.match(f.host.innerHTML,/#\/agents/);});
test('confirmed receipt survives absent metadata without fabricating a token name',async()=>{const a=agent('identity',null),f=fixture({agents:[a],loadContract:async()=>dto(a)});await flush();assert.match(f.host.innerHTML,/CANONICAL_RECEIPT_MINT/);assert.match(f.host.innerHTML,/Token metadata unavailable/);});
test('inventory preserves tokenless launch and recovery lifecycle entries',async()=>{
 const a=agent('identity',null);
 for(const state of ['PREPARED','AWAITING_OWNER_APPROVAL','PENDING','RECONCILIATION_REQUIRED','FAILED','UNAVAILABLE']){
  const d=dto(a,state);d.lifecycle.launch.signature='LOCAL_RECOVERY_SIGNATURE';
  const f=fixture({agents:[a],loadContract:async()=>d});await flush();
  assert.match(f.host.innerHTML,new RegExp(`data-token-state="${state}"`));
  assert.match(f.host.innerHTML,/Token metadata unavailable/);
  assert.match(f.host.innerHTML,/#\/agent\/identity/);
  assert.match(f.host.innerHTML,/#\/tokens\/identity/);
  assert.doesNotMatch(f.host.innerHTML,/NO TOKENS CONFIGURED|pump.fun|MINT|LOCAL_RECOVERY_SIGNATURE|CANONICAL_RECEIPT_MINT|Actual token/);
 }
});
test('selected detail preserves tokenless recovery while ordinary identity stays unconfigured',async()=>{
 const a=agent('identity',null);
 for(const state of ['PREPARED','AWAITING_OWNER_APPROVAL','PENDING','RECONCILIATION_REQUIRED','FAILED','UNAVAILABLE']){
  const d=dto(a,state);d.lifecycle.launch.signature='LOCAL_RECOVERY_SIGNATURE';
  const f=fixture({agents:[a],selectedAgentId:a.id,loadContract:async()=>d});await flush();
  assert.match(f.host.innerHTML,new RegExp(`data-token-state="${state}"`));
  assert.match(f.host.innerHTML,/Token metadata unavailable/);
  assert.match(f.host.innerHTML,/#\/agent\/identity/);
  assert.match(f.host.innerHTML,/ALL TOKENS/);
  assert.doesNotMatch(f.host.innerHTML,/NO TOKENS CONFIGURED|pump.fun|MINT|LOCAL_RECOVERY_SIGNATURE|CANONICAL_RECEIPT_MINT|Actual token/);
 }
 const f=fixture({agents:[a],selectedAgentId:a.id,loadContract:async()=>dto(a,'NOT_CONFIGURED')});await flush();
 assert.match(f.host.innerHTML,/NO TOKENS CONFIGURED/);
 assert.doesNotMatch(f.host.innerHTML,/tw-token-card|pump.fun/);
});
test('draft, prepared, approval, failed and uncertain states never expose mint or external link',async()=>{const a=agent();for(const state of ['CONFIGURED_NOT_LAUNCHED','PREPARED','AWAITING_OWNER_APPROVAL','RECONCILIATION_REQUIRED','PENDING','FAILED','UNAVAILABLE']){const f=fixture({loadContract:async()=>dto(a,state)});await flush();assert.match(f.host.innerHTML,new RegExp(`data-token-state="${state}"`));assert.doesNotMatch(f.host.innerHTML,/CANONICAL_RECEIPT_MINT|pump.fun/);}});
test('wrong owner, Agent, lifecycle identity and unavailable projection fail closed',async()=>{const a=agent();for(const mutation of [d=>d.owner='wrong',d=>d.id='wrong',d=>d.lifecycle.agent.id='wrong']){const d=dto(a);mutation(d);let projected=false;const f=fixture({loadContract:async()=>d,projectUnit:()=>{projected=true;}});await flush();assert.equal(projected,false);assert.match(f.host.innerHTML,/UNAVAILABLE/);assert.doesNotMatch(f.host.innerHTML,/pump.fun/);}const f=fixture({projectUnit:(a,d)=>({...project(a,d),available:false})});await flush();assert.match(f.host.innerHTML,/UNAVAILABLE/);});
test('projector success cannot promote wrong network, draft or mismatched mint/signature',async()=>{const a=agent();for(const change of [d=>d.lifecycle.launch.network='solana:103',d=>d.lifecycle.token.state='CONFIGURED',d=>d.lifecycle.launch.signature=null,d=>d.lifecycle.launch.state='PREPARED']){const d=dto(a);change(d);const f=fixture({loadContract:async()=>d,projectUnit:()=>project(a,dto(a))});await flush();assert.doesNotMatch(f.host.innerHTML,/pump.fun|CANONICAL_RECEIPT_MINT|CANONICAL_SIGNATURE/);assert.match(f.host.innerHTML,/UNAVAILABLE/);}});
test('read rejection is error while malformed evidence is unavailable',async()=>{const f=fixture({loadContract:async()=>{throw Error('PRIVATE_DIAGNOSTIC');}});await flush();assert.match(f.host.innerHTML,/data-token-state="ERROR"/);assert.doesNotMatch(f.host.innerHTML,/PRIVATE_DIAGNOSTIC/);const missing=fixture({loadContract:async()=>null});await flush();assert.match(missing.host.innerHTML,/data-token-state="UNAVAILABLE"/);});
test('destroy and stale route prevent asynchronous rendering',async()=>{for(const destroy of [true,false]){let resolve,current=true;const f=fixture({isCurrent:()=>current,loadContract:()=>new Promise(r=>resolve=r)});await Promise.resolve();const loading=f.host.innerHTML;if(destroy)f.page.destroy();else current=false;resolve(dto(agent()));await flush();assert.equal(f.host.innerHTML,loading);}});
test('escaping and image protocol checks preserve safe authored text',async()=>{const a=agent('id"<',{name:'<script>bad</script>',ticker:'"X',image:'javascript:bad'}),f=fixture({agents:[a],loadContract:async()=>dto(a)});await flush();assert.match(f.host.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(f.host.innerHTML,/<script>|javascript:/);assert.match(f.host.innerHTML,/#\/agent\/id%22%3C/);});

test('confirmed detail links the exact launch transaction through current shared projection',async()=>{
 const a=agent('receipt-agent',null),d=dto(a);d.lifecycle.token.mint='1'.repeat(32);d.lifecycle.launch.signature='LOCAL_SIGNATURE_ONLY';
 const f=fixture({agents:[a],selectedAgentId:a.id,loadContract:async()=>d,projectUnit:launchpadUnit});await flush();
 assert.match(f.host.innerHTML,/href="https:\/\/explorer.solana.com\/tx\/LOCAL_SIGNATURE_ONLY" target="_blank" rel="noopener noreferrer"/);
 assert.match(f.host.innerHTML,/backend’s recorded receipt/);
 assert.match(f.host.innerHTML,/#\/agent\/receipt-agent/);
 assert.match(f.host.innerHTML,/<h3>Token metadata unavailable<\/h3>/);
 assert.match(f.host.innerHTML,/aria-label="Inspect Token metadata unavailable"/);
 assert.match(f.host.innerHTML,/Price and chart data · UNAVAILABLE/);
 assert.doesNotMatch(f.host.innerHTML,/ON-CHAIN VERIFIED|cluster=devnet/);
 const list=fixture({agents:[a],loadContract:async()=>d,projectUnit:launchpadUnit});await flush();
 assert.doesNotMatch(list.host.innerHTML,/VIEW LAUNCH TRANSACTION/);
});
test('current shared recovery projection explains uncertainty and preserves metadata-null Agent access',async()=>{
 for(const selectedAgentId of [null,'recovery']){
  const a=agent('recovery',null),d=dto(a,'RECONCILIATION_REQUIRED');d.lifecycle.launch.signature='LOCAL_UNKNOWN_SIGNATURE';
  const f=fixture({agents:[a],selectedAgentId,loadContract:async()=>d,projectUnit:launchpadUnit});await flush();
  assert.match(f.host.innerHTML,/transaction outcome is uncertain/);
  assert.match(f.host.innerHTML,/reconcile the existing receipt/);
  assert.match(f.host.innerHTML,/Do not start a fresh launch or rebroadcast/);
  assert.match(f.host.innerHTML,/#\/agent\/recovery/);
  assert.match(f.host.innerHTML,/<h3>Token metadata unavailable<\/h3>/);
  assert.doesNotMatch(f.host.innerHTML,/NO TOKENS CONFIGURED|explorer.solana.com|pump.fun|LOCAL_UNKNOWN_SIGNATURE|MINT/);
 }
});
test('pending fixture explains pending outcome without claiming a CURRENT submitted DTO',async()=>{
 const a=agent(),f=fixture({selectedAgentId:a.id,loadContract:async()=>dto(a,'PENDING')});await flush();
 assert.match(f.host.innerHTML,/transaction outcome is pending, not confirmed/);
 assert.match(f.host.innerHTML,/Do not start a fresh launch or rebroadcast/);
 assert.doesNotMatch(f.host.innerHTML,/VIEW LAUNCH TRANSACTION|explorer.solana.com|pump.fun/);
});
test('transaction link remains gated for wrong owner, network and non-null projector mismatch',async()=>{
 const a=agent();
 for(const change of [d=>d.owner='wrong',d=>d.lifecycle.launch.network='solana:103',d=>d.lifecycle.token.state='CONFIGURED',d=>d.lifecycle.launch.state='RECONCILIATION_REQUIRED']){
  const d=dto(a);change(d);const f=fixture({selectedAgentId:a.id,loadContract:async()=>d});await flush();
  assert.doesNotMatch(f.host.innerHTML,/explorer.solana.com|VIEW LAUNCH TRANSACTION|pump.fun/);
 }
 for(const field of ['mint','signature']){
  const f=fixture({selectedAgentId:a.id,projectUnit:(a,d)=>{const unit=project(a,d);if(field==='mint')unit.token.mint='NON_NULL_WRONG_MINT';else unit.launch.signature='NON_NULL_WRONG_SIGNATURE';return unit;}});await flush();
  assert.match(f.host.innerHTML,/UNAVAILABLE/);
  assert.doesNotMatch(f.host.innerHTML,/explorer.solana.com|VIEW LAUNCH TRANSACTION|pump.fun/);
 }
});
test('transaction path is encoded and receipt signature remains escaped text',async()=>{
 const a=agent(),d=dto(a);d.lifecycle.launch.signature='LOCAL/"<signature>?';
 const f=fixture({selectedAgentId:a.id,loadContract:async()=>d});await flush();
 assert.match(f.host.innerHTML,/https:\/\/explorer.solana.com\/tx\/LOCAL%2F%22%3Csignature%3E%3F/);
 assert.match(f.host.innerHTML,/LOCAL\/&quot;&lt;signature&gt;\?/);
 assert.doesNotMatch(f.host.innerHTML,/<signature>/);
});
import {ownerAgentContract} from '../server/launchpad-contracts.js';
const workflowReceipt=(a,more={})=>({agentId:a.id,owner:a.creator,network:'solana:101',status:'Unknown',signature:'LOCAL_UNKNOWN_SIGNATURE',broadcastAttempted:true,mint:'1'.repeat(32),...more});
const workflowFixture=(a,receipt,overrides={})=>{const reads=[];const f=fixture({agents:[a],loadContract:async id=>{reads.push(id);return ownerAgentContract(a,{receipt});},projectUnit:launchpadUnit,...overrides});return {...f,reads};};
test('Tokens list/detail distinguish signed workflow phase from delivery and finality proof',async()=>{
 const a=agent('workflow',null);
 for(const selectedAgentId of [null,a.id])for(const status of ['Unknown','Confirming','Submitted']){const receipt=workflowReceipt(a,{status,notice:'PRIVATE_DIAGNOSTIC',secret:'PRIVATE'}),before=JSON.stringify(receipt),f=workflowFixture(a,receipt,{selectedAgentId});assert.doesNotMatch(f.host.innerHTML,/data-token-workflow|Signature recorded/);await flush();
 assert.match(f.host.innerHTML,/RECONCILIATION REQUIRED/);assert.match(f.host.innerHTML,new RegExp('Recorded receipt phase · '+status+' \\(workflow only\\)'));assert.match(f.host.innerHTML,/BACKEND VERIFIED · Recorded launch workflow/);assert.match(f.host.innerHTML,/Signature recorded · YES/);assert.match(f.host.innerHTML,/Transaction delivery · UNVERIFIED/);assert.match(f.host.innerHTML,/Recorded finality · UNAVAILABLE · Reconciliation pending/);assert.match(f.host.innerHTML,/Signed outcome is unknown/);assert.match(f.host.innerHTML,/same-signature status/);assert.match(f.host.innerHTML,/#\/agent\/workflow/);assert.doesNotMatch(f.host.innerHTML,/PRIVATE|LOCAL_UNKNOWN_SIGNATURE|LAUNCH SUBMITTED|LAUNCH CONFIRMED|pump.fun|explorer.solana.com|ON-CHAIN VERIFIED|<button/);assert.deepEqual(f.reads,[a.id]);assert.equal(JSON.stringify(receipt),before);f.page.destroy();}
});
test('Tokens canonical confirmed/failed receipts retain backend finality and unverified delivery',async()=>{
 const a=agent('canonical');for(const selectedAgentId of [null,a.id])for(const [receipt,finality]of [[workflowReceipt(a,{status:'Success',confirmed:true}),'CONFIRMED'],[workflowReceipt(a,{status:'Failed',resolution:'ONCHAIN_FAILURE'}),'FAILED']]){const f=workflowFixture(a,receipt,{selectedAgentId});await flush();assert.match(f.host.innerHTML,new RegExp('Recorded finality · '+finality+' · Canonical '+(finality==='CONFIRMED'?'confirmed':'failed')+' receipt'));assert.match(f.host.innerHTML,/Transaction delivery · UNVERIFIED/);assert.match(f.host.innerHTML,/does not prove transaction delivery or independently verify the chain/);assert.doesNotMatch(f.host.innerHTML,/Reconciliation pending|ON-CHAIN VERIFIED/);if(finality==='FAILED')assert.doesNotMatch(f.host.innerHTML,/pump.fun|explorer.solana.com|LOCAL_UNKNOWN_SIGNATURE/);else assert.match(f.host.innerHTML,/pump.fun/);f.page.destroy();}
});
test('Tokens absent receipt/unsigned preparation do not imply signature or finality',async()=>{
 const a=agent('unsigned');for(const receipt of [null,workflowReceipt(a,{status:'Prepared',signature:null,broadcastAttempted:false}),workflowReceipt(a,{signature:null,broadcastAttempted:true})]){const f=workflowFixture(a,receipt,{selectedAgentId:a.id});await flush();assert.match(f.host.innerHTML,/Signature recorded · NO/);assert.match(f.host.innerHTML,/Recorded finality · UNAVAILABLE/);assert.doesNotMatch(f.host.innerHTML,/Signed outcome is unknown|same-signature status|pump.fun|explorer.solana.com/);if(receipt?.broadcastAttempted)assert.match(f.host.innerHTML,/Transaction outcome is unknown/);f.page.destroy();}
});
test('Tokens missing/contradictory workflow proof remains unavailable without leaking diagnostics',async()=>{
 const a=agent('bad-workflow');for(const change of [d=>delete d.lifecycle.launch.workflowProvenance,d=>d.lifecycle.launch.deliveryStatus='VERIFIED',d=>d.lifecycle.launch.receiptStatus='PRIVATE',d=>d.lifecycle.launch.signatureRecorded=false,d=>d.lifecycle.launch.finality='CONFIRMED',d=>d.lifecycle.launch.authorizationGranted=true,d=>d.lifecycle.launch.network='solana:103']){const d=ownerAgentContract(a,{receipt:workflowReceipt(a)});change(d);const f=fixture({agents:[a],selectedAgentId:a.id,loadContract:async()=>d,projectUnit:launchpadUnit});await flush();assert.match(f.host.innerHTML,/Recorded launch workflow · UNAVAILABLE/);assert.doesNotMatch(f.host.innerHTML,/PRIVATE|data-token-workflow|Signature recorded · YES|pump.fun|explorer.solana.com/);f.page.destroy();}
});
test('Tokens injected adapter cannot invent workflow authority or override canonical lifecycle',async()=>{
 const a=agent('adapter'),d=ownerAgentContract(a,{receipt:workflowReceipt(a)});for(const state of ['RECONCILIATION_REQUIRED','CONFIGURED_NOT_LAUNCHED']){const f=fixture({agents:[a],selectedAgentId:a.id,loadContract:async()=>d,projectUnit:(a,d)=>{const u=launchpadUnit(a,d);u.launch.state=state;u.launch.workflow={available:true,receiptStatus:'PRIVATE_SUCCESS',signatureRecorded:true,deliveryStatus:'VERIFIED',finality:'CONFIRMED',provenance:'ON-CHAIN VERIFIED'};return u;}});await flush();assert.doesNotMatch(f.host.innerHTML,/PRIVATE_SUCCESS|ON-CHAIN VERIFIED|Canonical confirmed receipt|Transaction delivery · VERIFIED/);assert.match(f.host.innerHTML,new RegExp(state==='RECONCILIATION_REQUIRED'?'Reconciliation pending':'Recorded launch workflow · UNAVAILABLE'));f.page.destroy();}
});
test('Tokens workflow respects visitor/owner/stale/error boundaries and tokenless identity validity',async()=>{
 const a=agent('private',null),d=ownerAgentContract(a,{receipt:workflowReceipt(a)});for(const change of [d=>d.owner='wrong',d=>d.id='wrong',d=>d.lifecycle.agent.id='wrong']){const bad=structuredClone(d);change(bad);const f=fixture({agents:[a],loadContract:async()=>bad,projectUnit:launchpadUnit});await flush();assert.doesNotMatch(f.host.innerHTML,/data-token-workflow|Signature recorded/);f.page.destroy();}
 const visitor=workflowFixture(a,workflowReceipt(a),{owner:null});await flush();assert.equal(visitor.reads.length,0);assert.doesNotMatch(visitor.host.innerHTML,/Actual Agent|data-token-workflow/);
 const identity=workflowFixture(a,null);await flush();assert.match(identity.host.innerHTML,/TOKEN NOT CONFIGURED/);assert.match(identity.host.innerHTML,/#\/agents/);assert.doesNotMatch(identity.host.innerHTML,/data-token-workflow|pump.fun/);
 let resolve,current=true;const stale=fixture({agents:[a],isCurrent:()=>current,loadContract:()=>new Promise(r=>resolve=r),projectUnit:launchpadUnit});await Promise.resolve();const before=stale.host.innerHTML;current=false;resolve(d);await flush();assert.equal(stale.host.innerHTML,before);
});
