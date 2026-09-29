import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';

export const SOL_MINT='So11111111111111111111111111111111111111112';
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const reject=code=>{throw Object.assign(Error(code),{code,status:409});};
export function integer(value,{zero=false}={}){
 if(typeof value!=='string'||!(/^(0|[1-9][0-9]*)$/).test(value)||BigInt(value)>18446744073709551615n||(!zero&&value==='0'))reject('INVALID_INTEGER_AMOUNT');
 return BigInt(value);
}
export function signedInteger(value){if(typeof value!=='string'||!(/^-?(0|[1-9][0-9]*)$/).test(value)||value==='-0'||BigInt(value)>18446744073709551615n||BigInt(value)<-18446744073709551615n)reject('INVALID_SIGNED_AMOUNT');return BigInt(value);}
const address=value=>{try{if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw Error();return value;}catch{reject('INVALID_ADDRESS');}};
// Canonical wallet/owner/config come only from the authenticated server context.
export function canonicalIntent(body,context,now=Date.now(),lifetimeMs=30000){
 if(!body||Object.keys(body).some(k=>!['direction','inputMint','outputMint','inputAmount','slippageBps','requestKey'].includes(k)))reject('UNEXPECTED_INTENT_FIELD');
 const {direction,inputMint,outputMint,inputAmount,slippageBps,requestKey}=body;
 if(!['BUY','SELL'].includes(direction)||!context?.agentId||!context.owner||!context.agentWallet)reject('INVALID_INTENT');
 address(inputMint);address(outputMint);address(context.owner);address(context.agentWallet);
 if(inputMint===outputMint||(direction==='BUY'?inputMint!==SOL_MINT||outputMint===SOL_MINT:outputMint!==SOL_MINT||inputMint===SOL_MINT))reject('UNSUPPORTED_PAIR');
 integer(inputAmount);
 if(!Number.isSafeInteger(slippageBps)||slippageBps<0||slippageBps>100)reject('SLIPPAGE_LIMIT');
 if(typeof requestKey!=='string'||requestKey.length<16||requestKey.length>100)reject('INVALID_IDEMPOTENCY_KEY');
 const intent={mode:'CONTROLLED_REAL',network:'solana:mainnet',version:1,agentId:context.agentId,owner:context.owner,agentWallet:context.agentWallet,direction,inputMint,outputMint,inputAmount,slippageBps,configReference:context.configReference??'controlled-policy-v1'};
 return {intent:{...intent,createdAt:now,expiresAt:now+lifetimeMs},fingerprint:digest(intent),requestKey};
}

export const DEFAULT_RISK_POLICY=Object.freeze({version:'controlled-policy-v1',maxSlippageBps:100,minReserveLamports:'2000000',futureSellFeeLamports:'10000',reconciliationMarginLamports:'10000',maxNetworkFeeLamports:'10000',maxBuyLamports:'1000000',maxSnapshotAgeMs:10000});
function evaluateRealRisk(intent,snapshot,policy,now,mode){
 if(intent.mode!==mode||intent.network!=='solana:mainnet'||snapshot.network!=='solana:mainnet')reject('WRONG_NETWORK');
 if(!Number.isSafeInteger(intent.expiresAt)||intent.expiresAt<=now||!Number.isFinite(snapshot.observedAt)||snapshot.observedAt>now||now-snapshot.observedAt>policy.maxSnapshotAgeMs)reject('STALE_RISK_SNAPSHOT');
 if(snapshot.agentWallet!==intent.agentWallet||snapshot.inputMint!==intent.inputMint||snapshot.outputMint!==intent.outputMint)reject('RISK_IDENTITY_MISMATCH');
 // Unsupported Token-2022 extensions, transfer fees, frozen and delegated accounts
 // must be rejected by the independent chain adapter, never inferred from a quote.
 if(snapshot.mintsVerified!==true||snapshot.tokenAccountsVerified!==true||snapshot.routeAvailable!==true)reject('TOKEN_ACCOUNT_OR_ROUTE_UNVERIFIED');
 if(!Number.isSafeInteger(intent.slippageBps)||intent.slippageBps<0||intent.slippageBps>policy.maxSlippageBps)reject('SLIPPAGE_LIMIT');
 const amount=integer(intent.inputAmount),balance=integer(snapshot.solBalanceLamports,{zero:true}),fee=integer(snapshot.networkFeeLamports,{zero:true}),rent=integer(snapshot.ataRentLamports,{zero:true});
 if(fee>integer(policy.maxNetworkFeeLamports))reject('FEE_LIMIT');
 if(snapshot.ataExists!==true&&snapshot.ataExists!==false)reject('ATA_STATE_UNKNOWN');
 if(snapshot.ataExists&&rent!==0n||!snapshot.ataExists&&rent===0n)reject('ATA_RENT_MISMATCH');
 const required=integer(policy.minReserveLamports)+integer(policy.futureSellFeeLamports)+integer(policy.reconciliationMarginLamports)+fee+rent+(intent.direction==='BUY'?amount:0n);
 if(intent.direction==='BUY'&&amount>integer(policy.maxBuyLamports))reject('TRADE_LIMIT');
 if(intent.direction==='SELL'&&integer(snapshot.inputTokenBalance,{zero:true})<amount)reject('INSUFFICIENT_TOKEN_BALANCE');
 if(balance<required)reject('SOL_RESERVE_VIOLATION');
 return Object.freeze({allowed:true,reference:digest({intent,snapshot,policy}),intentHash:digest(intent),policyVersion:policy.version,checkedAt:now,expiresAt:Math.min(intent.expiresAt,now+policy.maxSnapshotAgeMs),snapshot:structuredClone(snapshot),reserveAfterLamports:(balance-fee-rent-(intent.direction==='BUY'?amount:0n)).toString()});
}
export function evaluateControlledRisk(intent,snapshot,policy=DEFAULT_RISK_POLICY,now=Date.now()){return evaluateRealRisk(intent,snapshot,policy,now,'CONTROLLED_REAL');}
export function evaluateAutonomousRisk(intent,snapshot,policy=DEFAULT_RISK_POLICY,now=Date.now()){return evaluateRealRisk(intent,snapshot,policy,now,'LIVE_AUTONOMOUS');}
export function evaluateAcceptanceRisk(intent,snapshot,policy=DEFAULT_RISK_POLICY,now=Date.now()){return evaluateRealRisk(intent,snapshot,policy,now,'AUTONOMOUS_ACCEPTANCE_TEST');}
