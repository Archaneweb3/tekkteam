import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync('public/app/workspace.js','utf8');
test('guest character roster keeps art and known catalog but never invents assignment availability',()=>{
 const ctx={state:{session:null,agents:[],config:{characters:[{id:'frank',name:'Felix',role:'Builder',color:'yellow'}]}},worldHero:()=>'',worldMetric:(label,value)=>label+':'+value+';',esc:String,document:{querySelectorAll:()=>[]},page:{innerHTML:''}};
 vm.runInNewContext(source.slice(source.indexOf('function characters('),source.indexOf('function characterAssignment('))+';characters(page);',ctx);
 assert.match(ctx.page.innerHTML,/TOTAL CHARACTERS:1/);assert.match(ctx.page.innerHTML,/ASSIGNED:—/);assert.match(ctx.page.innerHTML,/AVAILABLE:—/);assert.match(ctx.page.innerHTML,/SIGN IN TO CHECK/);assert.doesNotMatch(ctx.page.innerHTML,/READY FOR YOUR WORKFORCE/);
});
test('trader denial keeps recovery link without exposing internal fixture errors',async()=>{
 const ctx={request:async()=>{throw Object.assign(Error('LOCAL_FIXTURE_ENDPOINT_OR_ORIGIN_DENIED'),{httpStatus:403});},poll:(host,run)=>{ctx.done=run(()=>false);return {destroy(){}};},esc:String,host:{innerHTML:''}};
 const code=fs.readFileSync('public/app/trading-pages.js','utf8').split('export function mountPublicTrader')[1];vm.runInNewContext('function mountPublicTrader'+code+';mountPublicTrader(host,"missing");',ctx);await ctx.done;
 assert.match(ctx.host.innerHTML,/unavailable in this access context/);assert.match(ctx.host.innerHTML,/#\/traders/);assert.doesNotMatch(ctx.host.innerHTML,/LOCAL_FIXTURE/);
});
test('guest character detail does not claim assignment availability',()=>{
 const page={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};const ctx={page,state:{session:null,agents:[],config:{characters:[{id:'frank',name:'Felix',role:'Builder'}]}},esc:String,characterPortraitUrl:()=>'/frank.png'};
 vm.runInNewContext(source.slice(source.indexOf('function characterAssignment('),source.indexOf('function guideLanding('))+';characterAssignment(page,"frank");',ctx);assert.match(page.innerHTML,/SIGN IN TO CHECK/);assert.doesNotMatch(page.innerHTML,/>AVAILABLE</);
});
