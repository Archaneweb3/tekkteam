import {Transaction,PublicKey,SystemProgram} from '@solana/web3.js';
import {randomUUID,createHash} from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import {GENESIS} from '../src/pump-readiness.js';
import {inspectTransfer,buildTransfer} from '../src/wallet-transfer.js';
import {validateWalletSubmission} from './wallet-submission-validation.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';

import {FUNDING_BUDGET,FUNDING_CEILINGS,fundingFees} from './funding-fee-policy.js';
import {createRealBalanceReservations} from './real-balance-reservations.js';
import {withdrawalSafety} from './wallet-transfer-capability.js';
const budget=r=>r.fundingMessageVersion===1?r:undefined;
const fail=message=>{throw Object.assign(Error(message),{status:409});};
const active=r=>['PREPARED','SUBMITTED','UNKNOWN','Prepared','Confirming'].includes(r.status);
const exactBody=(body,keys)=>{if(!body||Object.keys(body).some(k=>!keys.includes(k)))fail('Unexpected transfer fields; destination is locked');};
const normalize=r=>r.kind?r:{...r,kind:'FUND',ownerWallet:r.owner,agentWallet:r.destination,source:r.owner,amountLamports:r.lamports,feeLamports:r.fee,network:'solana:mainnet',status:({Prepared:'PREPARED',Confirming:'UNKNOWN',Confirmed:'CONFIRMED',Failed:'FAILED'})[r.status]??'UNKNOWN',expiresAt:r.createdAt+120000};
const publicRecord=r=>{
 const keys=['id','agentId','kind','ownerWallet','agentWallet','source','destination','amountLamports','feeLamports','sourceBalanceLamports','remainingLamports','network','status','signature','slot','timestamp','createdAt','expiresAt','reason','fundingMessageVersion','messageHash','computeUnitLimit','computeUnitPrice','baseFeeLamports','priorityFeeLamports','maxPriorityFeeLamports','maxNetworkFeeLamports','destinationBalanceLamports','expectedDestinationBalanceLamports'];
 if(r.kind==='FUND'&&r.status==='PREPARED'&&r.transaction)keys.push('transaction','message','blockhash','lastValidBlockHeight');
 return Object.fromEntries(keys.filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
};

export function installWalletTransfers(app,{db,store,auth,owned,connection:c,verifyNetwork,now=Date.now,enabled=()=>process.env.FUNDING_ENABLED==='true',withdrawalEnabled=()=>process.env.WITHDRAWAL_ENABLED==='true',paused=()=>process.env.WALLET_TRANSFERS_PAUSED==='true',sessionValid=req=>!!req.session}){
 // Preserve existing receipts; one durable ledger serves both directions.
 db.exec('CREATE TABLE IF NOT EXISTS agent_funding(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,data TEXT NOT NULL)');
 const realReservations=createRealBalanceReservations(db);
 const currentAgent=req=>{if(!sessionValid(req))throw Object.assign(Error('Owner session expired; reconnect your wallet'),{status:401});return owned(req).agent;};
 const rows=id=>db.prepare('SELECT data FROM agent_funding WHERE agent_id=? ORDER BY rowid DESC').all(id).map(x=>JSON.parse(x.data));
 const save=r=>realReservations.syncWalletRecord(r,()=>db.prepare('INSERT OR REPLACE INTO agent_funding VALUES(?,?,?)').run(r.id,r.agentId,JSON.stringify(r)));
 const read=(a,id)=>{const row=db.prepare('SELECT data FROM agent_funding WHERE id=? AND agent_id=?').get(id,a.id);if(!row)fail('Wallet request not found');const r=normalize(JSON.parse(row.data));if(r.ownerWallet!==a.creator)fail('Wallet owner mismatch');return r;};
 const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const policy=(kind,a,requestId)=>{
  if(paused()||!(kind==='FUND'?enabled():withdrawalEnabled()))fail(kind==='FUND'?'Deposit is not enabled by server policy':'Withdrawal is not enabled by server policy');
  if(kind==='WITHDRAW'&&a){const w=walletFor(a),safety=withdrawalSafety(db,a.id,w.address,{ignoreWalletRequestId:requestId});if(!safety.available)fail(safety.reason);}
 };
 const network=verifyNetwork??(async()=>{if(await c.getGenesisHash()!==GENESIS)fail('Mainnet verification failed');});
 const walletFor=a=>{const w=db.prepare('SELECT address,secret FROM agent_wallets WHERE agent_id=?').get(a.id);if(!w||a.tradingWallet!==w.address||w.address===a.creator)fail('Agent wallet mapping is unavailable');return w;};
 const custody=(a,fn)=>{
  let bytes,key;
  try{const w=walletFor(a);if(typeof store?.unseal!=='function')throw Error();bytes=store.unseal(w.secret,'trading:'+a.id);if(bytes.length!==64)throw Error();key=nacl.sign.keyPair.fromSeed(bytes.subarray(0,32));const publicKey=new PublicKey(key.publicKey);if(!nacl.verify(key.secretKey,bytes)||publicKey.toBase58()!==w.address)throw Error();return fn({publicKey,secretKey:key.secretKey});}
  catch{fail('Agent custody is unavailable; transfer locked');}
  finally{bytes?.fill(0);key?.secretKey.fill(0);}
 };
 const checkMapping=(a,r)=>{const w=walletFor(a);if(a.creator!==r.ownerWallet||w.address!==r.agentWallet||r.destination!==(r.kind==='FUND'?w.address:a.creator)||r.source!==(r.kind==='FUND'?a.creator:w.address))fail('Wallet mapping changed');};
 const feeBalance=async(tx,r)=>{
  const fee=(await c.getFeeForMessage(tx.compileMessage(),'confirmed')).value;
  if(!Number.isSafeInteger(fee)||fee<0||fee>100000)fail('Network fee unavailable or excessive');
  const balance=await c.getBalance(new PublicKey(r.source),'confirmed');
  if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(r.amountLamports+fee)||balance<r.amountLamports+fee)fail('Insufficient balance including network fee');
  let fees={feeLamports:fee};if(budget(r)){try{fees=fundingFees(r,fee);}catch{fail('Funding fee unavailable or excessive');}}
  let destinationQuote={};
  if(r.kind==='WITHDRAW'){
   const value=await c.getBalance(new PublicKey(r.destination),'confirmed');
   if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(value+r.amountLamports))fail('Owner balance unavailable');
   destinationQuote={destinationBalanceLamports:value,expectedDestinationBalanceLamports:value+r.amountLamports};
  }
  return {...fees,...destinationQuote,sourceBalanceLamports:balance,remainingLamports:balance-r.amountLamports-fee};
 };
 async function reconcile(input){
  const r=normalize(input);
  if(!['SUBMITTED','UNKNOWN'].includes(r.status)||!r.signature)return r;
  try{
   await network();const tx=await c.getTransaction(r.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   if(!tx){r.status='UNKNOWN';r.reason='Confirmation pending. Reconcile this request; do not send again.';}
   else{
    const message=tx.transaction.message;
    if(tx.transaction.signatures?.[0]!==r.signature||message.serialize().toString('base64')!==r.message||!tx.meta||!Number.isSafeInteger(tx.slot))throw Error();
    const parsed=Transaction.populate(message,tx.transaction.signatures);inspectTransfer(parsed,r.source,r.destination,r.amountLamports,budget(r));if(!parsed.verifySignatures())throw Error();
    if(tx.meta.err){r.status='FAILED';r.reason='Transaction failed on chain';}
    else{
     const keys=message.accountKeys,si=keys.findIndex(k=>k.toBase58()===r.source),di=keys.findIndex(k=>k.toBase58()===r.destination),{preBalances:pre,postBalances:post,fee}=tx.meta;
     if(si<0||di<0||fee!==r.feeLamports||![pre[si],post[si],pre[di],post[di]].every(Number.isSafeInteger)||post[di]-pre[di]!==r.amountLamports||pre[si]-post[si]!==r.amountLamports+fee)throw Error();
     r.status='CONFIRMED';r.slot=tx.slot;r.timestamp=tx.blockTime==null?now():tx.blockTime*1000;delete r.reason;
    }
   }
  }catch{r.status='UNKNOWN';r.reason='Unable to verify confirmation. Reconcile this request; do not send again.';}
  // Concurrent reconciliation must never downgrade a terminal receipt.
  atomic(()=>{if(active(read({id:r.agentId,creator:r.ownerWallet},r.id)))save(r);});
  return read({id:r.agentId,creator:r.ownerWallet},r.id);
 }
 async function balance(address){try{await network();const value=await c.getBalance(new PublicKey(address),'confirmed');if(!Number.isSafeInteger(value)||value<0)throw Error();return {balanceLamports:value,balanceStatus:'AVAILABLE'};}catch{return {balanceLamports:null,balanceStatus:'UNAVAILABLE'};}}
 async function assets(address){try{await network();const key=new PublicKey(address),[legacy,t22]=await Promise.all([c.getParsedTokenAccountsByOwner(key,{programId:TOKEN_PROGRAM_ID},'confirmed'),c.getParsedTokenAccountsByOwner(key,{programId:TOKEN_2022_PROGRAM_ID},'confirmed')]);if(!Array.isArray(legacy?.value)||!Array.isArray(t22?.value))throw Error();const byMint=new Map();for(const row of [...legacy.value,...t22.value]){const info=row.account?.data?.parsed?.info,amount=info?.tokenAmount?.amount,decimals=info?.tokenAmount?.decimals,mint=info?.mint;if(typeof mint!=='string'||typeof amount!=='string'||!/^\d+$/.test(amount)||!Number.isInteger(decimals)||decimals<0||decimals>18)throw Error();if(BigInt(amount)>0n){const old=byMint.get(mint);if(old&&old.decimals!==decimals)throw Error();byMint.set(mint,{mint,amount:(BigInt(old?.amount??'0')+BigInt(amount)).toString(),decimals});}}return {assetStatus:'AVAILABLE',assets:[...byMint.values()].sort((a,b)=>a.mint.localeCompare(b.mint)),assetCount:byMint.size};}catch{return {assetStatus:'UNAVAILABLE',assets:[],assetCount:null};}}
 app.get('/api/agents/:id/trading/wallet',auth,async(req,res)=>{
  const a=currentAgent(req),w=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id),activity=[];
  for(const r of rows(a.id))activity.push(publicRecord(await reconcile(r)));
  const walletState=w?await Promise.all([balance(w.address),assets(w.address)]):[{balanceLamports:null,balanceStatus:'NO_WALLET'},{assetStatus:'NO_WALLET',assets:[],assetCount:0}];
  const ownerBalance=await balance(a.creator);
  const pending=activity.some(active);
  const mapped=!!w&&a.tradingWallet===w.address&&w.address!==a.creator;
  let mainnetVerified=false;try{await network();mainnetVerified=true;}catch{}
  let custodyReady=false;if(mapped&&withdrawalEnabled()&&!paused()){try{custody(a,()=>true);custodyReady=true;}catch{}}
  const disabled=(code,reason)=>({available:false,code,reason});
  const common=!mapped?disabled('WALLET_MAPPING_UNAVAILABLE','Agent Wallet mapping is unavailable'):!mainnetVerified?disabled('MAINNET_UNAVAILABLE','Mainnet verification is unavailable'):paused()?disabled('TRANSFERS_PAUSED','Wallet transfers are paused'):pending?disabled('PENDING_TRANSFER','A wallet transfer must resolve first'):null;
  const deposit=common??(!enabled()?disabled('DEPOSIT_POLICY_DISABLED','Deposit is not enabled by server policy'):ownerBalance.balanceStatus!=='AVAILABLE'?disabled('OWNER_BALANCE_UNAVAILABLE','Owner balance is unavailable'):ownerBalance.balanceLamports<=0?disabled('OWNER_BALANCE_EMPTY','Owner wallet has no SOL'): {available:true,code:'AVAILABLE',reason:null});
  const safety=mapped?withdrawalSafety(db,a.id,w.address):disabled('WALLET_MAPPING_UNAVAILABLE','Agent Wallet mapping is unavailable');
  const withdraw=common??(!withdrawalEnabled()?disabled('WITHDRAW_POLICY_DISABLED','Withdrawal is not enabled by server policy'):!custodyReady?disabled('CUSTODY_UNAVAILABLE','Agent Wallet withdrawal custody is unavailable'):!safety.available?safety:walletState[0].balanceStatus!=='AVAILABLE'?disabled('AGENT_BALANCE_UNAVAILABLE','Agent balance is unavailable'):walletState[0].balanceLamports<=FUNDING_CEILINGS.totalFeeLamports?disabled('INSUFFICIENT_WITHDRAWABLE_SOL','No withdrawable SOL remains after the network fee cap'):{available:true,code:'AVAILABLE',reason:null});
  res.json({agentId:a.id,ownerWallet:a.creator,agentWallet:w?.address??null,...walletState[0],...walletState[1],ownerBalanceLamports:ownerBalance.balanceLamports,ownerBalanceStatus:ownerBalance.balanceStatus,depositCapability:deposit,withdrawCapability:withdraw,fundingEnabled:deposit.available,withdrawalEnabled:withdraw.available,liveLocked:true,activity});
 });
 for(const [route,kind] of [['funding','FUND'],['withdrawal','WITHDRAW']]){
  const base='/api/agents/:id/trading/'+route;
  if(kind==='WITHDRAW')app.get(base+'/max',auth,async(req,res)=>{
   const a=currentAgent(req);policy(kind,a);const w=walletFor(a);await network();
   const value=await c.getBalance(new PublicKey(w.address),'confirmed');
   if(!Number.isSafeInteger(value)||value<0)fail('Agent balance unavailable');
   // The existing System Program SOL transfer creates no token account/rent;
   // reserve the entire approved network-fee ceiling before suggesting MAX.
   const feeCapLamports=FUNDING_CEILINGS.totalFeeLamports;
   res.json({agentId:a.id,source:w.address,destination:a.creator,network:'solana:mainnet',balanceLamports:value,feeCapLamports,requiredRentLamports:0,maxLamports:Math.max(0,value-feeCapLamports)});
  });
  if(kind==='FUND')app.post(base+'/:operationId/review',auth,async(req,res)=>{
   const a=currentAgent(req),r=read(a,req.params.operationId);exactBody(req.body,[]);policy(kind);checkMapping(a,r);
   if(r.kind!==kind||r.status!=='PREPARED'||!r.transaction||now()>=r.expiresAt)fail('Funding review expired or unavailable');
   const tx=Transaction.from(Buffer.from(r.transaction,'base64'));inspectTransfer(tx,r.source,r.destination,r.amountLamports,budget(r));
   if(tx.serializeMessage().toString('base64')!==r.message)fail('Funding review message mismatch');
   await network();const quote=await feeBalance(tx,r);
   if(quote.feeLamports!==r.feeLamports||await c.getBlockHeight('confirmed')>r.lastValidBlockHeight||now()>=r.expiresAt)fail('Funding review expired or fee changed');
   policy(kind);checkMapping(currentAgent(req),r);custody(a,()=>true);
   if(read(a,r.id).status!=='PREPARED')fail('Funding request is no longer prepared');
   res.json(publicRecord({...r,...quote}));
  });
  app.post(base+'/prepare',auth,async(req,res)=>{
   const a=currentAgent(req);policy(kind,a);exactBody(req.body,['lamports','requestKey']);const {lamports,requestKey}=req.body;
   if(!Number.isSafeInteger(lamports)||lamports<=0)fail('Enter a positive whole number of lamports');
   if(typeof requestKey!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey))fail('A valid idempotency key is required');
   const w=walletFor(a);
   const reserved=atomic(()=>{
    const existing=rows(a.id).find(r=>r.requestKey===requestKey);
    if(existing){if(existing.kind!==kind||existing.amountLamports!==lamports||existing.ownerWallet!==a.creator)fail('Idempotency key conflicts with this request');return {existing};}
    for(const old of rows(a.id).filter(active)){const r=normalize(old);if(r.status==='PREPARED'&&!r.signature&&r.expiresAt<=now()){r.status='FAILED';r.reason='Unsigned preparation expired';save(r);}else fail('Existing wallet request must be resolved first');}
    const r={id:randomUUID(),requestKey,agentId:a.id,kind,ownerWallet:a.creator,agentWallet:w.address,source:kind==='FUND'?a.creator:w.address,destination:kind==='FUND'?w.address:a.creator,amountLamports:lamports,network:'solana:mainnet',status:'PREPARED',createdAt:now(),expiresAt:now()+120000};save(r);return {r};
   });
   if(reserved.existing)return res.json(publicRecord(normalize(reserved.existing)));
   const r=reserved.r;
   try{
    await network();custody(a,()=>true);
    const {blockhash,lastValidBlockHeight}=await c.getLatestBlockhash('confirmed');if(!Number.isSafeInteger(lastValidBlockHeight))fail('Blockhash validity unavailable');
    // Both directions share the proven final-message policy (legacy field name retained).
    Object.assign(r,FUNDING_BUDGET);
    const tx=buildTransfer(r.source,r.destination,lamports,blockhash,budget(r));inspectTransfer(tx,r.source,r.destination,lamports,budget(r));
    Object.assign(r,await feeBalance(tx,r),{messageHash:createHash('sha256').update(tx.serializeMessage()).digest('hex'),blockhash,lastValidBlockHeight,message:tx.serializeMessage().toString('base64'),transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')});
    policy(kind,currentAgent(req),r.id);checkMapping(currentAgent(req),r);if(now()>=r.expiresAt||await c.getBlockHeight('confirmed')>r.lastValidBlockHeight)fail('Preparation expired');
    atomic(()=>{if(read(a,r.id).status!=='PREPARED')fail('Preparation is no longer active');save(r);});res.json(publicRecord(r));
   }catch(e){atomic(()=>{if(read(a,r.id).status==='PREPARED'){r.status='FAILED';r.reason='Unable to prepare wallet transfer';save(r);}});if(e.status)throw e;fail('Wallet transfer preparation unavailable');}
  });
  app.post(base+(kind==='FUND'?'/submit':'/confirm'),auth,async(req,res)=>{
   const a=currentAgent(req);exactBody(req.body,kind==='FUND'?['id','signedTransaction']:['id','confirm']);let r=read(a,req.body.id);if(r.kind!==kind)fail('Wrong wallet operation');
   if(r.status!=='PREPARED')return res.json(publicRecord(await reconcile(r)));
   policy(kind,a,r.id);checkMapping(a,r);if(!r.transaction||now()>=r.expiresAt)fail('Preparation expired or incomplete');
   if(kind==='WITHDRAW'&&req.body.confirm!==true)fail('Explicit withdrawal confirmation is required');
   let tx;
   try{tx=validateWalletSubmission(kind==='FUND'?req.body.signedTransaction:r.transaction,r,{requestId:req.body.id,requireSignature:kind==='FUND'});}
   catch(e){
    if(!e.diagnostic)throw e;
    // No ledger mutation: a rejected attempt is not a cancelled request. A
    // concurrent successful claimant must still be treated as uncertain.
    const latest=read(a,r.id);
    if(latest.status!=='PREPARED'||latest.signature)return res.json(publicRecord(latest));
    console.warn('wallet_submission_rejected',JSON.stringify({requestId:r.id,...e.diagnostic}));
    return res.status(409).json({error:'Submission rejected before broadcast. No transaction was sent by this attempt. The prepared request is unchanged; do not retry automatically.',submissionState:'REJECTED_BEFORE_BROADCAST',requestId:r.id,diagnostic:e.diagnostic});
   }
   await network();const quote=await feeBalance(tx,r);if(quote.feeLamports!==r.feeLamports)fail('Network fee changed; preparation cannot be submitted');
   if(await c.getBlockHeight('confirmed')>r.lastValidBlockHeight||now()>=r.expiresAt)fail('Preparation expired; no broadcast');
   policy(kind,currentAgent(req),r.id);const fresh=currentAgent(req);checkMapping(fresh,r);
   // Durable cross-process latch BEFORE custody signing. A crash stays UNKNOWN.
   const claimed=atomic(()=>{if(read(fresh,r.id).status!=='PREPARED')return false;r.status='UNKNOWN';r.reason='Submission in progress; reconcile only';save(r);return true;});
   if(!claimed)return res.json(publicRecord(read(fresh,r.id)));
   try{custody(fresh,key=>{if(kind==='WITHDRAW')tx.sign(key);});if(tx.serializeMessage().toString('base64')!==r.message||!tx.verifySignatures())fail('Invalid transfer message or signature');r.signature=bs58.encode(tx.signature);r.status='SUBMITTED';delete r.reason;save(r);}
   catch{r.status='FAILED';r.reason='Custody unavailable; nothing was broadcast';save(r);return res.json(publicRecord(r));}
   // Exact signature is persisted before the ONLY send. No timeout/restart retries.
   try{const signature=await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'});if(signature!==r.signature)throw Error();}
   catch{atomic(()=>{const latest=read(fresh,r.id);if(active(latest)){r.status='UNKNOWN';r.reason='Submission outcome unknown; reconcile only';save(r);}});}
   res.json(publicRecord(read(fresh,r.id)));
  });
  app.post(base+'/:operationId/cancel',auth,(req,res)=>{const a=currentAgent(req);const r=atomic(()=>{const value=read(a,req.params.operationId);if(value.kind!==kind||value.status!=='PREPARED'||value.signature)fail('Only unsigned preparations can be cancelled');value.status='FAILED';value.reason='Cancelled before submission';save(value);return value;});res.json(publicRecord(r));});
  app.get(base+'/:operationId',auth,async(req,res)=>{const a=currentAgent(req),r=read(a,req.params.operationId);if(r.kind!==kind)fail('Wrong wallet operation');res.json(publicRecord(await reconcile(r)));});
 }
 return {reconcilePending:async()=>{for(const row of db.prepare('SELECT data FROM agent_funding').all()){const r=JSON.parse(row.data);if(r.signature&&active(r))await reconcile(r);}}};
}
