import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createDexLedger} from '../server/dex/ledger.js';
import {createAutonomousAcceptance,ENGINE_ACCEPTANCE} from '../server/dex/autonomous-acceptance.js';

const id='never-broadcast-fixture',sig='fixture-signature',hash='fixture-hash';
function fixture(){
 const db=new DatabaseSync(':memory:'),ledger=createDexLedger(db),acceptance=createAutonomousAcceptance(db,{activationConfigured:true});
 db.exec('CREATE TABLE dex_autonomous_sign_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL); CREATE TABLE dex_autonomous_broadcast_claim(execution_id TEXT PRIMARY KEY,message_hash TEXT NOT NULL)');
 const intent={mode:'AUTONOMOUS_ACCEPTANCE_TEST',agentId:ENGINE_ACCEPTANCE.agentId,owner:ENGINE_ACCEPTANCE.owner,agentWallet:ENGINE_ACCEPTANCE.agentWallet,acceptanceCycleId:'fixture-cycle',direction:'BUY',inputAmount:'100000',expiresAt:1000,pool:ENGINE_ACCEPTANCE.pool};
 const record={id,status:'UNKNOWN',reason:'SIGNED_NOT_BROADCAST',signature:sig,messageHash:hash,fingerprint:'intent-hash',intent,pool:ENGINE_ACCEPTANCE.pool,lastValidBlockHeight:100,risk:{snapshot:{solBalanceLamports:'6995000'}},broadcastAttemptedAt:null};
 db.prepare('INSERT INTO dex_executions VALUES(?,?,?,?,?,?,?)').run(id,intent.owner,'fixture-key',record.fingerprint,intent.agentId,record.status,JSON.stringify(record));
 db.prepare('INSERT INTO dex_autonomous_sign_claim VALUES(?,?)').run(id,hash);
 const hold={operationId:'dex:'+id,intentHash:record.fingerprint,status:'UNKNOWN',kind:'CONTROLLED_DEX',signature:sig,resources:[{wallet:intent.agentWallet,lamports:'3086880',balanceLamports:'6995000',protectedLamports:'2020000'}]};
 db.prepare('INSERT INTO real_balance_reservations VALUES(?,?,?,?)').run(hold.operationId,hold.intentHash,hold.status,JSON.stringify(hold));
 db.prepare('INSERT INTO real_reserved_accounts VALUES(?,?,?)').run(hold.operationId,intent.agentWallet,'3086880');
 const cycle={cycleId:intent.acceptanceCycleId,status:'UNKNOWN',emergencyPermission:false,emergencyStopped:true,execution:{id,direction:'BUY',intentHash:record.fingerprint,messageHash:hash,reservationId:hold.operationId,reservedLamports:'3086880',expiresAt:1000,amount:'100000'}};
 db.prepare('INSERT INTO dex_autonomous_acceptance VALUES(?,?)').run(intent.agentId,JSON.stringify(cycle));
 const proof={network:'solana:mainnet',genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',signature:sig,signatureStatus:null,transaction:null,currentBlockHeight:101,checkedAt:Date.now(),agentBalanceLamports:'6995000',tokenBalanceRaw:'0',tokenAccountExists:false};
 return {db,ledger,acceptance,proof};
}

test('signed but provably never broadcast expires, preserves signature and releases reservation',()=>{
 const f=fixture();
 assert.throws(()=>f.ledger.transition(id,['UNKNOWN'],'EXPIRED',{reason:'EXPIRED_BEFORE_BROADCAST'}),/EXECUTION_STATE_CONFLICT/);
 const expired=f.ledger.expireNeverBroadcast(id,f.proof);
 assert.equal(expired.status,'EXPIRED');assert.equal(expired.signature,sig);
 assert.equal(f.ledger.reservation(id).status,'EXPIRED');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM real_reserved_accounts').get().n,0);
 f.acceptance.terminalFailure(expired);
 assert.equal(f.acceptance.read().status,'FAILED');assert.equal(f.acceptance.retryEligible(),true);
 f.db.close();
});

test('broadcast claim, receipt, unexpired blockhash, or balance mismatch fails closed',()=>{
 for(const variant of ['claim','receipt','height','balance']){
  const f=fixture();
  if(variant==='claim')f.db.prepare('INSERT INTO dex_autonomous_broadcast_claim VALUES(?,?)').run(id,hash);
  if(variant==='receipt')f.db.prepare('INSERT INTO dex_receipts VALUES(?,?,?)').run(id,sig,'{}');
  if(variant==='height')f.proof.currentBlockHeight=100;
  if(variant==='balance')f.proof.agentBalanceLamports='6990000';
  assert.throws(()=>f.ledger.expireNeverBroadcast(id,f.proof),/NEVER_BROADCAST_PROOF_INCOMPLETE/);
  assert.equal(f.ledger.get(id).status,'UNKNOWN');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM real_reserved_accounts').get().n,1);
  f.db.close();
 }
});
