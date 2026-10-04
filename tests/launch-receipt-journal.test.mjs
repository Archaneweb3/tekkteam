import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReceiptJournal} from '../server/launch-receipt-journal.js';

const record={agentId:'a',owner:'11111111111111111111111111111111',network:'solana:101',status:'Prepared',confirmed:false};
function fixture(t){const dir=fs.mkdtempSync(join(tmpdir(),'tekk-receipt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return join(dir,'receipts.json');}
test('missing journal requires explicit initialization; corrupt/version/owner/state fail closed',t=>{
 const path=fixture(t);assert.throws(()=>createReceiptJournal(path),{code:'ENOENT'});
 for(const data of ['{',JSON.stringify({version:3,receipts:{}}),JSON.stringify({version:2,receipts:{a:{...record,owner:'bad'}}}),JSON.stringify({version:2,receipts:{a:{...record,status:'Success'}}})]){
  fs.writeFileSync(path,data);assert.throws(()=>createReceiptJournal(path,{initializeMissing:true}));assert.equal(fs.readFileSync(path,'utf8'),data);
 }
});
test('commit survives restart, stores only public receipt and reports Windows durability honestly',t=>{
 const path=fixture(t),j=createReceiptJournal(path,{initializeMissing:true,platform:'win32'});
 const ack=j.commit({a:record});assert.equal(ack.persistence,'VERIFIED_LOCAL');assert.equal(ack.powerLossDurability,'UNVERIFIED');assert.equal(ack.authorizationGranted,false);
 assert.deepEqual(createReceiptJournal(path).read(),{a:record});assert.equal(fs.existsSync(path+'.write-lock'),false);
 assert.throws(()=>j.commit({a:{...record,secret:'private'}}),{code:'RECEIPT_JOURNAL_INVALID'});
});
for(const phase of ['open','write','file-sync','close','rename'])test('failure before '+phase+' leaves canonical bytes unchanged and permits safe retry',t=>{
 const path=fixture(t);createReceiptJournal(path,{initializeMissing:true});const before=fs.readFileSync(path);let fail=true;
 const j=createReceiptJournal(path,{checkpoint:p=>{if(fail&&p===phase)throw Error('injected');}});
 assert.throws(()=>j.commit({a:record}));assert.deepEqual(fs.readFileSync(path),before);assert.deepEqual(j.read(),{});
 fail=false;j.commit({a:record});assert.deepEqual(j.read(),{a:record});
});
for(const phase of ['directory-sync','verify'])test('uncertain post-rename '+phase+' fences writer, restart observes committed latch',t=>{
 const path=fixture(t);createReceiptJournal(path,{initializeMissing:true});
 const j=createReceiptJournal(path,{checkpoint:p=>{if(p===phase)throw Error('injected');}});
 assert.throws(()=>j.commit({a:record}));assert.throws(()=>j.read(),{code:'RECEIPT_JOURNAL_FENCED'});assert.deepEqual(createReceiptJournal(path).read(),{a:record});
});
test('cooperating stale writer and read disagreement cannot overwrite another commit',t=>{
 const path=fixture(t),first=createReceiptJournal(path,{initializeMissing:true}),stale=createReceiptJournal(path);
 first.commit({a:record});assert.throws(()=>stale.commit({}),{code:'RECEIPT_JOURNAL_STALE_WRITER'});assert.deepEqual(first.read(),{a:record});
 const reader=createReceiptJournal(path);first.commit({});assert.throws(()=>reader.read(),{code:'RECEIPT_JOURNAL_EXTERNAL_CHANGE'});
});
test('exclusive lock is never cleared by contender',t=>{
 const path=fixture(t),j=createReceiptJournal(path,{initializeMissing:true});fs.writeFileSync(path+'.write-lock','other');
 assert.throws(()=>j.commit({a:record}),{code:'RECEIPT_JOURNAL_WRITER_BUSY'});assert.equal(fs.readFileSync(path+'.write-lock','utf8'),'other');assert.deepEqual(j.read(),{});
});
test('oversized aggregate is rejected before replacing canonical journal',t=>{
 const path=fixture(t),j=createReceiptJournal(path,{initializeMissing:true}),before=fs.readFileSync(path);
 assert.throws(()=>j.commit({a:{...record,description:'x'.repeat(8*1024*1024)}}),{code:'RECEIPT_JOURNAL_TOO_LARGE'});
 assert.deepEqual(fs.readFileSync(path),before);assert.deepEqual(j.read(),{});
});
