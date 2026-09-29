// Mainnet read-only proof: no reservation, signer, sender, or DB write.
import 'dotenv/config';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {loadFreshCpmmPolicy,buildVerifiedCpmmFromPolicy,simulateUnsignedCpmm} from '../server/dex/cpmm-mainnet-state.js';
import {SOL_MINT,evaluateAutonomousRisk,DEFAULT_RISK_POLICY} from '../server/dex/intent.js';

const TOKEN='Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk';
const POOL='Q2sPHPdUWFMg7M7wwrQKLrn619cAucfRsmhVJffodSp';
if(process.env.FUNDING_ENABLED==='true'||process.env.WITHDRAWAL_ENABLED==='true'||process.env.LIVE_AUTONOMOUS_ENABLED==='true'||process.env.CONTROLLED_REAL_ENABLED==='true'||process.env.AUTONOMOUS_KILL_SWITCH==='false'||process.env.REAL_MONEY_EMERGENCY_STOP==='false')throw Error('READ_ONLY_FLAGS_REQUIRED');
const db=new DatabaseSync(resolve(process.env.DATA_DIR||'server/data/mainnet-safety','tekkwork.sqlite'),{readOnly:true});
const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get('0f406135-35ea-437d-a27c-29052d279c3b')?.address;db.close();
if(!wallet)throw Error('AGENT_WALLET_UNAVAILABLE');
const network=createRealMoneyNetwork();await network.verify();
const now=Date.now(),intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:'0f406135-35ea-437d-a27c-29052d279c3b',agentWallet:wallet,direction:'BUY',inputMint:SOL_MINT,outputMint:TOKEN,inputAmount:'100000',slippageBps:100,pool:POOL,createdAt:now,expiresAt:now+30000};
const result=await loadFreshCpmmPolicy(network.connection,intent,{deferBuild:true});
const c=result.context,p=result.policy;
const riskSnapshot={network:'solana:mainnet',agentWallet:wallet,inputMint:SOL_MINT,outputMint:TOKEN,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.agentBalanceLamports,networkFeeLamports:p.networkFeeCapLamports,ataRentLamports:c.rentCost.toString(),ataExists:c.rentCost===0n,inputTokenBalance:'0',observedAt:Date.now()};
let risk,build,simulation;
try{risk=evaluateAutonomousRisk(intent,riskSnapshot,DEFAULT_RISK_POLICY,Date.now());}catch(e){risk={allowed:false,reason:e.code??'RISK_REJECTED'};}
try{build=buildVerifiedCpmmFromPolicy(result);simulation=await simulateUnsignedCpmm(network.connection,build);}catch(e){build={error:e.code??'BUILD_OR_SIMULATION_FAILED'};}
// Synthetic post-BUY token holding: explicitly never asserted to exist on-chain.
const raw=Buffer.alloc(165);new PublicKey(TOKEN).toBuffer().copy(raw,0);new PublicKey(wallet).toBuffer().copy(raw,32);raw.writeBigUInt64LE(c.q.output,64);raw[108]=1;
const sellIntent={...intent,direction:'SELL',inputMint:TOKEN,outputMint:SOL_MINT,inputAmount:c.q.output.toString()};
const sellPolicy={...p,intent:sellIntent,agentBalanceLamports:(BigInt(p.agentBalanceLamports)-100000n-c.rentCost-BigInt(p.networkFeeCapLamports)).toString(),agentAccounts:p.agentAccounts.map((a,i)=>i===1?{...a,info:{owner:TOKEN_PROGRAM_ID.toBase58(),executable:false,lamports:Number(p.rentLamports),data:raw.toString('base64')}}:a)};
let sell;
try{const {buildCpmmEnvelope,cpmmEnvelopeContext}=await import('../server/dex/cpmm-envelope.js');const {validateDexTransaction}=await import('../server/dex/transaction-validator.js');const sellContext=cpmmEnvelopeContext(sellPolicy),tx=buildCpmmEnvelope(sellPolicy),v=validateDexTransaction(tx,sellPolicy);let sellRisk;try{sellRisk=evaluateAutonomousRisk(sellIntent,{...riskSnapshot,inputMint:TOKEN,outputMint:SOL_MINT,solBalanceLamports:sellPolicy.agentBalanceLamports,ataRentLamports:sellContext.rentCost.toString(),ataExists:sellContext.rentCost===0n,inputTokenBalance:sellIntent.inputAmount,observedAt:Date.now()},DEFAULT_RISK_POLICY,Date.now());}catch(e){sellRisk={allowed:false,reason:e.code??'RISK_REJECTED'};}sell={status:v.status,unexplainedWritableAccounts:v.unexplainedWritableAccounts,risk:sellRisk.allowed?'PASS':sellRisk.reason,requiredRentLamports:sellContext.rentCost.toString(),expectedOutputLamports:sellContext.q.output.toString()};}catch(e){sell={status:'REJECTED',reason:e.code??'SELL_ENVELOPE_FAILED'};}
console.log(JSON.stringify({pool:POOL,mint:TOKEN,snapshot:result.snapshotDiagnostic,agentBalanceLamports:p.agentBalanceLamports,buyQuoteRaw:c.q.output.toString(),buyMinimumRaw:c.q.minimumOutput.toString(),capitalRentLamports:c.rentCost.toString(),risk:{allowed:risk.allowed,reason:risk.reason??null,reserveAfterLamports:risk.reserveAfterLamports??null},buyValidator:build.validation?.status??build.error??null,buyUnexplainedWritable:build.validation?.unexplainedWritableAccounts??null,buySimulation:simulation??null,syntheticSell:sell},null,2));
