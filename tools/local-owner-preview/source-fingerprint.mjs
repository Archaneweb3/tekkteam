import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function previewSourceFingerprint(){
 const files=[];const walk=folder=>{for(const e of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){const relative=folder+'/'+e.name;if(e.isDirectory()&&e.name!=='data')walk(relative);else if(e.isFile()&&/\.(?:js|mjs)$/.test(e.name))files.push(relative);}};
 for(const folder of ['server','src','public/app','tools/local-owner-preview'])walk(folder);
 files.push('package.json','package-lock.json');files.sort();const hash=createHash('sha256');for(const file of files)hash.update(file+'\0').update(fs.readFileSync(path.join(root,file)));
 return Object.freeze({sha256:hash.digest('hex'),files:files.length});
}
