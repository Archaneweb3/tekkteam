import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOverviewTop} from '../public/app/overview-top.js';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app/real-leaderboard.js',import.meta.url),'utf8').replace("import {request} from './backend.js';","const request=()=>{throw Error('No transport');};").replace("import {characterPortraitUrl} from './character-registry.js';","const characterPortraitUrl=()=>'';");
const {renderRealRankings}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('homepage ranks only explicit Real response and never promotes legacy Paper totals',()=>{
 const network={agents:[],activity:[],overview:{}};
 const legacy={agents:[{name:'Old Paper',closedPositionCount:1,roiPercent:999,totalPnlSol:7}]};
 assert.doesNotMatch(renderOverviewTop(network,legacy),/Old Paper|999|Employee of the month/);
 const real={mode:'REAL',agents:[{name:'Verified',rank:1,character:'frank',strategy:'guardian',closedPositionCount:2,roiBps:'1234',realizedPnlLamports:'123456789'}]};
 assert.match(renderOverviewTop(network,real,'roi'),/12\.34%/);
 assert.match(renderOverviewTop(network,real,'sol'),/0\.123456789 SOL/);
 assert.match(renderOverviewTop(network,{mode:'REAL',agents:[]}),/No opted-in Agent/);
 assert.match(renderOverviewTop(network,null),/Rankings unavailable/);
});
test('verified empty and partial weeks retain all three places without fake performance or portraits',()=>{
 for(let count=0;count<=3;count++){
  const data={mode:'REAL',week:{startsAt:'2026-10-05T00:00:00Z'},agents:Array.from({length:count},(_,i)=>({name:'Real '+i,rank:i+1,character:'frank',closedPositionCount:1,roiBps:'100',realizedPnlLamports:'1000000'}))};
  for(const html of [renderOverviewTop({agents:[]},data),renderRealRankings(data)]){
   assert.equal((html.match(/WAITING FOR AGENT/g)||[]).length,3-count);
   const placeholders=html.match(/<article class="[^"]*tw-podium-waiting[\s\S]*?<\/article>/g)||[];
   for(const item of placeholders)assert.doesNotMatch(item,/<img|<strong|href=|0 SOL|0%/);
  }
 }
 assert.doesNotMatch(renderOverviewTop({},null),/WAITING FOR AGENT/);
});
