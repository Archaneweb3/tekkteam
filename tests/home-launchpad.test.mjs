import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const workspace=read('public/app/workspace.js'),overview=read('public/app/overview.js'),navigation=read('public/app/glass-navigation.js');
test('Home renders launch orientation without any Agent/token data or backend effects',()=>{
 const page={innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[]};let destroyed=0;
 let officeOptions=null;const ctx={page,createOffice:(_host,options)=>{officeOptions=options;return {destroy(){destroyed++}}},mountLiquidMaterial:()=>({destroy(){destroyed++}}),characterPortraitUrl:id=>'/'+id};
 vm.runInNewContext(overview.replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')+';result=renderWorkspaceMap(page,{onAction(){}})',ctx);
 assert.match(page.innerHTML,/AI AGENT LAUNCHPAD/);assert.match(page.innerHTML,/Pump.fun/);assert.match(page.innerHTML,/Live trading stays OFF/);assert.match(page.innerHTML,/class="tw-button primary" href="#\/launch"/);assert.match(page.innerHTML,/href="#\/agents"/);assert.match(page.innerHTML,/Paper Trader/);assert.equal((page.innerHTML.match(/class="role-character"/g)||[]).length,3);assert.equal(officeOptions.composition,'hero');assert.equal(typeof officeOptions.onAction,'function');assert.doesNotMatch(page.innerHTML,/workforce-device|workforce-phone/);ctx.result.destroy();assert.equal(destroyed,2);
});
test('five primary destinations and secondary routes remain reachable',()=>{
 const initial=vm.runInNewContext(workspace.match(/\$\{(\[\['overview'.*?\]\])\.map/)[1]);
 assert.equal(JSON.stringify(initial.map(x=>x[1])),JSON.stringify(['Home','Launchpad','Agents','Tokens','Wallet']));
 const secondary=[...workspace.matchAll(/href="#\/(payroll|traders|market|leaderboard|how)"/g)].map(m=>m[1]);
 assert.equal(new Set([...initial.map(x=>x[0]),...secondary]).size,10);
 for(const id of [...initial.map(x=>x[0]),...secondary])assert.match(workspace,new RegExp('(?:[ {,])'+id+'[,:]'));
 assert.doesNotMatch(navigation,/const walletLink=/);
 const rail=read('public/hero-sidebar.css');assert.match(rail,/height:44px!important;min-height:44px!important/);assert.doesNotMatch(rail,/height:43px!important/);
});
test('WebGL failure retains launch and Agent routes with explicit safety copy',()=>{
 const fallback=workspace.match(/catch\(error\)\{map.innerHTML=(.*?);console.error/)[1];const html=vm.runInNewContext(fallback);
 assert.match(html,/href="#\/launch">Launch Coin/);assert.match(html,/href="#\/agents">View Agents/);assert.match(html,/Live trading stays OFF/);assert.match(html,/explicit wallet approval/);
});
test('identity-only Agent card remains visible without a fabricated token',()=>{
 const lines=workspace.split('\n').filter(l=>/^const (esc |statusText |tokenLabel |card )/.test(l)).join('\n');const ctx={state:{config:{strategies:[]}},agent:{id:'LOCAL_FIXTURE',name:'Identity only',coin:null,character:'frank',tradingStatus:'PAUSED',strategy:'balanced'}};
 vm.runInNewContext(lines+';html=card(agent)',ctx);assert.match(ctx.html,/Identity only/);assert.match(ctx.html,/Token not configured/);assert.match(ctx.html,/#\/agent\/LOCAL_FIXTURE/);assert.doesNotMatch(ctx.html,/undefined|null|mint/);
});
test('Launchpad icon reuses an existing authored asset',()=>{assert.match(read('public/app/sidebar-icons.js'),/launch:'tokens'/);assert.ok(readFileSync('public/assets/nav-icons/tokens.webp').length>0);});
