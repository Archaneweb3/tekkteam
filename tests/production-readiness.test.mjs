import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';
import {runtime} from '../server/runtime.js';
import {openStore} from '../server/store.js';
import {installFunding,inspectFunding} from '../server/agent-funding.js';
import {executeLive} from '../server/live-execution.js';
import {GENESIS} from '../src/pump-readiness.js';
test('production secrets fail closed and live cannot be enabled by flag',async()=>{
 assert.throws(()=>runtime({NODE_ENV:'production'}),/Missing/);
 assert.throws(()=>runtime({LIVE_TRADING_ENABLED:'true'}),/locked/);
 assert.equal(runtime({}).liveEnabled,false);assert.equal(runtime({}).fundingEnabled,false);
 assert.throws(()=>openStore(join(mkdtempSync(join(tmpdir(),'vault-')),'db'),undefined,true),/VAULT/);
 await assert.rejects(executeLive(),/LOCKED/);
});
test('funding exact destination/amount rejects mutation',()=>{
 const owner=Keypair.generate(),wallet=Keypair.generate().publicKey;
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:wallet,lamports:10}));
 assert.doesNotThrow(()=>inspectFunding(tx,owner.publicKey.toBase58(),wallet.toBase58(),10));
 assert.throws(()=>inspectFunding(tx,owner.publicKey.toBase58(),wallet.toBase58(),11),/mismatch/);
 tx.add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:wallet,lamports:1}));assert.throws(()=>inspectFunding(tx,owner.publicKey.toBase58(),wallet.toBase58(),10),/mismatch/);
});
// Extended route, idempotency and custody coverage lives in wallet-transfers.test.mjs.
