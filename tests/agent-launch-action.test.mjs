import test from 'node:test';import assert from 'node:assert/strict';
import {agentLaunchAction} from '../public/app/agent-launch-action.js';
test('canonical launch action never treats uncertainty or a foreign Agent as permission to prepare',()=>{
 const value=state=>({agent:{id:'a'},launch:{state},token:{mint:null}});
 assert.equal(agentLaunchAction(value('CONFIGURED_NOT_LAUNCHED'),'a').action,'review');
 for(const state of ['RECONCILIATION_REQUIRED','AWAITING_OWNER_APPROVAL','PREPARED','FAILED','NOT_CONFIGURED'])assert.equal(agentLaunchAction(value(state),'a').action,'lifecycle');
 for(const state of ['UNAVAILABLE','CONFIRMED','invented'])assert.equal(agentLaunchAction(value(state),'a').action,null);
 assert.equal(agentLaunchAction(value('CONFIGURED_NOT_LAUNCHED'),'other').action,null);
 const confirmed={agent:{id:'a'},launch:{state:'CONFIRMED',signature:'verified-signature',network:'solana:101'},token:{mint:'verified-mint'}};
 assert.equal(agentLaunchAction(confirmed,'a').action,'lifecycle');
 confirmed.launch.network='devnet';assert.equal(agentLaunchAction(confirmed,'a').action,null);
});
