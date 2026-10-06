import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import {inspectFundingReview} from './wallet-transfer.js';
import './wallet-mobile-bootstrap.js';
import './reown-bootstrap.js';
import {createElement,LayoutDashboard,Users,Coins,Shapes,BookOpen,Search,Plus,Minus,X,ArrowLeft,Check,Ellipsis,Trash2,ExternalLink,Wallet,Box,ChartNoAxesCombined,Rocket,Crosshair,Copy,RefreshCw,LogOut,LockKeyhole} from 'lucide';
import { publicConfig } from '../server/config.js';
// Static client presentations must never pretend a local API is publicly hosted.
window.TekkworkApiBase=import.meta.env.VITE_API_BASE||'/api';
Object.defineProperty(window,'TekkworkWalletTestOnly',{value:import.meta.env.VITE_WALLET_TEST_ONLY==='true',writable:false,configurable:false});
if (import.meta.env.PROD && import.meta.env.VITE_BACKEND_ENABLED!=='true') window.TekkworkDemo = {
  config: { ...publicConfig('demo'), preview:true, backendOnline:false, capabilities:{walletAuth:false,persistentAgents:false,devnetMint:false,pumpfun:false,autonomousTrading:false} },
  session:null, agents:[], events:[], coins:[], feed:[], tokens:[], bonded:[],
  stats:{agentsTotal:0,agentsActive:0,drafts:0,testLaunches:0,trades24h:0,aumSol:0,pnlSol:0,feesClaimedSol:0},
};
window.Buffer = Buffer;
const icons={overview:LayoutDashboard,agents:Users,traders:ChartNoAxesCombined,leaderboard:ChartNoAxesCombined,payroll:Users,tokens:Coins,skins:Shapes,how:BookOpen,search:Search,plus:Plus,minus:Minus,close:X,back:ArrowLeft,check:Check,more:Ellipsis,delete:Trash2,external:ExternalLink,wallet:Wallet,box:Box,trade:ChartNoAxesCombined,copy:Copy,refresh:RefreshCw,logout:LogOut,lock:LockKeyhole};
Object.assign(icons,{roleLaunch:Rocket,roleAnalyst:ChartNoAxesCombined,roleTrader:Crosshair});
window.TekkworkIcon=name=>createElement(icons[name]||Box,{class:'tw-icon',width:18,height:18,'stroke-width':1.8,'aria-hidden':'true',focusable:'false'}).outerHTML;
window.TekkworkSDK = { Transaction, bs58, Buffer, inspectFundingReview };
window.mountWorkspacePhone = async host => {
  const {mountWorkspacePhone}=await import('./workspace-phone-model.js');
  return host.isConnected ? mountWorkspacePhone(host) : null;
};
window.mountPumpLaunch = async (host,options) => {
  if(options.getM4Wallet){
    const response=await fetch('/api/runtime-capabilities',{cache:'no-store'});
    if(!response.ok)throw Error('Runtime capabilities unavailable');
    const capability=await response.json();
    if(capability?.mode==='PRODUCT_MAINNET_SAFETY')throw Error('Token launch is not enabled on this runtime.');
    if(capability?.mode==='M4_CONTROLLED_SINGLE_LAUNCH'){
      const {mountM4Launch}=await import('./pump-m4-ui.js');
      if(host.isConnected)mountM4Launch(host,{...options,capability});return;
    }
    if(capability?.mode==='M3_UNSIGNED_PREPARATION')options={...options,preparationOnly:true,getWallet:options.getPreparationWallet};
    else throw Error('Reviewed launch is unavailable on this runtime.');
  }
  const {mountPumpLaunch}=await import('./pump-launch-ui.js');
  if(host.isConnected)mountPumpLaunch(host,options);
};
const workspaceScript = document.createElement('script');
workspaceScript.type = 'module';
// A deployment revision keeps the whole relative module graph on fresh URLs.
// Unversioned modules may remain fresh in mobile/WebView caches after a release.
const appRevision=import.meta.env.VITE_APP_REVISION;
workspaceScript.src = appRevision ? '/app/'+encodeURIComponent(appRevision)+'/workspace.js' : '/app/workspace.js';
document.body.appendChild(workspaceScript);
