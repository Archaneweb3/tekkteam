// Import before outbound-guard. Only this closed, read-only capability retains
// transport access; the rest of the owner runtime remains outbound-disabled.
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';
import dns from 'node:dns';
import {mainnetWalletBalance} from '../../server/wallet-balance.js';
const requestHttps=https.request,connectTls=tls.connect,connectSocket=net.Socket.prototype.connect,lookup=dns.lookup;
const fail=code=>Object.assign(Error(code),{code});
function publicAddress(ip){
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return a>0&&a<224&&![10,127].includes(a)&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&[0,2,168].includes(b))&&!(a===198&&[18,19,51].includes(b))&&!(a===203&&b===0);
}
export function createMainnetBalanceReader(endpoint,{onRead=()=>{}}={}){
 let url;try{url=new URL(endpoint);}catch{throw fail('BALANCE_RPC_CONFIG_INVALID');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||net.isIP(url.hostname)||!url.hostname.includes('.'))throw fail('BALANCE_RPC_CONFIG_INVALID');
 // The configured URL, method and params never come from an HTTP client.
 const agent=new https.Agent({keepAlive:false,maxSockets:2});
 agent.createConnection=(options,callback)=>{
  lookup(url.hostname,{family:4},(error,ip)=>{
   if(error||!publicAddress(ip)){callback(fail('BALANCE_RPC_DNS_FAILED'));return;}
   const socket=new net.Socket();
   connectSocket.call(socket,{host:ip,port:443});
   const secure=connectTls({socket,servername:url.hostname,rejectUnauthorized:true,minVersion:'TLSv1.2'});
   callback(null,secure);
  });
 };
 let sequence=0;
 const read=async(method,params)=>{
  if(method!=='getGenesisHash'&&method!=='getBalance')throw fail('BALANCE_RPC_METHOD_DENIED');
  const id=++sequence,body=JSON.stringify({jsonrpc:'2.0',id,method,params});
  return new Promise((resolve,reject)=>{
   let settled=false;const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
   const req=requestHttps(url,{agent,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
    if(res.statusCode!==200){res.resume();done(fail(res.statusCode===429?'BALANCE_RPC_RATE_LIMITED':'BALANCE_RPC_HTTP_FAILED'));return;}
    let text='';res.on('data',chunk=>{text+=chunk;if(text.length>65536){req.destroy();done(fail('BALANCE_RPC_RESPONSE_INVALID'));}});
    res.on('error',()=>done(fail('BALANCE_RPC_UNREACHABLE')));
    res.on('end',()=>{try{const data=JSON.parse(text);if(data.id!==id||data.jsonrpc!=='2.0'||data.error||!Object.hasOwn(data,'result'))throw Error();done(null,data.result);}catch{done(fail('BALANCE_RPC_RESPONSE_INVALID'));}});
   });
   const timer=setTimeout(()=>{done(fail('BALANCE_RPC_TIMEOUT'));req.destroy();},12000);
   req.on('error',error=>done(fail(error.code==='BALANCE_RPC_DNS_FAILED'?error.code:'BALANCE_RPC_UNREACHABLE')));req.end(body);
  });
 };
 const connection=Object.freeze({
  getGenesisHash:()=>read('getGenesisHash',[]),
  getBalanceAndContext:async key=>{
   const result=await read('getBalance',[key.toBase58(),{commitment:'confirmed'}]);
   if(!Number.isSafeInteger(result?.context?.slot)||result.context.slot<0)throw fail('BALANCE_RPC_RESPONSE_INVALID');
   return result;
  }
 });
 const balance=mainnetWalletBalance({connection});
 return Object.freeze({provider:url.hostname,read:async(owner,force)=>{
  try{const result=await balance(owner,force);onRead({status:'BALANCE_READ_OK',network:result.network,lamports:result.lamports,slot:result.slot,checkedAt:result.checkedAt,refresh:!!force});return result;}
  catch(error){onRead({status:'BALANCE_READ_FAILED',code:error.code||'BALANCE_RPC_UNREACHABLE',refresh:!!force});throw error;}
 }});
}
