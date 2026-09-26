import {Buffer} from 'buffer';
import {PublicKey,Transaction} from '@solana/web3.js';
import {inspectCreation,PAYER,URI} from './pump-readiness.js';
import {evaluateSimulation} from './pump-simulation-policy.js';
export async function debugClick({log}) {
 log('DEPENDENCY_CHECK',{Buffer:typeof Buffer.from,PublicKey:typeof PublicKey,Transaction:typeof Transaction,inspectCreation:typeof inspectCreation});
 const provider=window.phantom?.solana;
 log('PHANTOM_PROVIDER_DETECTED',{exists:!!provider,isPhantom:provider?.isPhantom===true});
 if(!provider)throw Error('window.phantom?.solana is missing. No connect request was attempted.');
 if(provider.isPhantom!==true)throw Error('Provider isPhantom is not true.');
 const publicKey=provider.publicKey?.toBase58?.()??null;
 log('WALLET_PUBLIC_KEY',{publicKey,expected:PAYER,connected:provider.isConnected===true});
 if(!provider.isConnected||!publicKey)throw Error('Phantom is not connected. Debug mode does not call connect.');
 if(publicKey!==PAYER)throw Error('Connected wallet does not match the expected payer.');
 log('WALLET_REQUEST_AUDIT','One signTransaction request after validation. No connect, send, broadcast or retry.');
 let phase='STATIC_VALIDATION',result;
 try{
  const response=await fetch('http://127.0.0.1:4192/prepare',{method:'POST',signal:AbortSignal.timeout(35000)});
  if(!response.ok)throw Error('Preparation HTTP '+response.status+': '+await response.text());
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
  const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.error){const e=Error(event.error.message);e.stack=event.error.stack??e.stack;throw e;}if(event.stage){log(event.stage,event.detail);if(event.stage==='MAINNET_SIMULATION_STARTED')phase='MAINNET_SIMULATION';}if(event.result)result=event.result;};
  while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop();lines.forEach(consume);}pending+=decoder.decode();consume(pending);
  if(!result)throw Error('Missing simulation result');
  if(provider.isConnected!==true||provider.publicKey?.toBase58()!==PAYER)throw Error('Wallet changed during validation');
  if(result.metadataUri!==URI)throw Error('Metadata URI mismatch');
  const bytes=Buffer.from(result.transactionBase64,'base64');
  const context={mint:new PublicKey(result.mint),blockhash:result.recentBlockhash,genesis:result.genesis,chainId:result.chainId};
  inspectCreation(bytes,context);
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(sha!==result.transactionSha256||sha!==result.simulationInputSha256)throw Error('Simulation bytes mismatch');
  const policy=evaluateSimulation(bytes,context,{before:result.before,afterRead:result.afterRead,simulation:result.simulation,fee:result.feeQuote.value});
  log('SPENDING_GUARD_RESULT',{...policy,accountEffects:undefined});
  log('SIMULATION_LOGS',result.simulation.value.logs);
  if(!policy.allowed)throw Error('Spending policy rejected: '+policy.reasons.join(', '));
  log('READY_FOR_PHANTOM_PREVIEW',{network:'Solana Mainnet',chainId:result.chainId,estimatedDebitLamports:policy.estimatedPayerDebitLamports,initialBuyLamports:0});
  phase='PHANTOM';
  log('SIGN_TRANSACTION_REQUESTED','Review Phantom manually. No broadcast. No automatic retry.');
  await provider.signTransaction(Transaction.from(bytes));
  log('PHANTOM_RESOLVED','SIGNED — NOT BROADCAST. Returned transaction discarded; nothing submitted.');
 }catch(e){log(phase+'_PASSED / FAILED',{status:'FAILED',message:e.message,stack:e.stack});throw e;}
}
