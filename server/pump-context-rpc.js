// Same finalized context and exact bytes on bounded retries; no downgrade/rebuild.
export async function readAtMinimumContext(transport,method,params,{pause=()=>new Promise(resolve=>setTimeout(resolve,750)),onRetry=()=>{}}={}){
 for(let attempt=0;;attempt++)try{return await transport.rpc(method,params);}catch(error){
  const options=params?.[['getLatestBlockhash','getBlockHeight'].includes(method)?0:1],slot=options?.minContextSlot;
  if(error.rpcCode!==-32016||!['getMultipleAccounts','simulateTransaction','getFeeForMessage','isBlockhashValid','getLatestBlockhash','getBlockHeight'].includes(method)||options?.commitment!=='finalized'||!Number.isSafeInteger(slot)||slot<0||attempt>=3)throw error;
  onRetry({method,rpcCode:error.rpcCode,minContextSlot:slot,attempt:attempt+1});await pause();
 }
}
