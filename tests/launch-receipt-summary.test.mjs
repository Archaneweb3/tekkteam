// DERIVED / LOCAL_FIXTURE. Never an on-chain receipt or an owner session.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {lifecycleProjection,ownerAgentContract,readLaunchEvidence} from '../server/launchpad-contracts.js';
import {createReceiptJournal} from '../server/launch-receipt-journal.js';
import {launchpadUnit} from '../public/app/launchpad-view-model.js';
import {renderLaunchpadPage,mountLaunchpadPage} from '../public/app/launchpad-page.js';
import {confirmedReceiptDetails} from '../public/app/launch-receipt-summary.js';
const agent={id:'M5_LOCAL_FIXTURE',creator:'So11111111111111111111111111111111111111112',name:'Fixture Agent',character:'frank',strategy:'balanced',coin:{name:'Fixture',ticker:'FIX',mint:null}};
const receipt=()=>({agentId:agent.id,owner:agent.creator,network:'solana:101',status:'Success',confirmed:true,mint:'So11111111111111111111111111111111111111112',signature:'LOCAL_FIXTURE_SIGNATURE',id:'e093f791-91af-4f5c-bc79-5f127c9c9e90',executionId:'e093f791-91af-4f5c-bc79-5f127c9c9e90',metadataUri:'https://fixture.invalid/metadata',confirmedSlot:123,confirmedAt:1791125477000,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR',coinDraftAgentId:agent.id,coinDraftRevision:1,reviewDigest:'a'.repeat(64),signedTransactionDigest:'b'.repeat(64),submittedAt:1791125470000,contextSlot:120,blockTime:1791125477});
const unit=r=>launchpadUnit(agent,ownerAgentContract(agent,{receipt:r}));
test('confirmed owner receipt allowlist exposes binding without draft mutation or private bytes',()=>{
 const before=JSON.stringify(agent),r={...receipt(),secret:'PRIVATE',transactionBase64:'PRIVATE',wallet:'PRIVATE'};
 const dto=ownerAgentContract(agent,{receipt:r});assert.equal(dto.lifecycle.launch.receiptDetails.bindingProvenance,'FINALIZED_M4_RECEIPT');
 assert.equal(dto.lifecycle.launch.receiptDetails.coinDraftRevision,1);assert.doesNotMatch(JSON.stringify(dto),/PRIVATE/);assert.equal(JSON.stringify(agent),before);assert.equal(agent.coin.mint,null);
 assert.deepEqual(Object.keys(dto.lifecycle.launch.receiptDetails),['metadataUri','confirmedSlot','confirmedAt','pumpProvenance','coinDraftAgentId','coinDraftRevision','executionId','bindingProvenance']);
 assert.equal(lifecycleProjection(agent,{receipt:{...receipt(),id:'OTHER'}}).launch.receiptDetails.bindingProvenance,'UNAVAILABLE');
});
test('unknown/unconfirmed and wrong owner Agent or network expose no confirmed summary',()=>{
 for(const mutate of [r=>r.owner='OTHER',r=>r.agentId='OTHER',r=>r.network='solana:103',r=>{r.status='Unknown';r.confirmed=false;},r=>{r.status='Submitted';r.confirmed=false;}]){const r=receipt();mutate(r);assert.equal(lifecycleProjection(agent,{receipt:r}).launch.receiptDetails,null);assert.equal(unit(r).launch.confirmed,false);}
});
test('legacy confirmed fields remain nullable and never infer M4 provenance or revision',()=>{
 const r=receipt();for(const key of ['executionId','coinDraftAgentId','coinDraftRevision','pumpProvenance','confirmedSlot','confirmedAt'])delete r[key];
 const u=unit(r);assert.equal(u.launch.confirmed,true);assert.equal(u.launch.receiptDetails.bindingProvenance,'UNAVAILABLE');assert.equal(u.launch.receiptDetails.coinDraftRevision,null);
 const html=renderLaunchpadPage({agents:[agent],owner:agent.creator,units:[u]});assert.match(html,/LAUNCH CONFIRMED/);assert.match(html,/Launch timestamp<\/dt><dd[^>]*>UNAVAILABLE/);assert.doesNotMatch(html,/Finalized M4 receipt/);
});
test('unsafe URLs, invalid slot and out of range dates are unavailable and cannot break rendering',()=>{
 for(const uri of ['javascript:alert(1)','http://fixture.invalid/meta','https://user:password@fixture.invalid/meta','invalid'])assert.equal(confirmedReceiptDetails({...receipt(),metadataUri:uri},agent.id).metadataUri,null);
 for(const confirmedAt of [-1,Infinity,Number.MAX_SAFE_INTEGER,'1791125477000']){const r={...receipt(),confirmedAt,confirmedSlot:-1},u=unit(r);assert.equal(u.launch.receiptDetails.confirmedAt,null);assert.equal(u.launch.receiptDetails.confirmedSlot,null);assert.doesNotThrow(()=>renderLaunchpadPage({agents:[agent],owner:agent.creator,units:[u]}));}
});
test('LAUNCHED label follows matching Agent ID and next action only navigates existing Agent',()=>{
 const u=unit(receipt()),other={...agent,id:'OTHER',name:'Other'};
 const html=renderLaunchpadPage({agents:[other,agent],owner:agent.creator,units:[u],tokenSavedAvailability:{[agent.id]:true},launchControls:true});
 assert.match(html,/Fixture Agent · LAUNCHED/);assert.doesNotMatch(html,/Fixture Agent · Saved coin draft/);
 assert.match(html,/Other<\/h3>[\s\S]*?STATUS UNAVAILABLE/);
 // Correctly ordered card roster is separately rendered; no real launch/funding callback.
 const card=renderLaunchpadPage({agents:[agent],owner:agent.creator,units:[u],tokenSavedAvailability:{[agent.id]:true},launchControls:true});
 assert.match(card,/href="#\/agent\/M5_LOCAL_FIXTURE">CONFIGURE \/ FUND AGENT/);assert.match(card,/Transaction signature/);assert.match(card,/VIEW METADATA/);assert.doesNotMatch(card,/data-launchpad-inspect|>REVIEW LAUNCH</);assert.match(card,/Funding and trading require separate authorization/);
});
test('confirmed selector remains enabled without draft read and only navigates existing Agent',async()=>{
 const listeners={},selected={value:agent.id},host={innerHTML:'',addEventListener:(type,fn)=>listeners[type]=fn,removeEventListener:type=>delete listeners[type],querySelector:selector=>selector==='[data-launchpad-selected-agent]'?selected:null};
 let preparations=0;const navigation=[];
 const mounted=mountLaunchpadPage(host,{agents:[agent],owner:agent.creator,loadContract:async()=>ownerAgentContract(agent,{receipt:receipt()}),onLaunch:()=>preparations++,onEntered:id=>navigation.push(id)});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(host.innerHTML,/<option value="M5_LOCAL_FIXTURE" >Fixture Agent · LAUNCHED/);
 listeners.click({target:{closest:selector=>selector==='[data-launchpad-selected-open]'?{}:null}});
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(navigation,[agent.id]);assert.equal(preparations,0);mounted.destroy();
});
test('disposable journal reload derives receipt relation without rewriting immutable draft',()=>{
 const directory=mkdtempSync(join(tmpdir(),'tekkteam-m5-local-fixture-')),path=join(directory,'receipts.json');
 try{const journal=createReceiptJournal(path,{initializeMissing:true});journal.commit({[agent.id]:receipt()});const first=readLaunchEvidence(agent,path),second=readLaunchEvidence(agent,path);assert.deepEqual(first,second);const u=unit(second.receipt);assert.equal(u.launch.confirmed,true);assert.equal(u.launch.receiptDetails.bindingProvenance,'FINALIZED_M4_RECEIPT');assert.equal(agent.coin.mint,null);}finally{rmSync(directory,{recursive:true,force:true});}
});
