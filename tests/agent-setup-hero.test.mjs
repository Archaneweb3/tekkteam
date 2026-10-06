import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app/workspace.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('  heroAction.onclick='),source.indexOf("\n  $('[data-hero-settings]",source.indexOf('  heroAction.onclick=')));
test('hero never runs a Paper/Real action; pending, failed and foreign launch state cannot navigate to execution',()=>{
 for(const [known,confirmed,disabled,expected] of [[false,false,true,null],[false,false,false,null],[true,true,false,'wallet'],[true,false,false,'trading']]){
  const calls=[],context={heroAction:{disabled},launchStatusKnown:known,launchConfirmed:confirmed,tabs:{select:tab=>calls.push(tab)},page:{},$:()=>({scrollIntoView(){}})};
  vm.createContext(context);vm.runInContext(handler,context);context.heroAction.onclick();assert.deepEqual(calls,expected?[expected]:[]);
 }
 assert.match(source,/launchStatusKnown&&lifecycle\.agent\?\.id===a\.id/);
 assert.doesNotMatch(handler,/MutationObserver|\.click\(|request\(|post\(/);
});
