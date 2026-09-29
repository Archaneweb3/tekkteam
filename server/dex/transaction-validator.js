import { createHash } from 'node:crypto';
import { VersionedTransaction, TransactionMessage, PublicKey, ComputeBudgetProgram, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import nacl from 'tweetnacl';
import {CPMM_ENVELOPE,validateCpmmEnvelopeDecoded} from './cpmm-envelope.js';

const MAINNET = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const address = x => new PublicKey(x).toBase58();
const equal = (a,b) => Buffer.from(a).equals(Buffer.from(b));
export function decodeDexTransaction(encoded, { lookupTables = [] } = {}) {
  try {
    if (typeof encoded !== 'string' || encoded.length > 1644 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail('DECODE_FAILURE');
    const bytes = Buffer.from(encoded,'base64');
    if (bytes.length > 1232 || bytes.toString('base64') !== encoded) fail('DECODE_FAILURE');
    const transaction = VersionedTransaction.deserialize(bytes);
    if (!equal(transaction.serialize(),bytes)) fail('NON_CANONICAL_TRANSACTION');
    const message = transaction.message;
    // Lookup table contents must come from a verified Mainnet RPC, never provider JSON.
    if (new Set(lookupTables.map(t=>t.key.toBase58())).size !== lookupTables.length) fail('DUPLICATE_LOOKUP_TABLE');
    const decompiled = TransactionMessage.decompile(message,{addressLookupTableAccounts:lookupTables});
    const keys = message.getAccountKeys(message.version === 0 ? {addressLookupTableAccounts:lookupTables} : undefined);
    const accounts = Array.from({length:keys.length},(_,i)=>({address:keys.get(i).toBase58(),signer:message.isAccountSigner(i),writable:message.isAccountWritable(i)}));
    if(new Set(accounts.map(a=>a.address)).size!==accounts.length)fail('DUPLICATE_ACCOUNT');
    const messageBytes = Buffer.from(message.serialize());
    return {transaction,messageBytes,messageHash:createHash('sha256').update(messageBytes).digest('hex'),version:message.version,feePayer:decompiled.payerKey.toBase58(),blockhash:message.recentBlockhash,accounts,signers:accounts.filter(a=>a.signer).map(a=>a.address),instructions:decompiled.instructions};
  } catch(error) { if(error.code)throw error; fail('DECODE_OR_LOOKUP_FAILURE'); }
}

// Route decoders are trusted server code, NOT a provider-supplied manifest. The
// default registry is deliberately empty until an audited route ABI is supported.
export function validateDexTransaction(encoded, policy) {
  const d = decodeDexTransaction(encoded,policy);
  if(policy.envelope===CPMM_ENVELOPE)return validateCpmmEnvelopeDecoded(d,policy);
  const {intent,quote,computeBudget,routeDecoders = new Map()} = policy;
  if(policy.genesisHash!==MAINNET || intent.network!=='solana:mainnet')fail('NETWORK_MISMATCH');
  const wallet=address(intent.agentWallet);
  if(!policy.inputTokenAccount||!policy.outputTokenAccount||policy.inputTokenAccount===policy.outputTokenAccount||[policy.inputTokenAccount,policy.outputTokenAccount].includes(wallet))fail('TOKEN_ACCOUNT_POLICY_MISMATCH');
  if(d.feePayer!==wallet||d.signers.length!==1||d.signers[0]!==wallet||d.transaction.signatures.length!==1)fail('SIGNER_MISMATCH');
  if(d.blockhash!==policy.blockhash)fail('BLOCKHASH_MISMATCH');
  if(policy.expectedMessageHash&&d.messageHash!==policy.expectedMessageHash)fail('MESSAGE_MISMATCH');
  if(intent.inputMint===intent.outputMint || quote.inputMint!==intent.inputMint || quote.outputMint!==intent.outputMint || String(quote.inputAmount)!==String(intent.inputAmount))fail('QUOTE_INTENT_MISMATCH');
  if(!/^\d+$/.test(String(intent.inputAmount))||BigInt(intent.inputAmount)<=0n||!/^\d+$/.test(String(quote.minimumOutput))||BigInt(quote.minimumOutput)<=0n)fail('INVALID_AMOUNT');
  if(!Number.isInteger(computeBudget?.units)||computeBudget.units<=0||computeBudget.units>1_400_000||!Number.isSafeInteger(computeBudget.microLamports)||computeBudget.microLamports<0)fail('INVALID_COMPUTE_POLICY');
  const expectedBudget=[ComputeBudgetProgram.setComputeUnitPrice({microLamports:computeBudget.microLamports}),ComputeBudgetProgram.setComputeUnitLimit({units:computeBudget.units})];
  if(d.instructions.length<3)fail('MISSING_ROUTE');
  for(let i=0;i<2;i++)if(!d.instructions[i].programId.equals(expectedBudget[i].programId)||d.instructions[i].keys.length||!equal(d.instructions[i].data,expectedBudget[i].data))fail('COMPUTE_BUDGET_MISMATCH');
  const writable=new Set(policy.allowedWritableAccounts?.map(address));
  if(!writable.has(wallet)||d.accounts.some(a=>a.writable&&!writable.has(a.address)))fail('UNEXPECTED_WRITABLE_ACCOUNT');
  const invokedPrograms=new Set(d.instructions.map(ix=>ix.programId.toBase58()));
  if(d.accounts.some(a=>invokedPrograms.has(a.address)&&(a.writable||a.signer)))fail('INVALID_PROGRAM_PRIVILEGES');
  let routes=0,ataCreates=0;
  for(const ix of d.instructions.slice(2)){
    const program=ix.programId.toBase58();
    if(ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)){
      // Only canonical idempotent ATA creation for the exact output mint/owner.
      const mint=address(intent.outputMint),ata=getAssociatedTokenAddressSync(new PublicKey(mint),new PublicKey(wallet)).toBase58();
      const expected=[wallet,ata,wallet,mint,SystemProgram.programId.toBase58(),TOKEN_PROGRAM_ID.toBase58()];
      if(routes||!policy.createOutputAta||!equal(ix.data,[1])||ix.keys.length!==6||ix.keys.some((k,i)=>k.pubkey.toBase58()!==expected[i])||ata!==policy.outputTokenAccount)fail('ATA_MISMATCH');
      // Message-level privilege union makes the repeated owner signer/writable.
      if(!ix.keys[0].isSigner||!ix.keys[0].isWritable||!ix.keys[1].isWritable||ix.keys[1].isSigner||ix.keys.slice(3).some(k=>k.isSigner||k.isWritable))fail('ATA_PRIVILEGE_MISMATCH');
      if(d.instructions.filter(x=>x.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).length!==1)fail('DUPLICATE_ATA');
      ataCreates++;
      continue;
    }
    const decoder=routeDecoders.get(program);
    if(!decoder)fail('UNSUPPORTED_ROUTE_OR_PROGRAM');
    if(++routes!==1)fail('EXTRA_ROUTE');
    const route=decoder(ix,{accounts:d.accounts});
    if(!route||route.inputMint!==intent.inputMint||route.outputMint!==intent.outputMint||String(route.inputAmount)!==String(intent.inputAmount)||String(route.minimumOutput)!==String(quote.minimumOutput)||route.authority!==wallet||route.inputTokenAccount!==policy.inputTokenAccount||route.outputTokenAccount!==policy.outputTokenAccount)fail('ROUTE_SEMANTIC_MISMATCH');
  }
  if(routes!==1)fail('MISSING_ROUTE');
  if(Boolean(policy.createOutputAta)!==Boolean(ataCreates))fail('ATA_CREATION_MISMATCH');
  if(policy.requireSignature&&!nacl.sign.detached.verify(d.messageBytes,d.transaction.signatures[0],new PublicKey(wallet).toBytes()))fail('INVALID_SIGNATURE');
  if(!policy.requireSignature&&d.transaction.signatures.some(s=>s.some(b=>b!==0)))fail('UNEXPECTED_PREEXISTING_SIGNATURE');
  return d;
}
