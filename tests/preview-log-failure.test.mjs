import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {once} from 'node:events';import {renameSync,mkdirSync} from 'node:fs';import net from 'node:net';
const free=async()=>{const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
test('disposable preview survives a failed request log and still shuts down cleanly',async()=>{
 const bp=await free(),fp=await free();const source=process.env.RECOVERY_BASELINE==='1'?'artifacts/launchpad-continuation/direct-delivery/baseline-master-recovery-20261002/':'';
 const child=fork(source+'tools/local-owner-preview/owner-backend.mjs',[String(bp),String(fp)],{silent:true});let warnings='';child.stderr.on('data',x=>warnings+=x);
 try{const ready=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Preview start timeout')),20000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Preview exited before ready'));});child.stdout.on('data',x=>{output+=x;for(const line of output.split('\n'))try{const data=JSON.parse(line);if(data.status==='READY'){clearTimeout(timer);resolve(data);}}catch{}});});
  renameSync(ready.logPath,ready.logPath+'.preserved');mkdirSync(ready.logPath);
  for(let i=0;i<2;i++){const response=await fetch('http://127.0.0.1:'+bp+'/api/health',{signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);const health=await response.json();assert.equal(health.liveTradingEnabled,false);assert.equal(health.broadcastEnabled,false);await new Promise(r=>setImmediate(r));}
  assert.equal(child.exitCode,null);const exited=once(child,'exit');child.send('shutdown');assert.equal((await exited)[0],0);assert.equal((warnings.match(/LOCAL_PREVIEW_LOG_UNAVAILABLE/g)||[]).length,1);
 }finally{if(child.exitCode===null){child.kill();await once(child,'exit');}}
});
