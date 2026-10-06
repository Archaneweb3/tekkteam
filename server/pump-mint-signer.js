import {Keypair} from '@solana/web3.js';
import {FINAL_MESSAGE_POLICY} from '../src/pump-wallet-final.js';
const fail=()=>{throw Object.assign(Error('M4_MINT_SIGNER_BINDING_INVALID'),{code:'M4_MINT_SIGNER_BINDING_INVALID',status:409});};
export function createEphemeralMintSigner(store){
 if(!store?.db||typeof store.seal!=='function'||typeof store.unseal!=='function')fail();
 const {db}=store;
 db.exec('CREATE TABLE IF NOT EXISTS m4_ephemeral_mint_signers(execution_id TEXT PRIMARY KEY, binding TEXT NOT NULL, ciphertext TEXT NOT NULL)');
 const binding=s=>JSON.stringify({policy:FINAL_MESSAGE_POLICY,id:s.executionId,owner:s.target.owner,agent:s.target.agentId,mint:s.result.mint,review:s.result.executionReview.digest,message:s.result.executionReview.messageSha256,blockhash:s.result.recentBlockhash,lastValidBlockHeight:s.result.lastValidBlockHeight});
 return Object.freeze({
  // Caller must put this write in the same SQLite transaction as preparation.
  stage(s,secret){let key;try{key=Keypair.fromSecretKey(secret);if(s.walletMessagePolicy!==FINAL_MESSAGE_POLICY||s.status!=='AWAITING_WALLET_APPROVAL'||key.publicKey.toBase58()!==s.result.mint)fail();const b=binding(s);db.prepare('INSERT INTO m4_ephemeral_mint_signers VALUES(?,?,?)').run(s.executionId,b,store.seal(secret,'m4-ephemeral-mint:'+b));}finally{key?.secretKey.fill(0);}},
  sign(s,tx){
   if(s.walletMessagePolicy!==FINAL_MESSAGE_POLICY||s.status!=='OWNER_APPROVED'||s.broadcastAttempted||!s.ownerApprovedTransactionBase64||tx.serialize({requireAllSignatures:false}).toString('base64')!==s.ownerApprovedTransactionBase64)fail();
   const row=db.prepare('SELECT binding,ciphertext FROM m4_ephemeral_mint_signers WHERE execution_id=?').get(s.executionId),b=binding(s);
   if(!row||row.binding!==b)fail();let secret,key;
   try{secret=store.unseal(row.ciphertext,'m4-ephemeral-mint:'+b);key=Keypair.fromSecretKey(secret);if(key.publicKey.toBase58()!==s.result.mint)fail();const message=tx.serializeMessage();tx.partialSign(key);if(!tx.serializeMessage().equals(message)||!tx.verifySignatures(true))fail();return tx.serialize({requireAllSignatures:true,verifySignatures:true}).toString('base64');}
   finally{secret?.fill(0);key?.secretKey.fill(0);}
  },
  // Logical deletion only; SQLite WAL/backups are not physical erasure proof.
  discard(id){db.prepare('DELETE FROM m4_ephemeral_mint_signers WHERE execution_id=?').run(id);}
 });
}
