// Product HTTP-only process boundary, adapted from the accepted owner preview guard.
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import http2 from 'node:http2';import dns from 'node:dns';import dgram from 'node:dgram';import child from 'node:child_process';import workers from 'node:worker_threads';import {syncBuiltinESMExports} from 'node:module';
function denied(){throw Object.assign(Error('HTTP_ONLY_EFFECT_DISABLED'),{code:'HTTP_ONLY_EFFECT_DISABLED'});}
function block(object,key){if(key in object)Object.defineProperty(object,key,{value:denied,writable:false,configurable:false});}
for(const key of ['connect','createConnection'])block(net,key);block(net.Socket.prototype,'connect');block(tls,'connect');
for(const object of [http,https])for(const key of ['request','get'])block(object,key);block(http2,'connect');block(dgram,'createSocket');
Object.defineProperty(dns,'lookup',{value:function(host,...args){if(host!=='127.0.0.1')return denied();const callback=args.at(-1);if(typeof callback!=='function')return denied();process.nextTick(()=>args[0]?.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4));},writable:false,configurable:false});
for(const key of Object.keys(dns))if(key!=='lookup'&&typeof dns[key]==='function')block(dns,key);for(const key of Object.keys(dns.promises))if(typeof dns.promises[key]==='function')block(dns.promises,key);
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])block(child,key);block(workers,'Worker');
Object.defineProperty(globalThis,'fetch',{value:async()=>denied(),writable:false,configurable:false});if('WebSocket' in globalThis)block(globalThis,'WebSocket');syncBuiltinESMExports();
for(const attempt of [()=>net.connect(1,'127.0.0.1'),()=>new net.Socket().connect(1,'127.0.0.1'),()=>tls.connect(1),()=>http.get('http://127.0.0.1'),()=>https.get('https://example.invalid'),()=>http2.connect('https://example.invalid'),()=>dgram.createSocket('udp4'),()=>dns.lookup('example.invalid'),()=>child.spawn('node'),()=>new workers.Worker('x')]){try{attempt();throw Error('OUTBOUND_GUARD_FAILED');}catch(e){if(e.code!=='HTTP_ONLY_EFFECT_DISABLED')throw e;}}
try{await fetch('https://example.invalid');throw Error('FETCH_GUARD_FAILED');}catch(e){if(e.code!=='HTTP_ONLY_EFFECT_DISABLED')throw e;}
