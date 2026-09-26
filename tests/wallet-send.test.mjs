import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';
test('application requests devnet and keeps mint signature (mock, not Phantom integration)',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  const owner=Keypair.generate(),mint=Keypair.generate();let calls=0;
  const account={address:owner.publicKey.toBase58(),chains:['solana:devnet']};
  const tx=new Transaction({feePayer:owner.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.createAccount({fromPubkey:owner.publicKey,newAccountPubkey:mint.publicKey,lamports:1000,space:82,programId:SystemProgram.programId}));tx.partialSign(mint);
  const bytes=tx.serialize({requireAllSignatures:false}).toString('base64');
  const wallet={name:'Phantom',accounts:[account],features:{
    'standard:connect':{connect:async()=>({accounts:[account]})},
    'solana:signMessage':{signMessage:async()=>[{signature:new Uint8Array(64)}]},
    'solana:signAndSendTransaction':{signAndSendTransaction:async input=>{
      calls++;assert.equal(input.chain,'solana:devnet');assert.equal(input.options.skipPreflight,false);
      const actual=Transaction.from(input.transaction);assert.deepEqual(actual.signatures[1].signature,tx.signatures[1].signature);
      assert.deepEqual(actual.serializeMessage(),tx.serializeMessage());return [{signature:new Uint8Array(64).fill(1)}];
    }},
  }};
  globalThis.window=new EventTarget();window.TekkworkSDK={Buffer,Transaction,bs58};
  window.addEventListener('wallet-standard:app-ready',e=>e.detail.register(wallet));
  globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/challenge')?{id:'test',message:'test'}:{config:{network:'devnet',broadcastEnabled:true}}});
  try {
    const api=await import('../public/app/backend.js');await api.connect(api.wallets()[0].id);
    assert.equal(api.walletDiagnostics().method,'solana:signAndSendTransaction');
    assert.equal(api.walletDiagnostics().walletActiveNetwork,'not exposed by Wallet Standard');
    assert.equal(api.walletDiagnostics().walletSimulation,'not observable by this application');
    assert.equal(await api.sendTestTransaction(bytes,account.address),bs58.encode(new Uint8Array(64).fill(1)));
    account.chains=['solana:mainnet'];await assert.rejects(()=>api.sendTestTransaction(bytes,account.address),/Devnet/);assert.equal(calls,1);
  }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
