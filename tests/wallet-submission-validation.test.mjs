import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,Transaction,SystemProgram} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {validateWalletSubmission} from '../server/wallet-submission-validation.js';

// Public deterministic TEST identities only; no live wallet secret is used.
const owner=Keypair.fromSeed(new Uint8Array(32).fill(11));
const destination=Keypair.fromSeed(new Uint8Array(32).fill(12)).publicKey;
const other=Keypair.fromSeed(new Uint8Array(32).fill(13)).publicKey;
const blockhash='HZvPD7kx2nxkoDbtTCaa5kXtbXSf3YP9CoEo16KSgizs';
const unsigned=new Transaction({feePayer:owner.publicKey,recentBlockhash:blockhash}).add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:destination,lamports:10000000}));
const encode=tx=>tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
const r={id:'fixture-request',network:'solana:mainnet',source:owner.publicKey.toBase58(),destination:destination.toBase58(),amountLamports:10000000,blockhash,transaction:encode(unsigned),message:unsigned.serializeMessage().toString('base64')};
const signed=(mutate=()=>{})=>{const tx=Transaction.from(Buffer.from(r.transaction,'base64'));mutate(tx);tx.sign(owner);return tx;};
function rejected(value,code,options){assert.throws(()=>validateWalletSubmission(value,r,options),e=>{
 assert.equal(e.diagnostic.code,code);
 assert.ok(Object.keys(e.diagnostic).every(k=>['code','expectedMessageHash','returnedMessageHash'].includes(k)));
 assert.ok(!JSON.stringify(e.diagnostic).includes(value));return true;
});}
test('wallet sign-only adds signatures without changing the exact message',()=>{
 const tx=signed();assert.notEqual(encode(tx),r.transaction);
 assert.equal(validateWalletSubmission(encode(tx),r).serializeMessage().toString('base64'),r.message);
});
test('decode failure is sanitized',()=>rejected('cookie=CANARY; privateKey=CANARY','DECODE_FAILURE'));
test('mutated amount rejected',()=>rejected(encode(signed(tx=>tx.instructions[0].data.writeBigUInt64LE(1n,4))),'MESSAGE_MISMATCH'));
test('mutated recipient rejected',()=>rejected(encode(signed(tx=>tx.instructions[0].keys[1].pubkey=other)),'MESSAGE_MISMATCH'));
test('extra instruction rejected',()=>rejected(encode(signed(tx=>tx.add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:other,lamports:1})))),'MESSAGE_MISMATCH'));
test('mutated instruction program rejected',()=>rejected(encode(signed(tx=>tx.instructions[0].programId=other)),'MESSAGE_MISMATCH'));
test('wrong blockhash rejected separately',()=>rejected(encode(signed(tx=>tx.recentBlockhash=other.toBase58())),'BLOCKHASH_MISMATCH'));
test('wrong request association rejected',()=>rejected(encode(signed()),'REQUEST_ASSOCIATION_MISMATCH',{requestId:'different-request'}));
test('missing signature rejected',()=>rejected(r.transaction,'SIGNATURE_VERIFICATION_FAILURE'));
test('invalid signature on identical message rejected',()=>{const tx=signed();tx.signatures[0].signature[0]^=1;rejected(encode(tx),'SIGNATURE_VERIFICATION_FAILURE');});
test('corrupt expected record is never accepted',()=>assert.throws(()=>validateWalletSubmission(encode(signed()),{...r,message:'wrong'}),e=>e.diagnostic.code==='EXPECTED_REQUEST_INVALID'));
test('public unsigned reference matches persisted failed request message digest',()=>{
 const source=new PublicKey('ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS');
 const target=new PublicKey('7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe');
 const tx=new Transaction({feePayer:source,recentBlockhash:blockhash}).add(SystemProgram.transfer({fromPubkey:source,toPubkey:target,lamports:10000000}));
 assert.equal(createHash('sha256').update(tx.serializeMessage()).digest('hex'),'54a643f78b14113767a09724073c08b3829f152f2a77dee58a6c50dc038a1c8b');
 // Pure offline message reconstruction, never signed, submitted or broadcast.
});
