import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('office teardown cancels reduced-motion refresh and stale callbacks cannot restart rendering',()=>{
 const source=readFileSync('public/app/office3d.js','utf8');
 const lifecycle=source.slice(source.indexOf('  let disposed = false;'),source.indexOf('\n  return {',source.indexOf('  let disposed = false;')));
 const teardown=source.slice(source.lastIndexOf('    destroy() {')+16,source.lastIndexOf('\n    },'));
 for(const reduce of [false,true]){
  const intervals=new Map();let frameCalls=0,timerCallback=null;
  const context={reduce,raf:0,running:false,last:0,dirty:true,night:0,nightTarget:1,frame(){},resize(){},performance:{now:()=>0},requestAnimationFrame(){return ++frameCalls;},cancelAnimationFrame(){},setInterval(fn){timerCallback=fn;intervals.set(1,fn);return 1;},clearInterval(id){intervals.delete(id);},ro:{disconnect(){}},io:{disconnect(){}},mo:{disconnect(){}},document:{removeEventListener(){}},host:{removeEventListener(){}},layer:{remove(){}},canvas:{remove(){}},gl:{getExtension:()=>null},onMove(){},onLeave(){},onVis(){}};
  vm.runInNewContext(lifecycle+';dispose=()=>{'+teardown+'};restart=start;',context);
  assert.equal(intervals.size,reduce?1:0);context.dispose();assert.equal(intervals.size,0);
  context.raf=0;const before=frameCalls;timerCallback?.();context.restart();assert.equal(frameCalls,before);assert.equal(context.running,false);
 }
});
