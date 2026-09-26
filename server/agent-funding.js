import {Transaction,SystemProgram,SystemInstruction,PublicKey} from '@solana/web3.js';
import {randomUUID} from 'node:crypto';
import bs58 from 'bs58';
import {GENESIS} from '../src/pump-readiness.js';
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function inspectFunding(tx,payer,destination,lamports){
 if(tx.feePayer?.toBase58()!==payer||tx.instructions.length!==1)fail('Funding message mismatch');
 const ix=tx.instructions[0];if(!ix.programId.equals(SystemProgram.programId))fail('Unexpected funding program');
 const transfer=SystemInstruction.decodeTransfer(ix);
 if(transfer.fromPubkey.toBase58()!==payer||transfer.toPubkey.toBase58()!==destination||BigInt(transfer.lamports)!==BigInt(lamports)||payer===destination)fail('Funding destination/amount mismatch');
 if(tx.compileMessage().header.numRequiredSignatures!==1)fail('Unexpected funding signer');
}
export function installFunding(app,{db,auth,owned,connection:c,valid,now=Date.now,enabled=()=>process.env.FUNDING_ENABLED==='true'}){
 db.exec('CREATE TABLE IF NOT EXISTS agent_funding(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,data TEXT NOT NULL)');
 const save=r=>db.prepare('INSERT OR REPLACE INTO agent_funding VALUES(?,?,?)').run(r.id,r.agentId,JSON.stringify(r));
 const gate=async()=>{if(!enabled())fail('Funding is disabled');if(await c.getGenesisHash()!==GENESIS)fail('Mainnet assertion failed');};
 const locks=new Set();
 app.post('/api/agents/:id/trading/funding/prepare',auth,async(req,res)=>{
  await gate();const a=owned(req).agent;valid(a);
  const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id);
  const n=req.body.lamports;if(!wallet||!Number.isSafeInteger(n)||n<=0||n>10000000)fail('Funding amount must be 1–10,000,000 lamports');
  const {blockhash,lastValidBlockHeight}=await c.getLatestBlockhash('confirmed');
  const tx=new Transaction({feePayer:new PublicKey(a.creator),recentBlockhash:blockhash}).add(SystemProgram.transfer({fromPubkey:new PublicKey(a.creator),toPubkey:new PublicKey(wallet.address),lamports:n}));
  inspectFunding(tx,a.creator,wallet.address,n);
  const fee=(await c.getFeeForMessage(tx.compileMessage(),'confirmed')).value;
  if(!Number.isSafeInteger(fee)||fee<0||fee>100000)fail('Funding fee unavailable or excessive');
  if(await c.getBalance(new PublicKey(a.creator),'confirmed')<n+fee)fail('Insufficient owner balance');
  const simulation=await c.simulateTransaction(tx);if(simulation.value.err)fail('Funding simulation failed');
  const record={id:randomUUID(),agentId:a.id,owner:a.creator,destination:wallet.address,lamports:n,fee,network:'solana:101',blockhash,lastValidBlockHeight,message:tx.serializeMessage().toString('base64'),transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),status:'Prepared',createdAt:now()};save(record);res.json(record);
 });
 app.post('/api/agents/:id/trading/funding/submit',auth,async(req,res)=>{
  await gate();const a=owned(req).agent;valid(a);if(locks.has(a.id))fail('Funding operation pending');locks.add(a.id);
  try{
   const row=db.prepare('SELECT data FROM agent_funding WHERE id=? AND agent_id=?').get(req.body.id,a.id);if(!row)fail('Funding preparation missing');const r=JSON.parse(row.data);
   if(r.status!=='Prepared'||r.owner!==a.creator)fail('Funding already attempted; check status');
   const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id);if(wallet?.address!==r.destination)fail('Agent wallet changed');
   if(typeof req.body.signedTransaction!=='string'||req.body.signedTransaction.length>4000)fail('Invalid signed funding');
   const tx=Transaction.from(Buffer.from(req.body.signedTransaction,'base64'));inspectFunding(tx,r.owner,r.destination,r.lamports);
   if(tx.serializeMessage().toString('base64')!==r.message||!tx.verifySignatures())fail('Signed funding changed or signature invalid');
   if(await c.getBlockHeight('confirmed')>r.lastValidBlockHeight)fail('Funding expired; no broadcast');
   if(!enabled())fail('Funding disabled before submission');
   r.signature=bs58.encode(tx.signature);r.status='Confirming';save(r); // Durable latch before the only send; never resend on timeout/restart.
   try{const signature=await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'});if(signature!==r.signature)fail('Unexpected RPC signature');}catch{r.uncertain=true;save(r);}
   res.json(r);
  }finally{locks.delete(a.id);}
 });
 app.get('/api/agents/:id/trading/funding/:fundingId',auth,async(req,res)=>{
  const a=owned(req).agent,row=db.prepare('SELECT data FROM agent_funding WHERE id=? AND agent_id=?').get(req.params.fundingId,a.id);if(!row)fail('Funding record missing');const r=JSON.parse(row.data);
  if(r.signature&&r.status==='Confirming'){
   if(await c.getGenesisHash()!==GENESIS)fail('Mainnet assertion failed');
   const tx=await c.getTransaction(r.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   if(tx){if(tx.meta?.err){r.status='Failed';}else{
    if(tx.transaction.message.serialize().toString('base64')!==r.message)fail('Confirmed message mismatch');
    const keys=tx.transaction.message.accountKeys;if(!keys)fail('Unexpected transaction version');
    const i=keys.findIndex(k=>k.toBase58()===r.destination);if(i<0||tx.meta.postBalances[i]-tx.meta.preBalances[i]!==r.lamports)fail('Confirmed funding effect mismatch');
    r.status='Confirmed';r.confirmedAt=now();r.confirmedBalanceLamports=await c.getBalance(new PublicKey(r.destination),'confirmed');
   }save(r);}
  }res.json(r);
 });
}
