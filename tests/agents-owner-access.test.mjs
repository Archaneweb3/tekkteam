import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('guest Agents preserves owner access and never claims zero/empty workforce',()=>{
 const source=readFileSync('public/app/workspace.js','utf8');const fn=source.slice(source.indexOf('function agents(page)'),source.indexOf('function tokens(page)'));
 let connects=0;const button={},page={innerHTML:'',querySelector:()=>button};
 const context={state:{session:null,agents:[]},location:{hash:'#/agents'},worldHero:(_,title,copy,art,primary,secondary)=>title+copy+primary+secondary,openWallet:()=>connects++,createAgentPage:()=>assert.fail('No implicit create')};
 vm.runInNewContext(fn,context);context.agents(page);assert.match(page.innerHTML,/OWNER WALLET|owner wallet/);assert.doesNotMatch(page.innerHTML,/TOTAL AGENTS|WORKFORCE IS EMPTY/);button.onclick();assert.equal(connects,1);
});
