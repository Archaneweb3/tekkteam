// Read-only public Mainnet snapshot. No wallet or transaction APIs.
import 'dotenv/config';
import {Connection,PublicKey} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {GENESIS} from '../src/pump-readiness.js';
const c=new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com','finalized');
const genesis=await c.getGenesisHash();if(genesis!==GENESIS)throw Error('NOT_MAINNET');
const url='https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/idl/pump_amm.json';
const raw=await(await fetch(url)).text(),idl=JSON.parse(raw);
const commit=await(await fetch('https://api.github.com/repos/pump-fun/pump-public-docs/commits/main')).json();
const P=new PublicKey(idl.address),pool=new PublicKey('GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J');
const a=await c.getAccountInfo(pool);if(!a)throw Error('POOL_ABSENT');
let off=8;const fields={};for(const f of idl.types.find(x=>x.name==='Pool').type.fields){const n={u8:1,u16:2,u64:8,i128:16,bool:1,pubkey:32}[f.type];if(!n)throw Error('UNKNOWN_TYPE');const b=a.data.subarray(off,off+n);fields[f.name]=b.length<n?'ABSENT':f.type==='pubkey'?new PublicKey(b).toBase58():f.type==='bool'?b[0]!==0:f.type==='u8'?b[0]:f.type==='u16'?b.readUInt16LE():f.type==='u64'?b.readBigUInt64LE().toString():((b.readBigInt64LE(8)<<64n)+b.readBigUInt64LE()).toString();off+=n;}
const idx=Buffer.alloc(2);idx.writeUInt16LE(fields.index);
const derived=PublicKey.findProgramAddressSync([Buffer.from('pool'),idx,new PublicKey(fields.creator).toBuffer(),new PublicKey(fields.base_mint).toBuffer(),new PublicKey(fields.quote_mint).toBuffer()],P);
const pumpIdl=await(await fetch('https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/idl/pump.json')).json();
const creator=PublicKey.findProgramAddressSync([Buffer.from('pool-authority'),new PublicKey(fields.base_mint).toBuffer()],new PublicKey(pumpIdl.address))[0];
const global=PublicKey.findProgramAddressSync([Buffer.from('global_config')],P)[0],feeProgram=new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
const fee=PublicKey.findProgramAddressSync([Buffer.from('fee_config'),P.toBuffer()],feeProgram)[0];
const keys=[pool,P,global,fee,feeProgram,...['base_mint','quote_mint','pool_base_token_account','pool_quote_token_account'].map(k=>new PublicKey(fields[k]))];
const infos=await c.getMultipleAccountsInfoAndContext(keys);
const accounts=keys.map((k,i)=>{const x=infos.value[i];return {address:k.toBase58(),owner:x?.owner.toBase58(),executable:x?.executable,lamports:x?.lamports,dataBase64:x?.data.toString('base64'),dataLength:x?.data.length}});
const pd=new PublicKey(infos.value[1].data.subarray(4,36)),pi=await c.getAccountInfo(pd);
const deployment={programData:pd.toBase58(),owner:pi.owner.toBase58(),slot:pi.data.readBigUInt64LE(4).toString(),upgradeAuthority:pi.data[12]?new PublicKey(pi.data.subarray(13,45)).toBase58():null,binaryHash:createHash('sha256').update(pi.data.subarray(45)).digest('hex')};
console.log('EVIDENCE='+JSON.stringify({observedAt:new Date().toISOString(),genesis,slot:infos.context.slot,source:{url,commit:commit.sha,idlSha256:createHash('sha256').update(raw).digest('hex')},fields,pda:{derived:derived[0].toBase58(),bump:derived[1],matches:derived[0].equals(pool),canonicalCreator:creator.toBase58(),creatorMatches:creator.toBase58()===fields.creator},deployment,accounts,schema:{pool:idl.types.find(x=>x.name==='Pool'),global:idl.types.find(x=>x.name==='GlobalConfig'),buy:idl.instructions.find(x=>x.name==='buy_exact_quote_in'),sell:idl.instructions.find(x=>x.name==='sell')}}));
