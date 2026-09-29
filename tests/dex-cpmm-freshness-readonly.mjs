// Explicit read-only Mainnet diagnostic; never constructs or sends a transaction.
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {loadFreshCpmmPolicy,CONTROLLED_CPMM_POOL,CONTROLLED_USDC_MINT} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT} from '../server/dex/intent.js';

if(process.env.FUNDING_ENABLED==='true'||process.env.WITHDRAWAL_ENABLED==='true'||process.env.LIVE_TRADING_ENABLED==='true'||process.env.LIVE_AUTONOMOUS_ENABLED==='true'||process.env.CONTROLLED_REAL_ENABLED==='true'||process.env.AUTONOMOUS_KILL_SWITCH==='false'||process.env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('READ_ONLY_FLAGS_REQUIRED');
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'server/data/mainnet-safety','tekkwork.sqlite'),{readOnly:true});
const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get('0f406135-35ea-437d-a27c-29052d279c3b')?.address;db.close();
if(!wallet)throw Error('AGENT_WALLET_UNAVAILABLE');
const realMoney=createRealMoneyNetwork();await realMoney.verify();
const intent={network:'solana:mainnet',direction:'BUY',agentWallet:wallet,inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100,pool:CONTROLLED_CPMM_POOL};
const count=Number(process.argv[2]??10);if(!Number.isInteger(count)||count<1||count>10)throw Error('INVALID_CHECK_COUNT');
const outcomes=[];
for(let i=0;i<count;i++){
 try{const result=await loadFreshCpmmPolicy(realMoney.connection,intent,{deferBuild:true});outcomes.push({check:i+1,status:'PASS',...result.snapshotDiagnostic});}
 catch(e){const message=String(e.message),cause=String(e.cause?.code??'');outcomes.push({check:i+1,status:'FAIL',code:e.code??(message.match(/^[A-Z_]+$/)?.[0]??(/429|too many requests|rate.limit/i.test(message)?'RPC_RATE_LIMITED':/timeout|timed out|ETIMEDOUT/i.test(message+cause)?'RPC_TIMEOUT':/ECONNRESET|fetch failed|ECONNREFUSED/i.test(message+cause)?'RPC_TRANSPORT_FAILURE':'RPC_FAILURE')),...e.snapshotDiagnostic});}
 if(i<count-1)await new Promise(done=>setTimeout(done,1100));
}
console.log(JSON.stringify({checks:count,passes:outcomes.filter(x=>x.status==='PASS').length,outcomes},null,2));
