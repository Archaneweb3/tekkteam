import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderAssociatedCoin,renderAgentOverview} from '../public/app/agent-overview-ui.js';
import {renderAgentTrading} from '../public/app/agent-trading-ui.js';
const agent={id:'agent-1',creator:'owner-1',coin:null};
const mint='So11111111111111111111111111111111111111112';
function contract(state='CONFIRMED') {return {id:agent.id,owner:agent.creator,coin:{name:'Coin <script>'},lifecycle:{agent:{id:agent.id},token:{state:state==='CONFIRMED'?'CONFIRMED':'CONFIGURED',mint},launch:{state,network:'solana:101',signature:'receipt-signature'}}};}
test('owner-bound confirmed receipt displays full mint/signature without invented economics',()=>{
 const html=renderAssociatedCoin({agent,contract:contract(),t:{status:'PAUSED',paperTargetPolicy:{kind:'ASSOCIATED_COIN',available:true}}});
 assert.match(html,/LAUNCH CONFIRMED/);assert.match(html,new RegExp(mint));assert.match(html,/receipt-signature/);assert.match(html,/Coin &lt;script&gt;/);assert.match(html,/Paper · PAUSED/);assert.match(html,/Associated coin only/);assert.doesNotMatch(html,/ON-CHAIN VERIFIED|PnL|market cap/i);
});
for(const state of ['NOT_CONFIGURED','CONFIGURED_NOT_LAUNCHED','PREPARED','AWAITING_OWNER_APPROVAL','RECONCILIATION_REQUIRED','FAILED','UNAVAILABLE']) test(state+' never promotes draft mint',()=>{
 const html=renderAssociatedCoin({agent,contract:contract(state)});assert.doesNotMatch(html,/pump\.fun|So111|receipt-signature|LAUNCH CONFIRMED/);
});
for(const mutate of [c=>c.owner='wrong',c=>c.id='wrong',c=>c.lifecycle.agent.id='wrong',c=>c.lifecycle.launch.network='solana:103',c=>c.lifecycle.launch.signature='',c=>c.lifecycle.token.mint='<bad>',c=>c.lifecycle.token.state='CONFIGURED']) test('unbound or incomplete receipt cannot expose mint link '+mutate.toString(),()=>{
 const c=contract();mutate(c);assert.doesNotMatch(renderAssociatedCoin({agent,contract:c}),/pump\.fun|LAUNCH CONFIRMED/);
});
test('null contract and identity-only Agent preserve Overview with unavailable data',()=>{
 const html=renderAgentOverview({agent,contract:null,t:null,a:null});assert.match(html,/RECEIPT STATUS UNAVAILABLE/);assert.match(html,/CURRENT POSITION/);assert.match(html,/PERFORMANCE/);assert.match(html,/Paper target policy unavailable/);
 const c=contract('NOT_CONFIGURED');c.coin=null;assert.match(renderAssociatedCoin({agent,contract:c}),/TOKEN NOT CONFIGURED/);
});
test('legacy general policy remains explicit and does not claim execution authorization',()=>{
 const html=renderAssociatedCoin({agent,contract:contract(),t:{status:'READY',paperTargetPolicy:{kind:'GENERAL'}}});assert.match(html,/General Paper market configuration/);assert.match(html,/does not authorize trading/);
});
test('unavailable and malformed receipt evidence uses UNAVAILABLE provenance',()=>{
 for(const mutate of [c=>c.lifecycle.launch.state='UNAVAILABLE',c=>c.lifecycle.launch.network='solana:103',c=>c.lifecycle.launch.signature='',c=>c.lifecycle.token.mint='<bad>',c=>c.lifecycle.launch=null,c=>c.lifecycle.token=null,c=>c.lifecycle.token.state='CONFIGURED']){
  const c=contract();mutate(c);const html=renderAssociatedCoin({agent,contract:c});assert.doesNotMatch(html,/BACKEND VERIFIED/);assert.match(html,/UNAVAILABLE · Mainnet receipt projection/);
 }
 const c=contract();c.coin=null;const html=renderAssociatedCoin({agent,contract:c});assert.match(html,/Token metadata unavailable/);assert.doesNotMatch(html,/No token configured/);
});
function tabHarness(reply,{throwContract=false}={}){
 const source=readFileSync(new URL('../public/app/agent-detail-tabs.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountAgentDetailTabs','function mountAgentDetailTabs').replaceAll('load();const timer=','pending=load();const timer=');
 const element={addEventListener(){},close(){},querySelector(){return element;}};
 const configure={addEventListener(type,fn){this.handler=fn;}},action={};
 const content={innerHTML:'',querySelector(selector){return selector==='.at-drawer'?{...element,open:false}:selector==='[data-associated-configure]'?configure:selector==='[data-paper-action]'?action:element;},querySelectorAll(){return [];}};
 const host={innerHTML:'',addEventListener(){},removeEventListener(){},querySelector(){return content;}};
 const renders=[],states=[],timers=[];
 const context={host,agent,pending:null,request:async()=>reply,setInterval(fn){timers.push(fn);return 1;},clearInterval(){},renderAgentOverview(value){renders.push(value);return 'overview';},renderAgentTrading(value){renders.push(value);return 'trading';},renderReasoning(){return '';},onTradingState(value){states.push(value);},loadContract(){if(throwContract)throw Error('fixture contract error');return null;}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,renders,states,timers,configure,action,start(tab){vm.runInContext(`${tab}Tab(host,agent,()=>true,{select(){},onTradingState,loadContract});`,context);return context.pending;}};
}
for(const reply of [null,undefined,'malformed',42,[],{}, {agentId:'other'}, {agentId:agent.id,decisions:{},config:'bad'}]) test('actual Overview/Trading loaders safely settle '+JSON.stringify(reply),async()=>{
 for(const tab of ['overview','trading']){
  const h=tabHarness(reply);await h.start(tab);assert.equal(h.renders.length,1);assert.equal(h.renders[0].t?.agentId??null,reply?.agentId===agent.id?agent.id:null);
  await h.timers[0]();assert.equal(h.renders.length,2,'busy releases for subsequent refresh');
 }
});
test('actual Overview settles synchronous contract loader throw and can refresh',async()=>{
 const h=tabHarness(null,{throwContract:true});await h.start('overview');assert.equal(h.renders[0].contract,null);await h.timers[0]();assert.equal(h.renders.length,2);
});
test('associated configure sends canonical snapshot mint and never enables; start is separate with discovery false',async()=>{
 const h=tabHarness(null),writes=[];
 const t={agentId:agent.id,status:'DRAFT',enabled:false,paperTargetPolicy:{kind:'ASSOCIATED_COIN',mint,available:true}};
 h.context.request=async(path,options)=>{if(options){writes.push({path,body:JSON.parse(options.body)});return t;}if(path.endsWith('/strategy-config'))return {agentId:agent.id,config:{strategy:'balanced'}};return t;};
 await h.start('trading');await h.configure.handler();assert.equal(writes.length,1);assert.match(writes[0].path,/configure$/);assert.deepEqual(writes[0].body,{mode:'paper',strategy:'balanced',tokenMint:mint,targetPolicy:'ASSOCIATED_COIN'});
 await h.action.onclick();assert.equal(writes.length,2);assert.match(writes[1].path,/enable$/);assert.equal(writes[1].body.discovery,false);
});
test('render blocks unavailable or unconfigured associated start but always permits working pause',()=>{
 const associated={kind:'ASSOCIATED_COIN',mint,available:true};
 for(const t of [{status:'DRAFT',paperTargetPolicy:associated},{status:'READY',tokenMint:'wrong',paperTargetPolicy:associated},{status:'READY',paperTargetPolicy:{kind:'UNAVAILABLE',available:false}}])assert.match(renderAgentTrading({agent,t}),/data-paper-action disabled/);
 const html=renderAgentTrading({agent,t:{status:'WORKING',paperTargetPolicy:{kind:'UNAVAILABLE',available:false}}});assert.doesNotMatch(html,/data-paper-action disabled/);assert.match(html,/PAUSE AGENT/);
});
