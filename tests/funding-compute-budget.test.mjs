import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Keypair,Transaction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {buildTransfer,inspectTransfer} from '../src/wallet-transfer.js';
import {validateWalletSubmission} from '../server/wallet-submission-validation.js';
import {FUNDING_BUDGET,FUNDING_CEILINGS,fundingFees} from '../server/funding-fee-policy.js';
const encode=tx=>tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
const record=(tx,budget,id='fixture')=>({id,network:'solana:mainnet',source:tx.feePayer.toBase58(),destination:tx.instructions.at(-1).keys[1].pubkey.toBase58(),amountLamports:10000000,blockhash:tx.recentBlockhash,transaction:encode(tx),message:tx.serializeMessage().toString('base64'),messageHash:createHash('sha256').update(tx.serializeMessage()).digest('hex'),...budget});
const owner=Keypair.fromSeed(new Uint8Array(32).fill(21)),recipient=Keypair.fromSeed(new Uint8Array(32).fill(22)),other=Keypair.fromSeed(new Uint8Array(32).fill(23));
const fresh=()=>buildTransfer(owner.publicKey.toBase58(),recipient.publicKey.toBase58(),10000000,other.publicKey.toBase58(),FUNDING_BUDGET);
test('final explicit budget and bounded fee calculation',()=>{
 const tx=fresh();assert.equal(tx.instructions.length,3);assert.doesNotThrow(()=>inspectTransfer(tx,owner.publicKey.toBase58(),recipient.publicKey.toBase58(),10000000,FUNDING_BUDGET));
 assert.deepEqual(fundingFees(FUNDING_BUDGET,5000),{baseFeeLamports:5000,priorityFeeLamports:0,maxPriorityFeeLamports:0,feeLamports:5000,maxNetworkFeeLamports:5000});
 assert.equal(fundingFees({...FUNDING_BUDGET,computeUnitPrice:1},5001).priorityFeeLamports,1);
 assert.equal(fundingFees({...FUNDING_BUDGET,computeUnitPrice:100000},6000).priorityFeeLamports,1000);
 for(const [r,fee] of [[{...FUNDING_BUDGET,computeUnitLimit:10001},5000],[{...FUNDING_BUDGET,computeUnitPrice:100001},5000],[FUNDING_BUDGET,null],[FUNDING_BUDGET,0],[FUNDING_BUDGET,FUNDING_CEILINGS.totalFeeLamports+1],[{...FUNDING_BUDGET,computeUnitPrice:-1},5000]])assert.throws(()=>fundingFees(r,fee));
});
test('exact captured payload: old expected rejects; explicitly reconstructed captured budget matches and verifies offline',()=>{
 const capture=JSON.parse(readFileSync(new URL('./fixtures/funding-edge-capture.json',import.meta.url)));
 const signed=Transaction.from(Buffer.from(capture.signedTransaction,'base64'));
 const source=signed.feePayer.toBase58(),dest=signed.instructions.at(-1).keys[1].pubkey.toBase58();
 const old=record(buildTransfer(source,dest,10000000,signed.recentBlockhash),undefined,capture.id);
 assert.equal(old.messageHash,'310f5cf5171218a10f28aa21c0b7aa8fb9ee507dc501da1f6fabfe2796c69f48');
 assert.throws(()=>validateWalletSubmission(capture.signedTransaction,old),e=>e.diagnostic.code==='MESSAGE_MISMATCH');
 // Historical TEST approval only. These captured values are NOT production policy.
 const historicalBudget={fundingMessageVersion:1,computeUnitLimit:200000,computeUnitPrice:375000};
 const final=record(buildTransfer(source,dest,10000000,signed.recentBlockhash,historicalBudget),historicalBudget,capture.id);
 assert.equal(final.messageHash,'efdb623cad67f1efacc3bcea75a3936c6ab39affc935c2f1e38c51b5b2bc049b');
 assert.equal(validateWalletSubmission(capture.signedTransaction,final).verifySignatures(),true);
 assert.throws(()=>fundingFees(final,80000)); // Not eligible for current production submission.
});
test('unchanged final message accepts valid test-owner signature',()=>{const tx=fresh(),r=record(tx,FUNDING_BUDGET);tx.sign(owner);assert.equal(validateWalletSubmission(encode(tx),r).verifySignatures(),true);});
const mutations={
 recipient:tx=>tx.instructions[2].keys[1].pubkey=other.publicKey,
 amount:tx=>tx.instructions[2].data.writeBigUInt64LE(1n,4),
 extraTransfer:tx=>tx.add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:other.publicKey,lamports:1})),
 payer:tx=>tx.feePayer=other.publicKey,
 blockhash:tx=>tx.recentBlockhash=recipient.publicKey.toBase58(),
 price:tx=>tx.instructions[0]=ComputeBudgetProgram.setComputeUnitPrice({microLamports:1}),
 limit:tx=>tx.instructions[1]=ComputeBudgetProgram.setComputeUnitLimit({units:9999}),
 order:tx=>[tx.instructions[0],tx.instructions[1]]=[tx.instructions[1],tx.instructions[0]],
 extraBudget:tx=>tx.add(ComputeBudgetProgram.setComputeUnitLimit({units:10000})),
 arbitraryProgram:tx=>tx.instructions[2].programId=other.publicKey,
 signerFlags:tx=>tx.instructions[2].keys[1].isSigner=true,
 writableFlags:tx=>tx.instructions[0].keys.push({pubkey:other.publicKey,isSigner:false,isWritable:true})
};
for(const [name,mutate] of Object.entries(mutations))test('reject '+name,()=>{const tx=fresh(),r=record(tx,FUNDING_BUDGET);mutate(tx);assert.throws(()=>validateWalletSubmission(encode(tx),r),e=>e.diagnostic.code===(name==='blockhash'?'BLOCKHASH_MISMATCH':'MESSAGE_MISMATCH'));});
test('wrong request, invalid and missing signatures reject',()=>{
 const tx=fresh(),r=record(tx,FUNDING_BUDGET);
 assert.throws(()=>validateWalletSubmission(encode(tx),r),e=>e.diagnostic.code==='SIGNATURE_VERIFICATION_FAILURE');
 tx.sign(owner);
 assert.throws(()=>validateWalletSubmission(encode(tx),r,{requestId:'wrong'}),e=>e.diagnostic.code==='REQUEST_ASSOCIATION_MISMATCH');
 tx.signatures[0].signature[0]^=1;
 assert.throws(()=>validateWalletSubmission(encode(tx),r),e=>e.diagnostic.code==='SIGNATURE_VERIFICATION_FAILURE');
});
