// Read-only, version-specific probe of installed PUBLIC extension code.
// Never reads a browser profile database, opens a wallet, signs or broadcasts.
// Usage: node scripts/inspect-phantom-adapter.mjs <extension-directory>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Keypair, VersionedTransaction, Transaction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

const directory=process.argv[2];
if(!directory)throw new Error('Pass the installed Phantom extension directory, not its profile data directory.');
const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
assert.equal(manifest.version,'26.30.2','This source inspection is pinned to 26.30.2. Review extraction for another version.');
const source=await readFile(join(directory,'solana.js'),'utf8');
const start=source.indexOf('Vu=class r{');
const end=source.indexOf('});var Gv,',start);
assert.ok(start>=0 && end>start,'Adapter source boundaries changed');
const adapterSource=source.slice(start+3,end);
const chains=['solana:mainnet','solana:devnet','solana:testnet','solana:localnet'];
class Account {
  constructor(props){Object.assign(this,props);}
  equals(other){return other===this;}
}
const Adapter=vm.runInNewContext('('+adapterSource+')',{
  Si:'',vi:chains,DF:[],Uo:Account,Ap:(a,b)=>Buffer.from(a).equals(Buffer.from(b)),
  Sp:chain=>chains.includes(chain),dn:VersionedTransaction,Vv:{default:bs58},Uint8Array,
},{timeout:1000});
const key=Keypair.generate().publicKey;
const calls=[];
const provider={
  publicKey:key,on(){},request:async()=>({}),connect:async()=>({}),
  signAndSendTransaction:async(transaction,options)=>{
    calls.push({options,message:Buffer.from(transaction.message.serialize()).toString('base64')});
    return {signature:bs58.encode(new Uint8Array(64).fill(1))};
  },
};
const wallet=new Adapter(provider);
const {accounts:[account]}=await wallet.features['standard:connect'].connect();
const tx=new Transaction({feePayer:key,recentBlockhash:Keypair.generate().publicKey.toBase58()})
  .add(SystemProgram.transfer({fromPubkey:key,toPubkey:key,lamports:0}));
const bytes=tx.serialize({requireAllSignatures:false});
await wallet.features['solana:signAndSendTransaction'].signAndSendTransaction({
  account,chain:'solana:devnet',transaction:bytes,
  options:{skipPreflight:false,preflightCommitment:'finalized',maxRetries:2},
});
assert.equal(calls.length,1);
assert.equal(calls[0].message,tx.serializeMessage().toString('base64'));
assert.equal('chain' in calls[0].options,false);
assert.equal(calls[0].options.skipPreflight,false);
console.log(JSON.stringify({
  extensionVersion:manifest.version,
  sourceSha256:createHash('sha256').update(source).digest('hex'),
  requestedChain:'solana:devnet',advertisedChains:account.chains,
  injectedProviderOptions:calls[0].options,
  chainForwardedToInjectedProvider:false,messageUnchanged:true,
  limitation:'Adapter executed with a stub provider. Does not prove which network the real wallet selected, or reproduce its simulation warning.',
},null,2));
