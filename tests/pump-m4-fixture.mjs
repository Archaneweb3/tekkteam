// LOCAL_FIXTURE only: synthetic owner key, no network, no saved human sessions.
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Keypair,Transaction} from '@solana/web3.js';
import {buildCreation,creationAccounts,inspectCreation,GENESIS,PUMP} from '../src/pump-readiness.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {createExecutionReview} from '../server/pump-execution-review.js';
import {M4_TARGET,sha} from '../server/pump-m4-guard.js';
import {createM4Execution} from '../server/pump-m4.js';
import {fixtureAtomicBalances} from './pump-atomic-fixture.mjs';
const source=JSON.parse(readFileSync(new URL('../docs/pump-simulation-2026-09-26.json',import.meta.url)));
export function m4Fixture(options={}){
 const owner=Keypair.generate(),target={...M4_TARGET,owner:owner.publicKey.toBase58()},identity={...target,description:'fixture',image:'https://fixture.example/image.png',character:'frank',tokenDescriptionPresent:true};delete identity.initialBuyLamports;delete identity.ceilingLamports;
 let clock=100000,sends=0,rawProof;
 const root=mkdtempSync(join(tmpdir(),'tekkteam-m4-')),journalPath=join(root,'receipt.json');writeFileSync(journalPath,JSON.stringify({version:2,receipts:{}}));const db=new DatabaseSync(join(root,'fixture.sqlite'));
 function prepareFactory({mintFactory,captureProof}){return async(launchIdentity,buy,id)=>{
  const mint=mintFactory(),accounts=creationAccounts(mint,launchIdentity.owner);let text=JSON.stringify(source);source.structure.accounts.forEach((a,i)=>{text=text.replaceAll(a.address,accounts[i].pubkey.toBase58());});
  const raw=JSON.parse(text,(k,v)=>k==='data'&&v&&typeof v.sha256==='string'?[Buffer.alloc(v.length).toString('base64'),'base64']:v),launch={...launchIdentity,initialBuyLamports:0,metadataUri:'https://fixture.example/'+'a'.repeat(43)},tx=buildCreation(mint,source.recentBlockhash,launch),bytes=tx.serialize({requireAllSignatures:false});
  raw.before.context.slot=101;raw.simulation.context.slot=102;raw.afterRead.context.slot=103;const debit=raw.before.value[5].lamports-raw.simulation.value.accounts[5].lamports;raw.before.value[5].lamports=182999717;raw.afterRead.value[5].lamports=182999717;raw.simulation.value.accounts[5].lamports=182999717-debit;
  const p=evaluateSimulation(bytes,{mint,blockhash:source.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch},{before:raw.before,afterRead:raw.afterRead,simulation:raw.simulation,fee:10000});
  const rentAccounts=source.rent.filter(a=>a.fundedLamports>0),r={mode:'M3_UNSIGNED_PREPARATION',id,createdAt:new Date(clock).toISOString(),expiresAt:clock+30000,network:'solana:101',genesis:GENESIS,programId:PUMP,launch,metadataUri:launch.metadataUri,metadataStatus:'PUBLIC_VERIFIED',feePayer:launch.owner,mint:mint.toBase58(),recentBlockhash:source.recentBlockhash,lastValidBlockHeight:source.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),transactionSha256:sha(bytes),transactionSize:bytes.length,instructionCount:1,structure:inspectCreation(bytes,{mint,blockhash:source.recentBlockhash,genesis:GENESIS,chainId:'solana:101',launch}),signingEnabled:false,broadcastEnabled:false,absoluteDebitBoundVerified:false,simulation:{status:'PASS',slot:102},policy:{allowed:p.allowed,initialBuyLamports:0,baseFeeLamports:10000,validatedOverheadLamports:p.validatedOverheadLamports,estimatedPayerDebitLamports:p.estimatedPayerDebitLamports,otherRequiredDebitLamports:p.estimatedPayerDebitLamports-10000,minimumRentExemptionLamports:rentAccounts.reduce((n,a)=>n+a.minimumRentExemptionLamports,0),rentAccounts,accountEffects:p.accountEffects.map(a=>({name:a.name,writable:a.writable,deltaLamports:a.deltaLamports}))}};
  fixtureAtomicBalances(bytes,r.structure,raw.before,raw.simulation);
  const proof={before:raw.before,afterRead:raw.afterRead,simulation:raw.simulation,feeResponse:{context:{slot:100},value:10000},latestResponse:{context:{slot:100},value:{blockhash:r.recentBlockhash,lastValidBlockHeight:r.lastValidBlockHeight}}};r.executionReview=createExecutionReview(r,{...proof,startedAt:clock,now:clock,validity:{context:{slot:103},value:true}});rawProof=proof;await captureProof(r,proof);return r;
 };}
 const transport={submitOnce:async(bytes,sig,authorize)=>{if(!authorize(bytes,sig))throw Error('Denied');sends++;if(options.sendFails)throw Error('Lost response');return sig;}};
 const deps={db,journalPath,target,now:()=>clock,transport,publishMetadata:async()=>'',prepareFactory,verifyCreatedAccounts:()=>{},verifyEvent:()=>{},revalidate:async()=>({contextSlot:104,checkedAt:clock}),confirm:async()=>({status:'CONFIRMATION_UNKNOWN'}),...options.dependencies};
 const request=s=>({requestId:s.executionId,reviewDigest:s.result.executionReview.digest,transactionBase64:s.result.transactionBase64});
 const signed=()=>{const stored=JSON.parse(db.prepare('SELECT payload FROM m4_execution').get().payload),tx=Transaction.from(Buffer.from(stored.walletTransactionBase64,'base64'));tx.partialSign(owner);return tx.serialize().toString('base64');};
 return {db,root,journalPath,target,identity,owner,deps,controller:createM4Execution(deps),request,signed,advance:n=>clock+=n,sends:()=>sends,clock:()=>clock,rawProof:()=>rawProof};
}
