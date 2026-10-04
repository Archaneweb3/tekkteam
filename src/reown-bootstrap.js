import bs58 from 'bs58';
import {registerWallet} from '@wallet-standard/wallet';
import {createReownWallet,reownProjectConfigured,SOLANA_CAIP} from '../public/app/reown-wallet.js';

import {createReownTransport} from '../public/app/reown-transport.js';

const projectId=import.meta.env.VITE_REOWN_PROJECT_ID;
const configured=reownProjectConfigured(projectId);
let status=configured?'configured':'unconfigured',initializing;
async function load(){
 if(initializing)return initializing;
 initializing=(async()=>{
  const [{createAppKit},{UniversalProvider},{solana}]=await Promise.all([import('@reown/appkit/core'),import('@walletconnect/universal-provider'),import('@reown/appkit/networks')]);
  const metadata={name:'TEKKTEAM',description:'TEKKTEAM Solana wallet connection',url:location.origin,icons:[location.origin+'/favicon.png']};
  const provider=await UniversalProvider.init({projectId,metadata,logger:'silent',disableProviderPing:true,customStoragePrefix:'tekkteam-wallet-m2'});
  // AppKit's reconnect-disabled startup also disconnects empty adapters.
  const disconnect=provider.disconnect.bind(provider);
  provider.disconnect=()=>provider.session?disconnect():Promise.resolve();
  const modal=createAppKit({projectId,metadata,networks:[solana],defaultNetwork:solana,universalProvider:provider,manualWCControl:true,enableReconnect:false,enableInjected:false,enableEIP6963:false,enableCoinbase:false,enableNetworkSwitch:false,universalProviderConfigOverride:{methods:{solana:['solana_signMessage']},chains:{solana:[SOLANA_CAIP]},events:{solana:['accountsChanged','chainChanged']}},allWallets:'SHOW',themeMode:'dark',themeVariables:{'--w3m-accent':'#ffd447','--w3m-color-mix':'#10294f','--w3m-color-mix-strength':30},features:{analytics:false,email:false,socials:[],swaps:false,onramp:false,send:false,history:false,reownAuthentication:false,connectMethodsOrder:['wallet']}});
  await modal.ready();
  status='initialized';
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  return createReownTransport({provider,modal,mobile});
 })().catch(()=>{status='initialization-failed';initializing=null;throw Error('Wallet discovery could not initialize. Check the Reown project origin and connection.');});
 return initializing;
}
if(configured){const bridge=createReownWallet({load,codec:bs58});registerWallet(bridge.wallet);window.TekkworkReown=Object.freeze({configured:true,get status(){return status;},prepareConnection:bridge.prepareConnection});}
else window.TekkworkReown=Object.freeze({configured:false,get status(){return status;}});
