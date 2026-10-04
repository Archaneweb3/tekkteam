import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('hosting template serves publisher root digest separately from frontend fallback',()=>{
 const config=readFileSync(new URL('../deploy/Caddyfile',import.meta.url),'utf8');
 const pattern=config.match(/@agentMetadata path_regexp agentMetadata (.+)/)?.[1];assert.ok(pattern);
 const route=new RegExp(pattern),digest=createHash('sha256').update('synthetic metadata').digest('base64url');assert.equal(digest.length,43);assert.ok(route.test('/'+digest));
 for(const path of ['/', '/api/state','/metadata/agents/a/image.png','/'+digest+'/extra','/../'+digest,'/'+digest+'x'])assert.equal(route.test(path),false,path);
 assert.match(config,/handle @agentMetadata \{\s+root \* \/var\/lib\/tekkwork\/pump-metadata-site\/public\s+header Content-Type application\/json\s+file_server/);
 assert.ok(config.indexOf('handle @agentMetadata')<config.indexOf('root * /opt/tekkwork/dist'));
});
test('prepared nginx routes only digest JSON and content-addressed agent PNG, not SPA fallback',()=>{
 const config=readFileSync(new URL('../deploy/nginx-metadata.locations.conf',import.meta.url),'utf8'),patterns=[...config.matchAll(/location ~ "([^"]+)"/g)].map(m=>new RegExp(m[1]));
 assert.equal(patterns.length,2);const digest=createHash('sha256').update('fixture metadata').digest('base64url');
 assert(patterns[0].test('/'+digest));assert(patterns[1].test('/metadata/agents/fixture-identity/'+createHash('sha256').update('fixture image').digest('hex')+'.png'));
 for(const uri of ['/api/state','/vault.key','/fixture.sqlite','/metadata/agents/a/../vault.key','/'+digest+'/extra','/metadata/agents/a/image.png'])assert(!patterns.some(p=>p.test(uri)),uri);
 assert.equal((config.match(/try_files \$uri =404;/g)??[]).length,2);assert(!config.includes('/index.html'));assert(!config.includes('proxy_pass'));
});
