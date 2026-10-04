import {mkdir,lstat,readFile,open} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeTokenImage} from './token-image.js';
import {normalizeTokenDraft} from '../src/token-draft-schema.js';
const fail=(message,status=503)=>Object.assign(Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function createTokenImageAuthority({root,origin,normalize=normalizeTokenImage}={}){
 if(typeof root!=='string'||!isAbsolute(root)||typeof origin!=='string')throw fail('Token image authority is not configured');
 let url;try{url=new URL(normalizeTokenDraft({name:'Origin',ticker:'ORG',image:origin}).image);}catch{throw fail('Token image origin is not supported');}
 const base=resolve(root);
 if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||/^[\d.:\[\]]+$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw fail('Token image origin is not supported');
 const host=url.origin,inflight=new Map();
 const idCheck=id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw fail('Token image Agent binding invalid',400);};
 async function directory(id,create){
  idCheck(id);const parts=[base,join(base,'public'),join(base,'public','metadata'),join(base,'public','metadata','agents'),join(base,'public','metadata','agents',id)];
  for(const path of parts){let stat;try{stat=await lstat(path);}catch(error){if(error.code!=='ENOENT'||!create)throw fail('Token image asset unavailable');try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw fail('Token image directory unavailable');}stat=await lstat(path);}if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('Token image directory is unsafe');}
  return parts.at(-1);
 }
 const result=image=>Object.freeze({image,localAsset:'VERIFIED',publicDelivery:'UNVERIFIED'});
 async function verify(id,image){
  idCheck(id);const prefix=host+'/metadata/agents/'+id+'/';if(typeof image!=='string'||!image.startsWith(prefix)||!/^([a-f0-9]{64})\.png$/.test(image.slice(prefix.length)))throw fail('Token image must be this Agent immutable asset',409);
  const dir=await directory(id,false),path=join(dir,image.slice(prefix.length));let stat,bytes;try{stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw fail('Token image asset invalid');bytes=await readFile(path);}catch{throw fail('Token image asset unavailable');}
  if(bytes.length<8||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||digest(bytes)+'.png'!==image.slice(prefix.length))throw fail('Token image hash mismatch',409);
  return result(image);
 }
 async function stage(id,input){
  idCheck(id);let bytes;try{bytes=await normalize(input);}catch{throw fail('Invalid or oversized token image',400);}if(!Buffer.isBuffer(bytes))throw fail('Token image normalization unavailable');
  const dir=await directory(id,true),name=digest(bytes)+'.png',path=join(dir,name),image=host+'/metadata/agents/'+id+'/'+name;
  if(inflight.has(path)){await inflight.get(path);return verify(id,image);}
  const work=(async()=>{let file;try{file=await open(path,'wx',0o600);await file.writeFile(bytes);await file.sync();}catch(error){if(error.code!=='EEXIST')throw fail('Token image staging unavailable');}finally{if(file)await file.close();}return verify(id,image);})();
  inflight.set(path,work);try{return await work;}finally{if(inflight.get(path)===work)inflight.delete(path);}
 }
 return {stage,verify};
}
