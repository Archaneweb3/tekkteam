import {Buffer} from 'buffer';
import {prepareMainnetMemo,assertSafetyMemo,readOnlyRpc} from './mainnet-safety.js';
import {networkConfig} from './networks.js';
const c=networkConfig('MAINNET'),transportUrl=new URL('/mainnet-rpc',location.origin).href,transport=readOnlyRpc(transportUrl),out=document.querySelector('#evidence');
const transportChecks=[];
const rpc=async(method,params=[])=>{const result=await transport(method,params);const visible=method==='getAccountInfo'&&result.value?{...result,value:{...result.value,data:'omitted: public account bytes'}}:result;transportChecks.push({method,result:visible,at:new Date().toISOString()});return result;};
const prepare=document.querySelector('#prepare'),preview=document.querySelector('#preview');
let evidence={},snapshot,owner,used=false;
const render=()=>{out.textContent=JSON.stringify(evidence,null,2);};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
prepare.onclick=async()=>{
  prepare.disabled=true;
  try{
    const p=window.phantom?.solana;if(!p?.isPhantom)throw new Error('Open in Microsoft Edge with Phantom installed');
    await p.connect({onlyIfTrusted:true});owner=p.publicKey.toBase58();
    await rpc('getBalance',[owner,{commitment:'finalized'}]);
    snapshot=await prepareMainnetMemo(owner,rpc);
    evidence={...snapshot,rpcEndpoint:c.rpc,transportUrl,transportChecks,transactionSha256:await sha(Buffer.from(snapshot.transaction,'base64')),walletActiveNetwork:'UNKNOWN: not exposed by injected provider',phantomSimulation:'UNKNOWN: requires extension capture',expectedPhantomChain:c.phantomChain,approved:false,broadcast:false};
    preview.disabled=false;
  }catch(e){evidence={error:e.message,approved:false,broadcast:false};prepare.disabled=false;}
  render();
};
preview.onclick=async()=>{
  if(used || !document.querySelector('#confirm').checked)return;
  preview.disabled=true;used=true;
  try{
    const p=window.phantom.solana;if(p.publicKey.toBase58()!==owner)throw new Error('Wallet changed');
    if(!(await rpc('isBlockhashValid',[snapshot.recent.blockhash,{commitment:'finalized'}])).value)throw new Error('Blockhash expired. Reload and prepare again; no preview requested');
    const tx=assertSafetyMemo(Buffer.from(snapshot.transaction,'base64'),owner);
    const bytes=tx.serialize({requireAllSignatures:false,verifySignatures:false});
    evidence.providerCallSha256=await sha(bytes);
    if(evidence.providerCallSha256!==evidence.transactionSha256)throw new Error('Transaction changed');
    evidence.messageBase64=tx.serializeMessage().toString('base64');
    evidence.provider={isPhantom:p.isPhantom,isConnected:p.isConnected,publicKey:p.publicKey.toBase58(),method:'signTransaction',chainArgument:'none: injected API',activeNetwork:'UNKNOWN'};
    evidence.preview='Pending: inspect then CANCEL';render();
    await p.signTransaction(tx);
    evidence.preview='Unexpected approval: returned signature discarded; nothing broadcast';evidence.approved=true;
  }catch(e){evidence.preview={code:e.code??null,message:e.message};}
  render();
};
