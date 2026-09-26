import test from 'node:test';
import assert from 'node:assert/strict';
import {backendNetwork,networkConfig,explorerUrl} from '../src/networks.js';
import {prepareMainnetMemo,assertSafetyMemo,readOnlyRpc} from '../src/mainnet-safety.js';
import {mainnetSafetyChain} from '../server/mainnet-safety.js';
import {createServer} from '../server/app.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const c=networkConfig('MAINNET');
function rpcMock(overrides={}){return async(method,params)=>{
  if(method in overrides)return overrides[method];
  if(method==='getGenesisHash')return c.genesis;
  if(method==='getAccountInfo')return {context:{slot:1},value:{owner:'11111111111111111111111111111111',lamports:5000000,executable:params[0]===c.programs.memo}};
  if(method==='getLatestBlockhash')return {context:{slot:1},value:{blockhash:owner,lastValidBlockHeight:100}};
  if(method==='getFeeForMessage')return {value:5000};
  if(method==='simulateTransaction'){assert.equal(params[1].replaceRecentBlockhash,false);assertSafetyMemo(Buffer.from(params[0],'base64'),owner);return {value:{err:null,logs:['success'],unitsConsumed:1}};}
  throw new Error('Unexpected RPC '+method);
};}
test('Mainnet explicit opt-in, RPC separation and empty address registries',()=>{
  assert.throws(()=>backendNetwork({SOLANA_NETWORK:'MAINNET'}),/SAFETY/);
  assert.throws(()=>networkConfig('typo'));
  assert.equal(backendNetwork({SOLANA_NETWORK:'MAINNET',MAINNET_SAFETY_MODE:'true',SOLANA_RPC_URL:'https://api.devnet.solana.com'}).rpc,c.rpc);
  assert.deepEqual(c.mints,{});assert.deepEqual(c.tokenAccounts,{});
  assert.equal(explorerUrl('MAINNET','address',owner).includes('devnet'),false);
  assert.equal(mainnetSafetyChain(c.rpc).submit,undefined);
});
test('Mainnet exact unsigned memo passes and rejects modified instructions/payer',async()=>{
  const result=await prepareMainnetMemo(owner,rpcMock());
  const tx=assertSafetyMemo(Buffer.from(result.transaction,'base64'),owner);
  assert.equal(result.feeLamports,5000);assert.equal(tx.instructions.length,1);
  assert.throws(()=>assertSafetyMemo(Buffer.from(result.transaction,'base64'),c.programs.memo),/payer/);
  tx.instructions[0].data=Buffer.from('changed');
  assert.throws(()=>assertSafetyMemo(tx.serialize({requireAllSignatures:false}),owner),/Memo/);
});
test('Wrong cluster, missing accounts, excessive fee and failed simulation fail closed',async()=>{
  for(const override of [{getGenesisHash:'devnet'},{getAccountInfo:{value:null}},{getFeeForMessage:{value:100001}},{simulateTransaction:{value:{err:'AccountNotFound'}}}])await assert.rejects(()=>prepareMainnetMemo(owner,rpcMock(override)));
});
test('RPC transport cannot broadcast or request funds',async()=>{
  let calls=0;const rpc=readOnlyRpc(c.rpc,async()=>{calls++;throw new Error('must not execute');});
  for(const method of ['sendTransaction','sendRawTransaction','requestAirdrop'])await assert.rejects(()=>rpc(method),/blocked/);
  assert.equal(calls,0);
});
test('Mainnet backend blocks all agent writes and reconciliation, and binds its database',async()=>{
  const dbPath=join(mkdtempSync(join(tmpdir(),'tekkwork-mainnet-test-')),'test.sqlite');
  const args={dbPath,network:'mainnet',rpc:c.rpc,mainnetSafetyMode:true};
  assert.throws(()=>createServer({...args,mainnetSafetyMode:false}),/safety/);
  const instance=createServer(args),server=instance.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    for(const path of ['/api/agents','/api/agents/x/prepare','/api/agents/x/submit','/api/agents/x/wallet-send','/api/agents/x/reconcile']){
      const response=await fetch(base+path,{method:'POST',headers:{origin:'http://127.0.0.1:5188','content-type':'application/json'},body:'{}'});
      assert.equal(response.status,403);
    }
    const {config}=await (await fetch(base+'/api/state')).json();
    assert.equal(config.broadcastEnabled,false);assert.equal(config.launchEnabled,false);
    await instance.reconcilePending();
  }finally{await new Promise(resolve=>server.close(resolve));instance.close();}
  assert.throws(()=>createServer({...args,network:'devnet'}),/network mismatch/);
});
