import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLaunchEvidence,lifecycleProjection} from '../server/launchpad-contracts.js';
const agent={id:'fixture',creator:'So11111111111111111111111111111111111111112',coin:{name:'Coin',ticker:'COIN'}};
test('complete existing v2 confirmation stays readable without acknowledgement backfill',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'tekkteam-confirmed-read-')),'receipt.json');
 const receipt={agentId:agent.id,owner:agent.creator,network:'solana:101',status:'Success',confirmed:true,mint:agent.creator,signature:'fixture-recorded-signature'};
 const bytes=JSON.stringify({version:2,receipts:{fixture:receipt}});writeFileSync(path,bytes);
 const evidence=readLaunchEvidence(agent,path);assert.equal(evidence.available,true);assert.deepEqual(evidence.receipt,receipt);
 const view=lifecycleProjection(agent,evidence);assert.equal(view.launch.state,'CONFIRMED');assert.equal(view.token.mint,receipt.mint);assert.equal(view.launch.finality,'CONFIRMED');assert.equal(view.launch.deliveryStatus,'UNVERIFIED');assert.equal(view.launch.authorizationGranted,false);
 assert.equal(readFileSync(path,'utf8'),bytes);
 assert.deepEqual(readLaunchEvidence({...agent,creator:'11111111111111111111111111111111'},path),{receipt:null,available:false});
});
test('passive reads fail closed for absent, corrupt, unsupported or contradictory journal',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'tekkteam-passive-')),'receipt.json');
 const assertUnavailable=()=>{const evidence=readLaunchEvidence(agent,path);assert.deepEqual(evidence,{receipt:null,available:false});const view=lifecycleProjection(agent,evidence);assert.equal(view.launch.state,'UNAVAILABLE');assert.equal(view.token.mint,null);assert.equal(view.launch.authorizationGranted,false);};
 assertUnavailable();assert.equal(existsSync(path),false);
 for(const data of ['broken',JSON.stringify({version:3,receipts:{}}),JSON.stringify({version:2,receipts:{fixture:{agentId:'fixture',owner:agent.creator,network:'solana:101',status:'Success',confirmed:true,mint:agent.creator}}}),JSON.stringify({version:2,receipts:{fixture:{agentId:'fixture',owner:agent.creator,network:'solana:101',status:'Prepared',signature:'signed',broadcastAttempted:true}}})]){
  writeFileSync(path,data);assertUnavailable();assert.equal(readFileSync(path,'utf8'),data);
 }
 writeFileSync(path,JSON.stringify({version:2,receipts:{}}));
 assert.equal(lifecycleProjection(agent,readLaunchEvidence(agent,path)).launch.state,'CONFIGURED_NOT_LAUNCHED');
 assert.equal(lifecycleProjection({...agent,coin:null},readLaunchEvidence(agent,path)).token.state,'NOT_CONFIGURED');
});
