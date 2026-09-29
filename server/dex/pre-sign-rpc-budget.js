import {AsyncLocalStorage} from 'node:async_hooks';

const scopes=new AsyncLocalStorage();
const readers=new WeakMap();
const METHODS=new Set(['getGenesisHash','getAccountInfoAndContext','getMultipleAccountsInfoAndContext','getMinimumBalanceForRentExemption','getLatestBlockhashAndContext','getSlot']);
export const PRE_SIGN_RPC_BUDGET=Object.freeze({maxConcurrency:1,minRequestGapMs:120});

const identity=value=>{
 if(Array.isArray(value))return value.map(identity);
 if(value&&typeof value.toBase58==='function')return value.toBase58();
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,identity(value[k])]));
 return value;
};

// The ordinary web3 transport hides response headers in its 429 error. Keep
// only Retry-After in the active pre-sign read scope; never retain a URL/body.
export async function observeRpcFetch(info,init){
 const response=await fetch(info,init);
 const scope=scopes.getStore();
 if(scope&&response.status===429){
  const raw=response.headers.get('retry-after');
  if(raw){const seconds=Number(raw),delay=Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now();if(Number.isFinite(delay)&&delay>=0)scope.retryAfterMs=Math.ceil(delay);}
 }
 return response;
}

export function preSignRpcReader(connection){
 let state=readers.get(connection);
 if(state)return state.reader;
 let tail=Promise.resolve(),lastStart=0;
 const inFlight=new Map();
 const reader=new Proxy(connection,{get(target,prop){
  const value=Reflect.get(target,prop,target);
  if(!METHODS.has(prop)||typeof value!=='function')return typeof value==='function'?value.bind(target):value;
  return (...args)=>{
   const key=JSON.stringify([prop,identity(args)]);
   if(inFlight.has(key))return inFlight.get(key);
   const run=async()=>{
    const gap=PRE_SIGN_RPC_BUDGET.minRequestGapMs-(Date.now()-lastStart);
    if(gap>0)await new Promise(resolve=>setTimeout(resolve,gap));
    lastStart=Date.now();
    return value.apply(target,args);
   };
   const request=tail.then(run,run);
   tail=request.catch(()=>{});
   inFlight.set(key,request);
   request.finally(()=>{if(inFlight.get(key)===request)inFlight.delete(key);}).catch(()=>{});
   return request;
  };
 }});
 state={reader};readers.set(connection,state);return reader;
}

export function withPreSignRpcScope(fn){const scope={retryAfterMs:null};return scopes.run(scope,async()=>{try{return await fn();}catch(error){if(scope.retryAfterMs!==null)error.retryAfterMs=scope.retryAfterMs;throw error;}});}
export function retryAfterFrom(error){
 const headers=error?.response?.headers??error?.headers;
 const raw=typeof headers?.get==='function'?headers.get('retry-after'):headers?.['retry-after'];
 const seconds=Number(raw),headerDelay=raw?(Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now()):null;
 const explicit=error?.retryAfterMs;
 return Number.isFinite(explicit)&&explicit>=0?explicit:Number.isFinite(headerDelay)&&headerDelay>=0?Math.ceil(headerDelay):null;
}
export function isRateLimited(error){return error?.status===429||error?.code===429||/\b429\b|rate.limit|too many requests/i.test(String(error?.message??''));}
