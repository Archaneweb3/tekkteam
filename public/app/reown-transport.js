import {reownNamespaces,restrictReownRequests} from './reown-wallet.js';

export function createReownTransport({provider,modal,mobile=false}){
 restrictReownRequests(provider);
 const rawConnect=provider.connect.bind(provider);
 let connecting,attempt=0,active=null;
 const retire=async session=>{if(!session)return;if(provider.session?.topic===session.topic)await provider.disconnect();else await provider.client.disconnect({topic:session.topic,reason:{code:6000,message:'Cancelled wallet connection'}});};
 // SDK Retry must share the same proposal and cancellation boundary.
 provider.connect=()=>{
  const context=active;
  if(!context||context.version!==attempt)return Promise.reject(Object.assign(Error('Wallet connection cancelled.'),{code:4001}));
  if(!context.pairing)context.pairing=rawConnect({namespaces:reownNamespaces(),optionalNamespaces:{}}).then(async session=>{if(context.version!==attempt){await retire(session);throw Object.assign(Error('Wallet connection cancelled.'),{code:4001});}return session;});
  return context.pairing;
 };
 const disconnect=async()=>{++attempt;provider.abortPairingAttempt();await modal.close();if(provider.session)await provider.disconnect();};
 const connect=async()=>{
  if(connecting)return connecting;
  connecting=(async()=>{
   if(provider.session)return provider.session;
   const version=++attempt;active={version,pairing:null};let opened=false,done=false,stop=()=>{},timer;
   const cancelled=new Promise((_,reject)=>{const cancel=error=>{if(version===attempt)++attempt;provider.abortPairingAttempt();reject(error);};stop=modal.subscribeState(state=>{if(state.open)opened=true;else if(opened&&!done&&!provider.session)cancel(Object.assign(Error('Wallet connection cancelled.'),{code:4001}));});timer=setTimeout(()=>cancel(Error('Wallet connection timed out. Retry More Wallets.')),180000);});
   try{await modal.open({view:'AllWallets',namespace:'solana'});return await Promise.race([provider.connect(),cancelled]);}
   catch(error){if(version===attempt)++attempt;throw error;}
   finally{done=true;active=null;clearTimeout(timer);stop();await modal.close();}
  })().finally(()=>{connecting=null;});return connecting;
 };
 return {provider,connect,disconnect};
}
