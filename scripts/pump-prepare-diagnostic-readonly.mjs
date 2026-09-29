// One-shot, read-only reproduction of the launch readiness path. Never calls
// the prepare endpoint, signs, persists a launch, or broadcasts.
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {agentLaunchData} from '../src/agent-launch-data.js';

const agentId='0f406135-35ea-437d-a27c-29052d279c3b';
const db=new DatabaseSync('server/data/tekkwork.sqlite',{readOnly:true});
const row=db.prepare('SELECT data FROM agents WHERE id=?').get(agentId);
db.close();
if(!row)throw Error('Diagnostic agent unavailable');
const launch=agentLaunchData(JSON.parse(row.data));
const receipts=readdirSync('server/data/pump-metadata-site').filter(name=>name.endsWith('.compact.receipt.json'));
if(receipts.length!==1)throw Error('Diagnostic metadata receipt ambiguous');
launch.metadataUri=JSON.parse(readFileSync('server/data/pump-metadata-site/'+receipts[0],'utf8')).uri;
launch.initialBuyLamports=10_000_000;

const child=spawn(process.execPath,['scripts/pump-readiness.mjs','--simulate','--events'],{
 stdio:['ignore','pipe','pipe'],windowsHide:true,
 env:{...process.env,PUMP_AGENT_LAUNCH:JSON.stringify(launch)},
});
let stdout='',stderr='';
child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>6_000_000)child.kill();});
child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>200_000)child.kill();});
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
const events=stderr.split(/\r?\n/).filter(line=>line.startsWith('PUMP_EVENT ')).map(line=>{
 try{return JSON.parse(line.slice(11)).stage;}catch{return 'INVALID_EVENT';}
});
const fatal=stderr.split(/\r?\n/).find(line=>/^Error: /.test(line))?.slice(7)??'';
const safeFatal=/^(RPC HTTP \d{3}|HTTP \d{3}|Insufficient Mainnet SOL for initial buy and launch costs|Metadata mismatch|Wrong cluster|Payer owner mismatch|Global owner mismatch|Launch spending policy rejected: [A-Z_, ]+)$/.test(fatal)?fatal:
 /429|Too Many Requests/i.test(fatal)?'RPC rate limit / 429':
 code===0?'NONE':'UNCLASSIFIED_READINESS_FAILURE';
let result=null;
if(code===0){try{const data=JSON.parse(stdout);result={payerBalanceLamports:data.before?.value?.[5]?.lamports??null,simulationError:data.simulation?.value?.err??null,policyAllowed:data.policy?.allowed??null,validatedOverheadLamports:data.policy?.validatedOverheadLamports??null,estimatedPayerDebitLamports:data.policy?.estimatedPayerDebitLamports??null,baseFeeLamports:data.policy?.baseFeeLamports??null,createdAccountFundingLamports:data.policy?.createdAccountFundingLamports??null};}catch{result={parse:'FAILED'};}}
console.log(JSON.stringify({mode:'READ_ONLY_SIMULATION',payerRole:'OWNER_PHANTOM',payerPublicAddress:launch.owner,initialBuyLamports:launch.initialBuyLamports,exitCode:code,stages:events,fatal:safeFatal,result}));
