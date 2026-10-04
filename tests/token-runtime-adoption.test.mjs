import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {tokenConfiguration,tokenRuntimeOptions} from '../server/runtime.js';
import {createServer} from '../server/app.js';
test('runtime metadata adapter stays unavailable by default; explicit layout is shared',()=>{
 assert.equal(tokenRuntimeOptions({}).configurationStatus,'UNAVAILABLE');
 const dataDir=resolve('fixture-only-runtime');const env={DATA_DIR:dataDir,PUBLIC_METADATA_ORIGIN:'https://metadata.example.com'};
 const r=tokenRuntimeOptions(env);assert.equal(r.configurationStatus,'COMPATIBLE');assert.equal(r.options.journalPath,join(dataDir,'pump-agent-launches.json'));assert.equal(r.authorizationGranted,false);
 assert.equal(tokenConfiguration(env).assetRoot,r.options.assetRoot);
});
test('constructor rejects ambiguous legacy seam and explicit resolver input before opening storage',()=>{
 assert.throws(()=>createServer({tokenDraftOptions:{},tokenDraftConfiguration:{}}),/Ambiguous/);
});
