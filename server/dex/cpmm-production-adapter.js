import {Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import nacl from 'tweetnacl';
import {digest,reject,DEFAULT_RISK_POLICY} from './intent.js';
import {loadFreshCpmmPolicy,buildVerifiedCpmmFromPolicy,simulateUnsignedCpmm} from './cpmm-mainnet-state.js';
import {readFinalizedSwap} from './rpc-reconciliation.js';
import {decodeDexTransaction} from './transaction-validator.js';

const stateDigest=p=>digest({genesis:p.snapshot.genesis,accounts:p.snapshot.accounts,agentAccounts:p.agentAccounts,agentBalanceLamports:p.agentBalanceLamports,rentLamports:p.rentLamports});
const fail=code=>reject(code);

// The production adapter has a second, code-level arming latch. Environment
// flags alone cannot make this integration phase sign or send value.
export function createCpmmProductionAdapter({connection,db,store,oneShot,autonomousClaim,allowValueMovement=false,allowPrepare=false,assertNetwork=async()=>{},now=Date.now}){
 const custody=(agentId,address,fn)=>{
  let secret,keypair;
  try{
   const row=db.prepare('SELECT address,secret FROM agent_wallets WHERE agent_id=?').get(agentId);
   if(!row||row.address!==address||typeof store?.unseal!=='function')fail('AGENT_CUSTODY_UNAVAILABLE');
   secret=store.unseal(row.secret,'trading:'+agentId);
   if(secret.length!==64)fail('AGENT_CUSTODY_UNAVAILABLE');
   const derived=nacl.sign.keyPair.fromSeed(secret.subarray(0,32));
   if(!nacl.verify(derived.secretKey,secret)||new PublicKey(derived.publicKey).toBase58()!==address)fail('AGENT_CUSTODY_UNAVAILABLE');
   keypair=Keypair.fromSecretKey(secret);
   if(keypair.publicKey.toBase58()!==address)fail('AGENT_CUSTODY_UNAVAILABLE');
   return fn(keypair);
  }finally{secret?.fill(0);keypair?.secretKey.fill(0);}
 };
 async function fresh(intent){await assertNetwork();return loadFreshCpmmPolicy(connection,intent,{now});}
 return Object.freeze({
  kind:'CPMM_CLASSIC_WSOL_USDC_V1',enabled:allowValueMovement,prepareEnabled:allowPrepare,autonomousCustodyBound:!!autonomousClaim,
  async quote(intent,{retryMinContextSlot=false}={}){
   await assertNetwork();
   const p=await loadFreshCpmmPolicy(connection,intent,{now,deferBuild:true,retryMinContextSlot}),q=p.context.q;
   // The owner-review intent may live longer, but every quote must satisfy
   // assertQuoteFresh's independent 30s maximum lifetime.
   const createdAt=now();
   const snapshotDiagnostic={...p.snapshotDiagnostic,quoteEvaluatedAt:createdAt,ageMs:createdAt-p.snapshotDiagnostic.dependentSnapshotFetchedAt};
   return {provider:'LOCAL_RAYDIUM_CPMM',network:'solana:mainnet',inputMint:intent.inputMint,outputMint:intent.outputMint,inputAmount:intent.inputAmount,slippageBps:intent.slippageBps,estimatedOutput:q.output.toString(),minimumOutput:q.minimumOutput.toString(),pool:p.pool,reference:digest([p.slot,stateDigest(p.policy),q.output.toString(),q.minimumOutput.toString()]),snapshotDiagnostic,stateReadAttempts:p.retryDiagnostics??[],createdAt,expiresAt:createdAt+25000};
  },
  async reservePlan(r,{retryMinContextSlot=false}={}){
   await assertNetwork();
   // Provenance, local quote, ATA/rent and fee CAP are known without building
   // the final transaction. The cap makes the pre-build hold conservative.
   const p=await loadFreshCpmmPolicy(connection,r.intent,{now,deferBuild:true,retryMinContextSlot}),q=p.context.q;
   if(r.quote.provider!=='LOCAL_RAYDIUM_CPMM'||r.quote.pool!==p.pool||r.quote.estimatedOutput!==q.output.toString()||r.quote.minimumOutput!==q.minimumOutput.toString())fail('CPMM_QUOTE_CHANGED');
   const c=p.context;
   return {collected:p,snapshot:{network:'solana:mainnet',agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.policy.agentBalanceLamports,networkFeeLamports:p.policy.networkFeeCapLamports,ataRentLamports:c.rentCost.toString(),netRentLamports:(c.buy&&!c.states[1].exists?BigInt(p.policy.rentLamports):0n).toString(),ataExists:c.rentCost===0n,inputTokenBalance:c.buy?'0':c.states[1].amount.toString(),observedAt:now()}};
  },
  async buildReserved(r,pre){
   await assertNetwork();
   if(!pre?.collected||pre.collected.policy.intent!==r.intent||now()-pre.collected.observedAt>10000)fail('STALE_RESERVED_PLAN');
   const p=buildVerifiedCpmmFromPolicy(pre.collected);
   return {transaction:p.transaction,blockhash:p.policy.blockhash,lastValidBlockHeight:p.lastValidBlockHeight,pool:p.pool,routePolicyVersion:p.routePolicyVersion,validationPolicy:p.policy,stateDigest:stateDigest(p.policy),snapshotSlot:p.slot,observedAt:p.observedAt};
  },
  async build(r){
   const p=await fresh(r.intent),q=p.context.q;
   if(r.quote.provider!=='LOCAL_RAYDIUM_CPMM'||r.quote.pool!==p.pool||r.quote.estimatedOutput!==q.output.toString()||r.quote.minimumOutput!==q.minimumOutput.toString())fail('CPMM_QUOTE_CHANGED');
   return {transaction:p.transaction,blockhash:p.policy.blockhash,lastValidBlockHeight:p.lastValidBlockHeight,pool:p.pool,routePolicyVersion:p.routePolicyVersion,validationPolicy:p.policy,stateDigest:stateDigest(p.policy),snapshotSlot:p.slot,observedAt:p.observedAt};
  },
  async validationPolicy(r){if(!r.validationPolicy)fail('CPMM_POLICY_NOT_PERSISTED');return {...r.validationPolicy,expectedMessageHash:r.messageHash};},
  async snapshot(r){
   const original=r.validationPolicy;if(!original||!r.stateDigest)fail('CPMM_POLICY_NOT_PERSISTED');
   const p=await fresh(r.intent);
   if(stateDigest(p.policy)!==r.stateDigest)fail('CPMM_STATE_CHANGED');
   const c=p.context;
   const message=VersionedTransaction.deserialize(Buffer.from(r.transaction,'base64')).message;
   const fee=(await connection.getFeeForMessage(message,'confirmed')).value;
   if(!Number.isSafeInteger(fee)||fee<0||fee>Number(DEFAULT_RISK_POLICY.maxNetworkFeeLamports))fail('CPMM_FEE_UNAVAILABLE');
   return {network:'solana:mainnet',agentWallet:r.intent.agentWallet,inputMint:r.intent.inputMint,outputMint:r.intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.policy.agentBalanceLamports,networkFeeLamports:String(fee),ataRentLamports:c.rentCost.toString(),netRentLamports:(c.buy&&!c.states[1].exists?BigInt(p.policy.rentLamports):0n).toString(),ataExists:c.rentCost===0n,inputTokenBalance:c.buy?'0':c.states[1].amount.toString(),observedAt:now()};
  },
  blockHeight:async()=>{await assertNetwork();return connection.getBlockHeight('confirmed');},
  async assertCustody(intent){return custody(intent.agentId,intent.agentWallet,()=>true);},
  async simulateUnsigned(r,decoded){
   await assertNetwork();
   const tx=VersionedTransaction.deserialize(Buffer.from(r.transaction,'base64'));
   if(!Buffer.from(tx.message.serialize()).equals(decoded.messageBytes))fail('SIMULATION_MESSAGE_MISMATCH');
   const result=await simulateUnsignedCpmm(connection,{transaction:r.transaction});
   if(!result.success)fail('UNSIGNED_SIMULATION_FAILED');
   return {success:true,messageHash:decoded.messageHash,slot:result.slot,unitsConsumed:result.unitsConsumed};
  },
  async signExactMessage(r,decoded){
   // Acceptance is a distinct authority, not an alias for either the
   // owner-reviewed Controlled Real latch or the normal Live claim.
   if(r?.intent?.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&autonomousClaim?.acceptanceEnabled!==true)fail('CPMM_ACCEPTANCE_CLAIM_UNAVAILABLE');
   if(['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(r?.intent?.mode)){if(!autonomousClaim)fail('CPMM_AUTONOMOUS_DISARMED');autonomousClaim.assertSigningClaim(r);}
   else if(!allowValueMovement){if(!oneShot)fail('CPMM_EXECUTION_DISARMED');oneShot.assertClaimed(r);}
   await assertNetwork();
   return custody(r.intent.agentId,r.intent.agentWallet,key=>{
    const tx=VersionedTransaction.deserialize(Buffer.from(r.transaction,'base64'));
    if(!Buffer.from(tx.message.serialize()).equals(decoded.messageBytes))fail('SIGNED_MESSAGE_MUTATION');
    tx.sign([key]);return Buffer.from(tx.serialize()).toString('base64');
   });
  },
  async broadcastOnce(encoded,options,r){
   if(r?.intent?.mode==='AUTONOMOUS_ACCEPTANCE_TEST'&&autonomousClaim?.acceptanceEnabled!==true)fail('CPMM_ACCEPTANCE_CLAIM_UNAVAILABLE');
   if(['LIVE_AUTONOMOUS','AUTONOMOUS_ACCEPTANCE_TEST'].includes(r?.intent?.mode)){if(!autonomousClaim)fail('CPMM_AUTONOMOUS_DISARMED');autonomousClaim.assertBroadcastClaim(r);}
   else if(!allowValueMovement){if(!oneShot)fail('CPMM_EXECUTION_DISARMED');oneShot.assertClaimed(r);}
   const signed=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));if(Buffer.from(signed.message.serialize()).toString('base64')!==r.message)fail('SIGNED_MESSAGE_MUTATION');
   if(options?.maxRetries!==0||options?.skipPreflight!==false)fail('BROADCAST_POLICY_MISMATCH');
   await assertNetwork();
   return connection.sendRawTransaction(Buffer.from(encoded,'base64'),{maxRetries:0,skipPreflight:false,preflightCommitment:'confirmed'});
  },
  async readFinalized(signature,r){
   await assertNetwork();
   if(!r||r.signature!==signature||!r.validationPolicy)fail('RECONCILIATION_IDENTITY_MISMATCH');
   const decoded=decodeDexTransaction(r.transaction);
   const target=r.validationPolicy.agentAccounts.find(x=>x.address!==r.validationPolicy.agentAccounts[0].address);
   const rentAccounts=r.intent.direction==='BUY'&&target?.info===null?[target.address]:[];
   return readFinalizedSwap(connection,r,{resolvedAccounts:decoded.accounts.map(a=>a.address),maxNetworkFeeLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports,rentAccounts,netRentLamports:r.review.netRentLamports,minimumOutput:r.quote.minimumOutput});
  },
  async verifiedEffects(_r,chain){if(!chain?.effects||chain.effects.failed)fail('UNVERIFIED_CHAIN_EFFECTS');return chain.effects;}
 });
}
