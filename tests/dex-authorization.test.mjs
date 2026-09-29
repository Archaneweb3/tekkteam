import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeRealExecution,EXECUTION_MODES,issueConfirmationCapability} from '../server/dex/authorization.js';

const base=()=>{
 const context={authenticated:true,owner:'owner',agentId:'agent',agentWallet:'wallet'};
 const intent={mode:'CONTROLLED_REAL',owner:'owner',agentId:'agent',agentWallet:'wallet',direction:'BUY',inputMint:'SOL',outputMint:'USDC',inputAmount:'100000',slippageBps:100,expiresAt:30000};
 const record={id:'execution',status:'PREPARED',fingerprint:'intent-hash',intent,quote:{minimumOutput:'123'},pool:'verified-pool',routePolicyVersion:'cpmm-v1',messageHash:'exact-message',risk:{expiresAt:20000}};
 const flags={controlledEnabled:true,liveEnabled:false,killSwitch:true,realMoneyEmergencyStop:false};
 const {token,...capability}=issueConfirmationCapability(record,{now:()=>1000,bytes:()=>Buffer.alloc(32,7)});
 const prepared={...record,...capability};
 const reservation={operationId:'dex:execution',status:'PREPARED',intentHash:'intent-hash'};
 const check=(patch={})=>authorizeRealExecution({mode:EXECUTION_MODES.CONTROLLED_REAL,flags,context,record:prepared,confirmation:{token},reservation,phase:'CONFIRM',now:()=>1000,...patch});
 return {context,record:prepared,flags,reservation,token,check};
};

test('controlled owner capability works while autonomous kill switch stays active',()=>{const f=base();assert.equal(f.check(),true);assert.equal(f.flags.killSwitch,true);});
test('disabled controlled, enabled Live, and emergency stop fail closed',()=>{const f=base();for(const flags of [{...f.flags,controlledEnabled:false},{...f.flags,liveEnabled:true},{...f.flags,realMoneyEmergencyStop:true},{...f.flags,realMoneyEmergencyStop:undefined}])assert.throws(()=>f.check({flags}));});
test('Paper, AI loop and Live Autonomous cannot consume controlled capability',()=>{const f=base();for(const mode of [EXECUTION_MODES.PAPER,EXECUTION_MODES.LIVE_AUTONOMOUS])assert.throws(()=>f.check({mode}));for(const flags of [{...f.flags,killSwitch:true,liveEnabled:true},{...f.flags,killSwitch:false,liveEnabled:true}])assert.throws(()=>f.check({mode:EXECUTION_MODES.LIVE_AUTONOMOUS,flags}));});
test('owner/agent/wallet, token, expiry and reservation are mandatory',()=>{const f=base();for(const context of [{...f.context,authenticated:false},{...f.context,owner:'other'},{...f.context,agentId:'other'},{...f.context,agentWallet:'other'}])assert.throws(()=>f.check({context}));for(const token of ['', 'wrong', undefined])assert.throws(()=>f.check({confirmation:{token}}));assert.throws(()=>f.check({now:()=>20000}),/EXPIRED/);for(const reservation of [null,{...f.reservation,status:'FAILED'},{...f.reservation,intentHash:'other'}])assert.throws(()=>f.check({reservation}));});
test('every immutable review field and final message remains capability-bound',()=>{const f=base();for(const change of [r=>r.intent.inputAmount='200000',r=>r.intent.inputMint='other',r=>r.intent.outputMint='other',r=>r.intent.direction='SELL',r=>r.intent.owner='other',r=>r.quote.minimumOutput='124',r=>r.pool='other',r=>r.messageHash='other',r=>r.routePolicyVersion='other',r=>r.intent.slippageBps=50,r=>r.capabilityExpiresAt=19000]){const r=structuredClone(f.record);change(r);assert.throws(()=>f.check({record:r}));}});
