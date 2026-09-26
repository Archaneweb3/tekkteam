import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

export const equalBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function describeTransaction(bytes) {
  const tx = Transaction.from(bytes);
  const message = tx.compileMessage();
  return {
    serializedTransactionBase64: Buffer.from(bytes).toString('base64'),
    serializedByteLength: bytes.length,
    serializedSha256: await sha256(bytes),
    messageBase64: Buffer.from(message.serialize()).toString('base64'),
    messageSha256: await sha256(message.serialize()),
    recentBlockhash: tx.recentBlockhash,
    feePayer: tx.feePayer.toBase58(),
    requiredSignerCount: message.header.numRequiredSignatures,
    messageHeader: message.header,
    messageAccountKeys: message.accountKeys.map(k => k.toBase58()),
    requiredSigners: message.accountKeys.slice(0, message.header.numRequiredSignatures).map(k => k.toBase58()),
    signaturesPresent: tx.signatures.filter(s => s.signature !== null).length,
    instructions: tx.instructions.map(i => ({
      programId: i.programId.toBase58(),
      accountKeys: i.keys.map(k => ({ publicKey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable })),
      dataBase64: i.data.toString('base64'), dataHex: i.data.toString('hex'), dataUtf8: i.data.toString('utf8'),
    })),
  };
}
export async function compareCapture(encoded, encoding, kind, baseline) {
  if (!encoded.trim() || encoded.length > 20000) throw new Error('Paste only the serialized transaction or message (maximum 20 KB), not a HAR or headers.');
  const input = encoded.trim();
  if (encoding === 'base64' && !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) throw new Error('Invalid base64');
  const bytes = encoding === 'base58' ? bs58.decode(input) : Buffer.from(input, 'base64');
  if (encoding === 'base64' && Buffer.from(bytes).toString('base64').replace(/=+$/, '') !== input.replace(/=+$/, '')) throw new Error('Invalid base64 encoding');
  const expected = Buffer.from(baseline.serializedTransactionBase64, 'base64');
  const expectedMessage = Buffer.from(baseline.messageBase64, 'base64');
  const result = { source: 'Manually pasted DevTools capture; provenance and chain must be checked independently', kind, encoding,
    capturedByteLength: bytes.length, capturedSha256: await sha256(bytes) };
  if (kind === 'message') return { ...result, transactionBytesMatch: 'Not observable from message-only capture', messageBytesMatch: equalBytes(bytes, expectedMessage) };
  const decoded = await describeTransaction(bytes);
  return { ...result, transactionBytesMatch: equalBytes(bytes, expected),
    messageBytesMatch: equalBytes(Buffer.from(decoded.messageBase64, 'base64'), expectedMessage), decoded };
}
