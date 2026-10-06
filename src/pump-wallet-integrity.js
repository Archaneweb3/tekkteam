// Public transaction-message diagnostics only. Never include signatures or private keys.
export function describeWalletMessage(bytes,{Transaction,Buffer}){
 const raw=Buffer.from(bytes);let offset=0,count=0,shift=0;
 while(true){if(offset>=3||offset>=raw.length)throw Error('Invalid transaction signature vector');const n=raw[offset++];count|=(n&127)<<shift;if(!(n&128))break;shift+=7;}
 const messageOffset=offset+count*64;if(messageOffset>=raw.length)throw Error('Missing transaction message');
 const tx=Transaction.from(raw),message=tx.compileMessage();
 return {wireMessageBase64:raw.subarray(messageOffset).toString('base64'),compiledMessageBase64:tx.serializeMessage().toString('base64'),blockhash:tx.recentBlockhash,feePayer:tx.feePayer?.toBase58(),signers:tx.signatures.map(s=>s.publicKey.toBase58()),accounts:message.accountKeys.map((k,i)=>({address:k.toBase58(),writable:message.isAccountWritable(i),signer:message.isAccountSigner(i)})),instructions:tx.instructions.map(ix=>({program:ix.programId.toBase58(),accounts:ix.keys.map(k=>({address:k.pubkey.toBase58(),writable:k.isWritable,signer:k.isSigner})),data:Buffer.from(ix.data).toString('base64')})),ownerSignaturePresent:!!tx.signature,signaturesValid:tx.verifySignatures(false),mintSignaturePresent:tx.signatures[1]?.signature!==null};
}
export function walletMessageDifferences(expected,actual){
 return ['wireMessageBase64','compiledMessageBase64','blockhash','feePayer','signers','accounts','instructions'].filter(k=>JSON.stringify(expected[k])!==JSON.stringify(actual[k]));
}
