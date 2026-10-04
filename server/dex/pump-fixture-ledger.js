import {randomUUID} from 'node:crypto';
import {digest,integer,reject} from './intent.js';
import {createRealBalanceReservations} from '../real-balance-reservations.js';

// Separate hypothetical tables; the shared wallet mutex prevents competing holds.
// No production receipt, position, history or signing capability is written.
export function createPumpFixtureLedger(db){
 const holds=createRealBalanceReservations(db);
 db.exec(`CREATE TABLE IF NOT EXISTS pump_fixture_executions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,request_key TEXT NOT NULL,agent_id TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(owner,request_key));
 CREATE TABLE IF NOT EXISTS pump_fixture_positions(agent_id TEXT NOT NULL,mint TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(agent_id,mint));`);
 const atomic=fn=>holds.atomic(fn);
 const get=id=>{const row=db.prepare('SELECT data FROM pump_fixture_executions WHERE id=?').get(id);return row?JSON.parse(row.data):null;};
 const put=r=>{db.prepare('UPDATE pump_fixture_executions SET data=? WHERE id=?').run(JSON.stringify(r),r.id);return r;};
 const position=(agentId,mint)=>{const row=db.prepare('SELECT data FROM pump_fixture_positions WHERE agent_id=? AND mint=?').get(agentId,mint);return row?JSON.parse(row.data):null;};
 return {get,position,reservation:id=>holds.get('pump-fixture:'+id),
  prepare({intent,quote,venueKind,executionWallet,wallet,networkFeeLamports,requestKey}){return atomic(()=>{
   if(quote.source!=='LOCAL_FIXTURE'||!['PUMP_BONDING_CURVE','PUMPSWAP'].includes(venueKind)||typeof requestKey!=='string'||requestKey.length<16||requestKey.length>100)reject('PUMP_LOCAL_CONTRACT_INVALID');
   const fingerprint=digest({intent,quote,venueKind,executionWallet,networkFeeLamports});
   const old=db.prepare('SELECT data FROM pump_fixture_executions WHERE owner=? AND request_key=?').get(intent.owner,requestKey);
   if(old){const r=JSON.parse(old.data);if(r.fingerprint!==fingerprint)reject('PUMP_LOCAL_IDEMPOTENCY_CONFLICT');return r;}
   const buy=intent.side==='BUY',swap=venueKind==='PUMPSWAP',amount=integer(intent.inputAmount),fee=integer(networkFeeLamports,{zero:true});
   if(fee>10000n)reject('PUMP_LOCAL_FEE_CAP');
   if(!buy&&integer(wallet.baseBalance,{zero:true})<amount||buy&&swap&&integer(wallet.wsolBalance,{zero:true})<amount)reject('PUMP_LOCAL_INPUT_BALANCE');
   const nativeHold=fee+(buy&&!swap?amount:0n),inputAsset=buy?(swap?'WSOL':'NATIVE_SOL'):intent.inputMint;
   const r={id:randomUUID(),status:'PREPARED_LOCAL',source:'LOCAL_FIXTURE',provenance:'DERIVED',intent:structuredClone(intent),quote:structuredClone(quote),venueKind,executionWallet,requestKey,fingerprint,networkFeeLamports,inputAsset,inputHold:amount.toString(),nativeHold:nativeHold.toString(),notReceipt:true,notSigned:true,notBroadcast:true};
   holds.reserve({operationId:'pump-fixture:'+r.id,intentHash:fingerprint,status:'PREPARED',kind:'PUMP_LOCAL_FIXTURE',resources:[{wallet:executionWallet,lamports:nativeHold.toString(),balanceLamports:wallet.solBalance,protectedLamports:'2020000'}]});
   db.prepare('INSERT INTO pump_fixture_executions VALUES(?,?,?,?,?)').run(r.id,intent.owner,requestKey,intent.agentId,JSON.stringify(r));return r;
  });},
  markPending(id){return atomic(()=>{const r=get(id);if(r?.status!=='PREPARED_LOCAL')reject('PUMP_LOCAL_STATE_CONFLICT');const h=holds.get('pump-fixture:'+id);holds.reserve({...h,status:'UNKNOWN'});return put({...r,status:'PENDING_LOCAL',reason:'SYNTHETIC_PENDING_NO_BROADCAST'});});},
  recover(id){const r=get(id);if(!r)reject('PUMP_LOCAL_NOT_FOUND');return {record:r,reservation:holds.get('pump-fixture:'+id),actualReceipt:null,realPosition:null,realPnl:null,notBroadcast:true};},
  cancel(id){return atomic(()=>{const r=get(id);if(r?.status!=='PREPARED_LOCAL')reject('PUMP_LOCAL_PENDING_REQUIRES_RESOLUTION');holds.finish('pump-fixture:'+id,'CANCELLED');return put({...r,status:'CANCELLED_LOCAL'});});},
  applyHypothetical(id,effects){return atomic(()=>{
   const r=get(id);if(r?.status!=='PREPARED_LOCAL')reject('PUMP_LOCAL_STATE_CONFLICT');
   if(effects?.source!=='LOCAL_FIXTURE'||effects.notReceipt!==true||effects.finalityVerified!==false||effects.actualReceiptVerified!==false||effects.affectedRoleLayoutsQualified!==true||effects.messageAndIndexBound!==true)reject('PUMP_LOCAL_EFFECTS_UNQUALIFIED');
   const debit=integer(effects.fixtureInputDebit),output=integer(effects.fixtureOutputCredit),budget=integer(r.inputHold),fee=integer(r.networkFeeLamports,{zero:true}),buy=r.intent.side==='BUY',swap=r.venueKind==='PUMPSWAP';
   if(buy?debit>budget:debit!==budget)reject('PUMP_LOCAL_DEBIT_MISMATCH');
   if(output<integer(r.quote.minimumOutput)||effects.networkFeeLamports!==r.networkFeeLamports||effects.unspentBudget!==(budget-debit).toString())reject('PUMP_LOCAL_ECONOMICS_MISMATCH');
   const baseDelta=buy?output:-debit,quoteDelta=buy?-debit:output,nativeDelta=swap?-fee:quoteDelta-fee;
   if(effects.solDelta!==nativeDelta.toString()||effects.baseDelta!==baseDelta.toString()||effects.wsolDelta!==(swap?quoteDelta:0n).toString())reject('PUMP_LOCAL_ASSET_DELTA_MISMATCH');
   const mint=buy?r.intent.outputMint:r.intent.inputMint,quoteAsset=swap?'WSOL':'NATIVE_SOL';
   const p=position(r.intent.agentId,mint)??{agentId:r.intent.agentId,mint,source:'LOCAL_FIXTURE',provenance:'DERIVED',quantity:'0',quoteAsset,costBasisQuoteRaw:'0',realizedQuotePnlRaw:'0',nativeFeesLamports:'0',unrealizedPnl:null,notRealPosition:true};
   // Both canonical quotes use nine-decimal native-backed units; this is an
   // explicitly hypothetical reporting unit, never a conversion/reservation.
   if(!['NATIVE_SOL','WSOL','MIXED_SOL_WSOL'].includes(p.quoteAsset))reject('PUMP_LOCAL_BASIS_ASSET_INVALID');
   const origins=new Set(p.quoteAssetsObserved??[p.quoteAsset]);origins.add(quoteAsset);
   Object.assign(p,{quoteAssetsObserved:[...origins].sort(),quoteAsset:origins.size>1?'MIXED_SOL_WSOL':quoteAsset,lastQuoteAsset:quoteAsset,costBasisUnit:'SOL_EQUIVALENT_LAMPORTS',basisUnitProvenance:'DERIVED_NATIVE_SOL_WSOL_1_TO_1_RAW_UNITS',nativeFeesExcludedFromQuotePnl:true});
   if(buy){p.quantity=(BigInt(p.quantity)+output).toString();p.costBasisQuoteRaw=(BigInt(p.costBasisQuoteRaw)+debit).toString();}
   else{const quantity=BigInt(p.quantity);if(quantity<debit)reject('PUMP_LOCAL_UNTRACKED_POSITION');const basis=debit===quantity?BigInt(p.costBasisQuoteRaw):BigInt(p.costBasisQuoteRaw)*debit/quantity;p.quantity=(quantity-debit).toString();p.costBasisQuoteRaw=(BigInt(p.costBasisQuoteRaw)-basis).toString();p.realizedQuotePnlRaw=(BigInt(p.realizedQuotePnlRaw)+output-basis).toString();}
   p.nativeFeesLamports=(BigInt(p.nativeFeesLamports)+fee).toString();
   db.prepare('INSERT INTO pump_fixture_positions VALUES(?,?,?) ON CONFLICT(agent_id,mint) DO UPDATE SET data=excluded.data').run(p.agentId,p.mint,JSON.stringify(p));
   holds.finish('pump-fixture:'+id,'CONFIRMED',{provenTerminal:true,source:'LOCAL_FIXTURE',notReceipt:true});
   return put({...r,status:'APPLIED_HYPOTHETICAL',fixtureEffects:structuredClone(effects),releasedInputAsset:r.inputAsset,releasedUnspentInput:(budget-debit).toString(),actualReceipt:null});
  });}
 };
}
