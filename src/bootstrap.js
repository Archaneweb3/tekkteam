import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { publicConfig } from '../server/config.js';
// Static client presentations must never pretend a local API is publicly hosted.
if (import.meta.env.PROD) window.TekkworkDemo = {
  config: { ...publicConfig('demo'), preview:true, backendOnline:false, capabilities:{walletAuth:false,persistentAgents:false,devnetMint:false,pumpfun:false,autonomousTrading:false} },
  session:null, agents:[], events:[], coins:[], feed:[], tokens:[], bonded:[],
  stats:{agentsTotal:0,agentsActive:0,drafts:0,testLaunches:0,trades24h:0,aumSol:0,pnlSol:0,feesClaimedSol:0},
};
window.Buffer = Buffer;
window.TekkworkSDK = { Transaction, bs58, Buffer };
const workspaceScript = document.createElement('script');
workspaceScript.type = 'module';
workspaceScript.src = '/app/workspace.js';
document.body.appendChild(workspaceScript);
