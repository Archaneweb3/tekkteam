import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readInternalAgent} from '../server/internal-agent-request.js';
test('internal lookup forwards owner cookie and fails closed on errors',async t=>{
 const server=http.createServer((req,res)=>{if(req.headers.cookie!=='tw_session=fixture'){res.writeHead(401);res.end();return;}if(req.url.endsWith('/broken')){res.end('invalid');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'agent-one'}));});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 assert.deepEqual(await readInternalAgent('agent-one','tw_session=fixture',base),{id:'agent-one'});
 await assert.rejects(readInternalAgent('agent-one','',base),/owner wallet/);
 await assert.rejects(readInternalAgent('broken','tw_session=fixture',base),/Invalid internal/);
});
