import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deriveLaunchViewState} from '../src/pump-launch-view-state.js';

const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const agentId='agent-fixture';
const base={agentId,owner,network:'solana:101'};
const receipt=(status,extra={})=>({...base,id:'launch-1',status,confirmed:false,...extra});
const attempt=(status,extra={})=>({attemptId:'attempt-1',agentId,status,...extra});
const view=(r=null,a=null,phase=null)=>deriveLaunchViewState({receipt:r,attempt:a,phase});

test('not launched: no false mint or transaction success',()=>{
 const state=view(receipt('Idle'));
 assert.equal(state.lifecycle,'NOT_LAUNCHED');
 assert.equal(state.showSuccess,false);
 assert.equal(state.showPending,false);
 assert.equal(state.showApproval,false);
});

test('preparing is an attempt state, not a launched token',()=>{
 const state=view(receipt('Idle'),attempt('IN_PROGRESS',{currentStage:'TRANSACTION_BUILD'}),'preparing');
 assert.equal(state.lifecycle,'NOT_LAUNCHED');
 assert.equal(state.attemptStatus,'IN_PROGRESS');
 assert.equal(state.showSuccess,false);
});

test('prepared is reviewable but not launched or submitted',()=>{
 const state=view(receipt('Prepared',{mint:'mint-fixture',initialBuyLamports:0}));
 assert.equal(state.lifecycle,'NOT_LAUNCHED');
 assert.equal(state.showSuccess,false);
 assert.equal(state.showPending,false);
 assert.equal(state.initialBuyLamports,0);
});

test('wallet approval is not a confirmed launch',()=>{
 const state=view(receipt('Awaiting approval',{mint:'mint-fixture'}),attempt('PREPARED'),'awaitingApproval');
 assert.equal(state.lifecycle,'NOT_LAUNCHED');
 assert.equal(state.showSuccess,false);
 assert.equal(state.showPending,false);
});

test('submitted signature is pending and must not expose fresh prepare',()=>{
 const state=view(receipt('Confirming',{signature:'signature-fixture',mint:'mint-fixture',broadcastAttempted:true}));
 assert.equal(state.lifecycle,'PENDING');
 assert.equal(state.showPending,true);
 assert.equal(state.showSuccess,false);
 assert.equal(state.canPrepare,false);
});

test('confirmed Mainnet receipt outranks a later failed attempt',()=>{
 const state=view(receipt('Success',{confirmed:true,signature:'signature-fixture',mint:'mint-fixture'}),attempt('FAILED',{failureCode:'RPC_UNAVAILABLE'}));
 assert.equal(state.lifecycle,'LAUNCHED');
 assert.equal(state.attemptStatus,'FAILED');
 assert.equal(state.showSuccess,true);
 assert.equal(state.showFailure,false);
 assert.equal(state.canPrepare,false);
});

test('failed before transaction has no stale mint or signature in failure state',()=>{
 const state=view(receipt('Idle'),attempt('FAILED',{failureStage:'TRANSACTION_BUILD',failureCode:'BUILD_FAILED'}));
 assert.equal(state.lifecycle,'NOT_LAUNCHED');
 assert.equal(state.attemptStatus,'FAILED');
 assert.equal(state.showFailure,true);
 assert.equal(state.showSuccess,false);
 assert.equal(state.showPending,false);
});

test('unknown signature is not treated as failed or safe to retry',()=>{
 const state=view(receipt('Confirming',{signature:'signature-fixture',mint:'mint-fixture',broadcastAttempted:true,notice:'Broadcast outcome unknown. Check confirmation; never resubmit this launch.'}));
 assert.equal(state.lifecycle,'UNKNOWN');
 assert.equal(state.showPending,true);
 assert.equal(state.showSuccess,false);
 assert.equal(state.canPrepare,false);
});

test('already launched never offers Prepare even if latest attempt is failed',()=>{
 const state=view(receipt('Success',{confirmed:true,signature:'signature-fixture',mint:'mint-fixture',initialBuyLamports:0}),attempt('FAILED'));
 assert.equal(state.lifecycle,'LAUNCHED');
 assert.equal(state.canPrepare,false);
 assert.equal(state.initialBuyLamports,0);
});

test('a failed signed transaction is not mistaken for a pre-transaction failure',()=>{
 const state=view(receipt('Failed',{signature:'failed-signature',mint:'mint-fixture',broadcastAttempted:true,error:'Transaction failed on-chain'}),attempt('FAILED'));
 assert.equal(state.showSuccess,false);
 assert.equal(state.canPrepare,false);
});
