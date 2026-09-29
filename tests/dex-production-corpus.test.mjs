import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PublicKey,VersionedTransaction,TransactionInstruction,Keypair} from '@solana/web3.js';
import {decodeMainnetTransaction,resolveMainnetTables,assertAccountProvenance} from '../server/dex/mainnet-accounts.js';
import {validateNativeLifecycle} from '../server/dex/native-lifecycle.js';
import {inspectJupiterRoute,requireApprovedJupiterRoute} from '../server/dex/jupiter-route-policy.js';
import {dexConfiguration} from '../server/dex/config.js';
const corpus=JSON.parse(readFileSync(new URL('./fixtures/jupiter-production-corpus.json',import.meta.url))),tables=JSON.parse(readFileSync(new URL('./fixtures/jupiter-alt-snapshots.json',import.meta.url)));
const rpc=(patch={})=>({getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getAccountInfoAndContext:async key=>{const t=tables.find(t=>t.address===key.toBase58());return {context:{slot:t.slot},value:{owner:new PublicKey(t.owner),executable:false,data:Buffer.from(t.data,'base64')}};},...patch});
const ix=x=>new TransactionInstruction({programId:new PublicKey(x.programId),keys:x.accounts.map(a=>({...a,pubkey:new PublicKey(a.pubkey)})),data:Buffer.from(x.data,'base64')});
const native=(sample=corpus[0])=>({intent:sample.intent,accounts:sample.tokenAccounts.accounts,setup:sample.build.setupInstructions.map(ix),cleanup:[ix(sample.build.cleanupInstruction)]});
const other=Keypair.fromSeed(new Uint8Array(32).fill(44)).publicKey;
test('credentials configure read-only provider but never enable execution',()=>{assert.equal(dexConfiguration({JUPITER_API_KEY:'fixture-not-real',CONTROLLED_REAL_ENABLED:'false'}).enabled,false);assert.throws(()=>dexConfiguration({CONTROLLED_REAL_ENABLED:'true'}),/configuration unavailable/);assert.throws(()=>dexConfiguration({CONTROLLED_REAL_ENABLED:'true',JUPITER_API_KEY:'fixture-not-real'}),/NOT_READY/);assert.throws(()=>dexConfiguration({CONTROLLED_REAL_ENABLED:'yes'}),/Invalid/);});
for(const [n,sample] of corpus.entries())test(`production corpus ${n}: complete RPC ALT resolution, unsigned, route denied`,async()=>{
 assert.equal(sample.notSigned,true);assert.equal(sample.notBroadcast,true);assert.equal(sample.productionSupported,false);
 for(const version of sample.versions.filter(v=>v.unsignedTransaction)){const decoded=await decodeMainnetTransaction(rpc(),version.unsignedTransaction);assert.equal(decoded.messageHash,version.messageHash);assert.deepEqual(decoded.accounts,version.accounts);assert.ok(decoded.transaction.signatures.every(s=>s.every(b=>b===0)));assert.equal(decoded.feePayer,sample.intent.agentWallet);assert.throws(()=>assertAccountProvenance(decoded,new Map()),/UNKNOWN_ACCOUNT/);}
 const route=ix(sample.build.swapInstruction);assert.equal(inspectJupiterRoute(route).supported,false);assert.throws(()=>requireApprovedJupiterRoute(route));
});
test('ALT invalid owner, missing account, deactivated, too-recent extension and index manipulation reject',async()=>{
 const v=corpus[0].versions.find(v=>v.version==='v0'),message=VersionedTransaction.deserialize(Buffer.from(v.unsignedTransaction,'base64')).message;
 for(const mutate of [r=>r.value=null,r=>r.value.owner=other,r=>r.value.executable=true,r=>r.value.data.writeBigUInt64LE(1n,4),r=>r.value.data.writeBigUInt64LE(BigInt(r.context.slot),12)]){const base=rpc();await assert.rejects(resolveMainnetTables(rpc({getAccountInfoAndContext:async key=>{const r=await base.getAccountInfoAndContext(key);mutate(r);return r;}}),message));}
 const copy=VersionedTransaction.deserialize(Buffer.from(v.unsignedTransaction,'base64')).message;copy.addressTableLookups[0].writableIndexes=[255];copy.addressTableLookups[0].readonlyIndexes=[255];await assert.rejects(resolveMainnetTables(rpc(),copy),/ALT_INDEX_INVALID/);
 await assert.rejects(decodeMainnetTransaction(rpc({getGenesisHash:async()=> 'devnet'}),v.unsignedTransaction),/NETWORK_MISMATCH/);
});
test('malicious ALT contents alter resolved accounts and fail independent provenance',async()=>{
 const v=corpus[0].versions.find(v=>v.version==='v0'),tx=VersionedTransaction.deserialize(Buffer.from(v.unsignedTransaction,'base64')),lookup=tx.message.addressTableLookups[0],index=lookup.writableIndexes[0]??lookup.readonlyIndexes[0],base=rpc();
 const evil=rpc({getAccountInfoAndContext:async key=>{const r=await base.getAccountInfoAndContext(key);if(key.equals(lookup.accountKey))Buffer.from(other.toBytes()).copy(r.value.data,56+32*index);return r;}});
 const d=await decodeMainnetTransaction(evil,v.unsignedTransaction);assert.notDeepEqual(d.accounts,v.accounts);const roles=new Map(v.accounts.map(a=>[a.address,{kind:'FIXTURE_APPROVED',writable:a.writable,signer:a.signer}]));assert.throws(()=>assertAccountProvenance(d,roles),/UNKNOWN_ACCOUNT/);
});
test('observed BUY setup/cleanup verifies exact WSOL lifecycle but never route approval',()=>{for(const s of corpus.filter(s=>s.intent.direction==='BUY')){const r=validateNativeLifecycle(native(s));assert.equal(r.setupVerified,true);assert.equal(r.routeVerified,false);}});
test('existing canonical ATA idempotent setup is allowed without claiming it was observed',()=>{const p=native();p.accounts=p.accounts.map(a=>({...a,exists:true}));assert.equal(validateNativeLifecycle(p).setupVerified,true);});
for(const [name,mutate] of [
 ['WSOL close attacker',p=>p.cleanup[0].keys[1].pubkey=other],
 ['WSOL amount increase',p=>p.setup.find(i=>i.data.length===12).data.writeBigUInt64LE(100001n,4)],
 ['ATA owner substitution',p=>p.setup[0].keys[2].pubkey=other],
 ['ATA mint substitution',p=>p.setup[0].keys[3].pubkey=other],
 ['extra System transfer',p=>p.setup.push(p.setup.find(i=>i.data.length===12))],
 ['extra token instruction',p=>p.setup.push(p.cleanup[0])],
 ['unknown setup program',p=>p.setup[0].programId=other]
])test(name+' rejected',()=>{const p=native();mutate(p);assert.throws(()=>validateNativeLifecycle(p));});
