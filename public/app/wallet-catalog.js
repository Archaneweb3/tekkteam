// Shortcuts are presentation metadata, never proof of a connected/supported wallet.
export const walletShortcuts = [
 ['Phantom','https://phantom.com/download'],
 ['Solflare','https://www.solflare.com/download/'],
 ['Backpack','https://backpack.app/'],
 ['MetaMask','https://metamask.io/download/'],
 ['Trust Wallet','https://trustwallet.com/download'],
 ['Jupiter Mobile','https://jup.ag/mobile'],
 ['Espresso Cash','https://www.espressocash.com/'],
];
export function walletName(name){
 const aliases={'phantom':'Phantom','solflare':'Solflare','backpack':'Backpack','metamask':'MetaMask','trust':'Trust Wallet','trust wallet':'Trust Wallet','jupiter':'Jupiter Mobile','jupiter mobile':'Jupiter Mobile','espresso cash':'Espresso Cash'};
 return aliases[String(name).toLowerCase()]||name;
}
export function walletGroup(name){return ['Phantom','Solflare','Backpack'].includes(name)?'Recommended':walletShortcuts.some(([n])=>n===name)?'Other popular wallets':'Detected Solana wallets';}

// Trust's documented Solana provider exposes toBytes(), unlike Phantom's toBase58().
// This stable transport wrapper adds no auth state, auto-connect or transaction API.
const trustAdapters=new WeakMap();
export function injectedWallet(name,win){
 if(name==='Phantom')return win.phantom?.solana?.isPhantom===true?win.phantom.solana:null;
 if(name==='Solflare')return win.solflare?.isSolflare===true?win.solflare:null;
 if(name!=='Trust Wallet')return null;
 const raw=win.trustwallet?.solana;
 if(!raw?.isTrust)return null;
 if(trustAdapters.has(raw))return trustAdapters.get(raw);
 const key=value=>value?{toBase58:()=>{const bytes=value.toBytes();if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw Error('Invalid Solana public key');return win.TekkworkSDK.bs58.encode(bytes);}}:null;
 const listeners=new Map();
 const adapter={
  get publicKey(){return key(raw.publicKey);},get isConnected(){return raw.isConnected;},get icon(){return raw.icon;},
  get connect(){return typeof raw.connect==='function'?async()=>{await raw.connect();return {publicKey:key(raw.publicKey)};}:undefined;},
  get disconnect(){return typeof raw.disconnect==='function'?()=>raw.disconnect():undefined;},
  get signMessage(){return typeof raw.signMessage==='function'?bytes=>raw.signMessage(bytes):undefined;},
  on(event,fn){const wrapped=event==='accountChanged'?value=>fn(key(value)):fn;let map=listeners.get(event);if(!map)listeners.set(event,map=new Map());map.set(fn,wrapped);raw.on?.(event,wrapped);},
  removeListener(event,fn){const map=listeners.get(event),wrapped=map?.get(fn);if(wrapped){(raw.removeListener||raw.off)?.call(raw,event,wrapped);map.delete(fn);}},
 };
 trustAdapters.set(raw,adapter);return adapter;
}
