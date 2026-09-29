import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,TransactionMessage,TransactionInstruction,VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,AccountLayout,MintLayout} from '@solana/spl-token';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {extractFinalizedSwapEffects,readFinalizedSwap} from '../server/dex/rpc-reconciliation.js';
import {inspectMainnetTokenAccounts} from '../server/dex/mainnet-accounts.js';
import {SOL_MINT} from '../server/dex/intent.js';
const kp=n=>Keypair.fromSeed(new Uint8Array(32).fill(n)),wallet=kp(60),mint=kp(61).publicKey,program=kp(62).publicKey,ata=getAssociatedTokenAddressSync(mint,wallet.publicKey),wsol=getAssociatedTokenAddressSync(new PublicKey(SOL_MINT),wallet.publicKey),GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
// TEST-ONLY keypair; no custody access, network requests, or broadcasts.
function fixture(direction='BUY',rent=0){
 const intent={direction,agentWallet:wallet.publicKey.toBase58(),inputMint:direction==='BUY'?SOL_MINT:mint.toBase58(),outputMint:direction==='BUY'?mint.toBase58():SOL_MINT,inputAmount:direction==='BUY'?'100000':'50'};
 const ix=new TransactionInstruction({programId:program,data:Buffer.from([1]),keys:[{pubkey:wallet.publicKey,isSigner:true,isWritable:true},{pubkey:ata,isSigner:false,isWritable:true},{pubkey:wsol,isSigner:false,isWritable:true}]});
 const message=new TransactionMessage({payerKey:wallet.publicKey,recentBlockhash:kp(63).publicKey.toBase58(),instructions:[ix]}).compileToV0Message(),tx=new VersionedTransaction(message);tx.sign([wallet]);
 const keys=message.staticAccountKeys.map(k=>k.toBase58()),index=keys.indexOf(ata.toBase58()),pre=keys.map(()=>0),post=[...pre];pre[0]=10000000;post[0]=pre[0]+(direction==='BUY'?-105000-rent:695000-rent);pre[index]=2039280;post[index]=pre[index]+rent;
 const token=n=>({accountIndex:index,mint:mint.toBase58(),owner:wallet.publicKey.toBase58(),programId:TOKEN_PROGRAM_ID.toBase58(),uiTokenAmount:{amount:String(n),decimals:6}});
 const signature=bs58.encode(tx.signatures[0]),expected={signature,messageHash:createHash('sha256').update(message.serialize()).digest('hex'),resolvedAccounts:keys,maxNetworkFeeLamports:'10000',minimumOutput:direction==='BUY'?'99':'693000',netRentLamports:String(rent),rentAccounts:rent?[ata.toBase58()]:[]};
 const response={slot:500,transaction:{message,signatures:[signature]},meta:{err:null,fee:5000,preBalances:pre,postBalances:post,loadedAddresses:{writable:[],readonly:[]},preTokenBalances:[token(direction==='BUY'?0:100)],postTokenBalances:[token(direction==='BUY'?100:50)]}};
 return {intent,response,expected,index};
}
test('BUY derives actual token output and SOL debit with separately explained rent',()=>{const f=fixture('BUY',2039280),r=extractFinalizedSwapEffects(f.response,f.intent,f.expected);assert.equal(r.actualInput,'100000');assert.equal(r.actualOutput,'100');assert.equal(r.agentSolDelta,'-2144280');assert.equal(r.rentLamports,'2039280');});
test('SELL derives actual input/output and fee without quote-output accounting',()=>{const f=fixture('SELL'),r=extractFinalizedSwapEffects(f.response,f.intent,f.expected);assert.equal(r.actualInput,'50');assert.equal(r.actualOutput,'700000');assert.equal(r.agentSolDelta,'695000');});
test('negative rent refund is explicit and not extra swap output',()=>{const f=fixture('SELL',-2039280),r=extractFinalizedSwapEffects(f.response,f.intent,f.expected);assert.equal(r.actualOutput,'700000');assert.equal(r.rentLamports,'-2039280');});
test('failed finalized transaction records only fee and unchanged balances',()=>{const f=fixture();f.response.meta.err={InstructionError:[0,'Custom']};f.response.meta.postBalances=[...f.response.meta.preBalances];f.response.meta.postBalances[0]-=5000;f.response.meta.postTokenBalances=structuredClone(f.response.meta.preTokenBalances);const r=extractFinalizedSwapEffects(f.response,f.intent,f.expected);assert.equal(r.failed,true);assert.equal(r.networkFeeLamports,'5000');assert.equal(r.actualOutput,undefined);f.response.meta.postBalances[f.index]++;assert.throws(()=>extractFinalizedSwapEffects(f.response,f.intent,f.expected),/FAILED_EFFECTS/);});
for(const [name,mutate] of [
 ['message hash',f=>f.expected.messageHash='other'],
 ['signature',f=>{f.expected.signature=bs58.encode(new Uint8Array(64));f.response.transaction.signatures=[f.expected.signature];}],
 ['resolved account substitution',f=>f.expected.resolvedAccounts[1]=kp(64).publicKey.toBase58()],
 ['mint substitution',f=>f.response.meta.postTokenBalances[0].mint=kp(65).publicKey.toBase58()],
 ['token owner substitution',f=>f.response.meta.postTokenBalances[0].owner=kp(65).publicKey.toBase58()],
 ['unexpected SOL debit',f=>f.response.meta.postBalances[0]-=1000],
 ['below minimum output',f=>f.response.meta.postTokenBalances[0].uiTokenAmount.amount='98'],
 ['excessive fee',f=>f.response.meta.fee=10001],
 ['unexplained rent',f=>f.expected.netRentLamports='1'],
 ['unrelated rent account',f=>f.expected.rentAccounts=[kp(65).publicKey.toBase58()]],
 ['duplicate rent account',f=>f.expected.rentAccounts=[ata.toBase58(),ata.toBase58()]],
 ['duplicate token metadata',f=>f.response.meta.postTokenBalances.push(f.response.meta.postTokenBalances[0])]
])test('RPC metadata rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>extractFinalizedSwapEffects(f.response,f.intent,f.expected));});
test('read-only RPC reconciliation requires Mainnet finalized status and matching slot',async()=>{const f=fixture(),record={intent:f.intent,signature:f.expected.signature,messageHash:f.expected.messageHash},rpc={getGenesisHash:async()=>GENESIS,getSignatureStatuses:async()=>({value:[{confirmationStatus:'confirmed',slot:500}]}),getTransaction:async()=>f.response};assert.equal(await readFinalizedSwap(rpc,record,f.expected),null);rpc.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',slot:500}]});assert.equal((await readFinalizedSwap(rpc,record,f.expected)).effects.actualOutput,'100');rpc.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',slot:501}]});await assert.rejects(readFinalizedSwap(rpc,record,f.expected),/SLOT/);rpc.getGenesisHash=async()=> 'devnet';await assert.rejects(readFinalizedSwap(rpc,record,f.expected),/NETWORK/);});
const mintInfo=()=>{const data=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:100n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},data);return {data,owner:TOKEN_PROGRAM_ID,executable:false,lamports:1461600};};
const tokenInfo=(m,native=false,patch={})=>{const data=Buffer.alloc(AccountLayout.span);AccountLayout.encode({mint:m,owner:wallet.publicKey,amount:native?0n:100n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:native?1:0,isNative:native?2039280n:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default,...patch},data);return {data,owner:TOKEN_PROGRAM_ID,executable:false,lamports:2039280};};
function accountsFixture(){const intent=fixture().intent,value=[{data:Buffer.alloc(0),owner:SystemProgram.programId,executable:false,lamports:4995000},mintInfo(),mintInfo(),tokenInfo(new PublicKey(SOL_MINT),true),tokenInfo(mint)];return {intent,value,rpc:{getGenesisHash:async()=>GENESIS,getMultipleAccountsInfoAndContext:async keys=>{assert.equal(keys[3].toBase58(),wsol.toBase58());assert.equal(keys[4].toBase58(),ata.toBase58());return {context:{slot:100},value};},getMinimumBalanceForRentExemption:async()=>2039280}};}
test('RPC token account inspection independently derives ATAs and peak two-account rent',async()=>{const f=accountsFixture();let r=await inspectMainnetTokenAccounts(f.rpc,f.intent);assert.equal(r.tokenAccountsVerified,true);assert.equal(r.ataRentLamports,'0');f.value[3]=null;f.value[4]=null;r=await inspectMainnetTokenAccounts(f.rpc,f.intent);assert.equal(r.ataRentLamports,'4078560');assert.equal(r.solBalanceLamports,'4995000');});
for(const [name,mutate] of [
 ['wrong token owner',f=>f.value[4]=tokenInfo(mint,false,{owner:kp(66).publicKey})],
 ['wrong token mint',f=>f.value[4]=tokenInfo(kp(66).publicKey)],
 ['frozen account',f=>f.value[4]=tokenInfo(mint,false,{state:2})],
 ['delegate',f=>f.value[4]=tokenInfo(mint,false,{delegateOption:1,delegate:kp(66).publicKey})],
 ['close authority',f=>f.value[4]=tokenInfo(mint,false,{closeAuthorityOption:1,closeAuthority:kp(66).publicKey})],
 ['wrong token program',f=>f.value[4].owner=SystemProgram.programId],
 ['unsupported extension',f=>f.value[4].data=Buffer.concat([f.value[4].data,Buffer.alloc(20)])],
 ['nonzero existing WSOL',f=>f.value[3]=tokenInfo(new PublicKey(SOL_MINT),true,{amount:1n})],
 ['wrong mint program',f=>f.value[2].owner=SystemProgram.programId]
])test('RPC account inspection rejects '+name,async()=>{const f=accountsFixture();mutate(f);await assert.rejects(inspectMainnetTokenAccounts(f.rpc,f.intent));});
