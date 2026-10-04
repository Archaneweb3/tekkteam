import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {EventEmitter} from 'node:events';
import {mainnetWalletBalance} from '../server/wallet-balance.js';import {GENESIS} from '../src/pump-readiness.js';
const source=fs.readFileSync('tools/local-owner-preview/mainnet-balance-reader.mjs','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
const owner='So11111111111111111111111111111111111111112';
function setup({status=200,genesis=GENESIS,value=16738236,slot=42,wrongId=false,dnsError=false}={}){
 const calls=[];class Socket{connect(){}}
 const https={Agent:class{},request(url,options,onResponse){
  const request=new EventEmitter();request.destroy=()=>{};
  request.end=body=>queueMicrotask(()=>{const message=JSON.parse(body);calls.push({host:url.hostname,...message});if(dnsError){request.emit('error',Object.assign(Error(),{code:'BALANCE_RPC_DNS_FAILED'}));return;}const response=new EventEmitter();response.statusCode=status;response.resume=()=>{};onResponse(response);response.emit('data',JSON.stringify({jsonrpc:'2.0',id:wrongId?999:message.id,result:message.method==='getGenesisHash'?genesis:{value,context:{slot}}}));response.emit('end');});return request;
 }};
 const context={https,tls:{connect(){}},net:{Socket,isIP:s=>/^\d+\./.test(s)?4:0},dns:{lookup(){}},mainnetWalletBalance,URL,Buffer,setTimeout,clearTimeout};vm.runInNewContext(source,context);return {calls,create:context.createMainnetBalanceReader};
}
test('read-only adapter sends only genesis and confirmed balance, caches owner and refreshes deliberately',async()=>{
 const {create,calls}=setup();const reader=create('https://rpc.example.invalid/key');const result=await reader.read(owner);
 assert.equal(result.lamports,16738236);assert.equal(result.network,'solana:101');assert.deepEqual(calls.map(x=>x.method),['getGenesisHash','getBalance']);assert.deepEqual(calls[1].params,[owner,{commitment:'confirmed'}]);
 await reader.read(owner);assert.equal(calls.length,2);await new Promise(resolve=>setTimeout(resolve,1050));await reader.read(owner,true);assert.equal(calls.length,4);assert.equal(reader.sendTransaction,undefined);assert.equal(reader.connection,undefined);
});
test('wrong genesis fails before balance and malformed responses fail closed',async()=>{
 const mismatch=setup({genesis:'devnet'});await assert.rejects(mismatch.create('https://rpc.example.invalid').read(owner),{code:'BALANCE_RPC_NETWORK_MISMATCH'});assert.equal(mismatch.calls.length,1);
 for(const params of [{value:-1},{value:1.1},{slot:-1},{wrongId:true}])await assert.rejects(setup(params).create('https://rpc.example.invalid').read(owner),{code:'BALANCE_RPC_RESPONSE_INVALID'});
});
test('HTTP, rate limit and DNS failures remain useful safe errors without redirect or secret leakage',async()=>{
 for(const [params,code] of [[{status:302},'BALANCE_RPC_HTTP_FAILED'],[{status:429},'BALANCE_RPC_RATE_LIMITED'],[{dnsError:true},'BALANCE_RPC_DNS_FAILED']])await assert.rejects(setup(params).create('https://rpc.example.invalid/SECRET').read(owner),e=>e.code===code&&!e.message.includes('SECRET'));
 for(const url of ['bad SECRET','http://rpc.example.invalid','https://127.0.0.1','https://u:SECRET@rpc.example.invalid','https://rpc.example.invalid:444','https://rpc.example.invalid/#SECRET'])assert.throws(()=>setup().create(url),e=>e.code==='BALANCE_RPC_CONFIG_INVALID'&&!e.message.includes('SECRET'));
});
