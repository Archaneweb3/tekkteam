import {PublicKey,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,ACCOUNT_SIZE,MINT_SIZE,unpackAccount,unpackMint,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {assertMainnet} from './mainnet-accounts.js';
import {JUPITER_ROUTER} from './jupiter-route-policy.js';
import {SOL_MINT,reject} from './intent.js';

export async function classifyMainnetAccounts(connection,decoded,intent){
 await assertMainnet(connection);const wallet=new PublicKey(intent.agentWallet);
 const atas=new Map([intent.inputMint,intent.outputMint].map(m=>[getAssociatedTokenAddressSync(new PublicKey(m),wallet).toBase58(),m]));
 const basics=new Map([[SystemProgram.programId.toBase58(),'SYSTEM_PROGRAM'],[ComputeBudgetProgram.programId.toBase58(),'COMPUTE_BUDGET'],[TOKEN_PROGRAM_ID.toBase58(),'TOKEN_PROGRAM'],[ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),'ASSOCIATED_TOKEN_PROGRAM']]);
 const result=await connection.getMultipleAccountsInfoAndContext(decoded.accounts.map(a=>new PublicKey(a.address)),{commitment:'confirmed'});
 if(!Number.isSafeInteger(result.context?.slot)||result.value?.length!==decoded.accounts.length)reject('RPC_PROVENANCE_UNAVAILABLE');
 return decoded.accounts.map((a,i)=>{
  const info=result.value[i],proof={...a,slot:result.context.slot,exists:!!info,programOwner:info?.owner.toBase58()??null,executable:!!info?.executable,authorized:false};
  if(a.address===intent.agentWallet)return {...proof,category:'AGENT_WALLET',authorized:!!info&&!info.executable&&info.owner.equals(SystemProgram.programId)&&info.data.length===0};
  if(basics.has(a.address))return {...proof,category:basics.get(a.address),authorized:!!info&&info.executable&&!a.writable&&!a.signer};
  if(a.address===JUPITER_ROUTER)return {...proof,category:'JUPITER_ROUTER_UNAPPROVED'};
  if([intent.inputMint,intent.outputMint].includes(a.address)){
   try{const mint=unpackMint(new PublicKey(a.address),info,TOKEN_PROGRAM_ID);return {...proof,category:'EXPECTED_MINT',authorized:!info.executable&&info.data.length===MINT_SIZE&&mint.isInitialized&&!a.writable&&!a.signer};}catch{return {...proof,category:'INVALID_MINT'};}
  }
  if(atas.has(a.address)){
   const mint=atas.get(a.address);if(!info)return {...proof,category:mint===SOL_MINT?'EXPECTED_WSOL_ATA_UNCREATED':'EXPECTED_ATA_UNCREATED'};
   try{const token=unpackAccount(new PublicKey(a.address),info,TOKEN_PROGRAM_ID);return {...proof,category:mint===SOL_MINT?'WSOL_ACCOUNT':'AGENT_ATA',tokenOwner:token.owner.toBase58(),mint:token.mint.toBase58(),amount:token.amount.toString(),authorized:!info.executable&&info.data.length===ACCOUNT_SIZE&&token.owner.equals(wallet)&&token.mint.toBase58()===mint&&token.isInitialized&&!token.isFrozen&&!token.delegate&&!token.closeAuthority&&token.isNative===(mint===SOL_MINT)&&(!token.isNative||token.amount===0n)};}catch{return {...proof,category:'INVALID_AGENT_TOKEN_ACCOUNT'};}
  }
  if(info?.executable)return {...proof,category:'UNAPPROVED_CPI_PROGRAM'};
  if(info?.owner.equals(TOKEN_PROGRAM_ID)&&info.data.length===ACCOUNT_SIZE){try{const token=unpackAccount(new PublicKey(a.address),info,TOKEN_PROGRAM_ID);return {...proof,category:'UNVERIFIED_POOL_TOKEN_ACCOUNT',tokenOwner:token.owner.toBase58(),mint:token.mint.toBase58()};}catch{}}
  return {...proof,category:'UNKNOWN_ACCOUNT_PROVENANCE'};
 });
}
