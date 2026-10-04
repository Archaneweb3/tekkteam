import {isAbsolute,resolve,join,sep} from 'node:path';
import {normalizeTokenDraft} from '../src/token-draft-schema.js';

const fields=['dataDir','assetRoot','journalPath','publicOrigin','publisherOrigin'];
const result=(reason,options=null)=>Object.freeze({version:1,configurationStatus:reason?'UNAVAILABLE':'COMPATIBLE',reason,options:options?Object.freeze(options):null,asset:Object.freeze({layout:'OWNER_AGENT_SHA256_PNG_V1',configurationProvenance:reason?'UNAVAILABLE':'DERIVED',localAsset:'UNAVAILABLE',publicDelivery:'UNAVAILABLE'}),receiptAuthority:'UNAVAILABLE',authorizationGranted:false});
function pathValue(value){
 if(typeof value!=='string'||!value||value.trim()!==value||/[\u0000-\u001f\u007f-\u009f]/u.test(value)||/^[/\\]{2}/.test(value)||!isAbsolute(value)||(sep==='\\'&&!/^[a-z]:[/\\]/i.test(value)))return null;
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=value.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))return null;}else if(c>=0xdc00&&c<=0xdfff)return null;}
 return resolve(value);
}
function originValue(value){
 const normalized=normalizeTokenDraft({name:'Origin',ticker:'ORG',image:value}).image,u=new URL(normalized);
 if(u.pathname!=='/'||u.search||u.hash)throw Error('Origin required');
 return u.origin;
}
// Trusted explicit configuration only: no environment, filesystem, hosting or runtime reads.
// COMPATIBLE describes normalized lexical layout, never receipt/asset/delivery authority.
export function resolveTokenDraftConfiguration(input){
 if(input==null)return result('TOKEN_CONFIGURATION_MISSING');
 let descriptors;
 try{if(typeof input!=='object'||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))return result('TOKEN_CONFIGURATION_INVALID');descriptors=Object.getOwnPropertyDescriptors(input);}catch{return result('TOKEN_CONFIGURATION_INVALID');}
 if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||!fields.includes(k))||Object.values(descriptors).some(d=>!Object.hasOwn(d,'value')||!d.enumerable))return result('TOKEN_CONFIGURATION_INVALID');
 if(fields.some(k=>!Object.hasOwn(descriptors,k)||descriptors[k].value==null||descriptors[k].value===''))return result('TOKEN_CONFIGURATION_MISSING');
 const dataDir=pathValue(descriptors.dataDir.value),assetRoot=pathValue(descriptors.assetRoot.value),journalPath=pathValue(descriptors.journalPath.value);
 if(!dataDir||!assetRoot||!journalPath)return result('TOKEN_CONFIGURATION_PATH_INVALID');
 // Deliberately conservative exact normalized strings; no symlink/case identity assumed.
 if(assetRoot!==join(dataDir,'pump-metadata-site'))return result('TOKEN_CONFIGURATION_ASSET_ROOT_MISMATCH');
 if(journalPath!==join(dataDir,'pump-agent-launches.json'))return result('TOKEN_CONFIGURATION_JOURNAL_PATH_MISMATCH');
 let publicOrigin,publisherOrigin;try{publicOrigin=originValue(descriptors.publicOrigin.value);publisherOrigin=originValue(descriptors.publisherOrigin.value);}catch{return result('TOKEN_CONFIGURATION_ORIGIN_INVALID');}
 if(publicOrigin!==publisherOrigin)return result('TOKEN_CONFIGURATION_ORIGIN_MISMATCH');
 return result(null,{assetRoot,journalPath,publicOrigin});
}
