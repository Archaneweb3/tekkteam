import {inspectCreation,CAP} from './pump-readiness.js';
import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {Buffer} from 'buffer';
import {FEE_PROGRAM} from './initial-buy.js';

export const POLICY_LABEL='Simulation-verified estimated spending limit';
export function evaluateSimulation(bytes,context,{before,afterRead,simulation,fee}) {
 const structure=inspectCreation(bytes,context), v=simulation.value;
 const reasons=[], warnings=[],initialBuy=structure.initialBuyLamports;
 let payerMovements=0,buyMovements=0;
 const allowedPrograms=new Set([structure.programId,...structure.accounts.filter(a=>['system_program','token_program','associated_token_program','mayhem_program_id','fee_program'].includes(a.name)).map(a=>a.address)]);
 const logs=v.logs??[], invoked=[...new Set(logs.flatMap(l=>{const m=/^Program (\w+) invoke \[\d+\]$/.exec(l);return m?[m[1]]:[];}))];
 if(v.err!==null)reasons.push('SIMULATION_FAILED');
 if(initialBuy&&!logs.includes('Program log: Instruction: BuyExactSolIn'))reasons.push('INITIAL_BUY_SUCCESS_NOT_CONFIRMED');
 if(!logs.includes('Program log: Instruction: CreateV2')||logs.at(-1)!==`Program ${structure.programId} success`)reasons.push('CREATE_V2_SUCCESS_NOT_CONFIRMED');
 if(!logs.length||!invoked.includes(structure.programId)||logs.some(l=>/truncat/i.test(l)))reasons.push('INCOMPLETE_PROGRAM_LOGS');
 if(invoked.some(p=>!allowedPrograms.has(p)))reasons.push('UNEXPECTED_CPI_PROGRAM');
 const accountSet=new Set(structure.accounts.map(a=>a.address));
 for(const group of v.innerInstructions??[])for(const ix of group.instructions){
  if(!ix.programId||!allowedPrograms.has(ix.programId))reasons.push('UNEXPECTED_OR_UNDECODED_INNER_PROGRAM');
  for(const a of ix.accounts??[])if(!accountSet.has(a))reasons.push('UNEXPECTED_INNER_ACCOUNT');
  if(ix.parsed){
   const types={system:['createAccount','transfer'],'spl-associated-token-account':['create','createIdempotent'],'spl-token':['initializeMetadataPointer','initializeMint2','getAccountDataSize','initializeImmutableOwner','initializeAccount3','initializeTokenMetadata','updateTokenMetadataAuthority','mintTo','setAuthority',...(initialBuy?['transferChecked']:[])]};
   if(!types[ix.program]?.includes(ix.parsed.type))reasons.push('UNEXPECTED_CPI_OPERATION');
   for(const value of Object.values(ix.parsed.info??{}))if(typeof value==='string'){
    let address;try{address=new PublicKey(value).toBase58();}catch{}
    if(address&&!accountSet.has(address))reasons.push('UNEXPECTED_PARSED_CPI_ACCOUNT');
   }
   if(ix.program==='system'){
    const info=ix.parsed.info;
    const destination=info.newAccount??info.destination;
    const allowedDestinations=structure.accounts.filter(a=>['mint','bonding_curve','associated_bonding_curve',...(initialBuy?['associated_user','creator_vault','user_volume_accumulator','bonding_curve_v2','fee_recipient','buyback_fee_recipient']:[])].includes(a.name)).map(a=>a.address);
    if(info.source!==structure.accounts[5].address||!allowedDestinations.includes(destination))reasons.push('UNEXPECTED_CPI_SOL_MOVEMENT');
    if(!Number.isSafeInteger(info.lamports)||info.lamports<0)reasons.push('UNKNOWN_CPI_SOL_AMOUNT');else{
     payerMovements+=info.lamports;
     if(initialBuy&&group.index===2&&ix.parsed.type==='transfer'&&structure.accounts.some(a=>['bonding_curve','creator_vault','fee_recipient','buyback_fee_recipient'].includes(a.name)&&a.address===destination))buyMovements+=info.lamports;
    }
   }
   if(ix.parsed.type==='transferChecked'){
    const info=ix.parsed.info,addr=n=>structure.accounts.find(a=>a.name===n)?.address;
    if(info.source!==addr('associated_bonding_curve')||info.destination!==addr('associated_user')||info.mint!==addr('mint')||info.authority!==addr('bonding_curve')||BigInt(info.tokenAmount?.amount??'0')<=0n)reasons.push('UNEXPECTED_TOKEN_MOVEMENT');
   }
  }else{
   let event=false;try{event=ix.programId===structure.programId&&Buffer.from(bs58.decode(ix.data)).subarray(0,8).toString('hex')==='e445a52e51cb9a1d'&&ix.accounts?.length===1&&ix.accounts[0]===structure.accounts[14].address;}catch{}
   let feeQuery=false;try{const d=Buffer.from(bs58.decode(ix.data));feeQuery=initialBuy>0&&ix.programId===FEE_PROGRAM&&['e7257e55cf5b3f34','9aed8a5ca202a2bb'].includes(d.subarray(0,8).toString('hex'))&&ix.accounts?.length===2&&ix.accounts[0]===structure.accounts.find(a=>a.name==='fee_config')?.address&&ix.accounts[1]===structure.programId;}catch{}
   if(!event&&!feeQuery)reasons.push('UNEXPECTED_RAW_CPI');
  }
 }
 if(!Array.isArray(v.innerInstructions))reasons.push('MISSING_INNER_INSTRUCTIONS');
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 // External reads are not atomic simulation prestate. Cross-bank differences
 // are telemetry, not proof that this transaction mutated those accounts.
 const sameBank=before.context.slot===simulation.context.slot&&afterRead.context.slot===simulation.context.slot&&same(before.value,afterRead.value);
 if(!sameBank)warnings.push('PRESTATE_NOT_SAME_BANK');
 const reconciliationFindings=sameBank?reasons:warnings;
 const accounts=structure.accounts.map((a,i)=>({name:a.name,address:a.address,writable:a.writable,pre:before.value[i],post:v.accounts?.[i]??null}));
 if(!Array.isArray(v.accounts)||v.accounts.length!==accounts.length)reasons.push('MISSING_POST_ACCOUNTS');
 let estimated=null;
 if(valid(accounts[5].pre?.lamports)&&valid(accounts[5].post?.lamports))estimated=accounts[5].pre.lamports-accounts[5].post.lamports;
 if(!valid(estimated))reasons.push('UNKNOWN_PAYER_DEBIT');
 if(!valid(fee))reasons.push('UNKNOWN_FEE');
 const effects=accounts.map(a=>({...a,deltaLamports:(a.post?.lamports??0)-(a.pre?.lamports??0),created:!a.pre&&(a.post?.lamports??0)>0}));
 if(effects.some(a=>!a.writable&&!same(a.pre,a.post)))reconciliationFindings.push('READONLY_ACCOUNT_CHANGED');
 if(effects.some(a=>a.name!=='user'&&a.deltaLamports<0))reconciliationFindings.push('UNEXPECTED_NONPAYER_DEBIT');
 const credits=effects.filter(a=>a.name!=='user').reduce((n,a)=>n+a.deltaLamports,0);
 if(estimated!==credits+fee)reconciliationFindings.push('DEBIT_NOT_RECONCILED_WITH_FEE_AND_ACCOUNT_EFFECTS');
 // CAP is now an overhead ceiling, never a limit on the user's exact buy input.
 const overhead=payerMovements-buyMovements+fee,expectedTotal=payerMovements+fee;
 if(initialBuy&&(!valid(buyMovements)||buyMovements>initialBuy||buyMovements===0))reasons.push('INITIAL_BUY_DEBIT_MISMATCH');
 if(!valid(overhead)||BigInt(overhead)>CAP)reasons.push('UNEXPECTED_LAUNCH_OVERHEAD');
 if(valid(estimated)&&estimated>initialBuy+Number(CAP))reasons.push('ESTIMATED_DEBIT_EXCEEDS_LIMIT');
 if(valid(estimated)&&estimated>expectedTotal)reasons.push('UNEXPECTED_EXTRA_PAYER_DEBIT');
 if(!valid(accounts[5].pre?.lamports)||accounts[5].pre.lamports<initialBuy+overhead)reasons.push('INSUFFICIENT_MAINNET_BALANCE');
 return {label:POLICY_LABEL,allowed:reasons.length===0,reasons:[...new Set(reasons)],warnings:[...new Set(warnings)],prestateSameBank:sameBank,thresholdLamports:String(initialBuy+Number(CAP)),validatedOverheadLamports:overhead,estimatedPayerDebitLamports:estimated,baseFeeLamports:fee,priorityFeeLamports:0,initialBuyLamports:initialBuy,payerPreBalance:accounts[5].pre?.lamports??null,payerPostBalance:accounts[5].post?.lamports??null,createdAccountFundingLamports:effects.filter(a=>a.created).reduce((n,a)=>n+a.deltaLamports,0),existingNonpayerNetCreditLamports:effects.filter(a=>!a.created&&a.name!=='user').reduce((n,a)=>n+a.deltaLamports,0),invokedPrograms:invoked,accountEffects:effects,simulationResult:v.err!==null?'FAIL':'PASS',uncertainty:'Estimated debit uses externally read pre-balance and simulated post-balance; cross-bank reconciliation is telemetry, not atomic prestate proof. Not an absolute on-chain cap. Created-account funding is not automatically classified entirely as minimum rent. No signing or broadcasting permission is granted.'};
}
