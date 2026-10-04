import {lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// Narrow public projection only. Private staging parent retains its permissions.
export function preparationAssetReader(root){
 return async path=>{
  const json=/^\/([A-Za-z0-9_-]{43})$/.exec(path),png=/^\/metadata\/agents\/([a-zA-Z0-9_-]{1,100})\/([a-f0-9]{64})\.png$/.exec(path);
  if(!json&&!png)return null;
  const parts=png?['public','metadata','agents',png[1],png[2]+'.png']:['public',json[1]];
  let file=root;
  try{
   for(const part of ['',...parts]){if(part)file=join(file,part);const stat=await lstat(file);if(stat.isSymbolicLink()||(part===parts.at(-1)?!stat.isFile()||stat.nlink!==1||stat.size>4*1024*1024:!stat.isDirectory()))return null;}
   const bytes=await readFile(file),hash=createHash('sha256').update(bytes);
   if(png){if(hash.digest('hex')!==png[2]||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return null;}
   else{
    if(hash.digest('base64url')!==json[1])return null;
    const data=JSON.parse(bytes);if(!data||Object.keys(data).some(k=>!['name','symbol','description','image','website','twitter','telegram','properties'].includes(k))||Object.entries(data).some(([k,v])=>k!=='properties'&&typeof v!=='string')||typeof data.name!=='string'||typeof data.symbol!=='string'||typeof data.image!=='string'||!data.properties||Object.keys(data.properties).some(k=>!['agentId','agentName','character','owner'].includes(k))||Object.values(data.properties).some(v=>typeof v!=='string'))return null;
   }
   return {bytes,type:png?'image/png':'application/json'};
  }catch{return null;}
 };
}
