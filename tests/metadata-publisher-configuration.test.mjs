import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,access,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMetadataPublisher,publishAgentMetadata} from '../server/agent-metadata.js';
test('unconfigured legacy and explicit publishers perform no network or deployment',async()=>{
 let requests=0;const publish=createMetadataPublisher(undefined,{request:async()=>{requests++;}});
 assert.equal(requests,0);await assert.rejects(publish({image:'https://example.com/a.png'}),{code:'METADATA_CONFIGURATION_UNAVAILABLE'});
 await assert.rejects(publishAgentMetadata({}),{code:'METADATA_CONFIGURATION_UNAVAILABLE'});assert.equal(requests,0);
});

for(const kind of ['http-error','redirect','malformed-json','metadata-mismatch','image-error','timeout'])test('publisher '+kind+' never returns delivery success and a deliberate later call can recover',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tekk-publisher-negative-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const configuration={dataDir:dir,assetRoot:join(dir,'pump-metadata-site'),journalPath:join(dir,'pump-agent-launches.json'),publicOrigin:'https://metadata.example.com',publisherOrigin:'https://metadata.example.com'};
 let failing=true,requests=0,images=0;
 const publish=createMetadataPublisher(configuration,{request:async(uri,options)=>{
  requests++;assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  if(failing&&['redirect','timeout'].includes(kind))throw Error(kind);
  if(failing&&kind==='http-error')return {status:503,json:()=>assert.fail('No failed HTTP JSON parsing')};
  const json=JSON.parse(await readFile(join(configuration.assetRoot,'public',new URL(uri).pathname.slice(1)),'utf8'));
  return {status:200,json:async()=>{if(failing&&kind==='malformed-json')throw Error('Malformed');return failing&&kind==='metadata-mismatch'?{...json,name:'Wrong'}:json;}};
 },verifyImage:async()=>{images++;if(failing&&kind==='image-error')throw Error('Image unavailable');}});
 const data={agentId:'fixture',name:'Test',symbol:'TEST',description:'Coin description',image:'https://metadata.example.com/image.png'};
 await assert.rejects(publish(data));assert.equal(requests,1);assert.equal(images,kind==='image-error'?1:0);
 failing=false;assert.match(await publish(data),/^https:\/\/metadata\.example\.com\//);assert.equal(requests,2);assert.equal(images,kind==='image-error'?2:1);
});

test('invalid explicit origin performs no disk staging, request or image verification',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tekk-publisher-config-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const assetRoot=join(dir,'pump-metadata-site');let effects=0;
 const publish=createMetadataPublisher({dataDir:dir,assetRoot,journalPath:join(dir,'pump-agent-launches.json'),publicOrigin:'http://metadata.example.com',publisherOrigin:'http://metadata.example.com'},{request:async()=>effects++,verifyImage:async()=>effects++});
 await assert.rejects(publish({image:'https://metadata.example.com/image.png'}),{code:'METADATA_CONFIGURATION_UNAVAILABLE'});assert.equal(effects,0);await assert.rejects(access(assetRoot),{code:'ENOENT'});
});
test('configured publisher stages exact metadata and verifies only injected origin',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tekk-metadata-'));t.after(()=>rm(dir,{recursive:true,force:true}));let requests=0,images=0;
 const configuration={dataDir:dir,assetRoot:join(dir,'pump-metadata-site'),journalPath:join(dir,'pump-agent-launches.json'),publicOrigin:'https://metadata.example.com',publisherOrigin:'https://metadata.example.com'};
 const publish=createMetadataPublisher(configuration,{request:async uri=>{requests++;assert.ok(uri.startsWith(configuration.publicOrigin+'/'));const json=await readFile(join(configuration.assetRoot,'public',new URL(uri).pathname.slice(1)),'utf8');return {status:200,json:async()=>JSON.parse(json)};},verifyImage:async()=>{images++;}});
 assert.equal(requests,0);const uri=await publish({agentId:'a',name:'Test',symbol:'TEST',description:'Fixture',image:'https://metadata.example.com/image.png'});assert.ok(uri);assert.equal(requests,1);assert.equal(images,1);
});

test('default image verification uses explicit publisher configuration, never ambient legacy origin',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tekk-publisher-explicit-image-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const configuration={dataDir:dir,assetRoot:join(dir,'pump-metadata-site'),journalPath:join(dir,'pump-agent-launches.json'),publicOrigin:'https://tekkteam.tech',publisherOrigin:'https://tekkteam.tech'};
 const bytes=Buffer.from('isolated fixture image bytes'),name=createHash('sha256').update(bytes).digest('hex')+'.png',relative='metadata/agents/fixture/'+name;
 await mkdir(join(configuration.assetRoot,'public','metadata/agents/fixture'),{recursive:true});await writeFile(join(configuration.assetRoot,'public',relative),bytes);
 const calls=[];const publish=createMetadataPublisher(configuration,{request:async(uri,options)=>{calls.push(uri);assert.equal(options.redirect,'error');assert.equal(new URL(uri).origin,configuration.publicOrigin);
  if(uri.endsWith('.png'))return new Response(bytes,{headers:{'content-type':'image/png'}});
  return new Response(await readFile(join(configuration.assetRoot,'public',new URL(uri).pathname.slice(1))),{headers:{'content-type':'application/json'}});
 }});
 await publish({agentId:'fixture',name:'Test',symbol:'TEST',description:'Coin description',image:configuration.publicOrigin+'/'+relative});assert.equal(calls.length,2);assert.ok(calls.every(uri=>uri.startsWith(configuration.publicOrigin+'/')));
});
