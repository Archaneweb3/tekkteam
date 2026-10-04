import {LocalSolanaMobileWalletAdapterWallet,createDefaultAuthorizationCache} from '@solana-mobile/wallet-standard-mobile';
import {registerWallet} from '@wallet-standard/wallet';
import {canRegisterMobileWallet,messageOnlyMobileWallet} from '../public/app/wallet-mwa-policy.js';

// Register only; no connect, sign-in, network request or wallet launch on page load.
if(canRegisterMobileWallet({href:location.href,userAgent:navigator.userAgent,secure:window.isSecureContext})){
 const wallet=new LocalSolanaMobileWalletAdapterWallet({
  appIdentity:{name:'TEKKTEAM',uri:location.origin,icon:'favicon.png'},
  authorizationCache:createDefaultAuthorizationCache(),
  chains:['solana:mainnet'],chainSelector:{select:async()=> 'solana:mainnet'},
  onWalletNotFound:async()=>{throw Error('No compatible Android wallet found. Install a Mobile Wallet Adapter wallet, then retry.');},
 });
 registerWallet(messageOnlyMobileWallet(wallet));
}
