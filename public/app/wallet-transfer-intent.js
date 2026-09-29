// An attempted prepare binds one key to one canonical intent, not to a form.
export function createTransferIntentKeys(newKey=()=>crypto.randomUUID()){
 let current=null;
 return {
  begin(){current=null;},
  forPrepare({kind,agentId,source,destination,lamports,network}){
   if(!['FUND','WITHDRAW'].includes(kind)||![agentId,source,destination,network].every(v=>typeof v==='string'&&v.length)||!Number.isSafeInteger(lamports)||lamports<=0)throw Error('Invalid transfer intent');
   const fingerprint=JSON.stringify([kind,agentId,source,destination,lamports,network]);
   if(!current||current.fingerprint!==fingerprint)current=Object.freeze({fingerprint,key:newKey()});
   return current.key;
  }
 };
}
