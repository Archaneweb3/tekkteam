import http from 'node:http';
import https from 'node:https';

// Node fetch applies the browser forbidden-port list (including API port 4190).
// This is a server-configured internal call, not an arbitrary client URL.
export function readInternalAgent(id,cookie='',base=process.env.API_INTERNAL_URL||'http://127.0.0.1:4190'){
 const url=new URL(base+'/api/agents/'+encodeURIComponent(id));
 if(!['http:','https:'].includes(url.protocol))throw Error('Invalid internal API protocol');
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).get(url,{headers:{cookie},timeout:10000},res=>{
   if(res.statusCode!==200){res.resume();reject(Error(res.statusCode===401||res.statusCode===404?'Sign in with this agent owner wallet first':'Internal agent lookup unavailable'));return;}
   let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>262144)req.destroy(Error('Internal agent response too large'));});
   res.on('error',reject);res.on('end',()=>{try{resolve(JSON.parse(body));}catch{reject(Error('Invalid internal agent response'));}});
  });
  req.on('timeout',()=>req.destroy(Error('Internal agent lookup timed out')));req.on('error',()=>reject(Error('Internal agent API connection unavailable')));
 });
}
