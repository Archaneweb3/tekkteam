import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Keypair} from '@solana/web3.js';
import {readAgentSetup,readAgentSetupFacts,createLaunchpadFundingAuthority} from '../server/agent-setup.js';
import {renderAgentSetup} from '../public/app/agent-setup-ui.js';

function fixture(){
 const db=new DatabaseSync(':memory:'),key=()=>Keypair.generate().publicKey.toBase58(),owner=key(),wallet=key(),mint=key();
 const agent={id:'agent',creator:owner,tradingWallet:wallet,launchWalletBinding:{owner,agentId:'agent',mint,network:'solana:101',signature:'fixture-signature',executionId:'fixture-execution'}};
 const receipt={...agent.launchWalletBinding,status:'Success',confirmed:true,confirmedSlot:100,pumpProvenance:'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR'};
 db.exec('CREATE TABLE agents(id TEXT,owner TEXT);CREATE TABLE agent_wallets(agent_id TEXT,address TEXT,secret TEXT);CREATE TABLE launch_agent_bindings(agent_id TEXT,owner TEXT,mint TEXT,network TEXT,signature TEXT,execution_id TEXT,wallet TEXT);CREATE TABLE real_reserved_accounts(wallet TEXT,lamports TEXT)');
 db.prepare('INSERT INTO agents VALUES(?,?)').run(agent.id,owner);db.prepare('INSERT INTO agent_wallets VALUES(?,?,?)').run(agent.id,wallet,'fixture-encrypted-envelope');
 db.prepare('INSERT INTO launch_agent_bindings VALUES(?,?,?,?,?,?,?)').run(agent.id,owner,mint,'solana:101',receipt.signature,receipt.executionId,wallet);
 const evidence={available:true,receipt};
 const input={db,agent,owner,evidence,balanceReader:async address=>({owner:address,network:'solana:101',lamports:3000000,slot:110,checkedAt:1000}),revalidate:()=>({owner,agent,evidence})};
 return {db,agent,receipt,input};
}

test('positive balance below reserve/holds still needs funding; exact canonical receipt is required for Launchpad funding',async()=>{
 const f=fixture();try{
  for(const lamports of [1,2020000]){const s=await readAgentSetup({...f.input,balanceReader:async()=>({owner:f.agent.tradingWallet,network:'solana:101',lamports,slot:110,checkedAt:1000})});assert.equal(s.state,'AWAITING_FUNDING');assert.equal(s.nextAction.kind,'FUND_AGENT');}
  let scope={available:true,scoped:true},evidence=f.input.evidence;const authority=createLaunchpadFundingAuthority({db:f.db,readScope:()=>scope,readEvidence:()=>evidence});
  assert.equal(authority(f.agent).signature,f.receipt.signature);evidence={available:true,receipt:null};assert.throws(()=>authority(f.agent),/Confirmed launch/);scope={available:false};assert.throws(()=>authority(f.agent),/Confirmed launch/);
  scope={available:true,scoped:false};assert.deepEqual(authority({id:'general',creator:f.input.owner}),{kind:'GENERAL'});const damaged={...f.agent};delete damaged.launchWalletBinding;assert.throws(()=>authority(damaged),/Confirmed launch/);
 }finally{f.db.close();}
});
test('setup binds canonical receipt/wallet, subtracts protected reserve and reservations, never grants authority or exposes ciphertext',async()=>{
 const f=fixture();try{f.db.prepare('INSERT INTO real_reserved_accounts VALUES(?,?)').run(f.agent.tradingWallet,'100000');const before=f.db.prepare('SELECT total_changes() n').get().n;
 const s=await readAgentSetup(f.input);assert.equal(s.state,'AWAITING_ACTIVATION');assert.equal(s.capital.protectedReserveLamports,'2020000');assert.equal(s.capital.balanceAfterReserveLamports,'880000');assert.equal(s.capital.executableTradeBudgetLamports,null);assert.equal(s.wallet.commitment,'confirmed');assert.equal(s.authorizationGranted,false);for(const key of ['funding','activation','trading'])assert.equal(s[key].enabled,false);assert.doesNotMatch(JSON.stringify(s),/fixture-encrypted-envelope|secret/);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
 }finally{f.db.close();}
});
test('zero balance and RPC unavailable stay distinct; mismatched network/address cannot supply a balance',async()=>{
 const f=fixture();try{for(const [result,state] of [[{owner:f.agent.tradingWallet,network:'solana:101',lamports:0,slot:1,checkedAt:1},'AWAITING_FUNDING'],[null,'BALANCE_UNAVAILABLE'],[{owner:f.input.owner,network:'solana:101',lamports:1},'BALANCE_UNAVAILABLE'],[{owner:f.agent.tradingWallet,network:'devnet',lamports:1},'BALANCE_UNAVAILABLE']]){
  const s=await readAgentSetup({...f.input,balanceReader:async()=>result});assert.equal(s.state,state);assert.equal(s.wallet.balanceLamports,state==='AWAITING_FUNDING'?'0':null);
 }}finally{f.db.close();}
});
test('owner/session, receipt or binding changes during balance await fail closed',async()=>{
 const f=fixture();try{await assert.rejects(readAgentSetup({...f.input,revalidate:()=>null}),{status:401});
 const s=await readAgentSetup({...f.input,balanceReader:async()=>{f.db.prepare('UPDATE launch_agent_bindings SET mint=?').run(Keypair.generate().publicKey.toBase58());return {owner:f.agent.tradingWallet,network:'solana:101',lamports:1,slot:1,checkedAt:1};}});assert.equal(s.reason,'SETUP_CHANGED');assert.equal(s.wallet,null);
 }finally{f.db.close();}
});
test('unconfirmed/foreign/missing receipt, wallet record and accounting never become ready; identity-only remains valid',()=>{
 const f=fixture();try{for(const patch of [{confirmed:false},{owner:'foreign'},{network:'devnet'},{pumpProvenance:'guessed'}])assert.equal(readAgentSetupFacts({...f.input,evidence:{available:true,receipt:{...f.receipt,...patch}}}).available,false);
 assert.equal(readAgentSetupFacts({...f.input,evidence:{available:true,receipt:null}}).reason,'RECEIPT_UNAVAILABLE');
 f.db.prepare('INSERT INTO agents VALUES(?,?)').run('identity',f.input.owner);
 assert.deepEqual(readAgentSetupFacts({...f.input,agent:{id:'identity',creator:f.input.owner},evidence:{available:true,receipt:null}}),{available:true,launched:false});
 f.db.exec('DELETE FROM agent_wallets');assert.equal(readAgentSetupFacts(f.input).reason,'WALLET_PROVISIONING_REQUIRED');
 }finally{f.db.close();}
});
test('setup UI keeps navigation separate from Paper and Real execution and rejects foreign owner state',async()=>{
 const f=fixture();try{const s=await readAgentSetup(f.input),html=renderAgentSetup(s,f.agent);assert.match(html,/data-overview-action="wallet"/);assert.match(html,/Trading is OFF/);assert.match(html,/Advanced/);assert.doesNotMatch(html,/data-paper-action|funding\/|autonomous-real|data-do="fund"/);assert.match(renderAgentSetup({...s,owner:'other'},f.agent),/unavailable/);assert.doesNotMatch(renderAgentSetup({...s,owner:'other'},f.agent),new RegExp(f.agent.tradingWallet));}finally{f.db.close();}
});
