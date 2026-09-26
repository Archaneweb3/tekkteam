import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
export const metadataRoot=()=>resolve(process.env.DATA_DIR||'server/data','pump-metadata-site');
export function imageOrigin(){const u=new URL(process.env.PUBLIC_METADATA_ORIGIN||'https://tekkwork-test-metadata.vercel.app');if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||/^[\d.:\[\]]+$/.test(u.hostname))throw Error('Public HTTPS image origin required');return u.origin;}
export async function normalizeTokenImage(data){
 if(typeof data!=='string'||data.length>4500000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data))throw Object.assign(Error('Token image must be PNG, JPEG or WebP, maximum 3 MB'),{status:400});
 const bytes=Buffer.from(data.split(',')[1],'base64');if(bytes.length>3*1024*1024)throw Object.assign(Error('Token image exceeds 3 MB'),{status:400});
 try{const source=sharp(bytes,{limitInputPixels:16777216,animated:false}),meta=await source.metadata();if(!['png','jpeg','webp'].includes(meta.format)||(meta.pages??1)>1)throw Error('Unsupported image');return await source.rotate().resize(512,512,{fit:'contain',background:{r:16,g:46,b:85,alpha:1}}).png().toBuffer();}catch{throw Object.assign(Error('Invalid or oversized token image'),{status:400});}
}
export async function stageTokenImage(agentId,bytes){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(agentId))throw Error('Invalid agent ID');
 const name=createHash('sha256').update(bytes).digest('hex')+'.png',relative=`metadata/agents/${agentId}/${name}`,path=join(metadataRoot(),'public',relative);
 await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,bytes);return imageOrigin()+'/'+relative;
}
export async function verifyPublishedImage(data,fetcher=fetch){
 const prefix=imageOrigin()+'/metadata/agents/'+data.agentId+'/';
 if(typeof data.image!=='string'||!data.image.startsWith(prefix)||!/^([a-f0-9]{64})\.png$/.test(data.image.slice(prefix.length)))throw Error('This agent requires its own published token image');
 const bytes=await readFile(join(metadataRoot(),'public','metadata/agents',data.agentId,data.image.slice(prefix.length)));
 const r=await fetcher(data.image,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(r.status!==200||!(r.headers.get('content-type')||'').startsWith('image/png'))throw Error('Token image publication failed');
 const reader=r.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw Error('Published image too large');}chunks.push(Buffer.from(value));}
 if(!Buffer.concat(chunks).equals(bytes))throw Error('Published token image differs from this agent image');
}
