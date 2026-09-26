import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {parseInitialBuy} from '../src/initial-buy.js';
import {buildCreation,inspectCreation,PAYER,GENESIS} from '../src/pump-readiness.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {mainnetWalletBalance} from '../server/wallet-balance.js';
const mint=Keypair.generate().publicKey,blockhash=Keypair.generate().publicKey.toBase58();
const launch={owner:PAYER,name:'A'.repeat(32),symbol:'B'.repeat(10),metadataUri:'https://tekkwork-test-metadata.vercel.app/'+'a'.repeat(43)};
const bytes=amount=>buildCreation(mint,blockhash,{...launch,initialBuyLamports:amount}).serialize({requireAllSignatures:false});
const context=amount=>({mint,blockhash,genesis:GENESIS,chainId:'solana:101',launch:{...launch,initialBuyLamports:amount}});
test('exact decimal input, no rounding/exponents/negative/nonfinite values',()=>{
 for(const [s,n] of [['0',0],['0.001',1000000],['0.01',10000000],['0.025',25000000],['0.1',100000000],['1',1000000000],['0.000000001',1]])assert.equal(parseInitialBuy(s),n);
 for(const s of ['',null,1,'-1','Infinity','NaN','1e-3','0.0000000001','9007199254740991'])assert.throws(()=>parseInitialBuy(s));
});
test('zero preserves create-only; selected input changes actual encoded exact-SOL buy',()=>{
 assert.equal(Transaction.from(bytes(0)).instructions.length,1);
 const a=bytes(25000000),b=bytes(1000000000);assert.ok(a.length<=1232);assert.notDeepEqual(a,b);
 assert.equal(Transaction.from(a).instructions[2].data.readBigUInt64LE(8),25000000n);
 assert.equal(inspectCreation(a,context(25000000)).initialBuyLamports,25000000);
 assert.throws(()=>inspectCreation(a,context(1000000000)),/Unexpected message/);
 const altered=Transaction.from(a);altered.instructions[2].keys[1].pubkey=Keypair.generate().publicKey;assert.throws(()=>inspectCreation(altered.serialize({requireAllSignatures:false}),context(25000000)));
});
test('policy permits user value above old total cap, rejects insufficient funds and extra debit',()=>{
 const e=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url)));
 const amount=25000000,ctx={mint:new PublicKey(e.mint),blockhash:e.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch:{owner:PAYER,initialBuyLamports:amount}},tx=buildCreation(ctx.mint,ctx.blockhash,ctx.launch),raw=tx.serialize({requireAllSignatures:false}),structure=inspectCreation(raw,ctx);
 // Synthetic account effects for a successful atomic buy; never sends anything.
 while(e.before.value.length<structure.accounts.length){e.before.value.push(null);e.simulation.value.accounts.push(null);}
 e.before.context.slot--;e.before.value[5].lamports=100000000;e.simulation.value.accounts[5].lamports=100000000-5511640-amount;
 e.simulation.value.accounts[2].lamports+=amount;
 e.simulation.value.logs.splice(-1,0,'Program log: Instruction: BuyExactSolIn');
 e.simulation.value.innerInstructions.push({index:2,instructions:[{program:'system',programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:PAYER,destination:structure.accounts[2].address,lamports:amount}}}]});
 const evaluate=()=>evaluateSimulation(raw,ctx,{before:e.before,afterRead:e.afterRead,simulation:e.simulation,fee:e.feeQuote.value});
 assert.equal(evaluate().allowed,true);assert.equal(evaluate().estimatedPayerDebitLamports,30511640);
 e.simulation.value.accounts[5].lamports--;assert.ok(evaluate().reasons.includes('UNEXPECTED_EXTRA_PAYER_DEBIT'));e.simulation.value.accounts[5].lamports++;
 e.before.value[5].lamports=1000000;e.simulation.value.accounts[5].lamports=0;assert.ok(evaluate().reasons.includes('INSUFFICIENT_MAINNET_BALANCE'));
});
test('Mainnet balance uses requested owner, coalesces/cache reads and never turns RPC failure into zero',async()=>{
 let calls=0,time=100000,wrong=false,fail=false;const owners=[];
 const read=mainnetWalletBalance({now:()=>time,connection:{getGenesisHash:async()=>wrong?'devnet':GENESIS,getBalanceAndContext:async key=>{calls++;owners.push(key.toBase58());if(fail)throw Error('RPC secret must not leak');return {value:0,context:{slot:1}};}}});
 const [a,b]=await Promise.all([read(PAYER),read(PAYER)]);assert.equal(a.lamports,0);assert.equal(b.network,'solana:101');assert.equal(calls,1);assert.deepEqual(owners,[PAYER]);
 time+=2000;await read(PAYER,true);assert.equal(calls,2);
 time+=2000;fail=true;await assert.rejects(read(PAYER,true),/^Error: Mainnet balance unavailable$/);
 wrong=true;await assert.rejects(read(PAYER,true));assert.equal(calls,3);
});
