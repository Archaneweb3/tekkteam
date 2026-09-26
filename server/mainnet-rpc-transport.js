import express from 'express';
import rateLimit from 'express-rate-limit';
import {PublicKey,Transaction,Message} from '@solana/web3.js';
import {assertSafetyMemo,readOnlyRpc} from '../src/mainnet-safety.js';
import {networkConfig} from '../src/networks.js';
const config=networkConfig('MAINNET');
const methods=new Set(['getGenesisHash','getBalance','getAccountInfo','getLatestBlockhash','getFeeForMessage','simulateTransaction','isBlockhashValid']);
const address=v=>{if(typeof v!=='string')throw Error('Invalid public key');new PublicKey(v);};
export function validateRead(method,params){
  if(!methods.has(method))throw Error('RPC method blocked by MAINNET SAFETY MODE');
  if(!Array.isArray(params)||params.length>2)throw Error('Invalid parameters');
  if(method==='getGenesisHash' && params.length)throw Error('Invalid genesis parameters');
  if(method==='getBalance'||method==='getAccountInfo'||method==='isBlockhashValid')address(params[0]);
  if(method==='simulateTransaction'||method==='getFeeForMessage'){
    if(typeof params[0]!=='string'||params[0].length>2200||!/^[A-Za-z0-9+/]+={0,2}$/.test(params[0]))throw Error('Invalid transaction encoding');
    const bytes=Buffer.from(params[0],'base64');
    const tx=method==='simulateTransaction'?Transaction.from(bytes):Transaction.populate(Message.from(bytes));
    assertSafetyMemo(tx.serialize({requireAllSignatures:false,verifySignatures:false}),tx.feePayer.toBase58());
    if(method==='simulateTransaction' && (params[1]?.encoding!=='base64'||params[1]?.sigVerify!==false||params[1]?.replaceRecentBlockhash!==false))throw Error('Only exact unsigned memo simulation allowed');
  }
  const options=params[method==='getLatestBlockhash'?0:1];
  if(options!==undefined){
    if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Invalid options');
    const keys=method==='simulateTransaction'?['encoding','sigVerify','replaceRecentBlockhash','commitment','minContextSlot']:['encoding','commitment','minContextSlot'];
    if(Object.keys(options).some(k=>!keys.includes(k)))throw Error('Unsupported options');
    if(options.commitment && options.commitment!=='finalized')throw Error('Finalized reads required');
  }
}
export function createMainnetTransport({rpc=readOnlyRpc(config.rpc),origins=['http://127.0.0.1:5188','http://localhost:5188']}={}){
  const app=express();let active=0;
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(req.headers.host||''))return res.status(403).json({error:'Loopback only'});
    if(!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Untrusted origin'});
    next();
  });
  app.use(rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));
  app.use(express.json({limit:'8kb',strict:true}));
  app.post('/mainnet-rpc',async(req,res)=>{
    const body=req.body;
    try{if(!body||Array.isArray(body)||body.jsonrpc!=='2.0'||!Number.isSafeInteger(body.id)||Object.keys(body).some(k=>!['jsonrpc','id','method','params'].includes(k)))throw Error('Invalid request');validateRead(body.method,body.params??[]);}catch(e){return res.status(400).json({error:e.message});}
    if(active>=2)return res.status(429).json({error:'Too many active requests'});
    active++;
    try{
      // Fixed server-selected upstream, no client URLs/headers/credentials forwarded.
      const genesis=await rpc('getGenesisHash');if(genesis!==config.genesis)throw Error('Wrong cluster');
      const result=body.method==='getGenesisHash'?genesis:await rpc(body.method,body.params??[]);
      res.json({jsonrpc:'2.0',id:body.id,result});
    }catch{res.status(502).json({error:'Mainnet read unavailable; no transaction submitted'});}
    finally{active--;}
  });
  app.use((req,res)=>res.status(405).json({error:'Only allowlisted POST reads supported'}));
  app.use((err,req,res,next)=>res.status(err.status===413?413:400).json({error:'Invalid request body'}));
  return app;
}
