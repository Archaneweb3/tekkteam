import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tokenMetadata} from '../src/agent-launch-data.js';
import {verifyPublishedImage} from './token-image.js';
import {resolveTokenDraftConfiguration} from './launchpad-token-configuration.js';

const unavailable=()=>Object.assign(Error('Explicit public metadata configuration required; no automatic deployment'),{code:'METADATA_CONFIGURATION_UNAVAILABLE'});

// Construction performs no IO. Only an already provisioned origin is verified.
export function createMetadataPublisher(configuration,{request=fetch,verifyImage}={}){
 const resolved=resolveTokenDraftConfiguration(configuration);
 let pending=Promise.resolve();
 return function publish(data){
  const task=pending.then(async()=>{
   if(!resolved.options)throw unavailable();
   if(!data.image)throw Error('Token image required before launch preparation');
   const json=JSON.stringify(tokenMetadata(data));
   const digest=createHash('sha256').update(json).digest('hex');
   const relative=Buffer.from(digest,'hex').toString('base64url');
   const uri=resolved.options.publicOrigin+'/'+relative;
   if(Buffer.byteLength(uri)>200)throw Error('Metadata URI too long');
   await mkdir(join(resolved.options.assetRoot,'public'),{recursive:true});
   await writeFile(join(resolved.options.assetRoot,'public',relative),json);
   const response=await request(uri,{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(response.status!==200||JSON.stringify(await response.json())!==json)throw Error('Public metadata verification failed');
   if(verifyImage)await verifyImage(data);
   else await verifyPublishedImage(data,request,{root:resolved.options.assetRoot,origin:resolved.options.publicOrigin});
   return uri;
  });
  pending=task.catch(()=>{});return task;
 };
}

// Ambient environment variables never authorize publication or deployment.
export async function publishAgentMetadata(){throw unavailable();}
