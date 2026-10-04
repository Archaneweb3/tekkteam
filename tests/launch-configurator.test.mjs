import test from 'node:test';import assert from 'node:assert/strict';
import {renderLaunchConfigurator,bindLaunchConfigurator,bindConfiguredAgent,configuredCoin,clearConfiguredCoin,reviseConfiguredIdentity} from '../public/app/launch-configurator.js';
test('composer upload/default-logo review preserves owner isolation and ignores stale completion',async()=>{
 const NativeFormData=globalThis.FormData,NativeReader=globalThis.FileReader,readers=[];
 globalThis.FormData=class{constructor(form){this.form=form;}get(key){return this.form.values[key];}};
 globalThis.FileReader=class{constructor(){readers.push(this);}readAsDataURL(){}finish(){this.result='data:image/png;base64,AAAA';this.onload();}};
 const config={characters:[{id:'frank',name:'Felix'}],strategies:[{id:'balanced',name:'Balanced'}]};
 const setup=(owner,createCharacterImage=async()=> 'data:image/png;base64,QkJC')=>{
  renderLaunchConfigurator(config,{owner});const listeners={},nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',disabled:false,closest:()=>null});return nodes.get(key);};
  const form={values:{coinName:'Coin A',ticker:'aaa',name:' Alice ',character:'frank',strategy:'balanced'},isConnected:true,querySelector:node,querySelectorAll:()=>[],addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]};
  let result=null,connected=0;const dispose=bindLaunchConfigurator({querySelector:s=>s==='[data-coin-agent-form]'?form:node(s),querySelectorAll:()=>[]},{owner,createCharacterImage,onReview:(input,context)=>result={input,context},onConnect:()=>connected++});
  return{form,listeners,dispose,node,get result(){return result;},get connected(){return connected;},submit(){return listeners.submit({preventDefault(){},stopPropagation(){}});},file(){const file={name:'coin.png',type:'image/png',size:3};listeners.change({target:{name:'coinImage',files:[file]}});return readers.at(-1);}};
 };
 try{
  clearConfiguredCoin();const a=setup('OWNER_A');const upload=a.file();await a.submit();assert.equal(a.result,null);assert.match(a.node('[data-composer-error]').textContent,/Wait/);
  a.form.values.coinName='Coin A';a.listeners.input();upload.finish();await a.submit();assert.equal(a.result.input.name,'Alice');assert.equal(a.result.context.coin.tokenImage,'data:image/png;base64,AAAA');
  const identity={id:'NEW_CANONICAL_ID',creator:'OWNER_A'};bindConfiguredAgent('OWNER_A',identity,a.result.input,null);assert.equal(configuredCoin('OWNER_A',identity.id),null);
  reviseConfiguredIdentity('OWNER_A',{...a.result.input,name:'Edited'},a.result.context);const edited={...a.result.input,name:'Edited'};bindConfiguredAgent('OWNER_A',identity,edited,a.result.context);assert.equal(configuredCoin('OWNER_A',identity.id).draft.ticker,'AAA');assert.equal(configuredCoin('OTHER',identity.id),null);assert.equal(configuredCoin('OWNER_A','OLD_RECORD'),null);
  const copy=configuredCoin('OWNER_A',identity.id);copy.draft.name='mutated';assert.equal(configuredCoin('OWNER_A',identity.id).draft.name,'Coin A');
  const delayed=a.file();a.dispose();assert.doesNotMatch(renderLaunchConfigurator(config,{owner:'OWNER_B'}),/value=" Alice "/);const b=setup('OWNER_B');delayed.finish();await b.submit();assert.equal(b.result.context.coin.tokenImage,'data:image/png;base64,QkJC');b.dispose();
  clearConfiguredCoin();let finish;const c=setup('OWNER_C',()=>new Promise(r=>finish=r));const pending=c.submit();c.form.values.name='Changed during image generation';c.listeners.input();finish('data:image/png;base64,QkJC');await pending;assert.equal(c.result,null);assert.equal(c.node('[type=submit]').disabled,false);c.dispose();
  const d=setup('OWNER_D',()=>new Promise(r=>finish=r));const stale=d.submit();d.dispose();renderLaunchConfigurator(config,{owner:'OWNER_E'});finish('data:image/png;base64,QkJC');await stale;assert.equal(d.result,null);
  const guest=setup(null);await guest.submit();assert.equal(guest.connected,1);assert.match(renderLaunchConfigurator(config,{owner:'OWNER_F'}),/Coin A/);guest.dispose();assert.doesNotMatch(renderLaunchConfigurator(config,{owner:null}),/value="Coin A"/);
 }finally{clearConfiguredCoin();globalThis.FormData=NativeFormData;globalThis.FileReader=NativeReader;}
});

