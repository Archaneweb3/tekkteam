// Read-only Linux preflight. Run on the approved Hostinger VPS; no credentials printed.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,statSync} from 'node:fs';import {homedir} from 'node:os';import {join} from 'node:path';
const run=(cmd,args)=>{try{return execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024}).trim();}catch{return 'UNAVAILABLE';}};
const production='/var/www/tekkteam',names=new Set(['tekkteam-api','tekkteam-launch']);
const result={node:process.version,productionPathExists:existsSync(production),proposedPathExists:existsSync('/var/www/tekkteam-staging'),proposedDataExists:existsSync('/var/lib/tekkteam-staging'),disk:run('df',['-h',production,'/var/lib']),listeners:run('ss',['-ltnp']),processes:[],pm2:'UNAVAILABLE'};
const pm2Home=process.env.PM2_HOME||join(homedir(),'.pm2');
// pm2 jlist would start a daemon if none existed. Never do that during preflight.
if(existsSync(join(pm2Home,'rpc.sock'))&&statSync(join(pm2Home,'rpc.sock')).isSocket()){
 try{const list=JSON.parse(run('pm2',['jlist']));result.pm2='READ_EXISTING_DAEMON';result.processes=list.filter(p=>names.has(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env?.status,cwd:p.pm2_env?.pm_cwd,script:p.pm2_env?.pm_exec_path,configured:Object.fromEntries(['PORT','DATA_DIR','NODE_ENV','SOLANA_NETWORK','MAINNET_SAFETY_MODE'].filter(k=>p.pm2_env?.[k]!==undefined).map(k=>[k,p.pm2_env[k]]))}));}catch{result.pm2='READ_FAILED';}
}
// Parse only allowlisted non-secret keys from the explicitly authorized project.
const envFile=join(production,'.env');
if(existsSync(envFile)){const text=readFileSync(envFile,'utf8');result.projectConfig={};for(const key of ['PORT','DATA_DIR','SOLANA_NETWORK','MAINNET_SAFETY_MODE']){const m=text.match(new RegExp('^\\s*'+key+'\\s*=\\s*(.*)$','m'));if(m)result.projectConfig[key]=m[1].replace(/\s+#.*$/,'').replace(/^['"]|['"]$/g,'');}result.projectConfig.mainnetRpcConfigured=/^\s*MAINNET_RPC_URL\s*=\s*\S/m.test(text);}
const nginx=run('nginx',['-T']);
// Only non-secret host/listener/static/proxy-target directives; never raw nginx dump.
result.nginx=nginx==='UNAVAILABLE'?'UNAVAILABLE':nginx.split('\n').filter(l=>/^\s*(server_name|listen|root|include)\s/.test(l)||/^# configuration file .*tekk/i.test(l)).map(l=>l.trim());
console.log(JSON.stringify(result,null,2));
