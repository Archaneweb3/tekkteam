import {PublicKey} from '@solana/web3.js';

// Pure authority projection: no journal, RPC, signing, execution or request reads.
export function resolveAssociatedCoinPaperPolicy({agent,paperState,receipt,scope}={}){
 const unavailable=reason=>({kind:'UNAVAILABLE',mint:null,available:false,reason});
 if(!scope||scope.available!==true||typeof scope.scoped!=='boolean'||scope.reason!==null)return unavailable('LAUNCHPAD_SCOPE_UNAVAILABLE');
 if(!agent?.id||!agent?.creator)return unavailable('AGENT_BINDING_UNAVAILABLE');
 if(paperState!=null&&(typeof paperState!=='object'||Array.isArray(paperState)||paperState.agentId!==agent.id))return unavailable('PAPER_STATE_UNAVAILABLE');
 const present=paperState!=null&&Object.hasOwn(paperState,'targetPolicy'),policy=paperState?.targetPolicy;
 if(present&&!['GENERAL','ASSOCIATED_COIN'].includes(policy))return unavailable('PAPER_POLICY_INVALID');
 if(scope.scoped&&policy==='GENERAL')return unavailable('PAPER_POLICY_CONFLICT');
 if(!scope.scoped&&policy!=='ASSOCIATED_COIN')return {kind:'GENERAL',mint:null,available:true,reason:null};
 if(!receipt||receipt.agentId!==agent.id||receipt.owner!==agent.creator||receipt.network!=='solana:101'||receipt.status!=='Success'||receipt.confirmed!==true||typeof receipt.signature!=='string'||!receipt.signature.trim()||typeof receipt.mint!=='string')return unavailable('ASSOCIATED_RECEIPT_UNAVAILABLE');
 let mint;try{mint=new PublicKey(receipt.mint).toBase58();if(mint!==receipt.mint)throw Error();}catch{return unavailable('ASSOCIATED_MINT_INVALID');}
 if(paperState?.position&&paperState.position.mint!==mint)return unavailable('ASSOCIATED_POSITION_CONFLICT');
 return {kind:'ASSOCIATED_COIN',mint,available:true,reason:null};
}
