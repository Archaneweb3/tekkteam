import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r',commit],{encoding:'utf8'}).trim().split('\n').filter(p=>/^(server|src|public|tests|tools)\//.test(p)||p==='vite.config.js'),manifest=files.map(path=>({path,sha:createHash('sha256').update(execFileSync('git',['show',commit+':'+path])).digest('hex')}));
const script=`set -euo pipefail
umask 077
root=/var/www/tekkteam-staging
release=$root/releases/flow-8fb4688
backup=/var/backups/tekkteam-staging/parity-${commit.slice(0,7)}
mkdir -p "$backup"
pm2 jlist > "$backup/pm2-before.json"
cp /etc/tekkteam-staging/wallet-test.json "$backup/config.json"
cd "$root"
node --input-type=module <<'NODE'
import{DatabaseSync,backup}from'node:sqlite';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const d=new DatabaseSync('/var/lib/tekkteam-staging/wallet-test.sqlite',{readOnly:true}),p=d.prepare('SELECT payload FROM m4_execution WHERE id=1').get().payload,s=JSON.parse(p);
if(createHash('sha256').update(p).digest('hex')!=='bb12a6fe5a98eba70ed0568c91a7cd54955f5197911d313bb07de29285b8fbfb'||s.executionId!=='774a48ae-507c-4753-b901-6c2261d60a4c'||s.status!=='USER_REJECTED'||s.signature||s.broadcastAttempted)throw Error('BASELINE_CHANGED');
if(d.prepare('SELECT count(*) n FROM agents WHERE id=?').get('8fc6fe77-16a0-4fed-8ca0-ddd1f6ef9fa7').n!==1||d.prepare('SELECT count(*) n FROM agent_wallets').get().n!==0)throw Error('TARGET_CHANGED');
await backup(d,'/var/backups/tekkteam-staging/parity-${commit.slice(0,7)}/wallet-test.sqlite');d.close();console.log('BASELINE_AND_BACKUP PASS');
NODE
cd "$release"
node --input-type=module <<'NODE'
import{readFileSync,mkdirSync}from'node:fs';import{dirname}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
for(const f of ${JSON.stringify(manifest)}){mkdirSync(dirname(f.path),{recursive:true});execFileSync('curl',['--fail','--silent','--show-error','--max-time','30','https://raw.githubusercontent.com/Archaneweb3/tekkteam/${commit}/'+f.path,'-o',f.path]);if(createHash('sha256').update(readFileSync(f.path)).digest('hex')!==f.sha)throw Error('SOURCE_HASH_MISMATCH');}console.log('PINNED_SOURCE_HASHES PASS');
NODE
node --test --test-concurrency=1 tests/pump-action-time.test.mjs tests/pump-action-time-ui.test.mjs tests/pump-m4.test.mjs tests/pump-m4-recovery.test.mjs tests/pump-m4-owner-first.test.mjs tests/pump-m4-oracle.test.mjs tests/pump-m4-ui.test.mjs tests/pump-m4-jit-ui.test.mjs tests/pump-m4-wallet-boundary.test.mjs tests/pump-m4-fee-policy.test.mjs tests/pump-execution-review.test.mjs tests/launch-agent-provisioning.test.mjs tests/pump-preparation-m3.test.mjs tests/pump-preparation-owner-route.test.mjs > "$backup/tests.log" 2>&1
VITE_REOWN_PROJECT_ID=4ff1d3e01a96614c9521dbc9eaa7830c node tools/build-wallet-test.mjs > "$backup/build.log" 2>&1
find artifacts/mobile-wallet-m2b/site -type d -exec chmod 755 {} +
find artifacts/mobile-wallet-m2b/site -type f -exec chmod 644 {} +
node --input-type=module <<'NODE'
import{readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync}from'node:fs';import{dirname}from'node:path';import{createHash}from'node:crypto';
const root='/var/www/tekkteam-staging',backup='/var/backups/tekkteam-staging/parity-${commit.slice(0,7)}';for(const f of ${JSON.stringify(manifest.filter(f=>/^(server|src|public)\//.test(f.path)))}){if(existsSync(root+'/'+f.path)){mkdirSync(dirname(backup+'/'+f.path),{recursive:true});copyFileSync(root+'/'+f.path,backup+'/'+f.path);}mkdirSync(dirname(root+'/'+f.path),{recursive:true});copyFileSync(f.path,root+'/'+f.path);if(createHash('sha256').update(readFileSync(root+'/'+f.path)).digest('hex')!==f.sha)throw Error('RUNTIME_HASH_MISMATCH');}console.log('RUNTIME_HASHES PASS');
NODE
for item in "$release"/artifacts/mobile-wallet-m2b/site/*; do if [ "$(basename "$item")" != index.html ]; then cp -a "$item" "$root/site/"; fi; done
install -m 0644 "$release/artifacts/mobile-wallet-m2b/site/index.html" "$root/site/.index-parity"
node --input-type=module <<'NODE'
import{readFileSync,writeFileSync,renameSync}from'node:fs';import{DatabaseSync}from'node:sqlite';import{createHash}from'node:crypto';
const p='/etc/tekkteam-staging/wallet-test.json',c=JSON.parse(readFileSync(p));if(c.origin!=='https://staging.tekkteam.tech'||c.port!==4395||c.dataDir!=='/var/lib/tekkteam-staging'||c.m4RecoveryExecutionId!=='d16d20e3-e3c6-418a-aa60-f35a1a6c254c')throw Error('CONFIG_BASELINE_CHANGED');
const d=new DatabaseSync(c.dataDir+'/wallet-test.sqlite',{readOnly:true}),h=createHash('sha256').update(d.prepare('SELECT payload FROM m4_execution WHERE id=1').get().payload).digest('hex');d.close();if(h!=='bb12a6fe5a98eba70ed0568c91a7cd54955f5197911d313bb07de29285b8fbfb')throw Error('EXECUTION_CHANGED');
c.m4ActionTime=true;delete c.m4RecoveryExecutionId;writeFileSync(p+'.parity',JSON.stringify(c),{mode:0o600});renameSync(p+'.parity',p);console.log('CONFIG_ONLY_DB_UNCHANGED PASS');
NODE
pm2 restart tekkteam-staging-api --update-env > "$backup/restart.log"
mv "$root/site/.index-parity" "$root/site/index.html"
pm2 jlist > "$backup/pm2-after.json"
node --input-type=module <<'NODE'
import{readFileSync}from'node:fs';const p='/var/backups/tekkteam-staging/parity-${commit.slice(0,7)}',a=JSON.parse(readFileSync(p+'/pm2-before.json')),b=JSON.parse(readFileSync(p+'/pm2-after.json'));for(const name of ['tekkteam-api','tekkteam-launch']){const x=a.find(x=>x.name===name),y=b.find(x=>x.name===name);if(x.pid!==y.pid||x.pm2_env.restart_time!==y.pm2_env.restart_time||y.pm2_env.status!=='online')throw Error('PRODUCTION_CHANGED');console.log(name+' UNCHANGED PID '+y.pid+' restart '+y.pm2_env.restart_time);}console.log('PARITY_STAGE_DEPLOY PASS ${commit}');
NODE
tail -n 9 "$backup/tests.log"
tail -n 2 "$backup/build.log"
`;
writeFileSync('artifacts/m4-deterministic-attempt/deploy-parity.sh',script);writeFileSync('artifacts/m4-deterministic-attempt/parity-manifest.json',JSON.stringify({commit,manifest},null,2));console.log(gzipSync(script).toString('base64'));
