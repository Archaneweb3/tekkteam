import {mkdirSync,readdirSync,lstatSync,copyFileSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('.');
const label=process.argv[2]||'baseline';
if(process.argv.length>3||!/^baseline(?:-[a-z0-9-]{1,60})?$/.test(label))throw Error('Only a bounded baseline label accepted');
const destination=join(root,'artifacts/launchpad-continuation/direct-delivery',label);
if(existsSync(destination))throw Error('Snapshot already exists; refusing to overwrite');
const files=[];
function collect(directory){
 for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){
  const name=join(directory,entry.name),stat=lstatSync(join(root,name));
  if(stat.isSymbolicLink())continue;
  if(entry.isDirectory()){
   if(!['data','node_modules','.git','.dot','backups','logs'].includes(entry.name))collect(name);
  }else if(/\.(?:js|mjs|css|html|md)$/.test(entry.name))files.push(name);
 }
}
for(const directory of ['src','public','server','tests','docs','tools'])collect(directory);
files.push('AGENTS.md','index.html','package.json','package-lock.json','vite.config.js');
mkdirSync(destination,{recursive:true});
const hashes={};
for(const file of [...new Set(files)]){
 const target=join(destination,file);mkdirSync(dirname(target),{recursive:true});
 copyFileSync(join(root,file),target);
 hashes[file.replaceAll('\\','/')]=createHash('sha256').update(readFileSync(target)).digest('hex');
}
writeFileSync(join(destination,'source-hashes.json'),JSON.stringify(hashes,null,2),{flag:'wx'});
console.log(JSON.stringify({source:'LOCAL_WORKTREE',path:relative(root,destination),files:Object.keys(hashes).length,privateDataIncluded:false}));
