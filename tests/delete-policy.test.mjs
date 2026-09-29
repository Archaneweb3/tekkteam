import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteBlockers} from '../server/delete-policy.js';

const codes=state=>deleteBlockers(state).map(x=>x.code);
test('empty draft dependencies permit existing deletion policy',()=>assert.deepEqual(codes(),[]));
test('empty custody wallet still requires an archive/cleanup path',()=>assert.deepEqual(codes({wallet:true,solLamports:0}),['CUSTODY_OR_AUDIT_RECORDS']));
test('real value and open positions give specific blockers',()=>{
 const blocked=codes({wallet:true,solLamports:5401560,tokenBalances:[{amount:'45962'}],realPosition:true});
 assert.deepEqual(blocked,['AGENT_WALLET_HAS_SOL','AGENT_WALLET_HAS_TOKENS','REAL_POSITION_OPEN','CUSTODY_OR_AUDIT_RECORDS']);
});
test('unverified wallet balance fails closed',()=>assert.ok(codes({wallet:true,solLamports:null}).includes('WALLET_BALANCE_UNAVAILABLE')));
test('active, unknown, reserved and pending launch states block separately',()=>{
 const blocked=codes({activeExecution:true,unresolvedExecution:true,activeReservation:true,pendingSubmission:true});
 assert.deepEqual(blocked,['ACTIVE_RESERVATION','UNRESOLVED_EXECUTION','PENDING_TOKEN_SUBMISSION']);
});
test('paper position and immutable real history are not silently destroyed',()=>assert.deepEqual(codes({paperPosition:true,realHistory:true}),['PAPER_POSITION_OPEN','CUSTODY_OR_AUDIT_RECORDS']));
