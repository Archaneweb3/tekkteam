import {publicWalletOrigin} from './wallet-mobile.js';
export function canRegisterMobileWallet({href,userAgent,secure}){
 return !!secure&&!!publicWalletOrigin(href)&&/Android/i.test(userAgent)&&/Chrome\//i.test(userAgent)&&!/; wv\)|Phantom|Solflare|Backpack|TrustWallet|MetaMask/i.test(userAgent);
}
// A single Wallet Standard transport feeds the existing connection/auth state.
// Do not expose SDK transaction or automatic sign-in methods in this milestone.
export function messageOnlyMobileWallet(wallet){
 const allowed=['standard:connect','standard:disconnect','standard:events','solana:signMessage'];
 const projected=new WeakMap(),originals=new WeakMap();
 const accounts=values=>(values||[]).filter(a=>a.chains?.includes('solana:mainnet')).map(a=>{if(!projected.has(a)){const safe=Object.freeze({...a,chains:Object.freeze(['solana:mainnet']),features:Object.freeze((a.features||[]).filter(f=>f==='solana:signMessage'))});projected.set(a,safe);originals.set(safe,a);}return projected.get(a);});
 const features=source=>Object.fromEntries(allowed.filter(key=>source[key]).map(key=>{
  const feature=source[key];
  if(key==='standard:connect')return [key,{version:feature.version,connect:async options=>{const result=await feature.connect(options);return {accounts:accounts(result.accounts)};}}];
  if(key==='standard:events')return [key,{version:feature.version,on:(event,listener)=>feature.on(event,change=>listener({...change,...(change.accounts?{accounts:accounts(change.accounts)}:{}),...(change.features?{features:features(change.features)}:{})}))}];
  if(key==='solana:signMessage')return [key,{version:feature.version,signMessage:(...inputs)=>feature.signMessage(...inputs.map(input=>{const account=originals.get(input.account);if(!account||!wallet.accounts.includes(account))throw Error('Mobile wallet account changed. Reconnect before signing in.');return {...input,account};}))}];
  return [key,{version:feature.version,disconnect:()=>feature.disconnect()}];
 }));
 return {get version(){return wallet.version;},get name(){return wallet.name;},get icon(){return wallet.icon;},get chains(){return wallet.chains.filter(c=>c==='solana:mainnet');},get accounts(){return accounts(wallet.accounts);},get features(){return features(wallet.features);}};
}
