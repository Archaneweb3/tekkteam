import {createHash} from 'node:crypto';
import {VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {GENESIS} from '../../src/pump-readiness.js';
import {digest,integer,SOL_MINT} from './intent.js';
import {pumpSdk,curveProgram,sdkPin,rejectPump} from './pump-sdk-boundary.js';
import {decodedPumpState} from './pump-account-decoder.js';
import {buildOfflinePumpInstruction} from './pump-offline-instruction.js';
import {buildOfflinePumpEnvelope} from './pump-offline-envelope.js';

const pump=pumpSdk.PUMP_PROGRAM_ID.toBase58(),system='11111111111111111111111111111111';
const eventTag=Buffer.from('e445a52e51cb9a1d','hex');
const tradeTag=Buffer.from(pumpSdk.pumpIdl.events.find(e=>e.name==='TradeEvent').discriminator);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=reason=>rejectPump('PUMP_FINALIZED_'+reason);
const amount=value=>{if(typeof value!=='string'||value.length>20)fail('AMOUNT_INVALID');return integer(value,{zero:true});};
const num=value=>{if(!Number.isSafeInteger(value)||value<0)fail('INTEGER_INVALID');return BigInt(value);};
const frozen=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;};

// Derived prepared policy only. No venue activation/finality/RPC/signing authority.
// Persist with the existing immutable plan so historical reconciliation never uses
// current quotes, current fee configuration or an expired approval to rebuild bytes.
export async function createPumpCurveEffectPolicy(input){
 const options={...input,intent:structuredClone(input.intent)},state=decodedPumpState(options.venue);
 if(options.venue.kind!=='PUMP_BONDING_CURVE')fail('VENUE_UNQUALIFIED');
 const built=await buildOfflinePumpInstruction(options),envelope=await buildOfflinePumpEnvelope(options);
 const roles=Object.fromEntries(built.accountRoles.map(r=>[r.role,r.address]));
 const critical=['user','bondingCurve','associatedUser','associatedBondingCurve'];
 if(new Set(critical.map(k=>roles[k])).size!==critical.length||['feeRecipient','creatorVault','remaining1'].some(k=>critical.some(c=>roles[k]===roles[c])))fail('ROLE_ALIAS');
 const value={schema:'PUMP_CURVE_EFFECT_POLICY_V1',sdkPin,source:options.venue.source,
  proofHash:options.venue.proofHash,snapshotSlot:options.venue.slot,
  agentId:options.venue.agentId,owner:options.venue.owner,agentWallet:options.executionWallet,
  network:'solana:101',genesis:GENESIS,mint:options.venue.mint,tokenProgram:options.venue.tokenProgram,
  creator:state.curve.creator.toBase58(),method:built.method,roles,
  accountRoles:built.instruction.keys.map(k=>({address:k.pubkey.toBase58(),roles:built.accountRoles.filter(r=>r.address===k.pubkey.toBase58()).map(r=>r.role),writable:k.isWritable,signer:k.isSigner})),
  intentHash:digest(options.intent),quoteHash:digest(envelope.quote),messageHash:envelope.messageHash,
  unsignedTransaction:envelope.unsignedTransaction,buybackBasisPoints:state.global.buybackBasisPoints?.toString()??null,
  provenance:'DERIVED',venueExecutionQualified:false,authorizationGranted:false};
 return frozen({...value,digest:digest(value)});
}

function transaction(encoded){
 if(typeof encoded!=='string'||encoded.length>1644||Buffer.from(encoded,'base64').toString('base64')!==encoded)fail('TRANSACTION_ENCODING');
 try{const bytes=Buffer.from(encoded,'base64');if(bytes.length>1232)fail('TRANSACTION_SIZE');const tx=VersionedTransaction.deserialize(bytes);if(!Buffer.from(tx.serialize()).equals(bytes))fail('TRANSACTION_NONCANONICAL');return tx;}catch(e){if(e.code)throw e;fail('TRANSACTION_INVALID');}
}
function tokenRows(rows,keys,p){
 if(!Array.isArray(rows)||rows.length!==2)fail('TOKEN_SET_UNQUALIFIED');
 const result=new Map();
 for(const row of rows){
  const i=row?.accountIndex;if(!Number.isSafeInteger(i)||i<0||i>=keys.length||result.has(i))fail('TOKEN_INDEX');
  const role=keys[i]===p.roles.associatedUser?'user':keys[i]===p.roles.associatedBondingCurve?'curve':null;
  if(!role||row.mint!==p.mint||row.programId!==p.tokenProgram||row.owner!==(role==='user'?p.agentWallet:p.roles.bondingCurve)||row.uiTokenAmount?.decimals!==6)fail('TOKEN_BINDING');
  result.set(i,{role,amount:amount(row.uiTokenAmount.amount)});
 }
 return result;
}
function innerInstructions(meta,keys){
 if(!Array.isArray(meta.innerInstructions)||meta.innerInstructions.length!==1||meta.innerInstructions[0]?.index!==0||!Array.isArray(meta.innerInstructions[0].instructions)||meta.innerInstructions[0].instructions.length>64)fail('INNER_INSTRUCTIONS');
 return meta.innerInstructions[0].instructions.map(row=>{
  if(!Number.isSafeInteger(row.programIdIndex)||row.programIdIndex<0||row.programIdIndex>=keys.length||row.stackHeight!==2||!Array.isArray(row.accounts)||row.accounts.some(i=>!Number.isSafeInteger(i)||i<0||i>=keys.length)||typeof row.data!=='string'||row.data.length>1500)fail('CPI_SHAPE');
  let data;try{data=Buffer.from(bs58.decode(row.data));if(bs58.encode(data)!==row.data)throw Error();}catch{fail('CPI_ENCODING');}
  return {program:keys[row.programIdIndex],accounts:row.accounts.map(i=>keys[i]),data};
 });
}
function invocationLogs(logs,inner,error){
 if(!Array.isArray(logs)||!logs.length||logs.length>1000||logs.some(l=>typeof l!=='string'||l.length>4096))fail('LOGS_INVALID');
 const stack=[];let root=0,cpi=0,result;
 for(const line of logs){
  let m=line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/);
  if(m){const depth=Number(m[2]);if(depth!==stack.length+1||depth>2)fail('INVOCATION_DEPTH');if(depth===1){if(++root!==1||m[1]!==pump)fail('INVOCATION_ROOT');}else if(inner[cpi++]?.program!==m[1])fail('INVOCATION_CPI');stack.push(m[1]);continue;}
  m=line.match(/^Program ([1-9A-HJ-NP-Za-km-z]+) (success|failed: .+)$/);
  if(m){if(stack.pop()!==m[1])fail('INVOCATION_CLOSE');if(!stack.length)result=m[2]==='success';continue;}
  if(!stack.length)fail('LOGS_OUTSIDE_INVOCATION');
 }
 if(stack.length||root!==1||cpi!==inner.length||result!==(error===null))fail('INVOCATION_RESULT');
}
function eventFromCpi(inner,p){
 const events=[];
 for(const row of inner.filter(row=>row.program===pump)){
  if(row.accounts.length!==1||row.accounts[0]!==p.roles.eventAuthority||!row.data.subarray(0,8).equals(eventTag)||!row.data.subarray(8,16).equals(tradeTag))fail('EVENT_CPI');
  let event;try{event=pumpSdk.PUMP_SDK.decodeTradeEventBc(row.data.subarray(16));
   // The SDK tolerates truncation/trailing garbage; finality accepts exact pinned bytes only.
   if(!Buffer.from(curveProgram.coder.types.encode('tradeEvent',event)).equals(row.data.subarray(16)))fail('EVENT_LAYOUT');
  }catch(e){if(e.code)throw e;fail('EVENT_DECODE');}events.push(event);
 }
 if(events.length!==1)fail('EVENT_COUNT');return events[0];
}
function validateCpi(inner,p,buy,sol,tokens,fees){
 let transfers=0;const native=new Map(),feeProgram=pumpSdk.getPumpFeeProgram(null);
 const add=(from,to,n)=>{const key=from+'>'+to;native.set(key,(native.get(key)??0n)+n);};
 for(const row of inner){
  const a=row.accounts,d=row.data;
  if(row.program===pump)continue;
  if(row.program===p.tokenProgram){
   const checked=d[0]===12,transfer=d[0]===3;
   const expected=buy?[p.roles.associatedBondingCurve,p.roles.associatedUser,p.roles.bondingCurve]:[p.roles.associatedUser,p.roles.associatedBondingCurve,p.agentWallet];
   if(checked?d.length!==10||d[9]!==6||a.length!==4||a[0]!==expected[0]||a[1]!==p.mint||a[2]!==expected[1]||a[3]!==expected[2]:!transfer||d.length!==9||a.length!==3||a.some((k,i)=>k!==expected[i]))fail('TOKEN_CPI_UNQUALIFIED');
   if(d.readBigUInt64LE(1)!==tokens||++transfers!==1)fail('TOKEN_CPI_AMOUNT');
  }else if(row.program===system){
   if(d.length!==12||d.readUInt32LE(0)!==2||a.length!==2)fail('ACCOUNT_PROVISIONING_UNQUALIFIED');
   const from=buy?p.agentWallet:p.roles.bondingCurve,allowed=buy?[p.roles.bondingCurve,p.roles.feeRecipient,p.roles.creatorVault]:[p.agentWallet,p.roles.feeRecipient,p.roles.creatorVault];
   if(a[0]!==from||!allowed.includes(a[1]))fail('NATIVE_CPI_UNQUALIFIED');add(a[0],a[1],d.readBigUInt64LE(4));
  }else if(row.program===p.roles.feeProgram){
   let decoded;try{decoded=feeProgram.coder.instruction.decode(d);}catch{fail('FEE_CPI_UNQUALIFIED');}
   if(decoded?.name!=='getFees'||!Buffer.from(feeProgram.coder.instruction.encode(decoded.name,decoded.data)).equals(d)||a.length!==2||a[0]!==p.roles.feeConfig||a[1]!==pump)fail('FEE_CPI_UNQUALIFIED');
  }else fail('PROGRAM_CPI_UNQUALIFIED');
 }
 if(transfers!==1)fail('TOKEN_CPI_MISSING');
 const expected=new Map();const from=buy?p.agentWallet:p.roles.bondingCurve;
 for(const [to,n]of [[buy?p.roles.bondingCurve:p.agentWallet,buy?sol:sol-fees.protocol-fees.creator],[p.roles.feeRecipient,fees.protocol],[p.roles.creatorVault,fees.creator]]){const key=from+'>'+to;expected.set(key,(expected.get(key)??0n)+n);}
 // BUY transfers require System CPI. SELL may mutate its program-owned lamports directly.
 if(buy){for(const [key,n]of expected)if((native.get(key)??0n)!==n)fail('NATIVE_CPI_AMOUNT');}
 for(const [key,n]of native)if(n!==(expected.get(key)??0n))fail('NATIVE_CPI_AMOUNT');
}

// Pure default-off adapter hook. Caller owns trusted finalized RPC read + runtime
// qualification. LOCAL_FIXTURE remains LOCAL_FIXTURE; this function has no I/O.
// Initial qualified subset: curve, existing accounts, no rent/refund, no sharing,
// cashback/rewards/buyback. Nonzero buyback split semantics require separate proof.
export function verifyFinalizedPumpCurveEffects(record,observation){
 const r=structuredClone(record),o=structuredClone(observation),p=r.plan?.effectPolicy;
 if(r.planDigest!==digest(r.plan)||r.fingerprint!==digest(r.intent))fail('PERSISTED_PLAN_INTEGRITY');
 if(!p||p.schema!=='PUMP_CURVE_EFFECT_POLICY_V1')fail('POLICY_REQUIRED');
 const {digest:policyDigest,...policy}=p;
 if(digest(policy)!==policyDigest||digest(p.sdkPin)!==digest(sdkPin)||p.intentHash!==digest(r.intent)||p.quoteHash!==digest(r.plan.quote)||p.messageHash!==r.plan.messageHash||p.proofHash!==r.plan.proofHash||p.snapshotSlot!==r.plan.snapshotSlot||p.unsignedTransaction!==r.plan.unsignedTransaction)fail('POLICY_BINDING');
 const source=r.source==='LOCAL_FIXTURE'?'LOCAL_FIXTURE':r.source==='ON_CHAIN'?'BACKEND_RPC_READ':null;
 if(!source||p.source!==source||o.source!==r.source||r.plan.source!==r.source||r.plan.venueKind!=='PUMP_BONDING_CURVE'||p.network!=='solana:101'||p.genesis!==GENESIS||r.intent.network!==p.network||r.intent.genesis!==p.genesis||p.owner!==r.intent.owner||p.agentId!==r.intent.agentId||p.agentWallet!==r.intent.agentWallet)fail('SOURCE_OR_OWNER_BINDING');
 if(o.finalized!==true||o.network!==p.network||o.genesis!==p.genesis||o.signature!==r.signature||!Number.isSafeInteger(o.slot)||o.slot<p.snapshotSlot||!Object.hasOwn(o,'error')||o.error!==null&&(typeof o.error!=='object'||Array.isArray(o.error)||!Object.keys(o.error).length))fail('FINALITY_BINDING');
 const tx=transaction(o.transaction),unsigned=transaction(p.unsignedTransaction),m=tx.message;
 if(m.version!==0||m.addressTableLookups.length||m.compiledInstructions.length!==1||m.header.numRequiredSignatures!==1||tx.signatures.length!==1||unsigned.signatures.some(s=>s.some(n=>n!==0))||!Buffer.from(m.serialize()).equals(Buffer.from(unsigned.message.serialize()))||hash(m.serialize())!==p.messageHash||m.staticAccountKeys[0].toBase58()!==p.agentWallet||bs58.encode(tx.signatures[0])!==r.signature||!nacl.sign.detached.verify(m.serialize(),tx.signatures[0],m.staticAccountKeys[0].toBytes()))fail('SIGNED_MESSAGE');
 const keys=m.staticAccountKeys.map(k=>k.toBase58()),ix=m.compiledInstructions[0];
 if(keys[ix.programIdIndex]!==pump||ix.accountKeyIndexes.length!==p.accountRoles.length||p.accountRoles.some((row,i)=>keys[ix.accountKeyIndexes[i]]!==row.address)||new Set(keys).size!==keys.length)fail('MESSAGE_ROLES');
 const buy=r.intent.side==='BUY';
 if(!['BUY','SELL'].includes(r.intent.side)||p.method!==(buy?'buyExactSolIn':'sell')||(buy?r.intent.inputMint:r.intent.outputMint)!==SOL_MINT||(buy?r.intent.outputMint:r.intent.inputMint)!==p.mint)fail('TRADE_BINDING');
 const meta=o.meta;
 if(!meta||digest(meta.err)!==digest(o.error)||meta.loadedAddresses&&((meta.loadedAddresses.writable?.length??0)||(meta.loadedAddresses.readonly?.length??0)))fail('META_BINDING');
 const fee=num(meta.fee);if(fee>amount(r.plan.feeCapLamports)||amount(r.plan.rentCapLamports)!==0n||amount(r.plan.refundCapLamports)!==0n)fail('FEE_RENT_CAP');
 for(const b of [meta.preBalances,meta.postBalances])if(!Array.isArray(b)||b.length!==keys.length)fail('BALANCES_INVALID');
 const pre=meta.preBalances.map(num),post=meta.postBalances.map(num),delta=post.map((n,i)=>n-pre[i]);
 if(delta.reduce((n,d)=>n+d,0n)!==-fee)fail('NATIVE_CONSERVATION');
 for(let i=0;i<keys.length;i++)if(!m.isAccountWritable(i)&&delta[i]!==0n)fail('READONLY_CHANGE');
 const before=tokenRows(meta.preTokenBalances,keys,p),after=tokenRows(meta.postTokenBalances,keys,p);
 const tokenDelta=new Map();for(const [i,row]of before){const end=after.get(i);if(end?.role!==row.role)fail('TOKEN_SET_CHANGED');if(pre[i]===0n||pre[i]!==post[i])fail('TOKEN_RENT_OR_PROVISIONING');tokenDelta.set(row.role,end.amount-row.amount);}
 if(tokenDelta.get('user')+tokenDelta.get('curve')!==0n)fail('TOKEN_CONSERVATION');
 const expected=new Map(),add=(address,n)=>expected.set(address,(expected.get(address)??0n)+n);
 const base={schema:'PUMP_CURVE_FINALIZED_EFFECTS_V1',source:r.source,policyDigest,
  networkFeeLamports:fee.toString(),rentLamports:'0',wsolDelta:'0',messageHash:p.messageHash,
  venueExecutionQualified:false,authorizationGranted:false};
 if(o.error!==null){
  add(p.agentWallet,-fee);if(tokenDelta.get('user')!==0n||tokenDelta.get('curve')!==0n)fail('FAILED_TOKEN_EFFECTS');
  for(let i=0;i<keys.length;i++)if(delta[i]!==(expected.get(keys[i])??0n))fail('FAILED_NATIVE_EFFECTS');
  return frozen({...base,nativeDelta:(-fee).toString(),tokenDelta:'0',actualInput:'0',actualOutput:'0',grossOutput:'0',venueFees:{protocol:'0',creator:'0',buyback:'0',lp:'0',includedInTrade:true}});
 }
 if(p.buybackBasisPoints!=='0')fail('BUYBACK_SPLIT_UNQUALIFIED');
 for(let i=0;i<keys.length;i++)if(m.isAccountWritable(i)&&pre[i]===0n)fail('ACCOUNT_PROVISIONING_UNQUALIFIED');
 const inner=innerInstructions(meta,keys);invocationLogs(meta.logMessages,inner,o.error);
 const event=eventFromCpi(inner,p),text=k=>event[k]?.toString(),n=k=>amount(text(k));
 if(event.mint.toBase58()!==p.mint||event.user.toBase58()!==p.agentWallet||event.creator.toBase58()!==p.creator||event.feeRecipient.toBase58()!==p.roles.feeRecipient||event.isBuy!==buy||event.ixName!==(buy?'buy_exact_sol_in':'sell'))fail('EVENT_BINDING');
 if(event.mayhemMode!==false||event.trackVolume!==false||event.shareholders?.length!==0||n('cashback')||n('cashbackFeeBasisPoints')||n('holderRewards')||n('holderRewardsBps')||n('buybackFee')||n('buybackFeeBasisPoints'))fail('EVENT_MODE_UNQUALIFIED');
 const sol=n('solAmount'),tokens=n('tokenAmount'),fees={protocol:n('fee'),creator:n('creatorFee')},totalFees=fees.protocol+fees.creator;
 if(sol===0n||tokens===0n||totalFees>=sol||n('feeBasisPoints')+n('creatorFeeBasisPoints')>=10000n)fail('EVENT_AMOUNTS');
 if(fees.protocol!==(sol*n('feeBasisPoints')+9999n)/10000n||fees.creator!==(sol*n('creatorFeeBasisPoints')+9999n)/10000n)fail('EVENT_FEE_ARITHMETIC');
 if(![system,SOL_MINT].includes(event.quoteMint.toBase58())||n('quoteAmount')!==0n&&n('quoteAmount')!==sol)fail('EVENT_QUOTE');
 if(tokenDelta.get('user')!==(buy?tokens:-tokens))fail('EVENT_TOKEN_EFFECTS');
 const input=buy?sol+totalFees:tokens,output=buy?tokens:sol-totalFees;
 if((buy?input>amount(r.intent.inputAmount):input!==amount(r.intent.inputAmount))||output<amount(r.plan.quote.minimumOutput))fail('TRADE_LIMIT');
 const walletDelta=(buy?-input:output)-fee;
 add(p.agentWallet,walletDelta);add(p.roles.bondingCurve,buy?sol:-sol);add(p.roles.feeRecipient,fees.protocol);add(p.roles.creatorVault,fees.creator);
 for(let i=0;i<keys.length;i++)if(delta[i]!==(expected.get(keys[i])??0n))fail('ROLE_NATIVE_EFFECTS');
 if(!r.plan.risk||post[0]<amount(r.plan.risk.protectedLamports))fail('PROTECTED_RESERVE');
 validateCpi(inner,p,buy,sol,tokens,fees);
 return frozen({...base,nativeDelta:walletDelta.toString(),tokenDelta:tokenDelta.get('user').toString(),actualInput:input.toString(),actualOutput:output.toString(),grossOutput:(buy?tokens:sol).toString(),venueFees:{protocol:fees.protocol.toString(),creator:fees.creator.toString(),buyback:'0',lp:'0',includedInTrade:true}});
}
