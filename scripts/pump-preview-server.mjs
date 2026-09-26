import http from 'node:http';
import {spawn} from 'node:child_process';
let used=false,evidence;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.headers.host!=='127.0.0.1:4192'){res.writeHead(403).end();return;}
 if(req.method==='GET'&&req.url==='/evidence'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(evidence??{}));return;}
 if(req.headers.origin!=='http://127.0.0.1:5188'){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5188');
 if(req.method!=='POST'||req.url!=='/prepare'||used){res.writeHead(409).end(JSON.stringify({error:'This server allows one preparation only. No automatic retry.'}));return;}
 used=true;
 res.setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
 const emit=value=>res.write(JSON.stringify(value)+'\n');
 const child=spawn(process.execPath,['scripts/pump-readiness.mjs','--simulate','--events'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],windowsHide:true});
 let stdout='',stderr='',pending='',failed=false;
 const timeout=setTimeout(()=>{failed=true;child.kill();emit({error:{message:'Preparation timed out; no retry',stack:'Preparation timeout'}});},30000);
 child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>4*1024*1024){failed=true;child.kill();}});
 child.stderr.on('data',chunk=>{stderr+=chunk;pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)if(line.startsWith('PUMP_EVENT ')){try{emit(JSON.parse(line.slice(11)));}catch{failed=true;child.kill();}}});
 child.on('error',e=>{failed=true;emit({error:{message:e.message,stack:e.stack}});});
 child.on('close',code=>{clearTimeout(timeout);try{if(code!==0||failed)throw Error(stderr||'Preparation failed');evidence=JSON.parse(stdout);emit({result:evidence});}catch(e){emit({error:{message:e.message,stack:e.stack}});}res.end();});
});
server.listen(4192,'127.0.0.1',()=>console.log('One-shot unsigned preparation on 4192. No submission routes.'));
