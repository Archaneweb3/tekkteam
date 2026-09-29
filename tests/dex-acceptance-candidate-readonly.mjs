// Independent, read-only on-chain candidate proof. Not an execution allowlist.
import 'dotenv/config';
import {PublicKey} from '@solana/web3.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {CPMM,inspectCpmmSnapshot,quoteCpmm} from '../server/dex/concrete-cpmm-proof.js';
import {SOL_MINT} from '../server/dex/intent.js';

if(process.env.FUNDING_ENABLED==='true'||process.env.WITHDRAWAL_ENABLED==='true'||process.env.LIVE_AUTONOMOUS_ENABLED==='true'||process.env.CONTROLLED_REAL_ENABLED==='true'||process.env.AUTONOMOUS_KILL_SWITCH==='false'||process.env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('READ_ONLY_FLAGS_REQUIRED');
const pool=process.argv[2];if(!pool)throw Error('POOL_REQUIRED');
const net=createRealMoneyNetwork();await net.verify();
const connection=net.connection, poolKey=new PublicKey(pool);
const first=await connection.getAccountInfoAndContext(poolKey,'confirmed'), fetchedAt=Date.now();
if(!first.value||!first.value.owner.equals(CPMM)||first.value.data.length!==637)throw Error('NOT_CLASSIC_CPMM_POOL');
const b=first.value.data;
const referenced=Array.from({length:10},(_,i)=>new PublicKey(b.subarray(8+i*32,40+i*32)).toBase58());
const addresses=[...new Set([pool,CPMM.toBase58(),...referenced])];
const dependent=await connection.getMultipleAccountsInfoAndContext(addresses.map(x=>new PublicKey(x)),{commitment:'confirmed',minContextSlot:first.context.slot});
const observedAt=Date.now();
if(dependent.value.length!==addresses.length||dependent.context.slot<first.context.slot||!dependent.value[0]?.data.equals(b)||observedAt-fetchedAt>10000)throw Error('STALE_OR_CHANGED_CANDIDATE_SNAPSHOT');
const accounts=addresses.map((address,i)=>({address,owner:dependent.value[i]?.owner.toBase58()??null,length:dependent.value[i]?.data.length??null,data:dependent.value[i]?.data.toString('base64')??null}));
const s=inspectCpmmSnapshot({genesis:await connection.getGenesisHash(),observedAt:new Date(observedAt).toISOString(),accounts},pool);
const direction=s.mint0===SOL_MINT?0:s.mint1===SOL_MINT?1:-1;
if(direction<0)throw Error('NOT_WSOL_PAIR');
const q=quoteCpmm(s,direction,100000n,100);
console.log(JSON.stringify({pool,mint0:s.mint0,mint1:s.mint1,outputMint:s['mint'+(1-direction)],tokenProgram:s['program'+(1-direction)],poolOwner:CPMM.toBase58(),poolSlot:first.context.slot,dependentSlot:dependent.context.slot,minContextSlot:first.context.slot,snapshotAgeMs:observedAt-fetchedAt,accountCount:addresses.length,observedAt:new Date(observedAt).toISOString(),reserveWsol:s.reserves[direction].toString(),reserveOutput:s.reserves[1-direction].toString(),inputLamports:'100000',estimatedOutputRaw:q.output.toString(),minimumOutputRaw:q.minimumOutput.toString(),slippageBps:100},null,2));
