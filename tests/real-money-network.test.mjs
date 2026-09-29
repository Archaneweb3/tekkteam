import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {GENESIS} from '../src/pump-readiness.js';

const mainnet={getGenesisHash:async()=>GENESIS};
const devnet={getGenesisHash:async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'};
const make=(connection,components={})=>createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET',MAINNET_RPC_URL:'https://rpc.example'},connection,components});

test('single Mainnet connection verifies every real-money phase',async()=>{
 const n=make(mainnet);const status=await n.verify();
 assert.equal(n.productionRpcConfigured,true);
 assert.equal(status.networkConsistent,true);
 for(const role of ['agentWallet','funding','withdrawal','cpmmState','blockhash','simulation','broadcaster','reconciliation'])assert.equal(n.endpoints[role],mainnet);
 assert.equal(status.broadcaster,'MAINNET');
});
test('public Mainnet fallback cannot be treated as acceptance-grade RPC capacity',()=>{
 assert.equal(createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET'},connection:mainnet}).productionRpcConfigured,false);
 assert.equal(createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET',MAINNET_RPC_URL:'https://api.mainnet-beta.solana.com'},connection:mainnet}).productionRpcConfigured,false);
});

for(const [name,base,role,other] of [
 ['Mainnet RPC with Devnet broadcaster',mainnet,'broadcaster',devnet],
 ['Devnet RPC with Mainnet broadcaster',devnet,'broadcaster',mainnet],
 ['simulation network mismatch',mainnet,'simulation',devnet],
 ['blockhash network mismatch',mainnet,'blockhash',devnet],
 ['reconciliation network mismatch',mainnet,'reconciliation',devnet],
 ['CPMM state network mismatch',mainnet,'cpmmState',devnet],
 ['Agent Wallet network mismatch',mainnet,'agentWallet',devnet],
])test(`${name} is fail-closed`,async()=>{
 const n=make(base,{[role]:other});await assert.rejects(n.verify(),/REAL_MONEY_RPC_TOPOLOGY_MISMATCH/);assert.equal(n.status().networkConsistent,false);
});

test('wrong genesis is fail-closed',async()=>{const n=make(devnet);await assert.rejects(n.verify(),/REAL_MONEY_GENESIS_MISMATCH/);assert.equal(n.status().networkConsistent,false);});
test('real-money mode and conflicting RPC settings are fail-closed',async()=>{
 const wrong=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'DEVNET'},connection:mainnet});await assert.rejects(wrong.verify(),/REAL_MONEY_NETWORK_NOT_MAINNET/);
 const conflict=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET',MAINNET_RPC_URL:'https://a.example',SOLANA_MAINNET_RPC_URL:'https://b.example'},connection:mainnet});await assert.rejects(conflict.verify(),/REAL_MONEY_RPC_CONFIG_CONFLICT/);
 const legacyConflict=createRealMoneyNetwork({env:{REAL_MONEY_NETWORK:'MAINNET',SOLANA_MAINNET_RPC_URL:'https://b.example'},connection:mainnet});await assert.rejects(legacyConflict.verify(),/REAL_MONEY_RPC_CONFIG_CONFLICT/);
});
test('network drift after successful check revokes readiness',async()=>{
 let genesis=GENESIS;const n=make({getGenesisHash:async()=>genesis});await n.verify();genesis='wrong';await assert.rejects(n.verify(),/REAL_MONEY_GENESIS_MISMATCH/);assert.equal(n.status().networkConsistent,false);
});
