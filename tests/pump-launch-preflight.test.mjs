import test from 'node:test';
import assert from 'node:assert/strict';
import {launchBalancePreflight,launchProductError,launchDiagnostics} from '../src/pump-launch-preflight.js';
import {classifyLaunchPreparationFailure} from '../server/pump-launch.js';

test('known insufficient initial buy is blocked; sufficient and zero buy remain eligible for exact preparation',()=>{
 assert.equal(launchBalancePreflight('0.1',17_664_446).insufficient,true);
 assert.equal(launchBalancePreflight('0.005',17_664_446).insufficient,false);
 assert.equal(launchBalancePreflight('0',17_664_446).insufficient,false);
 assert.equal(launchBalancePreflight('0.025',17_664_446).insufficient,true);
 assert.equal(launchBalancePreflight('0.005',null).availableLamports,null);
 assert.equal(launchBalancePreflight('0.005',17_664_446).exactRequiredLamports,null);
 assert.throws(()=>launchBalancePreflight('-1',17_664_446));
});

test('warning plus fatal classifies only the known failure, never raw process output',()=>{
 const stderr='(node:1234) [DEP0040] DeprecationWarning: punycode\nC:/Users/private/scripts/pump-readiness.mjs:42\nError: Insufficient Mainnet SOL for initial buy and launch costs\n    at prepare (C:/Users/private/file.js:90)\nNode.js v24.1.0';
 const result=classifyLaunchPreparationFailure(stderr);
 assert.equal(result.code,'INSUFFICIENT_LAUNCH_BALANCE');
 assert.doesNotMatch(JSON.stringify(result),/punycode|C:|Node\.js|DEP0040|:42/);
 const product=launchProductError(result);
 assert.equal(product.title,'NOT ENOUGH SOL');
 assert.doesNotMatch(JSON.stringify(product),/punycode|C:|Node\.js|DEP0040/);
});

test('unknown preparation failure is generic and does not expose paths or stack',()=>{
 const stderr='Error: private failure at C:/Users/private/file.js:90\nNode.js v24.1.0';
 const result=classifyLaunchPreparationFailure(stderr);
 assert.equal(result.code,'LAUNCH_PREPARATION_FAILED');
 assert.doesNotMatch(JSON.stringify(result),/private|C:|Node\.js/);
 const product=launchProductError(result);
 assert.equal(product.title,'PREPARATION FAILED');
 assert.doesNotMatch(JSON.stringify(product),/private|C:/);
});

test('offline service, rate limit and state conflict have distinct safe product errors',()=>{
 assert.equal(launchProductError({code:'LAUNCH_SERVICE_UNAVAILABLE'}).title,'LAUNCH SERVICE UNAVAILABLE');
 assert.equal(launchProductError({code:'WALLET_NOT_CONNECTED'}).title,'CONNECT YOUR WALLET');
 assert.equal(launchProductError({code:'LAUNCH_STATE_CONFLICT'}).title,'CHECK LAUNCH STATUS');
 assert.equal(classifyLaunchPreparationFailure('(node:1) [DEP0040] punycode warning\nError: RPC HTTP 429').code,'RPC_RATE_LIMIT');
 assert.equal(launchProductError({code:'RPC_RATE_LIMIT'}).title,'RPC TEMPORARILY BUSY');
});

test('copied diagnostics exclude arbitrary backend error and secret-bearing fields',()=>{
 const report=launchDiagnostics({code:'LAUNCH_PREPARATION_FAILED',message:'https://rpc.example/?api-key=SECRET',attempt:{attemptId:'abc123',status:'FAILED',failureStage:'SIMULATION',failureCode:'RPC_RATE_LIMIT',httpStatus:503,rpcCode:-32016,ownerAuth:true,mainnet:true,balance:true,metadata:true,build:true,validation:true,simulation:false,prepared:false,stack:'C:\\private\\secret.js',rpcUrl:'https://rpc.example/?api-key=SECRET',service:{requestStarted:true,reachable:true,httpStatus:503,responseReceived:true,responseClassification:'RPC_RATE_LIMIT',cookie:'SECRET'}}});
 assert.equal(report.attemptId,'abc123');assert.equal(report.failureStage,'SIMULATION');
 assert.equal(report.service.responseClassification,'RPC_RATE_LIMIT');
 assert.doesNotMatch(JSON.stringify(report),/SECRET|private|rpc\.example|api-key|cookie|stack/);
});
