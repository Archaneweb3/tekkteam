import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/app/trading-pages.js','utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
async function setup(kind,status=403){
 let denied=true,calls=0,tick,sortListener;
 const alert={textContent:''},retry={},results={innerHTML:'',querySelector(selector){if(selector==='[role="status"]')return this.innerHTML.includes('role="status"')?{}:null;if(selector==='[data-access-retry]')return this.innerHTML.includes('data-access-retry')?retry:null;if(selector==='[data-sort]')return {addEventListener:(event,fn)=>sortListener=fn};return null;}};
 const host={isConnected:true,innerHTML:'',querySelector:selector=>selector==='[data-results]'?results:alert};
 const ctx={characterPortraitUrl:()=>'',hydrateCharacters(){},document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},request:async path=>{calls++;if(path==='/state')return {session:{address:'fixture-owner'}};if(denied)throw Object.assign(Error('The API did not respond. Start the backend.'),{httpStatus:status});return {agents:[]};}};
 vm.runInNewContext(source,ctx);const controller=ctx.mountTradingPage(host,kind);await new Promise(r=>setImmediate(r));
 return {host,results,alert,retry,controller,get calls(){return calls;},setDenied:value=>denied=value,tick:()=>tick(),sort:()=>sortListener?.({target:{value:'roi'}})};
}
for(const kind of ['traders','leaderboard','payroll'])for(const status of [401,403])test(`${kind} HTTP${status} is unavailable, not empty or backend down`,async()=>{
 const f=await setup(kind,status);assert.match(f.alert.textContent,/unavailable in this access context/);assert.doesNotMatch(f.alert.textContent,/Start the backend|did not respond/);assert.match(f.results.innerHTML,/Paper and Real results are unavailable/);assert.doesNotMatch(f.results.innerHTML,/NO PAPER|NO TRADERS|NO ACTIVITY|0 SOL|PRIVATE_PREVIOUS/);
 const calls=f.calls;await f.tick();assert.equal(f.calls,calls);assert.equal(typeof f.retry.onclick,'function');f.controller.destroy();
});
test('explicit retry can recover actual leaderboard without a background denial loop',async()=>{const f=await setup('leaderboard');f.setDenied(false);await f.retry.onclick();await new Promise(r=>setImmediate(r));assert.equal(f.alert.textContent,'');assert.match(f.results.innerHTML,/PAPER RANKINGS|NO PAPER RANKINGS YET/);assert.doesNotMatch(f.results.innerHTML,/data-access-retry/);f.controller.destroy();});
test('revoked access clears previously rendered owner results',async()=>{const f=await setup('leaderboard');f.setDenied(false);await f.controller.refresh();f.results.innerHTML='PRIVATE_PREVIOUS_RANKING';f.setDenied(true);await f.controller.refresh();assert.doesNotMatch(f.results.innerHTML,/PRIVATE_PREVIOUS/);assert.match(f.results.innerHTML,/unavailable/);f.controller.destroy();});
test('non-access failure remains distinguishable and polling can retry',async()=>{const f=await setup('leaderboard',503);assert.match(f.alert.textContent,/Unable to load/);assert.doesNotMatch(f.alert.textContent,/unavailable in this access context/);const calls=f.calls;await f.tick();assert(f.calls>calls);f.controller.destroy();});
