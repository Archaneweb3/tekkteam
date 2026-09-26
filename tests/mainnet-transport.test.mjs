import test from 'node:test';
import assert from 'node:assert/strict';
import {createMainnetTransport} from '../server/mainnet-rpc-transport.js';
import {prepareMainnetMemo} from '../src/mainnet-safety.js';
import {networkConfig} from '../src/networks.js';
const c=networkConfig('MAINNET'),owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
test('secured transport allows unchanged memo flow and denies unsafe requests',async()=>{
  const calls=[];
  const upstream=async(method,params)=>{
    calls.push(method);
    if(method==='getGenesisHash')return c.genesis;
    if(method==='getAccountInfo')return {context:{slot:1},value:{owner:'11111111111111111111111111111111',lamports:5000000,executable:params[0]===c.programs.memo}};
    if(method==='getBalance')return {value:5000000};
    if(method==='getLatestBlockhash')return {context:{slot:1},value:{blockhash:owner,lastValidBlockHeight:100}};
    if(method==='getFeeForMessage')return {value:5000};
    if(method==='simulateTransaction')return {value:{err:null,logs:['success']}};
    throw Error('Unexpected method');
  };
  const server=createMainnetTransport({rpc:upstream}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
  const url='http://127.0.0.1:'+server.address().port+'/mainnet-rpc';
  const send=(body,origin='http://127.0.0.1:5188')=>fetch(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  let id=0;const rpc=async(method,params=[])=>{const r=await send({jsonrpc:'2.0',id:++id,method,params});assert.equal(r.status,200);return (await r.json()).result;};
  try{
    await rpc('getBalance',[owner,{commitment:'finalized'}]);
    const result=await prepareMainnetMemo(owner,rpc);assert.equal(result.simulation.value.err,null);
    for(const method of ['sendTransaction','sendRawTransaction','requestAirdrop','getProgramAccounts']){
      const before=calls.length;assert.equal((await send({jsonrpc:'2.0',id:1,method,params:[]})).status,400);assert.equal(calls.length,before);
    }
    assert.equal((await send({jsonrpc:'2.0',id:1,method:'getGenesisHash'},'https://evil.example')).status,403);
    assert.equal((await send([{jsonrpc:'2.0',id:1,method:'getGenesisHash'}])).status,400);
    assert.equal((await send({jsonrpc:'2.0',id:1,method:'simulateTransaction',params:[result.transaction,{encoding:'base64',sigVerify:false,replaceRecentBlockhash:true}]})).status,400);
    assert.equal((await send({jsonrpc:'2.0',id:1,method:'getGenesisHash',url:'https://evil.example'})).status,400);
  }finally{await new Promise(r=>server.close(r));}
});
