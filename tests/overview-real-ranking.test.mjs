import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOverviewTop} from '../public/app/overview-top.js';
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
