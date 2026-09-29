import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrepareAttemptJournal,publicAttempt,safeDiagnosticMessage} from '../server/pump-prepare-diagnostics.js';

test('prepare attempt is durable before work and every terminal failure retains its first stage',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'tekkwork-attempt-')),'attempts.json');
 const journal=createPrepareAttemptJournal(file);
 const cases=[
  ['OWNER_AUTH','OWNER_AUTH_FAILED'],['MAINNET_VERIFY','MAINNET_VERIFY_FAILED'],
  ['PAYER_BALANCE','INSUFFICIENT_LAUNCH_BALANCE'],['METADATA_VERIFY','METADATA_FAILED'],
  ['PUMP_READINESS','LAUNCH_SERVICE_UNAVAILABLE'],['TRANSACTION_BUILD','BUILD_FAILED'],
  ['VALIDATION','VALIDATION_FAILED'],['SIMULATION','SIMULATION_FAILED']
 ];
 for(const [stage,code] of cases){
  const attempt=journal.begin({agentId:'fixture-agent',payer:'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS'});
  assert.ok(attempt.attemptId);
  assert.equal(attempt.finalStatus,'IN_PROGRESS');
  journal.stage(attempt,stage);
  journal.fail(attempt,Object.assign(Error('RPC URL https://rpc.example/?api-key=SECRET path C:\\private\\secret.js'),{code}),400);
  const publicRecord=publicAttempt(attempt);
  assert.equal(publicRecord.status,'FAILED');
  assert.equal(publicRecord.failureStage,stage);
  assert.equal(publicRecord.failureCode,code);
  assert.equal(publicRecord.httpStatus,400);
  assert.ok(attempt.completedAt);
  assert.doesNotMatch(JSON.stringify(attempt),/SECRET|private\\secret|rpc\.example/);
 }
 const stored=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(stored.attempts.length,cases.length);
 assert.equal(new Set(stored.attempts.map(x=>x.attemptId)).size,cases.length);
});

test('warnings remain distinct from fatal diagnostic and details are allowlisted',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'tekkwork-attempt-')),'attempts.json');
 const journal=createPrepareAttemptJournal(file);
 const attempt=journal.begin({agentId:'fixture',payer:'not-a-public-key',token:'SECRET'});
 assert.equal(attempt.payer,null);
 journal.stage(attempt,'SIMULATION');
 journal.update(attempt,{warnings:[{code:'DEP0040',message:'Node deprecation warning'}]});
 journal.fail(attempt,Object.assign(Error('RPC HTTP 429 from https://secret-rpc.example/?api-key=SECRET'),{code:'RPC_RATE_LIMIT',rpcCode:-32016,processExitCode:1}),503);
 const saved=JSON.parse(readFileSync(file,'utf8')).attempts[0];
 assert.equal(saved.failureStage,'SIMULATION');
 assert.equal(saved.failureCode,'RPC_RATE_LIMIT');
 assert.equal(saved.rpcCode,-32016);
 assert.equal(saved.processExitCode,1);
 assert.equal(saved.warnings[0].code,'DEP0040');
 assert.match(saved.sanitizedMessage,/rate limit/i);
 assert.doesNotMatch(JSON.stringify(saved),/SECRET|secret-rpc\.example|api-key|token/);
 assert.equal(safeDiagnosticMessage('C:\\private\\secret.js unknown'), 'Launch preparation failed; see failure code and stage');
});

test('browser attempt ID is preserved server-side but reuse cannot overwrite historical attempts',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'tekkwork-attempt-')),'attempts.json');
 const journal=createPrepareAttemptJournal(file);
 const attemptId='c8293290-c747-4ecd-bd4e-438bc4bf6a9d';
 const first=journal.begin({attemptId,agentId:'agent-one'});
 assert.equal(first.attemptId,attemptId);
 journal.fail(first,Object.assign(Error('fixture'),{code:'FIXTURE_FAILURE'}),400);
 const second=journal.begin({attemptId,agentId:'agent-one'});
 assert.notEqual(second.attemptId,attemptId);
 assert.equal(journal.all()[0].finalStatus,'FAILED');
 assert.equal(journal.all().length,2);
});
