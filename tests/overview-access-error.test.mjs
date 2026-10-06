import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderOverviewTop} from '../public/app/overview-top.js';
import {renderOverviewFeed} from '../public/app/overview-feed.js';
const code=readFileSync('public/app/overview-dashboard.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountOverview','function mountOverview');
test('denied workforce reads do not falsely report an offline backend or an empty workforce',async()=>{
 for(const status of [403,503]){
  const host={innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},removeEventListener(){}};
  const ctx={renderOverviewTop,renderOverviewFeed,hydrateCharacters(){},request:async()=>{throw Object.assign(Error('Service unavailable'),{httpStatus:status});},esc:s=>s,document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){}};
  vm.runInNewContext(code,ctx);const mount=ctx.mountOverview(host,{getSession:()=>null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(host.innerHTML,status===403?/unavailable in this access context/:/Service unavailable/);
  assert.doesNotMatch(host.innerHTML,/Start the backend|No agents|No hires yet|No paper activity yet|0 SOL/);
  for(const label of ['tw-network-strip','TEKKTEAM OF THE WEEK','New hires unavailable','Trading Desk','On the Payroll','Rankings unavailable','Trading activity is unavailable'])assert.ok(host.innerHTML.includes(label),label);
  mount.destroy();
 }
});
test('filtering retains access error and successful retry restores actual data',async()=>{
 let denied=true,click;
 const host={innerHTML:'',classList:{add(){},remove(){}},addEventListener(type,handler){if(type==='click')click=handler;},removeEventListener(){}};
 const network={agents:[],activity:[],overview:{activeTraders:0,totalPaperPnlSol:0}};
 const ctx={renderOverviewTop,renderOverviewFeed,hydrateCharacters(){},request:async path=>{if(denied)throw Object.assign(Error('Denied'),{httpStatus:403});return path==='/trading/network'?network:{agents:[]};},esc:s=>s,document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(code,ctx);const mounted=ctx.mountOverview(host,{getSession:()=>null});
 await new Promise(resolve=>setImmediate(resolve));
 click({target:{closest:selector=>selector==='[data-feed-filter]'?{dataset:{feedFilter:'buys'}}:null}});
 assert.match(host.innerHTML,/unavailable in this access context/);
 denied=false;click({target:{closest:selector=>selector==='[data-retry]'?{}:null}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.doesNotMatch(host.innerHTML,/unavailable in this access context|Payroll data is unavailable/);
 assert.match(host.innerHTML,/No hires yet|No buys in the current activity feed/);mounted.destroy();
});

test('Real ranking remains independent and queued sort cannot relabel an old response',async()=>{
 let click,resolveRoi,resolveSol;
 const host={innerHTML:'',classList:{add(){},remove(){}},addEventListener(type,fn){if(type==='click')click=fn;},removeEventListener(){}};
 const frames=[];
 const ctx={renderOverviewTop:(network,leaders,sort)=>{frames.push({network,leaders,sort});return '';},renderOverviewFeed:()=>'',hydrateCharacters(){},esc:s=>s,document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){},request:path=>{
  if(path==='/trading/network')return Promise.reject(Error('Paper unavailable'));
  if(path==='/leaderboard?sort=roi')return new Promise(r=>resolveRoi=r);
  if(path==='/leaderboard?sort=sol')return new Promise(r=>resolveSol=r);
  throw Error(path);
 }};
 vm.runInNewContext(code,ctx);const mounted=ctx.mountOverview(host,{getSession:()=>null});
 click({target:{closest:s=>s==='[data-sort]'?{dataset:{sort:'sol'}}:null}});
 resolveRoi({mode:'REAL',agents:[{name:'ROI leader'}]});await new Promise(r=>setImmediate(r));
 assert.equal(frames.at(-1).sort,'roi');assert.equal(frames.at(-1).leaders.agents[0].name,'ROI leader');assert.equal(frames.at(-1).network,null);
 assert.match(host.innerHTML,/Paper unavailable/);
 click({target:{closest:s=>s==='[data-feed-filter]'?{dataset:{feedFilter:'buys'}}:null}});
 assert.equal(frames.at(-1).sort,'roi');
 resolveSol({mode:'REAL',agents:[{name:'SOL leader'}]});await new Promise(r=>setImmediate(r));
 assert.equal(frames.at(-1).sort,'sol');assert.equal(frames.at(-1).leaders.agents[0].name,'SOL leader');
 mounted.destroy();
});
