import {Transaction} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {inspectCreation} from './pump-readiness.js';
import {validateFinalWalletMessage} from './pump-wallet-final.js';
// Prepared intent is still checked by the original decoder.
export function inspectFinalCreation(bytes,context){
 const r=context.finalMessageResult,base=inspectCreation(Buffer.from(r.transactionBase64,'base64'),context);
 const final=validateFinalWalletMessage(r.transactionBase64,Buffer.from(bytes).toString('base64'),r,{Transaction,Buffer},context.finalMessageRequiresAllSignatures===true);
 return {...base,...(final.assertion?{lighthouse:final.assertion,accounts:[...base.accounts,{name:'lighthouse_program',address:final.assertion.program,signer:false,writable:false}]}:{}),finalMessageBase64:final.finalMessage.toString('base64')};
}
