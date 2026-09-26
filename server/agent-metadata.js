import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tokenMetadata} from '../src/agent-launch-data.js';
import {verifyPublishedImage} from './token-image.js';
const run=promisify(execFile);
const root=resolve(process.env.DATA_DIR||'server/data','pump-metadata-site');
let pending=Promise.resolve();

// Only static metadata goes to the existing isolated metadata project. Never deploy
// the application worktree. Content-addressed paths bind the URI to one snapshot.
export async function publishAgentMetadata(data) {
 const task=pending.then(async()=>{
  if(!data.image)throw Error('Token image required before launch preparation');
  const json=JSON.stringify(tokenMetadata(data));
  const digest=createHash('sha256').update(json).digest('hex');
  // Full content hash includes agent identity. Compact URI keeps atomic create+buy
  // under Solana's packet limit without changing metadata or truncating the hash.
  const relative=Buffer.from(digest,'hex').toString('base64url');
  const cache=join(root,`${digest}.compact.receipt.json`);
  if(process.env.PUBLIC_METADATA_ORIGIN){
   const origin=new URL(process.env.PUBLIC_METADATA_ORIGIN);if(origin.protocol!=='https:')throw Error('Public HTTPS metadata origin required');
   await mkdir(join(root,'public',relative,'..'),{recursive:true});
   await writeFile(join(root,'public',relative),json,{flag:'w'});
   const uri=origin.origin+'/'+relative;
   if(Buffer.byteLength(uri)>200)throw Error('Metadata URI too long');
   const response=await fetch(uri,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(response.status!==200||JSON.stringify(await response.json())!==json)throw Error('Public metadata verification failed');
   await verifyPublishedImage(data);return uri;
  }
  let uri;try{uri=JSON.parse(await readFile(cache,'utf8')).uri;}catch{}
  if(!uri){
   const cli=process.env.VERCEL_CLI_PATH||join(process.env.APPDATA||'', 'npm/node_modules/vercel/dist/index.js');
   await mkdir(join(root,'public',relative,'..'),{recursive:true});
   await mkdir(join(root,'.vercel'),{recursive:true});
   await writeFile(join(root,'.vercel/project.json'),JSON.stringify({projectId:'prj_s3AWeAfo5jjqVUis54Si9vt8NsGB',orgId:'team_zj6y8fLaoKBIb419RNkLPCbF'}));
   // Existing public assets remain in this append-only metadata hosting directory.
   await writeFile(join(root,'public',relative),json);
   await writeFile(join(root,'vercel.json'),JSON.stringify({version:2,buildCommand:null,installCommand:null,outputDirectory:'public',headers:[{source:'/:file',headers:[{key:'Content-Type',value:'application/json'}]}]}));
   const {stdout}=await run(process.execPath,[cli,'deploy','--prod','--yes',root],{timeout:120000,windowsHide:true,maxBuffer:1024*1024});
   const deployment=stdout.match(/https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g)?.at(-1);
   if(!deployment)throw Error('Metadata hosting did not return a public deployment URL');
   // Deployment URLs may require Vercel authentication. The production metadata
   // alias is public; immutable content paths are retained on every deployment.
   uri='https://tekkwork-test-metadata.vercel.app/'+relative;
  }
  if(Buffer.byteLength(uri)>200)throw Error('Metadata URI exceeds token metadata length limit');
  const response=await fetch(uri,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.status!==200||JSON.stringify(await response.json())!==json)throw Error('Agent metadata is not publicly accessible or does not match. Launch stopped.');
  await writeFile(cache,JSON.stringify({uri}));
  await verifyPublishedImage(data);
  return uri;
 });
 pending=task.catch(()=>{});return task;
}
