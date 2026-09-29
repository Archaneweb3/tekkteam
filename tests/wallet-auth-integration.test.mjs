import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {createServer} from '../server/app.js';
test('real application session/ownership/origin guards protect wallet routes; defaults stay locked',async t=>{
 const instance=createServer({dbPath:join(mkdtempSync(join(tmpdir(),'wallet-auth-')),'db')}),db=instance.store.db,owner=Keypair.generate().publicKey.toBase58(),other=Keypair.generate().publicKey.toBase58();
 for(const [cookie,address] of [['owner',owner],['other',other]])db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(cookie).digest('hex'),address,Date.now()+60000);
 db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,?)').run('a',owner,JSON.stringify({id:'a',creator:owner,status:'DRAFT',strategy:'balanced'}),'unused');
 const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();instance.close();});
 const call=(path,cookie,body,origin='http://127.0.0.1:5188')=>fetch(`http://127.0.0.1:${server.address().port}/api/agents/a/trading/`+path,{method:body?'POST':'GET',headers:{origin,cookie:cookie?'tw_session='+cookie:'','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 for(const path of ['funding/prepare','withdrawal/prepare','withdrawal/confirm','funding/submit']){
  assert.equal((await call(path,null,{})).status,401);assert.equal((await call(path,'other',{})).status,404);assert.equal((await call(path,'owner',{},'https://untrusted.example')).status,403);
 }
 assert.equal((await call('funding/prepare','owner',{})).status,409);assert.equal((await call('withdrawal/prepare','owner',{})).status,409);
 const state=await(await call('wallet','owner')).json();assert.equal(state.liveLocked,true);assert.equal(state.fundingEnabled,false);assert.equal(state.withdrawalEnabled,false);assert.equal(state.agentWallet,null);assert.equal(state.balanceStatus,'NO_WALLET');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM agent_wallets').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM agent_funding').get().n,0);
});
