// Browser public-address state only; all chooser/menu presentation remains in
// the established workspace and wallet-balance components. Never authenticates.
export function createPreviewConnection({getProvider,validateAddress,onChange=()=>{}}) {
 let address=null,provider=null,providerId,revision=0,remove=()=>{};
 const validate=value=>{if(!validateAddress(value))throw Error('Wallet did not provide a valid Solana address.');return value;};
 const solana=accounts=>accounts?.find(a=>a.chains?.includes('solana:mainnet'));
 const current=selected=>selected?.standard?solana(selected.standard.accounts)?.address:(selected?.injected??selected)?.publicKey?.toBase58?.();
 const same=(a,b)=>!!a&&!!b&&(a.standard||a.injected||a)===(b.standard||b.injected||b);
 const clear=(notify=true)=>{remove();remove=()=>{};provider=null;providerId=undefined;address=null;if(notify)onChange(null);};
 const reconcile=selected=>{if(!provider)return;try{if(!same(provider,selected)||validate(current(selected))!==address)throw Error('Retired binding');}catch{++revision;clear();}};
 return {
  get address(){if(provider)reconcile(getProvider(providerId));return address;},
  get presentation(){if(provider)reconcile(getProvider(providerId));return address?{address,name:provider.name||'Wallet',icon:provider.icon||provider.standard?.icon||provider.injected?.icon||null}:null;},
  isConnectedTo(id,owner){if(provider)reconcile(getProvider(providerId));return providerId===id&&address===owner&&same(provider,getProvider(id));},
  available:id=>{const selected=getProvider(id);return typeof (selected?.standard?.features['standard:connect']?.connect||(selected?.injected??selected)?.connect)==='function';},
  async connect(id){
   const selected=getProvider(id);reconcile(selected);const injected=selected?.injected??selected;
   const action=selected?.standard?.features['standard:connect']?.connect;
   if(selected?.standard?typeof action!=='function':typeof injected?.connect!=='function')throw Object.assign(Error('Wallet is no longer available. Reopen the connection dialog.'),{walletAuthCode:'SOLANA_ACCOUNT_UNAVAILABLE',walletAuthStage:'PROVIDER_CONNECT'});
   const version=++revision;let result;
   try{result=selected.standard?await selected.standard.features['standard:connect'].connect():await injected.connect();}catch(error){if(version!==revision)return null;reconcile(getProvider(id));throw Object.assign(Error(error?.code===4001||/reject|cancel/i.test(error?.message||'')?'Connection cancelled. You can retry.':"Couldn't connect wallet. You can retry."),{walletAuthCode:error?.code===4001||/reject|cancel/i.test(error?.message||'')?'WALLET_CONNECTION_REJECTED':'WALLET_CONNECTION_FAILED',walletAuthStage:'PROVIDER_CONNECT'});}
   if(version!==revision)return null;reconcile(getProvider(id));
   if(!same(getProvider(id),selected))throw Error('Wallet provider changed. Reopen the connection dialog.');
   const value=validate(selected.standard?solana(result?.accounts)?.address:(result?.publicKey??injected.publicKey)?.toBase58?.());
   if(validate(current(selected))!==value)throw Error('Wallet account changed. Reopen the connection dialog.');
   clear(false);provider=selected;providerId=id;address=value;
   const changed=value=>{if(provider!==selected)return;++revision;try{const next=selected.standard?solana(value)?.address:value?.toBase58?.();if(!same(getProvider(id),selected)||validate(current(selected))!==validate(next))throw Error('Account changed');address=next;onChange(address);}catch{clear();}};
   const disconnected=()=>{if(provider===selected){++revision;clear();}};
   if(selected.standard?.features['standard:events']){const off=selected.standard.features['standard:events'].on('change',event=>{if(event.accounts)changed(event.accounts);});remove=()=>off?.();}
   else if(injected.on){injected.on('accountChanged',changed);injected.on('disconnect',disconnected);remove=()=>{injected.removeListener?.('accountChanged',changed);injected.removeListener?.('disconnect',disconnected);};}
   onChange(address);return address;
  },
  async disconnect(){const selected=provider;++revision;clear();if(selected?.standard)await selected.standard.features['standard:disconnect']?.disconnect?.();else await (selected?.injected??selected)?.disconnect?.();}
 };
}
