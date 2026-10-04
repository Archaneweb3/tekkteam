import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer as createViteServer} from 'vite';
import {createServer as createApi} from '../server/app.js';

// The default production build is a deliberately auth-disabled client demo.
// Browser integration needs the real bootstrap plus isolated fixture storage,
// never a persistent developer API or a production service.
const run=args=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,BASE_URL:'http://127.0.0.1:5188'}});
 child.once('error',reject);
 child.once('exit',code=>code===0?resolve():reject(new Error(`Test command failed (${code}): ${args.join(' ')}`)));
});
let api,listener,vite,dir;
try {
 await run(['--test','tests/backend.test.mjs','tests/chain.test.mjs','tests/wallet-send.test.mjs']);
 await run(['--test','tests/wallet-transfers.test.mjs']);
 dir=mkdtempSync(join(tmpdir(),'tekkteam-suite-'));
 api=createApi({dbPath:join(dir,'db.sqlite'),origins:['http://127.0.0.1:5188'],network:'local'});
 listener=api.app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{listener.once('listening',resolve);listener.once('error',reject);});
 vite=await createViteServer({configFile:false,logLevel:'warn',server:{host:'127.0.0.1',port:5188,strictPort:true,proxy:{'/api':`http://127.0.0.1:${listener.address().port}`}}});
 await vite.listen();
 for(const file of ['workspace','workspace-auth','confirmation-ui','character-bounds','wallet-intent-browser','wallet-workspace','agent-settings-visual','agent-delete-browser'])await run([`tests/${file}.mjs`]);
} catch(error) {
 console.error(error.message);process.exitCode=1;
} finally {
 await vite?.close();
 if(listener?.listening)await new Promise(resolve=>listener.close(resolve));
 api?.close();
 if(dir)rmSync(dir,{recursive:true,force:true});
}
