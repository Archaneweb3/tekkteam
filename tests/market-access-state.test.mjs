import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('guest market metrics are unavailable, not zero or empty scans',()=>{
 const source=readFileSync('public/app/market-page.js','utf8');const code=source.slice(source.indexOf('export function mountMarketPage')).replace('export function','function');
 const nodes=new Map();const node=()=>({innerHTML:'',textContent:'',addEventListener(){},open:false});
 const host={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]};
 const context={request:()=>assert.fail('Guest must not read private radar'),document:{hidden:false},Date,esc:String,fact:(name,value)=>name+':'+value,stamp:String};
 vm.runInNewContext(code,context);context.mountMarketPage(host);
 assert.equal(nodes.get('.market-freshness').textContent,'SNAPSHOTS UNAVAILABLE');assert.match(nodes.get('.market-metrics').innerHTML,/MARKETS SHOWN:—/);assert.doesNotMatch(nodes.get('.market-metrics').innerHTML,/:0/);assert.match(nodes.get('.market-opportunity-list').innerHTML,/unavailable/);
});
