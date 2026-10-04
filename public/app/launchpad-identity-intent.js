// Same-tab reload recovery for off-chain identity creation only. No credentials.
export function createIdentityIntentJournal(owner,storage=globalThis.sessionStorage){
 const key='tekkteam:identity-intent:v1:'+owner;
 const invalid=()=>{throw Error('Identity recovery data is unavailable. Restore this tab storage before creating another identity.');};
 const validate=value=>{
  if(!value||value.version!==1||value.owner!==owner||!['PENDING','ACKNOWLEDGED'].includes(value.state)||value.state==='ACKNOWLEDGED'&&(typeof value.agentId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.agentId))||typeof value.key!=='string'||!/^[\x21-\x7e]{8,100}$/.test(value.key)||!value.input||Array.isArray(value.input)||Object.keys(value.input).some(k=>!['name','description','character','strategy'].includes(k))||Object.values(value.input).some(v=>typeof v!=='string'||v.length>300)||typeof value.input.name!=='string'||value.input.name.trim().length<2||value.input.name.trim().length>40)invalid();
  return value;
 };
 const read=()=>{try{if(!owner||!storage)invalid();const raw=storage.getItem(key);return raw===null?null:validate(JSON.parse(raw));}catch{invalid();}};
 return {
  read,
  write(intent){try{const next=validate({version:1,owner,state:'PENDING',key:intent.key,input:structuredClone(intent.input)}),old=read();if(old&&(old.key!==next.key||JSON.stringify(old.input)!==JSON.stringify(next.input)))invalid();const value=old??next;storage.setItem(key,JSON.stringify(value));if(JSON.stringify(read())!==JSON.stringify(value))invalid();return value;}catch{invalid();}},
  acknowledge(intentKey,agentId){try{const old=read();if(old?.key!==intentKey||old.state==='ACKNOWLEDGED'&&old.agentId!==agentId)invalid();const value=validate({...old,state:'ACKNOWLEDGED',agentId});storage.setItem(key,JSON.stringify(value));if(JSON.stringify(read())!==JSON.stringify(value))invalid();}catch{invalid();}},
  clear(intentKey){try{const old=read();if(old===null)return;if(old.key!==intentKey)invalid();storage.removeItem(key);if(read()!==null)invalid();}catch{invalid();}}
 };
}
