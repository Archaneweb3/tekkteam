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
  for(const label of ['tw-network-strip','Employee of the month','New hires unavailable','Trading Desk','On the Payroll','Rankings unavailable','Trading activity is unavailable'])assert.ok(host.innerHTML.includes(label),label);
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
