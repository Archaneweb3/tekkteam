// Reuse the current Vite client; never bundle a server environment/data directory.
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readReownProjectId} from './local-owner-preview/reown-config.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const projectId=readReownProjectId(process.env.VITE_REOWN_PROJECT_ID?'VITE_REOWN_PROJECT_ID='+process.env.VITE_REOWN_PROJECT_ID:readFileSync(join(root,'.env.local'),'utf8'));
if(!projectId)throw Error('VITE_REOWN_PROJECT_ID_REQUIRED');
for(const k of Object.keys(process.env))if(k.startsWith('VITE_'))delete process.env[k];
const {build}=await import('vite');
await build({root,configFile:false,envDir:mkdtempSync(join(tmpdir(),'tekkteam-wallet-build-')),resolve:{alias:[{find:/^buffer$/,replacement:'buffer/'}]},define:{'import.meta.env.VITE_REOWN_PROJECT_ID':JSON.stringify(projectId),'import.meta.env.VITE_BACKEND_ENABLED':JSON.stringify('true'),'import.meta.env.VITE_API_BASE':JSON.stringify('/api'),'import.meta.env.VITE_WALLET_TEST_ONLY':JSON.stringify('true'),'import.meta.env.VITE_APP_REVISION':JSON.stringify('m3-20261003')},build:{outDir:join(root,'artifacts/mobile-wallet-m2b/site'),emptyOutDir:true}});
console.log('Staging client built: same-origin API, current revision, no automatic wallet signing. Runtime capability qualification required.');
