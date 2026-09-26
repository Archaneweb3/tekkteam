// Classic bootstrap remains observable even if module evaluation fails.
(()=>{
 const out=document.querySelector('#evidence'),button=document.querySelector('#go');
 const names=['BUTTON_CLICKED','PHANTOM_PROVIDER_DETECTED','WALLET_PUBLIC_KEY','STATIC_VALIDATION_STARTED','STATIC_VALIDATION_PASSED / FAILED','FRESH_MAINNET_BLOCKHASH_RECEIVED','MAINNET_SIMULATION_STARTED','MAINNET_SIMULATION_PASSED / FAILED','SPENDING_GUARD_RESULT'];
 const rows=new Map();
 for(const name of names){const li=document.createElement('li');li.textContent=name+': NOT RUN';document.querySelector('#stages').append(li);rows.set(name,li);}
 function log(stage,detail){const entry={time:new Date().toISOString(),stage,detail};out.textContent+=JSON.stringify(entry,null,2)+'\n';console.info('[pump-preview debug]',entry);const row=rows.get(stage);if(row)row.textContent=stage+': '+(typeof detail==='string'?detail:JSON.stringify(detail));}
 function failure(stage,error){log(stage,{message:error?.message??String(error),stack:error?.stack??'(no stack supplied)',code:error?.code??null});out.classList.add('error');console.error('[pump-preview debug]',error);}
 window.addEventListener('error',event=>failure('UNCAUGHT_ERROR',event.error??new Error(event.message||'Resource failed: '+event.target?.src)),true);
 window.addEventListener('unhandledrejection',event=>failure('UNHANDLED_REJECTION',event.reason));
 let handler=null,moduleFailure=null,used=false;
 button.addEventListener('click',async event=>{
  try{
   log('BUTTON_CLICKED',{trusted:event.isTrusted,disabled:button.disabled,pointerEvents:getComputedStyle(button).pointerEvents});
   if(used){log('EARLY_STOP','Already attempted in this page. No retry or queued request.');return;}
   let stale;try{stale=sessionStorage.getItem('pump-preview-used');}catch(e){failure('SESSION_STORAGE_ERROR',e);}
   log('LEGACY_ATTEMPT_STATE',{value:stale??null,ignoredForReadOnlyDebug:true,reset:false});
   if(moduleFailure)throw moduleFailure;
   if(!handler){log('EARLY_STOP','Module is still loading; no provider request made.');return;}
   used=true;button.disabled=true;
   await handler({log,failure});
  }catch(error){failure('CLICK_HANDLER_FAILED',error);}
  finally{button.disabled=used;log('FLOW_STOPPED','No broadcast or automatic retry. Any returned signed transaction is discarded.');}
 });
 button.dataset.listenerAttached='true';
 document.querySelector('#boot').textContent='Classic script loaded; listener attached. Loading module…';log('CLICK_LISTENER_ATTACHED',true);
 // spl-token evaluates Buffer at module load; install the browser polyfill first.
 import('buffer').then(({Buffer})=>{globalThis.Buffer??=Buffer;log('BUFFER_POLYFILL_READY',true);return import('/src/pump-preview-debug.js');}).then(module=>{
  handler=module.debugClick;if(typeof handler!=='function')throw Error('debugClick export missing');
  document.querySelector('#boot').textContent='Ready: validate, simulate, then ONE Phantom sign-only preview. No broadcast.';log('MODULE_LOADED',true);
 }).catch(error=>{moduleFailure=error;document.querySelector('#boot').textContent='Module load FAILED — see error below. Click listener remains active.';failure('MODULE_IMPORT_FAILED',error);});
})();
