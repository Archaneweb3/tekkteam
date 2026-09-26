// Read-only construction evidence. No wallet provider, signing or submission API.
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {buildCreation,spendingGuard,PUMP_COMMIT,PUMP,PAYER,URI,GENESIS,creationAccounts} from '../src/pump-readiness.js';
import {inspectCreation} from '../src/pump-readiness.js';
import {evaluateSimulation} from '../src/pump-simulation-policy.js';
import {tokenMetadata} from '../src/agent-launch-data.js';
import {buyLamports,initialBuyAccounts,FEE_RECIPIENT,BUYBACK_RECIPIENT} from '../src/initial-buy.js';
const launch=process.env.PUMP_AGENT_LAUNCH?JSON.parse(process.env.PUMP_AGENT_LAUNCH):undefined;
if(process.argv.includes('--prepare-launch')&&!launch)throw Error('Agent-specific launch data required');
const metadataUri=launch?.metadataUri??URI;
const hash=b=>createHash('sha256').update(b).digest('hex');
const progress=(stage,detail)=>{if(process.argv.includes('--events'))process.stderr.write('PUMP_EVENT '+JSON.stringify({stage,detail})+'\n');};
progress('STATIC_VALIDATION_STARTED','Pinned official IDL, approved metadata and Mainnet accounts');
async function get(url){const r=await fetch(url,{redirect:'error'});if(!r.ok)throw Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}
const idlUrl=`https://raw.githubusercontent.com/pump-fun/pump-public-docs/${PUMP_COMMIT}/idl/pump.json`;
const raw=await get(idlUrl), idl=JSON.parse(raw), definition=idl.instructions.find(i=>i.name==='create_v2');
const metadata=await get(metadataUri);
if(JSON.stringify(JSON.parse(metadata))!==JSON.stringify(launch?tokenMetadata(launch):{name:'TEKKWORK TEST',symbol:'TEKK',description:'TEKKWORK Mainnet integration test token.',image:''}))throw Error('Metadata mismatch');
if(idl.address!==PUMP||JSON.stringify(definition.discriminator)!=='[214,144,76,236,95,139,49,180]')throw Error('IDL mismatch');
const expectedArgs=[['name','string'],['symbol','string'],['uri','string'],['creator','pubkey'],['is_mayhem_mode','bool'],['is_cashback_enabled',{defined:{name:'OptionBool'}}],['creator_fee_bps',{defined:{name:'OptionU64'}}],['is_holder_reward',{defined:{name:'OptionBool'}}]];
if(JSON.stringify(definition.args.map(a=>[a.name,a.type]))!==JSON.stringify(expectedArgs))throw Error('IDL argument schema mismatch');
for(const [name,type] of [['OptionBool','bool'],['OptionU64','u64']])if(JSON.stringify(idl.types.find(t=>t.name===name)?.type)!==JSON.stringify({kind:'struct',fields:[type]}))throw Error('IDL tuple encoding mismatch');
// Evidence mode discards the mint key. Explicit launch preparation retains it
// only until partial signing; no mint secret is exported or saved.
const launchPreparation=process.argv.includes('--prepare-launch');
const mintSigner=launchPreparation?Keypair.generate():null;
const mint=mintSigner?.publicKey??Keypair.generate().publicKey;
const accounts=creationAccounts(mint,launch?.owner??PAYER);
if(definition.accounts.length!==accounts.length)throw Error('IDL account count mismatch');
definition.accounts.forEach((a,i)=>{const e=accounts[i];if(a.name!==e.name||!!a.writable!==e.isWritable||!!a.signer!==e.isSigner||(a.address&&a.address!==e.pubkey.toBase58()))throw Error(`IDL account mismatch ${a.name}`);});
const rpc=process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com', c=new Connection(rpc,'finalized');
const genesis=await c.getGenesisHash();if(genesis!==GENESIS)throw Error('Wrong cluster');
const state=await c.getMultipleAccountsInfoAndContext(accounts.map(a=>a.pubkey));
if(state.value[0])throw Error('Mint already exists');
const programIndices=[6,7,8,9,15];
for(const i of programIndices)if(!state.value[i]?.executable)throw Error(`Non-executable program ${accounts[i].name}`);
if(state.value[4]?.owner.toBase58()!==PUMP)throw Error('Global owner mismatch');
if(state.value[5]?.owner.toBase58()!=='11111111111111111111111111111111')throw Error('Payer owner mismatch');
if(buyLamports(launch)){
 const buy=idl.instructions.find(i=>i.name==='buy_exact_sol_in'),keys=initialBuyAccounts(mint,launch.owner);
 if(JSON.stringify(buy?.discriminator)!=='[56,252,116,8,158,223,205,95]'||JSON.stringify(buy.args.map(a=>[a.name,a.type]))!==JSON.stringify([['spendable_sol_in','u64'],['min_tokens_out','u64'],['track_volume',{defined:{name:'OptionBool'}}]]))throw Error('Buy IDL mismatch');
 buy.accounts.forEach((a,i)=>{const k=keys[i];if(a.name!==k.name||!!a.writable!==k.isWritable||!!a.signer!==k.isSigner||(a.address&&a.address!==k.pubkey.toBase58()))throw Error('Buy account schema mismatch');});
 // Decode the pinned Global schema, not a guessed offset for fee recipients.
 const data=state.value[4].data;let offset=8;const values={};
 for(const f of idl.types.find(t=>t.name==='Global').type.fields){const type=f.type;const read=t=>{let v;if(t==='pubkey'){v=new PublicKey(data.subarray(offset,offset+32)).toBase58();offset+=32;}else if(t==='u64'){v=data.readBigUInt64LE(offset);offset+=8;}else if(t==='bool'){v=data[offset++];}else throw Error('Unknown Global schema');return v;};values[f.name]=type?.array?Array.from({length:type.array[1]},()=>read(type.array[0])):read(type);}
 if(![values.fee_recipient,...values.fee_recipients].includes(FEE_RECIPIENT)||!values.buyback_fee_recipients.includes(BUYBACK_RECIPIENT))throw Error('Mainnet fee recipient not authorized by Global');
 if(state.value[5].lamports<=buyLamports(launch))throw Error('Insufficient Mainnet SOL for initial buy and launch costs');
 for(const a of keys)if(!accounts.some(e=>e.pubkey.equals(a.pubkey)))accounts.push(a);
 const feeProgram=await c.getAccountInfo(keys[15].pubkey);if(!feeProgram?.executable)throw Error('Fee program not executable');
}
const latest=await c.getLatestBlockhash('finalized');
const tx=buildCreation(mint,latest.blockhash,launch), bytes=tx.serialize({requireAllSignatures:false,verifySignatures:false});
const fee=await c.getFeeForMessage(tx.compileMessage(),'finalized');
if(process.argv.includes('--simulate')) {
 const context={mint,blockhash:latest.blockhash,genesis,chainId:'solana:101',launch};
 const structure=inspectCreation(bytes,context);
 progress('STATIC_VALIDATION_PASSED / FAILED',{status:'PASSED',chainId:'solana:101',payer:PAYER,initialBuy:0});
 progress('FRESH_MAINNET_BLOCKHASH_RECEIVED',latest);
 let id=0;
 const read=async(method,params)=>{
  if(!['getMultipleAccounts','simulateTransaction','getMinimumBalanceForRentExemption'].includes(method))throw Error('Method not allowed');
  const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
  if(!response.ok)throw Error(`RPC HTTP ${response.status}`);
  const body=await response.json();if(body.error)throw Error(JSON.stringify(body.error));return body.result;
 };
 const addresses=accounts.map(a=>a.pubkey.toBase58());
 const before=await read('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized'}]);
 const simulationOptions={encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:before.context.slot,innerInstructions:true,accounts:{encoding:'base64',addresses}};
 progress('MAINNET_SIMULATION_STARTED',{sha256:hash(bytes),sigVerify:false,replaceRecentBlockhash:false});
 const simulation=await read('simulateTransaction',[bytes.toString('base64'),simulationOptions]);
 progress('MAINNET_SIMULATION_PASSED / FAILED',{status:simulation.value.err?'FAILED':'PASSED',error:simulation.value.err,unitsConsumed:simulation.value.unitsConsumed,logs:simulation.value.logs});
 const afterRead=await read('getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:simulation.context.slot}]);
 const policy=evaluateSimulation(bytes,context,{before,afterRead,simulation,fee:fee.value});
 const rent=[];
 for(const a of policy.accountEffects.filter(a=>a.created)) {
  const dataLength=Buffer.from(a.post.data[0],'base64').length;
  rent.push({address:a.address,name:a.name,dataLength,fundedLamports:a.post.lamports,minimumRentExemptionLamports:await read('getMinimumBalanceForRentExemption',[dataLength,{commitment:'finalized'}])});
 }
 // Retain account data hashes/lengths rather than duplicating executable binaries.
 const compact=(key,value)=>key==='data'&&Array.isArray(value)&&value[1]==='base64'?{sha256:hash(Buffer.from(value[0],'base64')),length:Buffer.from(value[0],'base64').length}:value;
 let walletTransactionBase64;
 if(launchPreparation){
  if(!policy.allowed)throw Error('Launch spending policy rejected: '+policy.reasons.join(', '));
  // Only the new mint signs here. Its secret never crosses the process boundary.
  tx.partialSign(mintSigner);
  walletTransactionBase64=tx.serialize({requireAllSignatures:false}).toString('base64');
 }
 console.log(JSON.stringify({createdAt:new Date().toISOString(),rpc,genesis,chainId:'solana:101',idlUrl,idlSha256:hash(raw),launch,metadataUri,walletTransactionBase64,transactionBase64:bytes.toString('base64'),transactionSha256:hash(bytes),simulationInputSha256:hash(Buffer.from(bytes.toString('base64'),'base64')),recentBlockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,mint:mint.toBase58(),structure,simulationOptions,feeQuote:fee,before,simulation,afterRead,policy,rent},compact,2));
 process.exit(0);
}
const guard=spendingGuard(bytes,{mint,blockhash:latest.blockhash,genesis,chainId:'solana:101'},fee.value);
console.log(JSON.stringify({status:'BLOCKED',createdAt:new Date().toISOString(),sources:{idlUrl,idlSha256:hash(raw),metadataUri:URI,metadataSha256:hash(metadata)},rpc,genesis,chainId:'solana:101',chainIdSource:'Configured Mainnet identity; no Phantom invoked',feePayer:PAYER,mint:mint.toBase58(),recentBlockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,transactionBase64:bytes.toString('base64'),transactionSha256:hash(bytes),serializedLength:bytes.length,readSlot:state.context.slot,payerBalanceLamports:state.value[5].lamports,accountObservations:accounts.map((a,i)=>({name:a.name,address:a.pubkey.toBase58(),exists:!!state.value[i],owner:state.value[i]?.owner.toBase58()??null,lamports:state.value[i]?.lamports??null,executable:state.value[i]?.executable??null})),guard},null,2));
// Intentionally STOP. No simulateTransaction call after a failed static guard.
