// Prints public on-chain accounts for a deterministic fixture; never writes or signs.
import 'dotenv/config';
import {PublicKey} from '@solana/web3.js';
import {createRealMoneyNetwork} from '../server/real-money-network.js';
import {CPMM,inspectCpmmSnapshot} from '../server/dex/concrete-cpmm-proof.js';

const pool=process.argv[2];if(!pool)throw Error('POOL_REQUIRED');
const net=createRealMoneyNetwork();await net.verify();
const conn=net.connection,first=await conn.getAccountInfoAndContext(new PublicKey(pool),'confirmed');
if(!first.value?.owner.equals(CPMM)||first.value.data.length!==637)throw Error('POOL_PROVENANCE_FAILED');
const b=first.value.data,addresses=[...new Set([pool,CPMM.toBase58(),...Array.from({length:10},(_,i)=>new PublicKey(b.subarray(8+i*32,40+i*32)).toBase58())])];
const fetched=await conn.getMultipleAccountsInfoAndContext(addresses.map(x=>new PublicKey(x)),{commitment:'confirmed',minContextSlot:first.context.slot});
if(fetched.context.slot<first.context.slot||fetched.value.length!==addresses.length||!fetched.value[0]?.data.equals(b))throw Error('SLOT_FENCE_FAILED');
const snapshot={genesis:await conn.getGenesisHash(),observedAt:new Date().toISOString(),slot:fetched.context.slot,accounts:addresses.map((address,i)=>({address,owner:fetched.value[i]?.owner.toBase58()??null,length:fetched.value[i]?.data.length??null,data:fetched.value[i]?.data.toString('base64')??null}))};
inspectCpmmSnapshot(snapshot,pool);
process.stdout.write(JSON.stringify(snapshot));
