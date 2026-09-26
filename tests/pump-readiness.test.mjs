import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,SystemProgram} from '@solana/web3.js';
import {buildCreation,inspectCreation,spendingGuard,GENESIS,PAYER} from '../src/pump-readiness.js';
const mint=Keypair.generate().publicKey, blockhash=Keypair.generate().publicKey.toBase58();
const context={mint,blockhash,genesis:GENESIS,chainId:'solana:101'};
const bytes=tx=>tx.serialize({requireAllSignatures:false,verifySignatures:false});
const original=()=>buildCreation(mint,blockhash);
test('canonical unsigned create_v2 is inspected but spending remains blocked',()=>{
 const b=bytes(original()), info=inspectCreation(b,context), result=spendingGuard(b,context,10000);
 assert.equal(info.requiredSigners,2);assert.equal(info.accounts.length,16);
 assert.equal(result.allowed,false);assert.equal(result.calculatedMaximumPayerDebitLamports,null);
 assert.equal(result.simulation.status,'NOT_RUN_STATIC_SPENDING_GUARD_REJECTED');
 assert.equal(result.capLamports,'10000000');
});
test('wrong network and payer fail closed',()=>{
 for(const change of [{chainId:'solana:103'},{genesis:'wrong'}])assert.throws(()=>inspectCreation(bytes(original()),{...context,...change}));
 const tx=original();tx.feePayer=Keypair.generate().publicKey;assert.throws(()=>inspectCreation(bytes(tx),context));
});
test('unexpected instruction, program, writable account and metadata rejected',()=>{
 const mutations=[
  tx=>tx.add(SystemProgram.transfer({fromPubkey:new PublicKey(PAYER),toPubkey:mint,lamports:0})),
  tx=>{tx.instructions[0].programId=SystemProgram.programId;},
  tx=>{tx.instructions[0].keys[1].isWritable=true;},
  tx=>{tx.instructions[0].keys[2].pubkey=Keypair.generate().publicKey;},
  tx=>{tx.instructions[0].data[45]^=1;},
  tx=>{tx.recentBlockhash=Keypair.generate().publicKey.toBase58();},
 ];
 for(const mutate of mutations){const tx=original();mutate(tx);assert.throws(()=>inspectCreation(bytes(tx),context));}
});
test('unknown, invalid or excessive known fee rejected; cap cannot be overridden',()=>{
 for(const fee of [null,undefined,-1,NaN,10000001,1.5])assert.throws(()=>spendingGuard(bytes(original()),context,fee));
 const result=spendingGuard(bytes(original()),{...context,capLamports:999999999},10000);
 assert.equal(result.capLamports,'10000000');assert.equal(result.allowed,false);
});
