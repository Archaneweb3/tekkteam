import {post,request} from './backend.js';
const notified=new Set();
export async function fundAgent(agent,wallet){
 const input=prompt('Mainnet funding amount in SOL (maximum 0.01):');if(input===null)return;
 if(!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(input))throw Error('Enter a valid SOL amount');
 const [whole,fraction='']=input.split('.'),lamports=Number(BigInt(whole)*1000000000n+BigInt(fraction.padEnd(9,'0')));
 if(!Number.isSafeInteger(lamports)||lamports<=0||lamports>10000000)throw Error('Amount must be greater than zero and at most 0.01 SOL');
 const base='/agents/'+encodeURIComponent(agent.id)+'/trading/funding',r=await post(base+'/prepare',{lamports}),provider=window.phantom?.solana;
 if(!provider?.isPhantom||provider.publicKey?.toBase58()!==agent.creator)throw Error('Connect this agent owner in Phantom first');
 if(r.agentId!==agent.id||r.destination!==wallet.address||r.owner!==agent.creator||r.lamports!==lamports||r.network!=='solana:101')throw Error('Funding identity mismatch');
 if(!confirm(`Solana Mainnet\nAgent: ${agent.name}\nDestination: ${r.destination}\nAmount: ${lamports/1e9} SOL\nFee: ${r.fee/1e9} SOL\nReview in Phantom?`))return;
 const {Transaction,Buffer}=window.TekkworkSDK,tx=Transaction.from(Buffer.from(r.transaction,'base64')),message=tx.serializeMessage().toString('base64');
 if(message!==r.message)throw Error('Funding message mismatch');
 const signed=await provider.signTransaction(tx);
 if(provider.publicKey?.toBase58()!==agent.creator||signed.serializeMessage().toString('base64')!==message||!signed.verifySignatures())throw Error('Signed funding mismatch');
 const submitted=await post(base+'/submit',{id:r.id,signedTransaction:signed.serialize().toString('base64')});
 sessionStorage.setItem('funding:'+agent.id,submitted.id);return checkFunding(agent.id,submitted.id);
}
export async function checkFunding(agentId,id=sessionStorage.getItem('funding:'+agentId)){
 if(!id)return null;
 const r=await request('/agents/'+encodeURIComponent(agentId)+'/trading/funding/'+encodeURIComponent(id));
 if(r.status==='Confirmed'&&!notified.has(id)){notified.add(id);window.dispatchEvent(new CustomEvent('tekkwork:balance-changed'));}
 if(r.status==='Failed')throw Error('Funding failed on-chain. No automatic retry.');return r;
}
