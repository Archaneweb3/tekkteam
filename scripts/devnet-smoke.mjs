// Disposable test wallet only: no imports of user keys, no mainnet override.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Connection, Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { getMint, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createServer } from '../server/app.js';

const dir=resolve('server/data/devnet-smoke');
mkdirSync(dir,{recursive:true});
const keyPath=resolve(dir,'test-wallet.json');
const owner=existsSync(keyPath)?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath,'utf8')))):Keypair.generate();
if(!existsSync(keyPath))writeFileSync(keyPath,JSON.stringify([...owner.secretKey]),{mode:0o600});
const rpc='https://api.devnet.solana.com';
const connection=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(15000)})});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
assert.equal(await connection.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
console.log('Devnet-only test wallet:',owner.publicKey.toBase58());
let balance=await connection.getBalance(owner.publicKey);
if(balance<5_000_000) {
  try {
    const signature=await connection.requestAirdrop(owner.publicKey,50_000_000);
    console.log('Test SOL airdrop submitted:',signature);
    for(let i=0;i<12;i++){await sleep(2500);balance=await connection.getBalance(owner.publicKey);if(balance>=5_000_000)break;}
  } catch { console.log('Public faucet unavailable or rate-limited. No retry loop.'); }
}
if(balance<5_000_000) {
  console.log('BLOCKED: add devnet test SOL at https://faucet.solana.com/ to the public address above, then rerun. Never send mainnet funds.');
  process.exitCode=2;
} else {
  const origin='http://127.0.0.1:5188';
  const service=createServer({dbPath:resolve(dir,'smoke.sqlite'),origins:[origin],network:'devnet',rpc});
  const server=service.app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  let cookie='';
  async function call(path,body,key) {
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    assert.ok(response.ok,`${path}: ${response.status} ${data.error||''}`);
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return data;
  }
  try {
    const challenge=await call('/auth/challenge',{address:owner.publicKey.toBase58()});
    await call('/auth/verify',{id:challenge.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(challenge.message),owner.secretKey))});
    const agent=await call('/agents',{name:'Devnet Smoke',tokenName:'Test Token',ticker:'TEST',description:'Disposable integration test',character:'frank',strategy:'balanced'},'devnet-smoke-one');
    if(!['SUBMITTED','DEVNET_LIVE'].includes(agent.status)) {
      const prepared=await call(`/agents/${agent.id}/prepare`,{});
      const tx=Transaction.from(Buffer.from(prepared.transaction,'base64'));
      assert.equal(tx.feePayer.toBase58(),owner.publicKey.toBase58());
      assert.ok(prepared.estimatedCostSol<0.01,'Unexpected test cost');
      tx.partialSign(owner);
      await call(`/agents/${agent.id}/submit`,{transaction:tx.serialize().toString('base64')});
    }
    let result;
    for(let i=0;i<18;i++) {
      result=await call(`/agents/${agent.id}/reconcile`,{});
      if(result.status!=='SUBMITTED')break;
      await sleep(3000);
    }
    assert.equal(result.status,'DEVNET_LIVE','Not confirmed; rerun to reconcile the same mint, not create another');
    const mintKey=new PublicKey(result.launch.mint);
    const mint=await getMint(connection,mintKey);
    assert.equal(mint.decimals,6);assert.equal(mint.supply,1_000_000_000_000n);
    assert.equal(mint.mintAuthority,null);assert.equal(mint.freezeAuthority,null);
    const holding=await getAccount(connection,getAssociatedTokenAddressSync(mintKey,owner.publicKey));
    assert.equal(holding.amount,mint.supply);
    const evidence={verifiedAt:new Date().toISOString(),network:'devnet',mint:mintKey.toBase58(),signature:result.launch.signature,owner:owner.publicKey.toBase58(),status:result.status};
    writeFileSync(resolve(dir,'result.json'),JSON.stringify(evidence,null,2));
    console.log('PASS: wallet auth → draft → signed mint → on-chain supply/authority/balance verification');
    console.log(`https://explorer.solana.com/tx/${evidence.signature}?cluster=devnet`);
  } finally {await new Promise(r=>server.close(r));service.close();}
}
