import path from 'node:path';import {fileURLToPath}from'node:url';import{mkdtempSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';
import {defaultPorts,port,frontendPathAllowed}from'./fixture-contract.mjs';
import {readReownProjectId,reownBrowserPolicy} from './reown-config.mjs';
const ports={frontend:port(process.argv[2]??defaultPorts.frontend),backend:port(process.argv[3]??defaultPorts.backend)};
const ownerAuth=process.argv[4]==='owner-auth';if(process.argv.length>5||process.argv[4]&&!ownerAuth)throw Error('Unknown preview mode');
if(ports.frontend===ports.backend)throw Error('Distinct ports required');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),envDir=mkdtempSync(path.join(tmpdir(),'tekkteam-owner-vite-env-'));
const cacheDir=path.join(envDir,'vite-cache'),cachePrefix='/@fs/'+cacheDir.replaceAll('\\','/')+'/';
let reownProjectId='';if(ownerAuth){try{reownProjectId=readReownProjectId(readFileSync(path.join(root,'.env.local'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
const reownPolicy=reownBrowserPolicy(!!reownProjectId);
for(const key of Object.keys(process.env))delete process.env[key];
// Bound esbuild concurrency in this isolated preview on memory-constrained hosts.
process.env.GOMAXPROCS='2';process.env.GOMEMLIMIT='128MiB';
const {createServer}=await import('vite');
const origin=`http://127.0.0.1:${ports.frontend}`;
const fixturePlugin={name:'local-owner-fixture',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.headers.host!==`127.0.0.1:${ports.frontend}`||(req.headers.origin&&req.headers.origin!==origin)||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))){res.statusCode=403;res.end('LOCAL_FIXTURE_ORIGIN_DENIED');return;}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.statusCode=403;res.end();return;}
 if(ownerAuth&&pathname==='/owner-auth-review'){if(req.method!=='GET'){res.statusCode=403;res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'none'; form-action 'self'");res.end(readFileSync(path.join(root,'tools/local-owner-preview/auth-review.html'),'utf8'));return;}
 if(!frontendPathAllowed(pathname,cachePrefix)){res.statusCode=403;res.end('LOCAL_FIXTURE_PRIVATE_PATH_DENIED');return;}
 res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' ws://127.0.0.1:"+ports.frontend+reownPolicy.connect+"; img-src 'self' data: blob:"+reownPolicy.images+"; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src "+reownPolicy.frames+"; form-action 'self'");
 if(!req.url.startsWith('/api')&&!['GET','HEAD'].includes(req.method)){res.statusCode=403;res.end('LOCAL_FIXTURE_METHOD_DENIED');return;}next();
 });}};
const server=await createServer({root,configFile:false,envDir,cacheDir,define:{'import.meta.env.VITE_REOWN_PROJECT_ID':JSON.stringify(reownProjectId)},resolve:{alias:[{find:/^buffer$/,replacement:'buffer/'}]},plugins:[fixturePlugin],optimizeDeps:{entries:[path.join(root,'index.html')]},server:{watch:{ignored:['**/artifacts/**']},host:'127.0.0.1',port:ports.frontend,strictPort:true,cors:false,fs:{strict:true,allow:[cacheDir,path.join(root,'public'),path.join(root,'src'),path.join(root,'node_modules'),path.join(root,'index.html'),path.join(root,'server/config.js')]},proxy:{'/api':{target:`http://127.0.0.1:${ports.backend}`,changeOrigin:false}}},clearScreen:false});
await server.listen();if(server.httpServer.address().address!=='127.0.0.1')throw Error('Loopback required');
// Listener readiness does not qualify dependency optimization or browser rendering.
console.log(JSON.stringify({status:'HTTP_LISTENING_NOT_QUALIFIED',pid:process.pid,ports,url:origin,root,envDir,configFile:false,dataSource:'LOCAL_FIXTURE'}));
let closing=false;const close=async()=>{if(closing)return;closing=true;await server.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);process.on('message',m=>{if(m==='shutdown')close();});
