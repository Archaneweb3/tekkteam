import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import {inspectFundingReview} from '../src/wallet-transfer.js';
import bs58 from 'bs58';
test('Mainnet funding validates before mocked wallet, uses sign-only and canonical account',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 const owner=Keypair.generate(),agent=Keypair.generate(),account={address:owner.publicKey.toBase58(),chains:['solana:mainnet']};let prompts=0,broadcasts=0,sessionOwner=account.address;
 const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:agent.publicKey,lamports:1}));
 const r={id:'r',agentId:'a',kind:'FUND',status:'PREPARED',ownerWallet:account.address,source:account.address,agentWallet:agent.publicKey.toBase58(),destination:agent.publicKey.toBase58(),network:'solana:mainnet',expiresAt:Date.now()+100000,amountLamports:1,blockhash:tx.recentBlockhash,message:tx.serializeMessage().toString('base64'),transaction:tx.serialize({requireAllSignatures:false}).toString('base64')};
 const wallet={name:'Phantom',accounts:[account],features:{'solana:signTransaction':{signTransaction:async input=>{prompts++;assert.equal(input.chain,'solana:mainnet');const signed=Transaction.from(input.transaction);signed.sign(owner);return [{signedTransaction:signed.serialize()}];}},'solana:signAndSendTransaction':{signAndSendTransaction:async()=>{broadcasts++;throw Error('Must not broadcast');}}}};
 globalThis.window=new EventTarget();window.TekkworkSDK={Buffer,Transaction,bs58,inspectFundingReview};window.addEventListener('wallet-standard:app-ready',e=>e.detail.register(wallet));
 globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/review')?r:{session:{address:sessionOwner}}});
 try{
  const {signFundingTransaction}=await import('../public/app/backend.js');
  for(const mutation of [{destination:owner.publicKey.toBase58()},{agentId:'wrong'},{amountLamports:2},{network:'solana:devnet'},{expiresAt:0}])await assert.rejects(signFundingTransaction({...r,...mutation},account.address,agent.publicKey.toBase58(),'a'));
  assert.equal(prompts,0);
  const bytes=await signFundingTransaction(r,account.address,agent.publicKey.toBase58(),'a');assert.equal(Transaction.from(Buffer.from(bytes,'base64')).verifySignatures(),true);assert.equal(prompts,1);assert.equal(broadcasts,0);
  sessionOwner='different';await assert.rejects(signFundingTransaction(r,account.address,agent.publicKey.toBase58(),'a'),/session/);assert.equal(prompts,1);
  sessionOwner=account.address;account.chains=['solana:devnet'];await assert.rejects(signFundingTransaction(r,account.address,agent.publicKey.toBase58(),'a'),/Mainnet/);assert.equal(prompts,1);
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
