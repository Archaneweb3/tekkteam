import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import {createCpmmProductionAdapter} from '../server/dex/cpmm-production-adapter.js';
import {FIRST_BUY,assertFirstBuyAcceptance,firstBuyAcceptanceAvailable} from '../server/dex/first-buy-acceptance.js';

const context={agentId:FIRST_BUY.agentId,owner:FIRST_BUY.owner,agentWallet:FIRST_BUY.agentWallet};
const body={direction:'BUY',inputMint:FIRST_BUY.inputMint,outputMint:FIRST_BUY.outputMint,inputAmount:'100000',slippageBps:100,requestKey:'first-buy-fixture-operation'};

test('first acceptance permits only exact owner/agent/wallet, BUY pair, amount, venue and pool',()=>{
 assert.equal(assertFirstBuyAcceptance(body,context),true);
 const failures=[
  [{...body,direction:'SELL'},context], [{...body,inputAmount:'100001'},context],
  [{...body,outputMint:FIRST_BUY.inputMint},context], [{...body,inputMint:FIRST_BUY.outputMint},context],
  [{...body,slippageBps:101},context], [{...body,pool:'other'},context],
  [{...body,venue:'JUPITER'},context], [body,{...context,agentId:'other'}],
  [body,{...context,agentWallet:'other'}], [body,{...context,owner:'other'}]
 ];
 for(const [candidate,actor] of failures)assert.throws(()=>assertFirstBuyAcceptance(candidate,actor),/REJECT_ACCEPTANCE_POLICY/);
 assert.throws(()=>assertFirstBuyAcceptance(body,context,{adapterKind:'OTHER'}),/REJECT_ACCEPTANCE_POLICY/);
 assert.equal(firstBuyAcceptanceAvailable([]),true);
});

const history=(status,{reason='QUOTE_UNAVAILABLE',signature=null,events,activeReservation=false,reservation=null,hasReceipt=false,broadcastAttemptedAt=null,authorizedMessageHash=null,requestKey='old-attempt'}={})=>({
 record:{id:'old-execution',requestKey,status,reason,signature,broadcastAttemptedAt,authorizedMessageHash},
 events:events??[{status:'QUOTED',record:{status:'QUOTED'}},{status,record:{status,reason,signature,broadcastAttemptedAt,authorizedMessageHash}}],
 activeReservation,reservation,hasReceipt
});
test('clean pre-sign failures preserve one-time acceptance for a fresh key',()=>{
 for(const entry of [history('REJECTED_BEFORE_SIGNING'),history('EXPIRED',{reason:'PREPARATION_EXPIRED'}),history('CANCELLED',{reason:'Cancelled before signing'}),history('FAILED',{reason:'Cancelled before signing'})]){
  assert.equal(firstBuyAcceptanceAvailable([entry],body.requestKey),true);
  assert.equal(assertFirstBuyAcceptance(body,context,{history:[entry]}),true);
 }
 assert.equal(firstBuyAcceptanceAvailable([history('REJECTED_BEFORE_SIGNING'),history('EXPIRED',{reason:'PREPARATION_EXPIRED',requestKey:'older-attempt'})],body.requestKey),true);
});
test('signed, broadcast, unknown, confirmed and unreconciled evidence consume or block acceptance',()=>{
 const blocked=[
  ...['SIGNED','SUBMITTED','UNKNOWN','CONFIRMED'].map(status=>history(status)),
  history('FAILED',{reason:'FINALIZED_ONCHAIN_ERROR',events:[{status:'SUBMITTED',record:{broadcastAttemptedAt:1}},{status:'FAILED',record:{status:'FAILED'}}]}),
  history('REJECTED_BEFORE_SIGNING',{signature:'unexpected-signature'}),
  history('REJECTED_BEFORE_SIGNING',{events:[{status:'UNKNOWN',record:{authorizedMessageHash:'claimed'}},{status:'REJECTED_BEFORE_SIGNING',record:{status:'REJECTED_BEFORE_SIGNING'}}]}),
  history('EXPIRED',{activeReservation:true}),
  history('REJECTED_BEFORE_SIGNING',{reservation:{status:'PREPARED',signature:null}}),
  history('REJECTED_BEFORE_SIGNING',{hasReceipt:true}),
  history('REJECTED_BEFORE_SIGNING',{events:[]}),
  history('FAILED',{reason:'SIGNATURE_OR_CUSTODY_REJECTED_BEFORE_BROADCAST'})
 ];
 for(const entry of blocked){assert.equal(firstBuyAcceptanceAvailable([entry],body.requestKey),false);assert.throws(()=>assertFirstBuyAcceptance(body,context,{history:[entry]}),/REJECT_ACCEPTANCE_POLICY/);}
});
test('same key remains idempotent at policy boundary; changed canonical intent remains rejected',()=>{
 const old=history('REJECTED_BEFORE_SIGNING',{requestKey:body.requestKey});
 assert.equal(assertFirstBuyAcceptance(body,context,{history:[old]}),true);
 assert.throws(()=>assertFirstBuyAcceptance({...body,inputAmount:'100001'},context,{history:[old]}),/REJECT_ACCEPTANCE_POLICY/);
});

test('production custody boundary verifies persisted encrypted identity without signing',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE agent_wallets(agent_id TEXT PRIMARY KEY,address TEXT,secret TEXT)');
 const key=Keypair.fromSeed(Uint8Array.from({length:32},(_,i)=>i+1));
 const agentId='fixture-agent',address=key.publicKey.toBase58();
 const store={unseal:()=>Buffer.from(key.secretKey)};
 const adapter=createCpmmProductionAdapter({connection:{},db,store});
 const intent={agentId,agentWallet:address};
 await assert.rejects(adapter.assertCustody(intent),/AGENT_CUSTODY_UNAVAILABLE/);
 db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(agentId,address,'sealed-fixture');
 assert.equal(await adapter.assertCustody(intent),true);
 await assert.rejects(adapter.assertCustody({...intent,agentWallet:FIRST_BUY.agentWallet}),/AGENT_CUSTODY_UNAVAILABLE/);
 store.unseal=()=>{throw Error('decrypt failed');};
 await assert.rejects(adapter.assertCustody(intent),/decrypt failed/);
 store.unseal=()=>Buffer.from(Keypair.fromSeed(new Uint8Array(32).fill(9)).secretKey);
 await assert.rejects(adapter.assertCustody(intent),/AGENT_CUSTODY_UNAVAILABLE/);
});
