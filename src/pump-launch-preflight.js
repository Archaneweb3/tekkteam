import {parseInitialBuy} from './initial-buy.js';

// The exact Pump CPI/rent debit is only known after the existing Mainnet
// simulation. This preflight rejects only the balance failure we can prove.
export function launchBalancePreflight(initialBuy, balanceLamports){
 const buyLamports=parseInitialBuy(initialBuy);
 const known=Number.isSafeInteger(balanceLamports)&&balanceLamports>=0;
 return {
  buyLamports,
  availableLamports:known?balanceLamports:null,
  minimumKnownLamports:buyLamports,
  exactRequiredLamports:null,
  insufficient:known&&buyLamports>0&&balanceLamports<=buyLamports,
  capacityUnknown:known&&balanceLamports>buyLamports,
 };
}

export function launchProductError(error){
 if(error?.code===4001)return {title:'WALLET REQUEST REJECTED',message:'Nothing was signed or sent.'};
 if(error?.code==='BALANCE_UNAVAILABLE')return {title:'BALANCE UNAVAILABLE',message:'Could not verify your Owner Wallet balance on Solana Mainnet. Refresh balance before preparing.'};
 if(error?.code==='LAUNCH_SERVICE_UNAVAILABLE')return {title:'LAUNCH SERVICE UNAVAILABLE',message:'The launch service is offline. No transaction was sent. Refresh launch status when it is back.'};
 if(error?.code==='RPC_RATE_LIMIT')return {title:'RPC TEMPORARILY BUSY',message:'No transaction was sent. Wait a moment and try again.'};
 if(error?.code==='LAUNCH_STATE_CONFLICT')return {title:'CHECK LAUNCH STATUS',message:'A previous launch preparation may already exist. Check status before preparing again.'};
 if(error?.code==='WALLET_NOT_CONNECTED')return {title:'CONNECT YOUR WALLET',message:'Connect the Owner Wallet in Phantom before preparing.'};
 if(error?.code==='INSUFFICIENT_LAUNCH_BALANCE'||/Insufficient Mainnet SOL for initial buy and launch costs|INSUFFICIENT_MAINNET_BALANCE/i.test(String(error?.message??'')))return {title:'NOT ENOUGH SOL',message:"Your wallet doesn't have enough SOL for the initial buy and launch costs. Reduce the initial buy or add SOL to your wallet."};
 return {title:'PREPARATION FAILED',message:"We couldn't prepare this launch. Check launch status before trying again."};
}

// Public diagnostic envelope only: never copy raw responses, RPC URLs, stacks,
// transactions, account records, or arbitrary nested server fields.
export function launchDiagnostics(error){
 const source=error?.attempt,report={};
 const label=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(value)?value:undefined;
 for(const key of ['attemptId','status','stage','failureStage','failureCode']){
  const value=label(source?.[key]);if(value!==undefined)report[key]=value;
 }
 const code=label(error?.code);if(code)report.code=code;
 for(const key of ['httpStatus','rpcCode','processExitCode'])if(Number.isSafeInteger(source?.[key]))report[key]=source[key];
 for(const key of ['ownerAuth','mainnet','balance','metadata','build','validation','simulation','prepared'])if(typeof source?.[key]==='boolean')report[key]=source[key];
 if(source?.service&&typeof source.service==='object'){
  const service={};for(const key of ['requestStarted','reachable','responseReceived'])if(typeof source.service[key]==='boolean')service[key]=source.service[key];
  if(Number.isSafeInteger(source.service.httpStatus))service.httpStatus=source.service.httpStatus;
  const classification=label(source.service.responseClassification);if(classification)service.responseClassification=classification;
  if(Object.keys(service).length)report.service=service;
 }
 return report;
}
