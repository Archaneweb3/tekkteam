import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parse} from 'dotenv';
import bs58 from 'bs58';
import {GENESIS} from '../src/pump-readiness.js';

export async function inspectExistingLaunchTransaction({endpoint,record,request=fetch}){
 if(new URL(endpoint).protocol!=='https:')throw Error('EXISTING_TX_HTTPS_REQUIRED');
 if(record?.id!=='44580b98-2b82-48bb-bfd7-54c368e130d5'||record.mint!=='4Lr5S4tugXweyUCV55dSdjp2JU55onpCM3VeRah5qE9S'||typeof record.signature!=='string'||bs58.decode(record.signature).length!==64)throw Error('EXISTING_TX_RECORD_MISMATCH');
 let id=0;
 const rpc=async(method,params)=>{try{const n=++id,r=await request(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:n,method,params}),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||j.id!==n||j.error||!Object.hasOwn(j,'result'))throw Error();return j.result;}catch{throw Error('EXISTING_TX_READ_FAILED_NO_RETRY');}};
 if(await rpc('getGenesisHash',[])!==GENESIS)throw Error('EXISTING_TX_GENESIS_MISMATCH');
 const tx=await rpc('getTransaction',[record.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]);
 const base={schema:'EXISTING_LAUNCH_READ_V1',transactionCalls:1,notSigned:true,notBroadcast:true,associationVerified:false,missingAssociation:['agentId','owner','applicationIntentOrRequestBinding'],mint:record.mint};
 if(!tx)return {...base,status:'UNAVAILABLE_OR_PRUNED',confirmedLaunch:false};
 if(tx.transaction?.signatures?.[0]!==record.signature||!Number.isSafeInteger(tx.slot)||!tx.meta)throw Error('EXISTING_TX_RESPONSE_BINDING');
 const instructions=[...(tx.transaction.message.instructions??[]),...(tx.meta.innerInstructions??[]).flatMap(x=>x.instructions??[])];
 const mintBalances=[...(tx.meta.preTokenBalances??[]),...(tx.meta.postTokenBalances??[])].filter(x=>x.mint===record.mint);
 return {...base,status:tx.meta.err?'FINALIZED_FAILED':'FINALIZED_SUCCESS_OBSERVED',slot:tx.slot,feeLamports:String(tx.meta.fee),errorPresent:tx.meta.err!==null,programs:[...new Set(instructions.map(i=>i.programId).filter(x=>typeof x==='string'))],mintInTokenBalances:mintBalances.length>0,mintInAccountKeys:(tx.transaction.message.accountKeys??[]).some(k=>(typeof k==='string'?k:k.pubkey)===record.mint),parsedMintInstructionTypes:instructions.filter(i=>i.parsed?.info?.mint===record.mint).map(i=>i.parsed.type),signerCount:(tx.transaction.message.accountKeys??[]).filter(k=>k.signer===true).length,confirmedLaunch:false,reason:'TRANSACTION_FINALITY_DOES_NOT_ESTABLISH_APPLICATION_AGENT_ASSOCIATION'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const root='artifacts/launchpad-continuation/direct-delivery/';if(fs.existsSync(root+'existing-launch-transaction.json'))throw Error('EXISTING_TX_AUTHORIZATION_CONSUMED');fs.writeFileSync(root+'existing-launch-transaction-claim.json',JSON.stringify({consumed:true,scope:'ONE_EXISTING_GET_TRANSACTION',notSigned:true,notBroadcast:true}),{flag:'wx'});const env=parse(fs.readFileSync('.env')),record=JSON.parse(fs.readFileSync('server/data/pump-mainnet-launch.json'));const report=await inspectExistingLaunchTransaction({endpoint:env.MAINNET_RPC_URL,record});fs.writeFileSync(root+'existing-launch-transaction.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,transactionCalls:report.transactionCalls,associationVerified:false,slot:report.slot??null}));}catch(e){console.error(e.message?.startsWith('EXISTING_TX_')?e.message:'EXISTING_TX_FAILED');process.exitCode=1;}
}
