import {MintLayout,NATIVE_MINT} from '@solana/spl-token';
import {decodedPumpState} from './pump-account-decoder.js';
import {pumpSdk,swapSdk,BN,rejectPump} from './pump-sdk-boundary.js';

const u64=(1n<<64n)-1n;
function quantity(value){
 if(typeof value!=='string'||! /^[1-9][0-9]{0,19}$/.test(value))rejectPump('PUMP_QUOTE_AMOUNT_INVALID');
 const amount=BigInt(value);if(amount>u64)rejectPump('PUMP_QUOTE_AMOUNT_INVALID');return amount;
}

// Offline estimates only: BUY is a spendable budget, not proof of exact debit.
export function quotePumpVenue({venue,intent,now=Date.now()}={}){
 const state=decodedPumpState(venue),{context}=state;
 if(intent?.agentId!==venue.agentId||intent.owner!==venue.owner||intent.network!=='solana:101'||!['BUY','SELL'].includes(intent.side))rejectPump('PUMP_QUOTE_INTENT_INVALID');
 const buying=intent.side==='BUY',inputMint=buying?venue.quoteMint:venue.mint,outputMint=buying?venue.mint:venue.quoteMint;
 if(intent.inputMint!==inputMint||intent.outputMint!==outputMint)rejectPump('PUMP_QUOTE_MINT_RESTRICTED');
 if(!Number.isSafeInteger(intent.slippageBps)||intent.slippageBps<0||intent.slippageBps>100)rejectPump('PUMP_QUOTE_SLIPPAGE_INVALID');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(context.observedAt)||context.observedAt>now||now-context.observedAt>30000||!Number.isSafeInteger(intent.expiresAt)||intent.expiresAt<=now||intent.expiresAt>context.observedAt+30000)rejectPump('PUMP_QUOTE_EXPIRED');
 const amount=quantity(intent.inputAmount),bn=new BN(amount.toString());let output,debit=amount;
 if(!buying&&amount>state.minted.supply)rejectPump('PUMP_QUOTE_SELL_SUPPLY_EXCEEDED');
 try{
  if(venue.kind==='PUMP_BONDING_CURVE'){
   if(!buying){const gross=amount*BigInt(state.curve.virtualQuoteReserves.toString())/(BigInt(state.curve.virtualTokenReserves.toString())+amount);if(gross>BigInt(state.curve.realQuoteReserves.toString()))rejectPump('PUMP_QUOTE_REAL_RESERVE_INSUFFICIENT');}
   const params={global:state.global,feeConfig:state.feeConfig,mintSupply:new BN(state.minted.supply.toString()),bondingCurve:state.curve,amount:bn,quoteMint:NATIVE_MINT};
   output=(buying?pumpSdk.getBuyTokenAmountFromSolAmount(params):pumpSdk.getSellSolAmountFromTokenAmount(params));
   if(buying&&!output.isZero())debit=BigInt(pumpSdk.getBuySolAmountFromTokenAmount({...params,amount:output}).toString());
  }else if(venue.kind==='PUMPSWAP'){
   const params={slippage:0,baseReserve:new BN(state.baseVault.amount.toString()),quoteReserve:new BN(state.quoteVault.amount.toString()),virtualQuoteReserves:state.pool.virtualQuoteReserves,globalConfig:state.global,baseMintAccount:MintLayout.decode(state.copied.mint.info.data),baseMint:state.mint,coinCreator:state.pool.coinCreator,creator:state.pool.creator,feeConfig:state.feeConfig,quoteMint:NATIVE_MINT,isMayhemMode:false,creatorFeeBps:state.pool.creatorFeeBps};
   output=buying?swapSdk.buyQuoteInput({...params,quote:bn}).base:swapSdk.sellBaseInput({...params,base:bn}).uiQuote;
   if(buying&&!output.isZero())debit=BigInt(swapSdk.buyBaseInput({...params,base:output}).uiQuote.toString());
  }else rejectPump('PUMP_QUOTE_VENUE_UNQUALIFIED');
 }catch(error){if(error.code)throw error;rejectPump('PUMP_QUOTE_MATH_REJECTED');}
 const estimated=BigInt(output.toString()),minimum=estimated*BigInt(10000-intent.slippageBps)/10000n;
 if(estimated<=0n||estimated>u64||minimum<=0n)rejectPump('PUMP_QUOTE_OUTPUT_INVALID');
 if(debit<=0n||debit>amount)rejectPump('PUMP_QUOTE_BUDGET_ROUNDING_UNQUALIFIED');
 return Object.freeze({schema:'PUMP_OFFLINE_QUOTE_V1',venue:venue.kind,proofHash:venue.proofHash,agentId:venue.agentId,side:intent.side,inputMint,outputMint,inputAmount:amount.toString(),estimatedDebit:debit.toString(),estimatedUnspentBudget:(amount-debit).toString(),estimatedOutput:estimated.toString(),minimumOutput:minimum.toString(),slippageBps:intent.slippageBps,expiresAt:intent.expiresAt,provenance:'DERIVED',source:venue.source,inputSemantics:buying?'SPENDABLE_BUDGET':'EXACT_TOKEN_INPUT',actualDebitVerified:false,executable:false,authorizationGranted:false});
}
