import test from 'node:test';import assert from 'node:assert/strict';
import {Transaction,TransactionInstruction,PublicKey} from '@solana/web3.js';
import {completeM4OwnerApproval,verifyM4Signed,sha} from '../server/pump-m4-guard.js';
import {m4Fixture} from './pump-m4-fixture.mjs';
// LOCAL_FIXTURE only: synthetic owner/mint, isolated SQLite, no Mainnet send.
const stored=f=>JSON.parse(f.db.prepare('SELECT payload FROM m4_execution').get().payload);
async function review(f){const ready=await f.controller.run('prepare',f.identity,{initialBuy:'0',requestId:crypto.randomUUID()});return f.controller.run('review',f.identity,f.request(ready));}
test('Phantom-first response has no mint signature; server merges exact stored signature and sends full bytes once',async()=>{const f=m4Fixture();try{const r=await review(f),privateRecord=stored(f);assert.equal(r.signingOrder,'OWNER_FIRST_MINT_AFTER_APPROVAL');assert.equal(r.walletTransactionBase64,r.result.transactionBase64);assert.ok(Transaction.from(Buffer.from(r.walletTransactionBase64,'base64')).signatures.every(s=>s.signature===null));assert.ok(Transaction.from(Buffer.from(privateRecord.walletTransactionBase64,'base64')).signatures[1].signature);const ownerOnly=f.signed(),complete=completeM4OwnerApproval(ownerOnly,privateRecord);assert.notEqual(complete.completeBase64,ownerOnly);assert.equal(complete.tx.verifySignatures(true),true);const result=await f.controller.run('submit',f.identity,{...f.request(r),signedTransactionBase64:ownerOnly}),persisted=stored(f);assert.equal(result.broadcastAttempted,true);assert.equal(f.sends(),1);assert.equal(persisted.signedTransactionBase64,complete.completeBase64);assert.equal(persisted.signedDigest,sha(Buffer.from(complete.completeBase64,'base64')));assert.equal(verifyM4Signed(persisted.signedTransactionBase64,persisted,true).signature,result.signature);await assert.rejects(f.controller.run('submit',f.identity,{...f.request(r),signedTransactionBase64:ownerOnly}));assert.equal(f.sends(),1);}finally{f.db.close();}});
test('missing/invalid owner, changed message or client-added mint signature cannot consume or send owner-first record',async()=>{for(const kind of ['missing','invalid','message','mint']){const f=m4Fixture();try{const r=await review(f),record=stored(f);let tx=Transaction.from(Buffer.from(kind==='mint'?record.walletTransactionBase64:r.result.transactionBase64,'base64'));if(kind!=='missing')tx.partialSign(f.owner);if(kind==='invalid')tx.signatures[0].signature[0]^=1;if(kind==='message'){tx.instructions[0].data[10]^=1;tx.partialSign(f.owner);}const bytes=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');await assert.rejects(f.controller.run('submit',f.identity,{...f.request(r),signedTransactionBase64:bytes}));assert.equal(stored(f).status,'AWAITING_WALLET_APPROVAL');assert.equal(stored(f).signature,undefined);assert.equal(f.sends(),0);}finally{f.db.close();}}});
test('legacy mint-first record remains verifiable; no signed archive is migrated to owner-first',async()=>{const f=m4Fixture();try{await review(f);const old=stored(f);delete old.signingOrder;f.db.prepare('UPDATE m4_execution SET payload=? WHERE id=1').run(JSON.stringify(old));const complete=completeM4OwnerApproval(f.signed(),old);assert.equal(complete.tx.verifySignatures(true),true);assert.equal(complete.completeBase64,f.signed());assert.equal(stored(f).signingOrder,undefined);assert.equal(f.sends(),0);}finally{f.db.close();}});

test('valid owner approval with a Lighthouse addition cannot reuse the reviewed mint signature or broadcast',async()=>{
 const f=m4Fixture();try{
  const r=await review(f),before=stored(f),tx=Transaction.from(Buffer.from(r.walletTransactionBase64,'base64'));
  const original=tx.serializeMessage();
  // Captured instruction shape, synthetic keys only. This is NOT a production allowlist.
  tx.add(new TransactionInstruction({programId:new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'),keys:[{pubkey:f.owner.publicKey,isSigner:true,isWritable:true}],data:Buffer.from('BgQDAMtDPAoAAAAABAMAAAEAAAAAAAAAAAA=','base64')}));
  tx.partialSign(f.owner);
  assert.equal(tx.verifySignatures(false),true);assert.ok(tx.signature);assert.equal(tx.signatures[1].signature,null);
  assert.equal(tx.serializeMessage().equals(original),false);
  const ownerOnly=tx.serialize({requireAllSignatures:false}).toString('base64');
  assert.throws(()=>completeM4OwnerApproval(ownerOnly,before),{code:'M4_OWNER_APPROVAL_INVALID'});
  await assert.rejects(f.controller.run('submit',f.identity,{...f.request(r),signedTransactionBase64:ownerOnly}),{code:'M4_OWNER_APPROVAL_INVALID'});
  assert.deepEqual(stored(f),before);assert.equal(f.sends(),0);
  const oldMint=Transaction.from(Buffer.from(before.walletTransactionBase64,'base64')).signatures[1];
  tx.addSignature(oldMint.publicKey,oldMint.signature);
  assert.equal(tx.verifySignatures(true),false,'mint signature for reviewed bytes cannot sign wallet-augmented bytes');
 }finally{f.db.close();}
});
