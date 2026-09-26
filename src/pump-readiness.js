import {PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {initialBuyInstructions,initialBuyAccounts,buyLamports} from './initial-buy.js';

export const PUMP_COMMIT = '81091419e4457566469d4e2a27f64ed84d42419c';
export const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
// Historical diagnostic defaults only. Production preparation requires an explicit
// agent launch snapshot, checked against the authenticated agent by the service.
export const PAYER = 'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
export const URI = 'https://tekkwork-test-metadata.vercel.app/metadata/tekkwork-test.json';
export const GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const CAP = 10_000_000n;
const mayhem = new PublicKey('MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e');
const pump = new PublicKey(PUMP);
const payer = new PublicKey(PAYER);
const pda = (program, ...seeds) => PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s.toBuffer()),program)[0];
const names = ['mint','mint_authority','bonding_curve','associated_bonding_curve','global','user','system_program','token_program','associated_token_program','mayhem_program_id','global_params','sol_vault','mayhem_state','mayhem_token_vault','event_authority','program'];
const writable = new Set([0,2,3,5,9,11,12,13]);
const signer = new Set([0,5]);
const str = value => {const b=Buffer.from(value);const n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};

export function creationAccounts(mint, owner=PAYER) {
  const payer=new PublicKey(owner);
  const curve=pda(pump,'bonding-curve',mint), vault=pda(mayhem,'sol-vault');
  const addresses=[mint,pda(pump,'mint-authority'),curve,getAssociatedTokenAddressSync(mint,curve,true,TOKEN_2022_PROGRAM_ID),pda(pump,'global'),payer,new PublicKey('11111111111111111111111111111111'),TOKEN_2022_PROGRAM_ID,new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),mayhem,pda(mayhem,'global-params'),vault,pda(mayhem,'mayhem-state',mint),getAssociatedTokenAddressSync(mint,vault,true,TOKEN_2022_PROGRAM_ID),pda(pump,'__event_authority'),pump];
  return addresses.map((pubkey,i)=>({name:names[i],pubkey,isSigner:signer.has(i),isWritable:writable.has(i)}));
}

// Full current argument encoding: OptionBool/OptionU64 are tuple structs,
// not Borsh Option<T>. All three mode flags and custom fee bps are zero.
function creationData(launch) {
  return Buffer.concat([Buffer.from([214,144,76,236,95,139,49,180]),str(launch?.name??'TEKKWORK TEST'),str(launch?.symbol??'TEKK'),str(launch?.metadataUri??URI),new PublicKey(launch?.owner??PAYER).toBuffer(),Buffer.alloc(11)]);
}

export function buildCreation(mint, blockhash, launch) {
  const payer=new PublicKey(launch?.owner??PAYER);
  if(mint.equals(payer)) throw Error('Mint must be a new independent account');
  return new Transaction({feePayer:payer,recentBlockhash:blockhash}).add(new TransactionInstruction({programId:pump,keys:creationAccounts(mint,payer.toBase58()),data:creationData(launch)}),...initialBuyInstructions(mint,launch));
}

/** Inspect the final serialized message; never trust a mutable UI summary. */
export function inspectCreation(bytes,{mint,blockhash,genesis,chainId,launch}) {
  if(genesis!==GENESIS || chainId!=='solana:101') throw Error('Wrong Mainnet context');
  const tx=Transaction.from(bytes);
  if(tx.signatures.some(s=>s.signature!==null)) throw Error('Unsigned construction only');
  if(tx.feePayer?.toBase58()!==(launch?.owner??PAYER)) throw Error('Payer changed');
  if(tx.recentBlockhash!==blockhash) throw Error('Blockhash changed');
  const amount=buyLamports(launch);
  if(tx.instructions.length!==(amount?3:1)) throw Error('Unexpected instruction count');
  const ix=tx.instructions[0], expected=creationAccounts(mint,launch?.owner??PAYER);
  if(ix.programId.toBase58()!==PUMP) throw Error('Unexpected program');
  if(ix.keys.length!==expected.length) throw Error('Unexpected account count');
  ix.keys.forEach((k,i)=>{const e=expected[i];if(!k.pubkey.equals(e.pubkey)||k.isSigner!==e.isSigner||k.isWritable!==e.isWritable)throw Error(`Unexpected account/privileges: ${e.name}`);});
  if(!ix.data.equals(creationData(launch))) throw Error('Creation data changed: metadata, creator, name, modes or trailing arguments');
  const canonical=buildCreation(mint,blockhash,launch).serializeMessage();
  if(!tx.serializeMessage().equals(canonical)) throw Error('Unexpected message keys/header');
  if(amount)for(const a of initialBuyAccounts(mint,launch.owner))if(!expected.some(e=>e.pubkey.equals(a.pubkey)))expected.push(a);
  return {instruction:amount?'create_v2 + createIdempotent + buy_exact_sol_in':'create_v2',programId:PUMP,requiredSigners:tx.compileMessage().header.numRequiredSignatures,accounts:expected.map(a=>({name:a.name,address:a.pubkey.toBase58(),signer:a.isSigner,writable:a.isWritable})),dataBase64:ix.data.toString('base64'),messageBase64:tx.serializeMessage().toString('base64'),initialBuyLamports:amount,explicitTransfers:[],priorityFeeLamports:0};
}

/** No CPI debit proof exists for this instruction. Fail closed regardless of
 * a favorable simulation or small fee quote. This is rejection, not an on-chain cap. */
export function spendingGuard(bytes, context, networkFeeLamports) {
  const structure=inspectCreation(bytes,context);
  if(!Number.isSafeInteger(networkFeeLamports)||networkFeeLamports<0) throw Error('Unknown/invalid network fee');
  if(BigInt(networkFeeLamports)>CAP) throw Error('Known network fee exceeds absolute cap');
  return {allowed:false,code:'UNPROVEN_CPI_PAYER_DEBIT',capLamports:CAP.toString(),structure,fees:{baseFeeLamports:networkFeeLamports,priorityFeeLamports:0,initialBuyLamports:0,explicitTransferLamports:0,platformFeeLamports:0,protocolFeeLamports:null,rentLamports:null},calculatedMaximumPayerDebitLamports:null,reason:'create_v2 supplies the payer as writable signer to Pump. Its CPI account creation/rent and other possible lamport debits have no max-debit argument in this message. No reviewed execution-time bound is available. Simulation cannot establish the absolute cap.',simulation:{status:'NOT_RUN_STATIC_SPENDING_GUARD_REJECTED',payerBalanceComparison:null}};
}
