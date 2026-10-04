import {PublicKey,VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {validateOfflinePumpEnvelope} from './pump-offline-envelope.js';
import {decodedPumpState} from './pump-account-decoder.js';
import {inspectPumpFixtureEconomics} from './pump-fixture-economics.js';
import {rejectPump} from './pump-sdk-boundary.js';
import {buildOfflinePumpInstruction} from './pump-offline-instruction.js';
import {inspectOfflinePumpAccountInventory} from './pump-account-inventory.js';
import {qualifyOfflinePumpAuxiliary} from './pump-auxiliary-layout.js';

const integer=value=>{if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value)||BigInt(value)>(1n<<64n)-1n)rejectPump('PUMP_SIMULATION_AMOUNT_INVALID');return BigInt(value);};
function snapshots(input){return Object.fromEntries(Object.entries(input??{}).map(([role,a])=>[role,{...a,data:Buffer.isBuffer(a?.data)?Buffer.from(a.data):a?.data}]));}

// Unsigned simulation-fixture topology, not RPC/finality or a ledger receipt.
export async function inspectPumpSimulationEffects(input={}){
 const options={...input.options,intent:Object.freeze({...input.options?.intent})},beforeAccounts=snapshots(input.beforeAccounts),afterAccounts=snapshots(input.afterAccounts);
 const meta=structuredClone(input.meta),encoded=input.unsignedTransaction,state=decodedPumpState(options.venue);
 if(options.venue.source!=='LOCAL_FIXTURE'||meta?.source!=='LOCAL_FIXTURE'||meta.err!==null||meta.slot!==options.venue.slot)rejectPump('PUMP_SIMULATION_EFFECTS_FIXTURE_ONLY');
 const validated=await validateOfflinePumpEnvelope(encoded,options);
 if(meta.messageHash!==validated.messageHash)rejectPump('PUMP_SIMULATION_MESSAGE_MISMATCH');
 const transaction=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),keys=transaction.message.staticAccountKeys.map(k=>k.toBase58()),count=keys.length;
 if(keys[0]!==options.executionWallet||transaction.message.header.numRequiredSignatures!==1)rejectPump('PUMP_SIMULATION_PAYER_MISMATCH');
 for(const balances of [meta.preBalances,meta.postBalances])if(!Array.isArray(balances)||balances.length!==count||balances.some(n=>!Number.isSafeInteger(n)||n<0))rejectPump('PUMP_SIMULATION_BALANCES_INVALID');
 for(let i=0;i<count;i++)if(!transaction.message.isAccountWritable(i)&&meta.preBalances[i]!==meta.postBalances[i])rejectPump('PUMP_SIMULATION_READONLY_CHANGE');
 const fee=integer(meta.fee);
 if(meta.fee!==options.networkFeeLamports)rejectPump('PUMP_SIMULATION_FEE_MISMATCH');
 if(meta.preBalances[0]!==beforeAccounts.wallet?.lamports||meta.postBalances[0]!==afterAccounts.wallet?.lamports)rejectPump('PUMP_SIMULATION_WALLET_BALANCE_MISMATCH');
 const own=new Map(),rows=[meta.preTokenBalances,meta.postTokenBalances];
 const base=beforeAccounts.base?.address,quote=beforeAccounts.quote?.address;
 for(let phase=0;phase<rows.length;phase++){
  const list=rows[phase],seen=new Set();if(!Array.isArray(list))rejectPump('PUMP_SIMULATION_TOKEN_BALANCES_INVALID');
  for(const row of list){
   const i=row?.accountIndex;if(!Number.isSafeInteger(i)||i<0||i>=count||seen.has(i))rejectPump('PUMP_SIMULATION_TOKEN_INDEX_INVALID');seen.add(i);
   integer(row.uiTokenAmount?.amount);
   if(row.owner!==options.executionWallet)continue;
   const address=keys[i],role=address===base?'base':options.venue.kind==='PUMPSWAP'&&address===quote?'quote':null;
   if(!role)rejectPump('PUMP_SIMULATION_UNRELATED_WALLET_TOKEN');
   const mint=role==='base'?options.venue.mint:NATIVE_MINT.toBase58(),program=role==='base'?state.tokenProgram.toBase58():TOKEN_PROGRAM_ID.toBase58(),decimals=role==='base'?state.minted.decimals:9;
   if(row.mint!==mint||row.programId!==program||row.uiTokenAmount.decimals!==decimals)rejectPump('PUMP_SIMULATION_TOKEN_BINDING_INVALID');
   const raw=(phase===0?beforeAccounts:afterAccounts)[role];
   if(!raw||raw.data.readBigUInt64LE(64)!==integer(row.uiTokenAmount.amount))rejectPump('PUMP_SIMULATION_TOKEN_AMOUNT_MISMATCH');
   const bound=own.get(role)??[false,false];bound[phase]=true;own.set(role,bound);
   if(meta.preBalances[i]!==beforeAccounts[role].lamports||meta.postBalances[i]!==afterAccounts[role].lamports)rejectPump('PUMP_SIMULATION_TOKEN_RENT_MISMATCH');
   if(role==='base'&&meta.preBalances[i]!==meta.postBalances[i])rejectPump('PUMP_SIMULATION_UNEXPECTED_BASE_RENT');
  }
 }
 for(const role of options.venue.kind==='PUMPSWAP'?['base','quote']:['base'])if(!own.get(role)?.every(Boolean))rejectPump('PUMP_SIMULATION_TOKEN_BALANCE_MISSING');
 const effects=inspectPumpFixtureEconomics({...options,beforeAccounts,afterAccounts});
 return Object.freeze({...effects,schema:'PUMP_SIMULATION_FIXTURE_EFFECTS_V1',messageHash:validated.messageHash,fixtureSlot:meta.slot,networkFeeLamports:fee.toString(),messageAndIndexBound:true,finalityVerified:false,actualReceiptVerified:false,realExecutorDebitCompatible:effects.fixtureInputDebit===validated.quote.inputAmount,executable:false});
}

// Stronger optional conservation gate, still hypothetical and never a receipt.
export async function inspectPumpSimulationConservation(input={}){
 const meta=structuredClone(input.meta),unsignedTransaction=input.unsignedTransaction;
 const options={...input.options,intent:Object.freeze({...input.options?.intent})};
 const effects=await inspectPumpSimulationEffects({...input,options,meta,unsignedTransaction,beforeAccounts:snapshots(input.beforeAccounts),afterAccounts:snapshots(input.afterAccounts)});
 const tx=VersionedTransaction.deserialize(Buffer.from(unsignedTransaction,'base64'));
 const sum=values=>values.reduce((n,v)=>n+BigInt(v),0n);
 if(sum(meta.postBalances)-sum(meta.preBalances)!==-integer(meta.fee))rejectPump('PUMP_SIMULATION_NATIVE_CONSERVATION_INVALID');
 const pre=new Map(meta.preTokenBalances.map(r=>[r.accountIndex,r])),post=new Map(meta.postTokenBalances.map(r=>[r.accountIndex,r]));
 if(pre.size!==post.size||[...pre.keys()].some(i=>!post.has(i)))rejectPump('PUMP_SIMULATION_ACCOUNT_PROVISIONING_UNQUALIFIED');
 const deltas=new Map();
 let observedBaseSupply=0n;
 for(const [index,before] of pre){
  const after=post.get(index),native=before.mint===NATIVE_MINT.toBase58();
  if(before.mint!==options.venue.mint&&!native)rejectPump('PUMP_SIMULATION_UNSUPPORTED_TOKEN_MINT');
  const program=native?TOKEN_PROGRAM_ID.toBase58():options.venue.tokenProgram,decimals=native?9:6;
  if(!before.owner||before.owner!==after.owner||before.mint!==after.mint||before.programId!==program||after.programId!==program||before.uiTokenAmount.decimals!==decimals||after.uiTokenAmount.decimals!==decimals)rejectPump('PUMP_SIMULATION_TOKEN_IDENTITY_CHANGED');
  const change=integer(after.uiTokenAmount.amount)-integer(before.uiTokenAmount.amount),solChange=BigInt(meta.postBalances[index])-BigInt(meta.preBalances[index]);
  if(!native)observedBaseSupply+=integer(before.uiTokenAmount.amount);
  if(!tx.message.isAccountWritable(index)&&change!==0n)rejectPump('PUMP_SIMULATION_READONLY_TOKEN_CHANGE');
  if(solChange!==(native?change:0n))rejectPump('PUMP_SIMULATION_TOKEN_RENT_CHANGE_UNQUALIFIED');
  deltas.set(before.mint,(deltas.get(before.mint)??0n)+change);
 }
 if([...deltas.values()].some(n=>n!==0n))rejectPump('PUMP_SIMULATION_TOKEN_CONSERVATION_INVALID');
 if(observedBaseSupply>decodedPumpState(options.venue).minted.supply)rejectPump('PUMP_SIMULATION_OBSERVED_SUPPLY_INVALID');
 return Object.freeze({...effects,schema:'PUMP_SIMULATION_FIXTURE_CONSERVATION_V1',nativeConservationPassed:true,tokenConservationPassed:true,accountProvisioningIncluded:false,venueAccountRolesVerified:false,venueExecutionQualified:false});
}

export async function inspectRoleBoundPumpSimulation(input={}){
 const options={...input.options,intent:Object.freeze({...input.options?.intent})},meta=structuredClone(input.meta),unsignedTransaction=input.unsignedTransaction;
 const beforeAccounts=snapshots(input.beforeAccounts),afterAccounts=snapshots(input.afterAccounts);
 const copy=list=>{if(!Array.isArray(list))rejectPump('PUMP_EFFECT_ACCOUNT_SNAPSHOTS_REQUIRED');return list.map(a=>({...a,data:Buffer.isBuffer(a?.data)?Buffer.from(a.data):a?.data}));};
 const before=copy(input.preInstructionAccounts),after=copy(input.postInstructionAccounts);
 const effects=await inspectPumpSimulationConservation({options,meta,unsignedTransaction,beforeAccounts,afterAccounts});
 const inventory=await inspectOfflinePumpAccountInventory({...options,walletAccounts:beforeAccounts,instructionAccounts:before});
 const built=await buildOfflinePumpInstruction(options),roles=new Map(built.accountRoles.map(r=>[r.role,r.address])),state=decodedPumpState(options.venue);
 const tx=VersionedTransaction.deserialize(Buffer.from(unsignedTransaction,'base64')),keys=tx.message.staticAccountKeys.map(k=>k.toBase58()),pre=new Map(),post=new Map();
 for(const [list,map]of [[before,pre],[after,post]])for(const a of list){
  if(!a||map.has(a.address)||!keys.includes(a.address)||a.slot!==options.venue.slot||a.exists!==true||a.executable!==false||!Number.isSafeInteger(a.lamports)||a.lamports<0||!Buffer.isBuffer(a.data))rejectPump('PUMP_EFFECT_RAW_ACCOUNT_INVALID');map.set(a.address,a);
 }
 if(pre.size!==post.size||[...pre.keys()].some(address=>!post.has(address)))rejectPump('PUMP_EFFECT_RAW_ACCOUNT_MISSING');
 for(const [address,a]of pre){const b=post.get(address),index=keys.indexOf(address);if(a.owner!==b.owner||a.lamports!==meta.preBalances[index]||b.lamports!==meta.postBalances[index])rejectPump('PUMP_EFFECT_RAW_BALANCE_MISMATCH');if(!tx.message.isAccountWritable(index)&&!a.data.equals(b.data))rejectPump('PUMP_EFFECT_READONLY_DATA_CHANGED');}
 const tokenPre=new Map(meta.preTokenBalances.map(r=>[r.accountIndex,r])),tokenPost=new Map(meta.postTokenBalances.map(r=>[r.accountIndex,r])),blockers=[];
 for(let index=0;index<keys.length;index++){
  const address=keys[index],token=tokenPre.get(index),rawChanged=pre.has(address)&&!pre.get(address).data.equals(post.get(address).data),changed=rawChanged||meta.preBalances[index]!==meta.postBalances[index]||token&&token.uiTokenAmount.amount!==tokenPost.get(index)?.uiTokenAmount.amount;
  if(!changed&&!token)continue;
  const a=pre.get(address),b=post.get(address),entries=inventory.rows.filter(r=>r.address===address);
  if(!a||!b)rejectPump('PUMP_EFFECT_RAW_ACCOUNT_MISSING');
  if(a.lamports!==meta.preBalances[index]||b.lamports!==meta.postBalances[index]||a.owner!==b.owner)rejectPump('PUMP_EFFECT_RAW_BALANCE_MISMATCH');
  if(!tx.message.isAccountWritable(index)&&!a.data.equals(b.data))rejectPump('PUMP_EFFECT_READONLY_DATA_CHANGED');
  if(token){
   if(!tokenPost.has(index)||a.data.length<165||b.data.length<165||a.data.readBigUInt64LE(64).toString()!==token.uiTokenAmount.amount||b.data.readBigUInt64LE(64).toString()!==tokenPost.get(index).uiTokenAmount.amount)rejectPump('PUMP_EFFECT_RAW_TOKEN_MISMATCH');
   for(const [raw,row]of [[a,token],[b,tokenPost.get(index)]])if(raw.owner!==row.programId||new PublicKey(raw.data.subarray(0,32)).toBase58()!==row.mint||new PublicKey(raw.data.subarray(32,64)).toBase58()!==row.owner)rejectPump('PUMP_EFFECT_RAW_TOKEN_IDENTITY_MISMATCH');
  }
  let qualified=entries.some(r=>r.status==='VERIFIED_LOCAL_LAYOUT');
  if(qualified&&!token){
   if(address===options.executionWallet){const bound=afterAccounts.wallet;if(b.owner!==bound.owner||!b.data.equals(bound.data)||b.lamports!==bound.lamports)rejectPump('PUMP_EFFECT_WALLET_POST_MISMATCH');}
   else if(!a.data.equals(b.data))qualified=false;
  }
  if(qualified&&token){
   const walletRole=address===beforeAccounts.base.address?'base':options.venue.kind==='PUMPSWAP'&&address===beforeAccounts.quote?.address?'quote':null;
   if(walletRole){const bound=afterAccounts[walletRole];if(b.owner!==bound.owner||!b.data.equals(bound.data)||b.lamports!==bound.lamports)rejectPump('PUMP_EFFECT_WALLET_POST_MISMATCH');}
   else{qualified=false;for(const row of entries)if(await qualifyOfflinePumpAuxiliary({role:row.role,raw:b,venue:options.venue,state,roles,executionWallet:options.executionWallet}))qualified=true;}
  }
  if(!qualified)blockers.push(Object.freeze({address,roles:Object.freeze(entries.map(r=>r.role)),reason:'Changed/token account layout or post-state not qualified'}));
 }
 return Object.freeze({...effects,schema:'PUMP_ROLE_BOUND_SIMULATION_FIXTURE_V1',accountInventory:inventory,effectRoleBlockers:Object.freeze(blockers),affectedRoleLayoutsQualified:blockers.length===0,venueAccountRolesVerified:false,venueExecutionQualified:false});
}
