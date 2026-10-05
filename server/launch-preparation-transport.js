// Import before http-only-outbound. Default/read-only modes have no send/sign port.
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';
import dns from 'node:dns';
import bs58 from 'bs58';
import {PUMP_COMMIT} from '../src/pump-readiness.js';
const requestHttps=https.request,connectTls=tls.connect,connectSocket=net.Socket.prototype.connect,lookup=dns.lookup;
export const PREPARATION_IDL=`https://raw.githubusercontent.com/pump-fun/pump-public-docs/${PUMP_COMMIT}/idl/pump.json`;
export const PREPARATION_RPC_METHODS=Object.freeze(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getFeeForMessage','simulateTransaction','getMinimumBalanceForRentExemption','isBlockhashValid']);
export const FINALITY_RPC_METHODS=Object.freeze(['getGenesisHash','getSignatureStatuses','getTransaction']);
const fail=(code,detail)=>Object.assign(Error(code),{code,...detail});
function endpoint(value){let u;try{u=new URL(value);}catch{throw fail('PREPARATION_ENDPOINT_INVALID');}if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||net.isIP(u.hostname)||!u.hostname.includes('.'))throw fail('PREPARATION_ENDPOINT_INVALID');return u;}
function publicAddress(ip){if(net.isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return a>0&&a<224&&![10,127].includes(a)&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&[0,2,168].includes(b))&&!(a===198&&[18,19,51].includes(b))&&!(a===203&&b===0);}
function finalitySignature(value){try{if(typeof value!=='string')return false;const bytes=bs58.decode(value);return bytes.length===64&&bytes.some(n=>n!==0)&&bs58.encode(bytes)===value;}catch{return false;}}
function finalityParams(method,params){
 try{
  if(!Array.isArray(params))throw Error();
  if(method==='getGenesisHash'){if(params.length!==0)throw Error();return [];}
  if(params.length!==2)throw Error();
  const first=params[0],options=params[1];
  if(!options||typeof options!=='object'||Array.isArray(options))throw Error();
  const keys=Object.keys(options),expected=method==='getSignatureStatuses'?['searchTransactionHistory']:['encoding','commitment','maxSupportedTransactionVersion'];
  if(keys.length!==expected.length||expected.some(key=>!Object.hasOwn(options,key)||!keys.includes(key)))throw Error();
  if(method==='getSignatureStatuses'){
   if(!Array.isArray(first)||first.length!==1)throw Error();
   const signature=first[0],history=options.searchTransactionHistory;
   if(!finalitySignature(signature)||history!==true)throw Error();
   return [[signature],{searchTransactionHistory:true}];
  }
  const encoding=options.encoding,commitment=options.commitment,version=options.maxSupportedTransactionVersion;
  if(!finalitySignature(first)||encoding!=='base64'||commitment!=='finalized'||version!==0)throw Error();
  return [first,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}];
 }catch{throw fail('FINALITY_RPC_OPTIONS_DENIED');}
}
export function createLaunchPreparationTransport({rpcUrl,origin,m4Target=null,finalityOnly=false}){
 if(typeof finalityOnly!=='boolean'||finalityOnly&&m4Target)throw fail('FINALITY_TRANSPORT_MODE_INVALID');
 if(m4Target&&(!m4Target.owner||!m4Target.agentId||m4Target.initialBuyLamports!==0||m4Target.ceilingLamports!==10000000))throw fail('M4_TARGET_INVALID');
 const rpc=endpoint(rpcUrl),publicOrigin=endpoint(origin);if(publicOrigin.origin!==origin)throw fail('PREPARATION_ORIGIN_INVALID');
 async function request(url,body){
  const agent=new https.Agent({keepAlive:false,maxSockets:1});let cancelled=false;
  agent.createConnection=(options,callback)=>{
   // DNS resolution is asynchronous. Returning its request object makes Node
   // treat it as a socket; only the callback may return the secured connection.
   lookup(url.hostname,{family:4},(error,ip)=>{if(cancelled)return;if(error||!publicAddress(ip)){callback(fail('PREPARATION_DNS_FAILED'));return;}const socket=new net.Socket();connectSocket.call(socket,{host:ip,port:443});callback(null,connectTls({socket,servername:url.hostname,rejectUnauthorized:true,minVersion:'TLSv1.2'}));});
  };
  return new Promise((resolve,reject)=>{
   let settled=false;const done=(error,value)=>{if(settled)return;settled=true;cancelled=true;clearTimeout(timer);agent.destroy();error?reject(error):resolve(value);};
   const req=requestHttps(url,{agent,method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
    res.on('error',()=>done(fail('PREPARATION_UNREACHABLE')));
    if(res.statusCode!==200){res.resume();done(fail('PREPARATION_HTTP_FAILED',{httpStatus:res.statusCode}));return;}
    const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>24*1024*1024){done(fail('PREPARATION_RESPONSE_TOO_LARGE'));req.destroy();}else chunks.push(chunk);});res.on('end',()=>done(null,{bytes:Buffer.concat(chunks),contentType:String(res.headers['content-type']??'')}));
   });
   const timer=setTimeout(()=>{done(fail('PREPARATION_TIMEOUT'));req.destroy();},20000);
   req.on('error',error=>done(fail(error.code==='PREPARATION_DNS_FAILED'?error.code:'PREPARATION_UNREACHABLE')));req.end(body);
  });
 }
 let sequence=0;
 return Object.freeze({provider:rpc.hostname,
  rpc:async(method,params)=>{
   if(finalityOnly){if(!FINALITY_RPC_METHODS.includes(method))throw fail('PREPARATION_RPC_METHOD_DENIED');params=finalityParams(method,params);}
   else if(!PREPARATION_RPC_METHODS.includes(method)&&!(m4Target&&['getSignatureStatuses','getTransaction','getBlockHeight'].includes(method)))throw fail('PREPARATION_RPC_METHOD_DENIED');
   if(method==='getTransaction'&&(params?.[1]?.encoding!=='base64'||params?.[1]?.commitment!=='finalized'))throw fail('M4_CONFIRMATION_OPTIONS_DENIED');
   if(method==='simulateTransaction'&&(params?.[1]?.sigVerify!==false||params?.[1]?.replaceRecentBlockhash!==false||params?.[1]?.commitment!=='finalized'))throw fail('PREPARATION_SIMULATION_OPTIONS_DENIED');
   const id=++sequence,{bytes}=await request(rpc,JSON.stringify({jsonrpc:'2.0',id,method,params}));let response;try{response=JSON.parse(bytes);}catch{throw fail('PREPARATION_RPC_RESPONSE_INVALID');}
   if(response.id!==id||response.jsonrpc!=='2.0')throw fail('PREPARATION_RPC_RESPONSE_INVALID');
   if(response.error){const rpcCode=Number.isInteger(response.error.code)?response.error.code:null;console.warn(JSON.stringify({event:'PREPARATION_RPC_REJECTED',method,rpcCode}));throw fail('PREPARATION_RPC_ERROR',{rpcCode});}
   if(!Object.hasOwn(response,'result'))throw fail('PREPARATION_RPC_RESPONSE_INVALID');return response.result;
  },
  ...(m4Target?{submitOnce:async(base64,expectedSignature,authorize)=>{
   // This private capability is inaccessible to HTTP clients. The durable M4
   // controller authorizes exact signed bytes AFTER committing its send latch.
   if(typeof authorize!=='function'||authorize(base64,expectedSignature)!==true)throw fail('M4_SEND_AUTHORITY_REQUIRED');
   const id=++sequence,{bytes}=await request(rpc,JSON.stringify({jsonrpc:'2.0',id,method:'sendTransaction',params:[base64,{encoding:'base64',skipPreflight:false,preflightCommitment:'finalized',maxRetries:0}]}));
   const response=JSON.parse(bytes);if(response.id!==id||response.jsonrpc!=='2.0'||response.error||response.result!==expectedSignature)throw fail('M4_SUBMISSION_UNCERTAIN');return response.result;
  }}:{}),
  ...(finalityOnly?{}:{publicRequest:async(uri)=>{
   const u=endpoint(uri);if(uri!==PREPARATION_IDL&&!(u.origin===origin&&!u.search&&(/^\/[A-Za-z0-9_-]{43}$/.test(u.pathname)||/^\/metadata\/agents\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9]{64}\.png$/.test(u.pathname))))throw fail('PREPARATION_PUBLIC_PATH_DENIED');
   const {bytes,contentType}=await request(u);return new Response(bytes,{status:200,headers:{'Content-Type':contentType}});
  }})
 });
}
