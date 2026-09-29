import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {observeRouteEvidence} from '../server/dex/route-evidence.js';
const corpus=JSON.parse(fs.readFileSync(new URL('./fixtures/jupiter-production-corpus.json',import.meta.url)));
const snapshots=JSON.parse(fs.readFileSync(new URL('./fixtures/jupiter-alt-snapshots.json',import.meta.url)));
for(const [index,sample] of corpus.entries())test(`captured sample ${index}: graph observation never approves route`,()=>{
 const e=observeRouteEvidence(sample,'v0',snapshots);
 assert.equal(e.approved,false);assert.equal(e.executionAllowed,false);assert.equal(e.allSignaturesZero,true);
 assert.equal(e.provenRouteInput,null);assert.equal(e.provenRouteMinimumOutput,null);assert.equal(e.provenCpiPrograms,null);
 assert.equal(e.signatureCount,1);assert.ok(e.unknownWritableAccounts.length>0);
 assert.ok(e.instructions.some(i=>i.semantic==='UNDECODED'));
 assert.equal(e.accounts.filter(a=>a.signer).length,1);
});
test('sample zero legacy and ALT variant resolve identical instruction graph',()=>{
 const a=observeRouteEvidence(corpus[0],'legacy',snapshots),b=observeRouteEvidence(corpus[0],'v0',snapshots);
 const expand=e=>e.instructions.map(i=>({...i,accountIndices:i.accountIndices.map(n=>e.accounts[n].address)}));
 assert.deepEqual(expand(a),expand(b));assert.notEqual(a.messageHash,b.messageHash);
 assert.equal(b.unknownWritableAccounts.length,8);
 const f=b.instructions.find(i=>i.semantic==='SYSTEM_TRANSFER').flow;
 assert.equal(f.lamports,'100000');assert.equal(f.destination,b.derivedAtas[0].address);
});
test('altering claimed intent amount does not invent decoded Jupiter semantics',()=>{
 const s=structuredClone(corpus[0]);s.intent.inputAmount='999999999';s.build.inAmount='999999999';
 const e=observeRouteEvidence(s,'v0',snapshots);
 assert.equal(e.instructions.find(i=>i.semantic==='SYSTEM_TRANSFER').flow.lamports,'100000');
 assert.equal(e.provenRouteInput,null);assert.equal(e.executionAllowed,false);
});
test('corrupted archived expected message hash rejects observation',()=>{
 const s=structuredClone(corpus[0]);s.versions.find(v=>v.version==='v0').messageHash='0'.repeat(64);
 assert.throws(()=>observeRouteEvidence(s,'v0',snapshots),/CAPTURED_MESSAGE_HASH_MISMATCH/);
});
test('substituted ALT resolved key rejects archived account comparison',()=>{
 const s=structuredClone(snapshots);const used=corpus[0].versions.find(v=>v.version==='v0').lookupProofs[0].address;
 const item=s.find(x=>x.address===used);const raw=Buffer.from(item.data,'base64');
 for(let n=56;n<raw.length;n++)raw[n]=0;item.data=raw.toString('base64');
 assert.throws(()=>observeRouteEvidence(corpus[0],'v0',s));
});
test('wrong ALT owner fails even for offline historical fixture',()=>{
 const s=structuredClone(snapshots);s[0].owner='11111111111111111111111111111111';
 assert.throws(()=>observeRouteEvidence(corpus[0],'v0',s),/INVALID_ALT_SNAPSHOT/);
});
