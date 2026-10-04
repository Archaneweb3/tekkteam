import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {EventEmitter} from 'node:events';
import {createDiagnosticLogger,instrumentFixtureRequest,fixtureReadRoutes} from './fixtures/preview-diagnostics.mjs';
import {fixtureEnvelope} from './fixtures/preview-envelope.mjs';
import {createServer} from '../server/app.js';

test('write/serialization/fallback failures never escape or interrupt lifecycle cleanup',()=>{
 let fallbacks=0;const logger=createDiagnosticLogger({pid:1,append:()=>{throw Object.assign(Error('PRIVATE_MARKER'),{code:'ENOSPC'});},onFailure:()=>{fallbacks++;throw Error('PRIVATE_FALLBACK');}});for(const event of ['REQUEST','RESPONSE','STOP','EXIT','UNCAUGHT_FATAL'])assert.equal(logger.log({event}),false);assert.equal(logger.failedWrites,5);assert.equal(fallbacks,1);let cleanup=false;assert.doesNotThrow(()=>{logger.log({event:'STOP'});cleanup=true;});assert.equal(cleanup,true);const circular={};circular.circular=circular;assert.equal(logger.log(circular),false);
});
test('unknown paths/query/headers/body and denied methods never enter diagnostics',()=>{
 const lines=[];const {log}=createDiagnosticLogger({pid:1,append:line=>lines.push(line)});
 for(const [method,url]of [['GET','/denied/PRIVATE_OWNER?secret=PRIVATE_QUERY'],['GET','/api/state?secret=PRIVATE_QUERY'],['POST','/api/state?secret=PRIVATE_QUERY'],['GET','/api/state/PRIVATE_OWNER']]){
  const res=new EventEmitter();res.setHeader=()=>{};res.statusCode=method==='GET'&&url.startsWith('/api/state?')?200:403;res.writableFinished=true;
  instrumentFixtureRequest({method,url,headers:{cookie:'PRIVATE_COOKIE'},body:'PRIVATE_BODY'},res,{log,requestId:'fixture-test'});res.emit('finish');
 }
 const text=lines.join('');assert.doesNotMatch(text,/PRIVATE_/);const requests=lines.map(JSON.parse).filter(x=>x.event==='REQUEST');assert.deepEqual(requests.map(x=>x.path),['DENIED_ROUTE','/api/state','DENIED_ROUTE','DENIED_ROUTE']);
});
test('aborted responses emit correlated event and logger failure remains safe',()=>{
 const rows=[];const {log}=createDiagnosticLogger({pid:1,append:line=>rows.push(JSON.parse(line))});const res=new EventEmitter();res.setHeader=()=>{};res.statusCode=200;res.writableFinished=false;instrumentFixtureRequest({method:'GET',url:'/api/state'},res,{log,requestId:'aborted-test'});res.emit('close');assert.equal(rows.at(-1).event,'RESPONSE_ABORTED');assert.equal(rows.at(-1).requestId,'aborted-test');
});
const read=(port,path)=>new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port,path},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));}).on('error',reject));
test('actual disposable in-memory state remains200 and APIerrors/denials stay500/403 despite REQUEST/finish write failures',async()=>{
 const api=createServer({dbPath:':memory:',vaultKey:Buffer.alloc(32,3).toString('base64'),network:'local',production:false,realMoneyNetwork:{status:()=>({realMoneyNetwork:'UNAVAILABLE',rpc:'UNAVAILABLE',networkConsistent:false,networkReason:'LOCAL_FIXTURE_OUTBOUND_DISABLED'})}});
 let warnings=0,sequence=0;const diagnostic=createDiagnosticLogger({pid:1,append:()=>{throw Error('simulated ENOSPC');},onFailure:()=>warnings++});
 const server=http.createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;instrumentFixtureRequest(req,res,{log:diagnostic.log,requestId:'fault-'+(++sequence)});
  if(path==='/diagnostic-error'){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'fixture state failure'}));return;}
  if(req.method!=='GET'||!fixtureReadRoutes.has(path)){res.writeHead(403);res.end('LOCAL_FIXTURE_READ_ONLY');return;}
  delete req.headers.cookie;const end=res.end;res.end=function(body,...args){if(typeof body==='string'||Buffer.isBuffer(body)){try{body=JSON.stringify(fixtureEnvelope(JSON.parse(body.toString()),path));res.removeHeader('Content-Length');}catch{}}return end.call(this,body,...args);};api.app(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{const replies=await Promise.all(Array.from({length:12},()=>read(port,'/api/state')));for(const r of replies){assert.equal(r.status,200);assert.equal(JSON.parse(r.body).config.network,'demo');assert.ok(r.headers['x-tekkteam-preview-request-id']);}const failed=await read(port,'/diagnostic-error');assert.equal(failed.status,500);assert.deepEqual(JSON.parse(failed.body),{error:'fixture state failure'});assert.equal((await read(port,'/denied/PRIVATE_MARKER?secret=PRIVATE_QUERY')).status,403);assert.equal(warnings,1);assert.equal(diagnostic.failedWrites,28);}finally{await new Promise(resolve=>server.close(resolve));api.close();}
});
