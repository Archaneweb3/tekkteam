import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validateFixtureResume} from '../tools/local-owner-preview/fixture-resume.mjs';
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(r=>s.close(r));return port;};
async function start(args){
 const child=fork('tools/local-owner-preview/owner-backend.mjs',args.map(String),{silent:true});let out='',err='';child.stderr.on('data',b=>err+=b);
 const ready=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('fixture timeout '+err)),20000);child.on('exit',code=>{clearTimeout(timeout);reject(Error('fixture exited '+code+' '+err));});child.stdout.on('data',b=>{out+=b;for(const line of out.split('\n')){try{const data=JSON.parse(line);if(data.status==='READY'){clearTimeout(timeout);resolve(data);}}catch{}}});});
 return {ready,stop:async()=>{const done=once(child,'exit');child.send('shutdown');await done;}};
}
test('resume preserves same fixture rows, session descriptor and uncertain receipt without reseeding',async()=>{
 const backend=await free(),frontend=await free(),ports={backend,frontend};let running=await start([backend,frontend]);const dir=running.ready.dir;
 try{
  const db=new DatabaseSync(dir+'/fixture.sqlite');
  try{db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run('preserved','11111111111111111111111111111111',JSON.stringify({id:'preserved',creator:'11111111111111111111111111111111',coin:null,name:'Fixture preserved'}));}finally{db.close();}
  await running.stop();running=null;
  const journal=JSON.stringify({version:2,receipts:{preserved:{agentId:'preserved',owner:'11111111111111111111111111111111',network:'solana:101',status:'Unknown',signature:'fixture-pending',broadcastAttempted:true}}});writeFileSync(dir+'/pump-agent-launches.json',journal);
  const sessionBytes=readFileSync(dir+'/browser-session.json','utf8');
  assert.equal(validateFixtureResume(dir,ports),dir);assert.throws(()=>validateFixtureResume(dir,{...ports,frontend:frontend+1}),/PROVENANCE_DENIED/);
  running=await start([backend,frontend,dir]);assert.equal(running.ready.resumed,true);assert.equal(running.ready.dir,dir);assert.equal(running.ready.outboundGuard,'PASS');
  assert.equal(readFileSync(dir+'/browser-session.json','utf8'),sessionBytes);assert.equal(readFileSync(dir+'/pump-agent-launches.json','utf8'),journal);
  const after=new DatabaseSync(dir+'/fixture.sqlite',{readOnly:true});try{assert.equal(after.prepare('SELECT count(*) n FROM agents').get().n,1);assert.equal(after.prepare('SELECT count(*) n FROM sessions').get().n,3);assert.equal(after.prepare('SELECT secret FROM agents').get().secret,null);}finally{after.close();}
  await running.stop();running=null;
  const bad=new DatabaseSync(dir+'/fixture.sqlite');try{bad.prepare('UPDATE agents SET secret=?').run('synthetic-ciphertext-never-decrypted');}finally{bad.close();}
  assert.throws(()=>validateFixtureResume(dir,ports),/CUSTODY_KEY_UNAVAILABLE/);
 }finally{if(running)await running.stop();}
});
