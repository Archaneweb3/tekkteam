// WalletConnect transport only. Owner authentication and balances stay in backend.js.
export const SOLANA_CAIP='solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export function reownProjectConfigured(value){return typeof value==='string'&&/^[a-f0-9]{32}$/i.test(value);}
export function reownNamespaces(){return {solana:{chains:[SOLANA_CAIP],methods:['solana_signMessage'],events:['accountsChanged','chainChanged']}};}
export function restrictReownRequests(provider){
 const request=provider.request.bind(provider);
 provider.request=(args,chain)=>{if(args?.method!=='solana_signMessage'||chain!==SOLANA_CAIP)throw Error('Only Solana authentication messages are enabled.');return request(args,chain);};
 return provider;
}
export function createReownWallet({load,codec}){
 let transport,pending,accounts=[],topic=null,revision=0;const listeners=new Set();
 const emit=()=>listeners.forEach(fn=>fn({accounts}));
 const clear=()=>{++revision;accounts=[];topic=null;emit();};
 const parse=session=>{
  if(!session||!Number.isFinite(session.expiry)||session.expiry*1000<=Date.now()||typeof session.topic!=='string')throw Error('WalletConnect session expired. Connect again.');
  if(Object.keys(session.namespaces||{}).some(key=>key!=='solana'))throw Error('Only a Solana Mainnet wallet session is accepted.');
  const ns=session.namespaces?.solana;
  if(!ns?.methods?.includes('solana_signMessage')||ns.methods.some(method=>method!=='solana_signMessage')||!ns.accounts?.length)throw Error('Wallet must approve Solana message authentication only.');
  if(ns.chains?.some(chain=>chain!==SOLANA_CAIP))throw Error('Only Solana Mainnet is supported.');
  return ns.accounts.map(value=>{
   if(typeof value!=='string'||!value.startsWith(SOLANA_CAIP+':'))throw Error('Only Solana Mainnet accounts are accepted.');
   const address=value.slice(SOLANA_CAIP.length+1);let publicKey;try{publicKey=codec.decode(address);}catch{throw Error('Invalid Solana wallet address.');}
   if(address.startsWith('0x')||publicKey.length!==32)throw Error('Invalid Solana wallet address.');
   return Object.freeze({address,publicKey,chains:Object.freeze(['solana:mainnet']),features:Object.freeze(['solana:signMessage'])});
  });
 };
 const reconcile=()=>{if(!accounts.length)return;try{const next=parse(transport.provider.session);if(transport.provider.session.topic!==topic||next.length!==accounts.length||next.some((a,i)=>a.address!==accounts[i].address))clear();}catch{clear();}};
 const initialize=async()=>{
  if(transport)return transport;
  transport=await load();
  for(const event of ['disconnect','session_delete','session_expire'])transport.provider.on(event,clear);
  transport.provider.on('session_update',reconcile);
  transport.provider.on('accountsChanged',values=>{if(accounts.length&&(!Array.isArray(values)||values.length!==accounts.length||values.some((v,i)=>v!==accounts[i].address&&v!==SOLANA_CAIP+':'+accounts[i].address)))clear();else reconcile();});
  transport.provider.on('chainChanged',chain=>{if(chain!==SOLANA_CAIP&&chain!==SOLANA_CAIP.split(':')[1])clear();else reconcile();});
  return transport;
 };
 const connect=async()=>{
  reconcile();if(accounts.length)return {accounts};if(pending)return pending;
  const version=++revision;
  pending=(async()=>{
   const t=await initialize();const session=await t.connect();
   if(version!==revision){await t.disconnect();throw Error('Wallet connection cancelled.');}
   let next;try{next=parse(session);}catch(error){await t.disconnect().catch(()=>{});throw error;}
   accounts=next;topic=session.topic;emit();return {accounts};
  })().finally(()=>{pending=null;});return pending;
 };
 const wallet={version:'1.0.0',name:'WalletConnect',icon:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE4IiByeD0iMyIgZmlsbD0iIzE3Mzg2MSIgc3Ryb2tlPSIjZmZkNDQ3Ii8+PGNpcmNsZSBjeD0iMjIiIGN5PSIxNyIgcj0iMiIgZmlsbD0iI2ZmZDQ0NyIvPjwvc3ZnPg==',chains:['solana:mainnet'],get accounts(){reconcile();return accounts;},features:{
  'standard:connect':{version:'1.0.0',connect},
  'standard:disconnect':{version:'1.0.0',disconnect:async()=>{clear();await transport?.disconnect();}},
  'standard:events':{version:'1.0.0',on:(event,fn)=>{if(event!=='change')throw Error('Unsupported wallet event');listeners.add(fn);return ()=>listeners.delete(fn);}},
  'solana:signMessage':{version:'1.0.0',signMessage:async(...inputs)=>{
   if(inputs.length!==1)throw Error('One authentication message at a time.');reconcile();
   const input=inputs[0],account=accounts.find(a=>a===input.account);
   if(!account||!(input.message instanceof Uint8Array)||!input.message.length)throw Error('Wallet account changed. Sign in again.');
   const version=revision;
   const result=await transport.provider.request({method:'solana_signMessage',params:{pubkey:account.address,message:codec.encode(input.message)}},SOLANA_CAIP);
   reconcile();if(version!==revision||!accounts.includes(account))throw Error('Wallet account changed during authentication.');
   const signature=codec.decode(result.signature);if(signature.length!==64)throw Error('Invalid wallet message signature.');
   return [{signature,signedMessage:input.message}];
  }}
 }};
 return {wallet,prepareConnection:connect,get initialized(){return !!transport;}};
}
