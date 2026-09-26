import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createServer } from '../server/app.js';

const origin = 'http://127.0.0.1:5188';
test('TEKKWORK auth, private persistence, idempotency, ownership and launch state machine', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tekkwork-test-'));
  let sends = 0, clock = Date.now(), chainStatus = 'pending';
  const chain = {
    prepare: async () => ({ transaction: 'test-transaction', message: 'expected', mint: Keypair.generate().publicKey.toBase58(), expiresAt: clock + 90000 }),
    submit: async (tx, msg) => { assert.equal(msg,'expected'); if (tx !== 'signed-expected') throw Object.assign(new Error('Invalid transaction'),{status:400}); return { signature:'test-signature', send:async () => { sends++; } }; },
    status: async () => chainStatus,
  };
  let service = createServer({ dbPath: join(dir,'db.sqlite'), origins:[origin], network:'devnet', chain, now:()=>clock });
  let server = service.app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r));
  let base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, { method='GET', body, cookie='', key, requestOrigin=origin } = {}) => {
    const response = await fetch(base+path,{ method, headers:{'Content-Type':'application/json', Origin:requestOrigin, Cookie:cookie,...(key?{'Idempotency-Key':key}:{})}, ...(body ? {body:JSON.stringify(body)} : {}) });
    return { status:response.status, body:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async key => {
    const c = await call('/auth/challenge',{method:'POST',body:{address:key.publicKey.toBase58()}});
    const input={id:c.body.id,signature:bs58.encode(nacl.sign.detached(Buffer.from(c.body.message),key.secretKey))};
    const result=await call('/auth/verify',{method:'POST',body:input}); assert.equal(result.status,200); return {...result,input};
  };
  const alice=Keypair.generate(), bob=Keypair.generate();
  let aliceSession, bobSession, agent;
  try {
    await t.test('rejects untrusted origins, missing auth, invalid signatures and replay', async () => {
      assert.equal((await call('/auth/challenge',{method:'POST',body:{address:alice.publicKey.toBase58()},requestOrigin:'https://attacker.invalid'})).status,403);
      assert.equal((await call('/agents',{method:'POST',body:{}})).status,401);
      const c=await call('/auth/challenge',{method:'POST',body:{address:alice.publicKey.toBase58()}});
      assert.equal((await call('/auth/verify',{method:'POST',body:{id:c.body.id,signature:'bad'}})).status,401);
      aliceSession=await login(alice); bobSession=await login(bob);
      assert.equal((await call('/auth/verify',{method:'POST',body:aliceSession.input})).status,401);
    });
    const input={name:'Felix Studio',tokenName:'Studio Token',ticker:'STUDIO',description:'A real draft',character:'frank',strategy:'balanced'};
    await t.test('persists drafts and deduplicates retries without copying reference data',async()=>{
      const r=await call('/agents',{method:'POST',body:input,cookie:aliceSession.cookie,key:'draft-request-001'}); assert.equal(r.status,201); agent=r.body;
      const again=await call('/agents',{method:'POST',body:input,cookie:aliceSession.cookie,key:'draft-request-001'}); assert.equal(again.body.id,agent.id);
      assert.equal((await call('/agents',{method:'POST',body:{...input,name:'Other'},cookie:aliceSession.cookie,key:'draft-request-001'})).status,409);
      assert.equal((await call('/state',{cookie:aliceSession.cookie})).body.agents.length,1);
      assert.equal((await call('/state')).body.agents.length,0);
      assert.equal((await call('/state',{cookie:bobSession.cookie})).body.agents.length,0);
      assert.equal((await call('/state',{cookie:aliceSession.cookie})).body.stats.trades24h,0);
    });
    await t.test('isolates owner access and validates updates',async()=>{
      assert.equal((await call('/agents/'+agent.id,{cookie:bobSession.cookie})).status,404);
      assert.equal((await call('/agents/'+agent.id,{method:'PATCH',body:{strategy:'momentum'},cookie:bobSession.cookie})).status,404);
      assert.equal((await call('/agents/'+agent.id,{method:'PATCH',body:{strategy:'bad'},cookie:aliceSession.cookie})).status,400);
      assert.equal((await call('/agents/'+agent.id,{method:'PATCH',body:{strategy:'momentum'},cookie:aliceSession.cookie})).body.strategy,'momentum');
    });
    await t.test('prepares once, submits once and waits for confirmation',async()=>{
      const prepared=await call(`/agents/${agent.id}/prepare`,{method:'POST',cookie:aliceSession.cookie}); assert.equal(prepared.status,200); assert.equal(prepared.body.message,undefined);
      assert.equal((await call(`/agents/${agent.id}/submit`,{method:'POST',cookie:aliceSession.cookie,body:{transaction:'tampered'}})).status,400);
      const submitted=await call(`/agents/${agent.id}/submit`,{method:'POST',cookie:aliceSession.cookie,body:{transaction:'signed-expected'}}); assert.equal(submitted.body.status,'SUBMITTED');
      await call(`/agents/${agent.id}/submit`,{method:'POST',cookie:aliceSession.cookie,body:{transaction:'signed-expected'}}); assert.equal(sends,1);
      assert.equal((await call(`/agents/${agent.id}/reconcile`,{method:'POST',cookie:aliceSession.cookie})).body.status,'SUBMITTED');
      const stored=service.store.db.prepare('SELECT payload FROM submissions WHERE agent_id=?').get(agent.id);
      assert.ok(stored); assert.notEqual(stored.payload,'signed-expected');
      await new Promise(r=>server.close(r)); service.close();
      service=createServer({dbPath:join(dir,'db.sqlite'),origins:[origin],network:'devnet',chain,now:()=>clock});
      server=service.app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}/api`;
      const before=sends; await service.reconcilePending(); assert.equal(sends,before+1);
      chainStatus='confirmed'; assert.equal((await call(`/agents/${agent.id}/reconcile`,{method:'POST',cookie:aliceSession.cookie})).body.status,'DEVNET_LIVE');
      assert.equal(service.store.db.prepare('SELECT payload FROM submissions WHERE agent_id=?').get(agent.id),undefined);
      assert.equal((await call(`/agents/${agent.id}/prepare`,{method:'POST',cookie:aliceSession.cookie})).status,409);
    });
    await t.test('stores only encrypted mint keys and survives a restart',async()=>{
      const row=service.store.db.prepare('SELECT secret FROM agents WHERE id=?').get(agent.id); assert.ok(row.secret.length>50);
      assert.throws(()=>service.store.unseal(row.secret,'different-agent'));
      await new Promise(r=>server.close(r)); service.close();
      service=createServer({dbPath:join(dir,'db.sqlite'),origins:[origin],network:'local',now:()=>clock}); server=service.app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}/api`;
      assert.equal((await call('/state',{cookie:aliceSession.cookie})).body.agents[0].id,agent.id);
      assert.equal((await call(`/agents/${agent.id}/prepare`,{method:'POST',cookie:aliceSession.cookie})).status,503);
    });
    await t.test('expires sessions and clears logout credentials',async()=>{
      await call('/auth/logout',{method:'POST',cookie:bobSession.cookie}); assert.equal((await call('/agents/'+agent.id,{cookie:bobSession.cookie})).status,401);
      clock+=9*3600_000; assert.equal((await call('/agents/'+agent.id,{cookie:aliceSession.cookie})).status,401);
    });
  } finally { await new Promise(r=>server.close(r)); service.close(); rmSync(dir,{recursive:true,force:true}); }
});
