import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Transaction,TransactionInstruction,PublicKey,VersionedTransaction,VersionedMessage} from '@solana/web3.js';
import {createM4Execution} from '../server/pump-m4.js';import {m4Fixture} from './pump-m4-fixture.mjs';
import {describeDiagnosticMessage,diagnosticMessageDiff,walletDiagnostic,createWalletDiagnosticStore,diagnoseWalletReturn} from '../server/pump-wallet-diagnostics.js';
import {LIGHTHOUSE_PROGRAM} from '../src/pump-wallet-final.js';
const actual=JSON.parse(readFileSync(new URL('./fixtures/phantom-lighthouse-20261007.json',import.meta.url)));
const get=f=>JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);
async function fixture(){const f=m4Fixture();const p=await f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});const s=get(f);s.walletDeliveryClaimed=true;f.db.prepare('UPDATE m4_execution SET payload=?').run(JSON.stringify(s));const tx=Transaction.from(Buffer.from(s.result.transactionBase64,'base64'));tx.add(new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:f.owner.publicKey,isSigner:true,isWritable:true}],data:Buffer.from('0604030040373c0a000000000403000001000000000000000000','hex')}));tx.partialSign(f.owner);return {...f,p,s,tx,body:{requestId:s.executionId,reviewDigest:s.result.executionReview.digest,returnedTransactionBase64:tx.serialize({requireAllSignatures:false}).toString('base64'),clientStage:'WALLET_RETURNED'}};}

test('exact recovered unsigned messages resolve changed indexes to unchanged semantic intent',()=>{
 const result=actual.result,a=describeDiagnosticMessage(actual.preparedMessageBase64,result,{messageOnly:true}),b=describeDiagnosticMessage(actual.walletMessageBase64,result,{messageOnly:true}),diff=diagnosticMessageDiff(a,b);
 assert.equal(a.messageSha256,'c2c5b046e3635c7d0247e0032f9d5a6b9b01514989125d85f7447c3023e49b8d');assert.equal(b.messageSha256,'30311cd44c4ada596f6147b6b2acd35f315ad2ecd62225b3b5fb24890af182f1');
 assert.equal(a.version,'legacy');assert.equal(b.version,'legacy');assert.equal(diff.accountOrderChanged,true);assert.equal(diff.signerSetChanged,false);assert.equal(diff.blockhashChanged,false);assert.equal(diff.computeBudgetChanged,false);assert.equal(diff.lookupTablesChanged,false);assert.deepEqual(diff.originalInstructionChanges,[]);assert.deepEqual(diff.privilegeOrRoleChanges,[]);assert.equal(diff.addedAccounts.length,1);assert.equal(diff.addedAccounts[0].pubkey,LIGHTHOUSE_PROGRAM);assert.equal(diff.addedAccounts[0].writable,false);assert.equal(diff.addedAccounts[0].signer,false);assert.equal(diff.addedInstructions[0].decoded.minimumLamports,'171718464');assert.equal(diff.addedInstructions[0].accounts[0].pubkey,result.launch.owner);
});
test('durable diagnostic is private, redacted, immutable, idempotent and never changes execution',async()=>{
 const f=await fixture();try{
  const before=f.db.prepare('SELECT payload FROM m4_execution').get().payload,receipt=f.controller.diagnose(f.identity,f.body);
  assert.equal(receipt.persisted,true);assert.deepEqual(f.controller.diagnose(f.identity,f.body),receipt);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM m4_wallet_diagnostics').get().n,1);
  const payload=JSON.parse(f.db.prepare('SELECT payload FROM m4_wallet_diagnostics').get().payload);assert.equal(payload.rule,'SEMANTIC_PASS');assert.equal(payload.source,'CLIENT_RETURN_OBSERVATION');assert.equal(payload.final.lighthouse[0].decoded.kind,'AssertAccountInfoMulti');
  const text=JSON.stringify(payload);for(const forbidden of [f.body.returnedTransactionBase64,Buffer.from(f.owner.secretKey).toString('base64'),Buffer.from(f.tx.signature).toString('base64')])assert.equal(text.includes(forbidden),false);
  assert.throws(()=>f.db.prepare("UPDATE m4_wallet_diagnostics SET payload='{}'").run(),/Immutable/);assert.throws(()=>f.db.prepare('DELETE FROM m4_wallet_diagnostics').run(),/Immutable/);
  const row=f.db.prepare('SELECT * FROM m4_wallet_diagnostics').get();assert.throws(()=>f.db.prepare('INSERT OR REPLACE INTO m4_wallet_diagnostics VALUES(?,?,?,?)').run(row.id,row.operation_id,row.fingerprint,'{}'),/Immutable/);
  const resumed=createM4Execution(f.deps);assert.deepEqual(resumed.diagnose(f.identity,f.body),receipt);assert.equal('diagnostics' in resumed.status(),false);assert.equal(f.db.prepare('SELECT payload FROM m4_execution').get().payload,before);assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('wrong owner/execution/review and unclaimed delivery cannot write evidence',async()=>{
 const f=await fixture();try{
  assert.throws(()=>f.controller.diagnose({...f.identity,owner:'wrong'},f.body));for(const key of ['requestId','reviewDigest'])assert.throws(()=>f.controller.diagnose(f.identity,{...f.body,[key]:'wrong'}),{code:'M4_DIAGNOSTIC_BINDING_REQUIRED'});
  const s=get(f);s.walletDeliveryClaimed=false;f.db.prepare('UPDATE m4_execution SET payload=?').run(JSON.stringify(s));assert.throws(()=>f.controller.diagnose(f.identity,f.body),{code:'M4_DIAGNOSTIC_BINDING_REQUIRED'});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM m4_wallet_diagnostics').get().n,0);assert.equal(f.sends(),0);
 }finally{f.db.close();}
});
test('malformed/oversized return, expired review and client quota stay diagnostic-only',async()=>{
 const f=await fixture();try{
  f.advance(100000);assert.equal(f.controller.diagnose(f.identity,f.body).persisted,true,'diagnostics survive expiry without authorizing send');
  assert.throws(()=>f.controller.diagnose(f.identity,{...f.body,returnedTransactionBase64:'a'.repeat(8193)}),{code:'M4_DIAGNOSTIC_INPUT_INVALID'});
  for(let i=0;i<7;i++)f.controller.diagnose(f.identity,{...f.body,returnedTransactionBase64:Buffer.from([i]).toString('base64')});
  assert.throws(()=>f.controller.diagnose(f.identity,{...f.body,returnedTransactionBase64:Buffer.from([9]).toString('base64')}),{code:'M4_DIAGNOSTIC_LIMIT'});assert.equal(f.sends(),0);
  const malformed=JSON.parse(f.db.prepare("SELECT payload FROM m4_wallet_diagnostics WHERE json_extract(payload,'$.final.available')=0 LIMIT 1").get().payload);assert.equal(malformed.final.error,'M4_DIAGNOSTIC_PARSE_FAILED');assert.equal(malformed.authorizationGranted,false);
 }finally{f.db.close();}
});
test('final simulation evidence binds request pubkeys and compiled balance indexes without raw data',async()=>{
 const f=await fixture();try{
  const keys=f.tx.compileMessage().accountKeys.map(k=>k.toBase58()),ownerIndex=keys.indexOf(f.identity.owner),pre=keys.map(()=>0),post=keys.map(()=>0);pre[ownerIndex]=182835778;post[ownerIndex]=177273200;
  const before={owner:'11111111111111111111111111111111',executable:false,lamports:182835778,data:['cHVibGlj','base64']},after={...before,lamports:177273200};
  const evidence={addresses:[LIGHTHOUSE_PROGRAM,f.identity.owner],sigVerify:true,before:{context:{slot:10},value:[null,before]},afterRead:{context:{slot:12},value:[null,before]},fee:{value:15218},simulation:{context:{slot:11},value:{err:null,fee:15218,preBalances:pre,postBalances:post,accounts:[null,after],logs:[]}}};
  const d=walletDiagnostic(f.s,{returnedTransactionBase64:f.body.returnedTransactionBase64,stage:'FINAL_REVALIDATION',rule:'M4_LIGHTHOUSE_PROGRAM_OR_STATE_CHANGED',evidence});assert.equal(d.finalSimulatedDebitLamports,5562578);assert.equal(d.accounts[1].pubkey,f.identity.owner);assert.equal(d.accounts[1].atomicDeltaLamports,-5562578);assert.equal(d.simulation.signatureVerificationRequested,true);assert.equal(d.accounts[1].before.data.length,6);assert.equal(JSON.stringify(d).includes('cHVibGlj'),false);
 }finally{f.db.close();}
});
