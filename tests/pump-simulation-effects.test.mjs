import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,VersionedTransaction} from '@solana/web3.js';
import {AccountLayout,NATIVE_MINT,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {pumpAccountFixture,pumpWalletFixture,fixtureBlockhash,encoded} from './pump-account-fixture.mjs';
import {swapProgram,swapSdk} from '../server/dex/pump-sdk-boundary.js';
import {createPumpDryRunInspector} from '../server/dex/pump-dry-run.js';
import {decodePumpVenueBundle} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpEnvelope} from '../server/dex/pump-offline-envelope.js';
import {inspectPumpSimulationEffects,inspectPumpSimulationConservation,inspectRoleBoundPumpSimulation} from '../server/dex/pump-simulation-effects.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createDexLedger,createPumpFixtureLedger} from '../server/dex/ledger.js';
import {createPumpLocalExecutor} from '../server/dex/pump-local-executor.js';
const now=1800000000000,wallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
async function fixture(migrated=false,side='BUY'){
 const b=await pumpAccountFixture({migrated});b.context.observedAt=now;const venue=decodePumpVenueBundle(b),intent={agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000};
 const options={venue,intent,executionWallet:wallet,blockhash:fixtureBlockhash,networkFeeLamports:'5000',now},built=await buildOfflinePumpEnvelope(options),q=built.quote,buy=side==='BUY';
 const beforeAccounts=pumpWalletFixture(venue,wallet),afterAccounts=pumpWalletFixture(venue,wallet),debit=BigInt(q.estimatedDebit),output=BigInt(q.estimatedOutput);
 afterAccounts.base.data.writeBigUInt64LE(2000000000n+(buy?output:-debit),64);
 if(migrated){const wsol=150000000n+(buy?-debit:output);afterAccounts.quote.data.writeBigUInt64LE(wsol,64);afterAccounts.quote.lamports=Number(wsol)+2039280;afterAccounts.wallet.lamports-=5000;}
 else afterAccounts.wallet.lamports+=Number(buy?-debit-5000n:output-5000n);
 const tx=VersionedTransaction.deserialize(Buffer.from(built.unsignedTransaction,'base64')),keys=tx.message.staticAccountKeys.map(k=>k.toBase58());
 const meta={source:'LOCAL_FIXTURE',messageHash:built.messageHash,slot:100,err:null,fee:'5000',preBalances:keys.map(()=>1000000),postBalances:keys.map(()=>1000000),preTokenBalances:[],postTokenBalances:[]};
 for(const [phase,accounts]of [['pre',beforeAccounts],['post',afterAccounts]])for(const role of migrated?['wallet','base','quote']:['wallet','base']){
  const a=accounts[role],index=keys.indexOf(a.address);assert(index>=0);meta[phase+'Balances'][index]=a.lamports;
  if(role!=='wallet')meta[phase+'TokenBalances'].push({accountIndex:index,owner:wallet,mint:role==='base'?venue.mint:NATIVE_MINT.toBase58(),programId:role==='base'?venue.tokenProgram:TOKEN_PROGRAM_ID.toBase58(),uiTokenAmount:{amount:a.data.readBigUInt64LE(64).toString(),decimals:role==='base'?6:9}});
 }
 return {options,beforeAccounts,afterAccounts,unsignedTransaction:built.unsignedTransaction,meta,keys,tx};
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`indexed simulation ${migrated} ${side} remains a fixture, not receipt`,async()=>{const x=await fixture(migrated,side),r=await inspectPumpSimulationEffects(x);assert.equal(r.messageAndIndexBound,true);assert.equal(r.finalityVerified,false);assert.equal(r.actualReceiptVerified,false);assert.equal(r.positionEffect,null);assert.equal(r.pnlEffect,null);assert.equal(r.notReceipt,true);assert.equal(r.executable,false);assert.equal(r.realExecutorDebitCompatible,!(migrated&&side==='BUY'));});
for(const [name,change]of [
 ['hash',x=>x.meta.messageHash='foreign'],['slot',x=>x.meta.slot++],['external source',x=>x.meta.source='BACKEND_RPC_READ'],['failed meta',x=>x.meta.err='failure'],['fee',x=>x.meta.fee='4999'],['unsafe native',x=>x.meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1],['partial native',x=>x.meta.postBalances.pop()],['wallet delta',x=>x.meta.postBalances[0]++],['duplicate index',x=>x.meta.preTokenBalances.push({...x.meta.preTokenBalances[0]})],['bad index',x=>x.meta.preTokenBalances[0].accountIndex=-1],['missing token',x=>x.meta.postTokenBalances=[]],['mint',x=>x.meta.preTokenBalances[0].mint=wallet],['program',x=>x.meta.preTokenBalances[0].programId=wallet],['decimals',x=>x.meta.preTokenBalances[0].uiTokenAmount.decimals=9],['amount',x=>x.meta.preTokenBalances[0].uiTokenAmount.amount='1'],['amount overflow',x=>x.meta.preTokenBalances[0].uiTokenAmount.amount='18446744073709551616'],['rent',x=>x.meta.postBalances[x.meta.preTokenBalances[0].accountIndex]++],['readonly delta',x=>{const i=x.keys.findIndex((_,i)=>!x.tx.message.isAccountWritable(i));x.meta.postBalances[i]++;}],['foreign owner',x=>x.meta.preTokenBalances[0].owner=x.options.venue.owner],['unrelated wallet token',x=>x.meta.preTokenBalances.push({accountIndex:0,owner:wallet,uiTokenAmount:{amount:'0',decimals:9}})],
])test(`indexed simulation rejects ${name}`,async()=>{const x=await fixture(true);change(x);await assert.rejects(inspectPumpSimulationEffects(x));});
test('preawait meta/account/intent mutation cannot change accepted snapshot',async()=>{const x=await fixture(true),pending=inspectPumpSimulationEffects(x);x.meta.messageHash='mutated';x.meta.preTokenBalances[0].uiTokenAmount.amount='0';x.options.intent.inputAmount='1';x.beforeAccounts.base.data.fill(0);const r=await pending;assert.equal(r.actualReceiptVerified,false);assert.equal(r.fixtureInputDebit,'99999999');});
async function conservation(migrated=false,side='BUY'){
 const x=await fixture(migrated,side),roles=await import('../server/dex/pump-offline-instruction.js').then(m=>m.buildOfflinePumpInstruction(x.options)),map=new Map(roles.accountRoles.map(r=>[r.role,r.address]));
 const add=(role,mint,program,decimals,change,native=false)=>{
  const index=x.keys.indexOf(map.get(role)),amount=native?20000000000n:793100000000000n,authority=x.options.venue.venue;assert(index>=0);
  x.meta.preTokenBalances.push({accountIndex:index,owner:authority,mint,programId:program,uiTokenAmount:{amount:amount.toString(),decimals}});
  x.meta.postTokenBalances.push({accountIndex:index,owner:authority,mint,programId:program,uiTokenAmount:{amount:(amount+change).toString(),decimals}});
  if(native){x.meta.preBalances[index]=Number(amount)+2039280;x.meta.postBalances[index]=Number(amount+change)+2039280;}
 };
 const baseChange=BigInt(x.meta.postTokenBalances[0].uiTokenAmount.amount)-BigInt(x.meta.preTokenBalances[0].uiTokenAmount.amount);
 add(migrated?'poolBaseTokenAccount':'associatedBondingCurve',x.options.venue.mint,x.options.venue.tokenProgram,6,-baseChange);
 if(migrated){const quoteChange=BigInt(x.meta.postTokenBalances[1].uiTokenAmount.amount)-BigInt(x.meta.preTokenBalances[1].uiTokenAmount.amount);add('poolQuoteTokenAccount',NATIVE_MINT.toBase58(),TOKEN_PROGRAM_ID.toBase58(),9,-quoteChange,true);}
 else{const index=x.keys.indexOf(map.get('bondingCurve')),walletDelta=x.meta.postBalances[0]-x.meta.preBalances[0];x.meta.preBalances[index]=2000000000;x.meta.postBalances[index]=2000000000-walletDelta-5000;}
 return x;
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`conservation ${migrated} ${side} without receipt or role qualification`,async()=>{const r=await inspectPumpSimulationConservation(await conservation(migrated,side));assert.equal(r.nativeConservationPassed,true);assert.equal(r.tokenConservationPassed,true);assert.equal(r.venueAccountRolesVerified,false);assert.equal(r.actualReceiptVerified,false);assert.equal(r.executable,false);});
test('wallet-only effects cannot claim full conservation',async()=>{await assert.rejects(inspectPumpSimulationConservation(await fixture(true)),/CONSERVATION/);});
for(const [name,mutate]of [
 ['hidden native debit',x=>x.meta.postBalances[x.keys.indexOf(x.options.venue.venue)]--],
 ['token imbalance',x=>x.meta.postTokenBalances[2].uiTokenAmount.amount=(BigInt(x.meta.postTokenBalances[2].uiTokenAmount.amount)+1n).toString()],
 ['new token account',x=>x.meta.preTokenBalances.pop()],
 ['token owner changed',x=>x.meta.postTokenBalances[2].owner=wallet],
 ['unsupported mint',x=>{x.meta.preTokenBalances[2].mint=wallet;x.meta.postTokenBalances[2].mint=wallet;}],
 ['base rent transfer',x=>{const i=x.meta.postTokenBalances[2].accountIndex;x.meta.postBalances[i]++;x.meta.postBalances[x.keys.indexOf(x.options.venue.venue)]--;}],
 ['readonly token transfer',x=>{const index=x.keys.findIndex((_,i)=>!x.tx.message.isAccountWritable(i));const row={accountIndex:index,owner:x.options.venue.owner,mint:x.options.venue.mint,programId:x.options.venue.tokenProgram,uiTokenAmount:{amount:'1',decimals:6}};x.meta.preTokenBalances.push(row);x.meta.postTokenBalances.push({...row,uiTokenAmount:{amount:'2',decimals:6}});}],
])test(`conservation rejects ${name}`,async()=>{const x=await conservation(true);mutate(x);await assert.rejects(inspectPumpSimulationConservation(x));});
async function boundFixture(migrated=false,side='BUY'){
 const x=await conservation(migrated,side),bundle=await pumpAccountFixture({migrated});
 const all=[...Object.values(bundle.accounts),...Object.values(x.beforeAccounts)].filter(a=>x.keys.includes(a.address));
 x.preInstructionAccounts=[...new Map(all.map(a=>[a.address,{...a,data:Buffer.from(a.data),lamports:x.meta.preBalances[x.keys.indexOf(a.address)]}])).values()];
 for(const row of x.meta.preTokenBalances){const address=x.keys[row.accountIndex];if(!x.preInstructionAccounts.some(a=>a.address===address)){
  const data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint:new PublicKey(row.mint),owner:new PublicKey(row.owner),amount:BigInt(row.uiTokenAmount.amount),delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);
  x.preInstructionAccounts.push({address,owner:row.programId,slot:100,exists:true,executable:false,data,lamports:x.meta.preBalances[row.accountIndex]});
 }}
 x.postInstructionAccounts=x.preInstructionAccounts.map(a=>{const i=x.keys.indexOf(a.address),data=Buffer.from(a.data),row=x.meta.postTokenBalances.find(r=>r.accountIndex===i);if(row)data.writeBigUInt64LE(BigInt(row.uiTokenAmount.amount),64);return {...a,data,lamports:x.meta.postBalances[i]};});return x;
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`role-bound ${migrated} ${side} cannot certify program or receipt`,async()=>{const r=await inspectRoleBoundPumpSimulation(await boundFixture(migrated,side));assert.equal(r.affectedRoleLayoutsQualified,true);assert.equal(r.venueAccountRolesVerified,false);assert.equal(r.actualReceiptVerified,false);assert.equal(r.executable,false);});
for(const [name,change]of [
 ['missing snapshot',x=>x.postInstructionAccounts=x.postInstructionAccounts.filter(a=>a.address!==x.beforeAccounts.base.address)],
 ['foreign raw authority',x=>{const a=x.postInstructionAccounts.find(a=>a.address===x.options.venue.venue);a.owner=wallet;}],
 ['swapped token index',x=>{const a=x.preInstructionAccounts.find(a=>a.address===x.beforeAccounts.base.address),b=x.preInstructionAccounts.find(a=>a.address===x.beforeAccounts.quote.address);[a.address,b.address]=[b.address,a.address];}],
 ['balanced fake token owner',x=>{const a=x.postInstructionAccounts.find(a=>a.address===x.beforeAccounts.base.address);a.data.fill(0,32,64);}],
 ['duplicate raw snapshot',x=>x.preInstructionAccounts.push(x.preInstructionAccounts[0])],
])test(`role binding rejects ${name}`,async()=>{const x=await boundFixture(true);change(x);await assert.rejects(inspectRoleBoundPumpSimulation(x));});
test('balanced aggregate over issued supply is rejected',async()=>{const x=await conservation(true),row=x.meta.preTokenBalances[2],after=x.meta.postTokenBalances[2],add=1000000000000000n;row.uiTokenAmount.amount=(BigInt(row.uiTokenAmount.amount)+add).toString();after.uiTokenAmount.amount=(BigInt(after.uiTokenAmount.amount)+add).toString();await assert.rejects(inspectPumpSimulationConservation(x),/OBSERVED_SUPPLY/);});
test('changed unqualified program data remains a role blocker',async()=>{const x=await boundFixture(false);const curve=x.postInstructionAccounts.find(a=>a.address===x.options.venue.venue);curve.data[0]^=1;const r=await inspectRoleBoundPumpSimulation(x);assert.equal(r.affectedRoleLayoutsQualified,false);assert(r.effectRoleBlockers.length>0);assert.equal(r.executable,false);});
test('data-only pool state mutation cannot be skipped',async()=>{const x=await boundFixture(true),pool=x.postInstructionAccounts.find(a=>a.address===x.options.venue.venue);pool.data[0]^=1;const r=await inspectRoleBoundPumpSimulation(x);assert.equal(r.affectedRoleLayoutsQualified,false);assert(r.effectRoleBlockers.some(b=>b.address===pool.address));});
test('data-only volume state mutation cannot be skipped',async()=>{
 const x=await boundFixture(true),built=await import('../server/dex/pump-offline-instruction.js').then(m=>m.buildOfflinePumpInstruction(x.options)),address=built.accountRoles.find(r=>r.role==='userVolumeAccumulator').address,i=x.keys.indexOf(address),data=await encoded(swapProgram,'userVolumeAccumulator',{user:new PublicKey(wallet)});
 const a={address,owner:swapSdk.PUMP_AMM_PROGRAM_ID.toBase58(),slot:100,exists:true,executable:false,lamports:x.meta.preBalances[i],data};x.preInstructionAccounts.push(a);x.postInstructionAccounts.push({...a,data:Buffer.from(data)});x.postInstructionAccounts.at(-1).data[0]^=1;
 const r=await inspectRoleBoundPumpSimulation(x);assert.equal(r.affectedRoleLayoutsQualified,false);assert(r.effectRoleBlockers.some(b=>b.address===address));
});
test('role-bound raw buffers stay fixed across pending inspection',async()=>{const x=await boundFixture(true),pending=inspectRoleBoundPumpSimulation(x);x.preInstructionAccounts[0].data.fill(0);x.postInstructionAccounts[0].data.fill(0);x.meta.messageHash='mutated';const r=await pending;assert.equal(r.affectedRoleLayoutsQualified,true);assert.equal(r.actualReceiptVerified,false);});
function context(x){return {owner:x.options.venue.owner,agentId:x.options.venue.agentId,agentWallet:wallet,associatedMint:x.options.venue.mint,network:'solana:101',authenticated:true,paused:false,liveEnabled:false,broadcastEnabled:false,revision:1};}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`composed local ${migrated} ${side} quote-message-effects remain disarmed`,async()=>{
 const x=await boundFixture(migrated,side),c=context(x),inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>c,simulateUnsigned:async p=>{assert.equal(p.unsignedTransaction,x.unsignedTransaction);return {source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null,balanceFixture:{meta:x.meta,afterAccounts:x.afterAccounts,postInstructionAccounts:x.postInstructionAccounts}};}});
 const result=await inspector.inspect({...x.options,accounts:x.beforeAccounts,instructionAccounts:x.preInstructionAccounts});assert.equal(result.localEconomicInspection.affectedRoleLayoutsQualified,true);assert.equal(result.localEconomicInspection.actualReceiptVerified,false);assert.equal(result.venueExecutionQualified,false);assert.equal(result.executable,false);assert.equal(result.positionEffect,null);
});
test('composed fixture rejects balanced substitutions rather than produce position',async()=>{const x=await boundFixture(true),c=context(x);x.postInstructionAccounts.find(a=>a.address===x.beforeAccounts.base.address).data.fill(0,32,64);const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>c,simulateUnsigned:async p=>({source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null,balanceFixture:{meta:x.meta,afterAccounts:x.afterAccounts,postInstructionAccounts:x.postInstructionAccounts}})});await assert.rejects(inspector.inspect({...x.options,accounts:x.beforeAccounts,instructionAccounts:x.preInstructionAccounts}));});
test('Pause during final effect await revokes composed result',async()=>{const x=await boundFixture(true),c=context(x);let reads=0;const inspector=createPumpDryRunInspector({now:()=>now,readContext:()=>{if(++reads===7)queueMicrotask(()=>{c.paused=true;c.revision++;});return c;},simulateUnsigned:async p=>({source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null,balanceFixture:{meta:x.meta,afterAccounts:x.afterAccounts,postInstructionAccounts:x.postInstructionAccounts}})});await assert.rejects(inspector.inspect({...x.options,accounts:x.beforeAccounts,instructionAccounts:x.preInstructionAccounts}),/PAUSED_OR_UNSAFE/);});
test('expiry during final effect await revokes composed result',async()=>{const x=await boundFixture(true),c=context(x);let reads=0,clock=now;const inspector=createPumpDryRunInspector({now:()=>clock,readContext:()=>{if(++reads===7)queueMicrotask(()=>{clock=x.options.intent.expiresAt;});return c;},simulateUnsigned:async p=>({source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null,balanceFixture:{meta:x.meta,afterAccounts:x.afterAccounts,postInstructionAccounts:x.postInstructionAccounts}})});await assert.rejects(inspector.inspect({...x.options,accounts:x.beforeAccounts,instructionAccounts:x.preInstructionAccounts}),/EXPIRED/);});

function localExecutor(x,db,c=context(x)){
 const ledger=createPumpFixtureLedger(db),executor=createPumpLocalExecutor({ledger,readContext:()=>c,now:()=>now,simulateUnsigned:async p=>({source:'LOCAL_FIXTURE',messageHash:p.messageHash,success:true,err:null,balanceFixture:{meta:x.meta,afterAccounts:x.afterAccounts,postInstructionAccounts:x.postInstructionAccounts}})});
 const input={...x.options,accounts:x.beforeAccounts,instructionAccounts:x.preInstructionAccounts,requestKey:'pump-local-fixture-request-'+x.options.intent.side};return {ledger,executor,input,c};
}
for(const migrated of [false,true])test(`local adapter ${migrated} BUY/SELL budget accounting never changes Real position`,async()=>{
 const db=new DatabaseSync(':memory:');try{
  const real=createDexLedger(db),x=await boundFixture(migrated),l=localExecutor(x,db),record=l.executor.prepare(l.input);
  assert.equal(l.executor.prepare(l.input).id,record.id);assert.equal(record.inputAsset,migrated?'WSOL':'NATIVE_SOL');
  assert.equal(record.nativeHold,migrated?'5000':'100005000');
  assert.equal(db.prepare('SELECT count(*) n FROM dex_receipts').get().n,0);
  const report=await l.executor.inspect(record.id,l.input);assert.throws(()=>l.executor.applyFixture(record.id,JSON.parse(JSON.stringify(report))),/ISSUED/);
  const applied=l.executor.applyFixture(record.id,report);assert.equal(applied.releasedInputAsset,record.inputAsset);assert.equal(applied.releasedUnspentInput,report.localEconomicInspection.unspentBudget);assert.equal(applied.actualReceipt,null);
  assert.equal(l.ledger.position(x.options.intent.agentId,x.options.venue.mint).notRealPosition,true);assert.equal(real.position(x.options.intent.agentId,x.options.venue.mint).quantity,'0');
  const sell=await boundFixture(migrated,'SELL'),s=localExecutor(sell,db),sr=s.executor.prepare(s.input),sellReport=await s.executor.inspect(sr.id,s.input);s.executor.applyFixture(sr.id,sellReport);
  const pos=s.ledger.position(sell.options.intent.agentId,sell.options.venue.mint);assert.equal(pos.quoteAsset,migrated?'WSOL':'NATIVE_SOL');assert.equal(pos.nativeFeesLamports,'10000');assert.equal(pos.unrealizedPnl,null);assert.equal(db.prepare('SELECT count(*) n FROM dex_receipts').get().n,0);
  assert.throws(()=>l.executor.applyFixture(record.id,report),/ISSUED/);
 }finally{db.close();}
});
for(const mutation of ['mint','owner','pause','live','wsol','native','negative-revision'])test('local adapter rejects '+mutation,async()=>{
 const x=await boundFixture(true),db=new DatabaseSync(':memory:');try{const l=localExecutor(x,db);
  if(mutation==='mint')l.c.associatedMint=wallet;if(mutation==='owner')l.c.owner=wallet;if(mutation==='pause')l.c.paused=true;if(mutation==='live')l.c.liveEnabled=true;
  if(mutation==='negative-revision')l.c.revision=-1;
  if(mutation==='wsol'){l.input.accounts.quote.data.writeBigUInt64LE(1n,64);l.input.accounts.quote.lamports=2039281;}if(mutation==='native')l.input.accounts.wallet.lamports=5000;
  assert.throws(()=>l.executor.prepare(l.input));assert.equal(db.prepare('SELECT count(*) n FROM pump_fixture_executions').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM real_reserved_accounts').get().n,0);
 }finally{db.close();}
});
test('local adapter rejects authority revocation after report, preserving hold',async()=>{
 const x=await boundFixture(true),db=new DatabaseSync(':memory:');try{const l=localExecutor(x,db),r=l.executor.prepare(l.input),report=await l.executor.inspect(r.id,l.input);l.c.paused=true;l.c.revision++;assert.throws(()=>l.executor.applyFixture(r.id,report));assert.equal(l.ledger.reservation(r.id).status,'PREPARED');assert.equal(l.ledger.position(r.intent.agentId,x.options.venue.mint),null);}finally{db.close();}
});
test('pending local restart remains unresolved without sign/send or fixture effects',async()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'tekkteam-pump-local-')),'fixture.sqlite'),x=await boundFixture(true);let db=new DatabaseSync(file);let l=localExecutor(x,db);const r=l.executor.prepare(l.input);l.executor.markPending(r.id);db.close();
 db=new DatabaseSync(file);try{l=localExecutor(x,db);const recovered=l.executor.recover(r.id);assert.equal(recovered.record.status,'PENDING_LOCAL');assert.equal(recovered.reservation.status,'UNKNOWN');assert.equal(recovered.actualReceipt,null);assert.equal(recovered.realPosition,null);assert.equal(recovered.notBroadcast,true);assert.throws(()=>l.executor.cancel(r.id),/PENDING/);await assert.rejects(l.executor.inspect(r.id,l.input),/NOT_PREPARED/);assert.equal(l.ledger.position(r.intent.agentId,x.options.venue.mint),null);assert.throws(()=>l.executor.prepare({...l.input,requestKey:'independent-next-request-fixture'}),/RESERVED/);}finally{db.close();}
});
test('changed request conflicts and competing BUY/SELL cannot reuse held capital',async()=>{
 const x=await boundFixture(true),db=new DatabaseSync(':memory:');try{const l=localExecutor(x,db),r=l.executor.prepare(l.input);
  assert.throws(()=>l.executor.prepare({...l.input,intent:{...l.input.intent,inputAmount:'99000000'}}),/IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>l.executor.prepare({...l.input,requestKey:'competing-WSOL-request-fixture'}),/RESERVED/);
  const sell=await boundFixture(true,'SELL'),s=localExecutor(sell,db);assert.throws(()=>s.executor.prepare(s.input),/RESERVED/);
  assert.equal(l.ledger.reservation(r.id).status,'PREPARED');assert.equal(db.prepare('SELECT count(*) n FROM pump_fixture_executions').get().n,1);
 }finally{db.close();}
});
test('cancel releases only unsigned local hold and permits next prepare',async()=>{
 const x=await boundFixture(true),db=new DatabaseSync(':memory:');try{const l=localExecutor(x,db),r=l.executor.prepare(l.input);l.executor.cancel(r.id);assert.equal(l.ledger.reservation(r.id).status,'CANCELLED');assert.equal(db.prepare('SELECT count(*) n FROM real_reserved_accounts').get().n,0);assert.equal(l.ledger.position(r.intent.agentId,x.options.venue.mint),null);assert(l.executor.prepare({...l.input,requestKey:'next-local-fixture-after-cancel'}).id!==r.id);}finally{db.close();}
});
test('post-inspection nested report mutation cannot alter issued accounting proof',async()=>{
 const x=await boundFixture(true),db=new DatabaseSync(':memory:');try{const l=localExecutor(x,db),r=l.executor.prepare(l.input),report=await l.executor.inspect(r.id,l.input);
  assert.throws(()=>{report.quote.minimumOutput='1';},TypeError);assert.throws(()=>{report.localEconomicInspection.accountInventory.rows.length=0;},TypeError);
  const applied=l.executor.applyFixture(r.id,report);assert.equal(applied.fixtureEffects.fixtureInputDebit,'99999999');assert(applied.fixtureEffects.accountInventory.rows.length>0);assert.equal(applied.actualReceipt,null);
 }finally{db.close();}
});
test('curve fixture position survives canonical PumpSwap migration without asset conversion or Real accounting',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const real=createDexLedger(db),buy=await boundFixture(false),b=localExecutor(buy,db),br=b.executor.prepare(b.input);b.executor.applyFixture(br.id,await b.executor.inspect(br.id,b.input));
  const before=b.ledger.position(br.intent.agentId,buy.options.venue.mint),sell=await boundFixture(true,'SELL'),s=localExecutor(sell,db),sr=s.executor.prepare(s.input),proof=await s.executor.inspect(sr.id,s.input),applied=s.executor.applyFixture(sr.id,proof),after=s.ledger.position(sr.intent.agentId,sell.options.venue.mint);
  assert.equal(sr.inputAsset,sell.options.venue.mint);assert.equal(sr.nativeHold,'5000');assert.equal(applied.releasedInputAsset,sr.inputAsset);
  const quantity=BigInt(before.quantity),debit=BigInt(proof.localEconomicInspection.fixtureInputDebit),basis=BigInt(before.costBasisQuoteRaw)*debit/quantity;
  assert.equal(after.quantity,(quantity-debit).toString());assert.equal(after.costBasisQuoteRaw,(BigInt(before.costBasisQuoteRaw)-basis).toString());assert.equal(after.realizedQuotePnlRaw,(BigInt(proof.localEconomicInspection.fixtureOutputCredit)-basis).toString());
  assert.equal(after.quoteAsset,'MIXED_SOL_WSOL');assert.deepEqual(after.quoteAssetsObserved,['NATIVE_SOL','WSOL']);assert.equal(after.costBasisUnit,'SOL_EQUIVALENT_LAMPORTS');assert.equal(after.nativeFeesExcludedFromQuotePnl,true);assert.equal(after.nativeFeesLamports,'10000');assert.equal(after.unrealizedPnl,null);
  assert.equal(real.position(sr.intent.agentId,sell.options.venue.mint).quantity,'0');assert.equal(db.prepare('SELECT count(*) n FROM dex_receipts').get().n,0);
 }finally{db.close();}
});
