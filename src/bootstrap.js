import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import {inspectFundingReview} from './wallet-transfer.js';
import '../public/agent-wallet.css';
import '../public/wallet-workspace.css';
import {createElement,LayoutDashboard,Users,Coins,Shapes,BookOpen,Search,Plus,Minus,X,ArrowLeft,Check,Ellipsis,Trash2,ExternalLink,Wallet,Box,ChartNoAxesCombined,Rocket,Crosshair,Copy,RefreshCw,LogOut,LockKeyhole} from 'lucide';
import { publicConfig } from '../server/config.js';
// Static client presentations must never pretend a local API is publicly hosted.
window.TekkworkApiBase=import.meta.env.VITE_API_BASE||'/api';
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
  const {mountPumpLaunch}=await import('./pump-launch-ui.js');
  if(host.isConnected)mountPumpLaunch(host,options);
};
const workspaceScript = document.createElement('script');
workspaceScript.type = 'module';
workspaceScript.src = '/app/workspace.js';
document.body.appendChild(workspaceScript);
