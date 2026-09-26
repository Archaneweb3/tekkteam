import { Buffer } from 'buffer';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { networkConfig } from './networks.js';

export const MAINNET_MEMO = 'TEKKWORK MAINNET SAFETY: preview only; do not approve';
const allowed = new Set(['getGenesisHash','getAccountInfo','getBalance','getLatestBlockhash','getFeeForMessage','simulateTransaction','isBlockhashValid']);
export function readOnlyRpc(endpoint, fetcher = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(['localhost','127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new Error('RPC requires HTTPS');
  let id = 0;
  return async (method, params = []) => {
    if (!allowed.has(method)) throw new Error('MAINNET SAFETY MODE: RPC method blocked');
    const response = await fetcher(endpoint, { method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:++id,method,params}), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(`RPC ${method} failed (${body.error.code})`);
    return body.result;
  };
}
export function assertSafetyMemo(bytes, expectedOwner) {
  const c = networkConfig('MAINNET'), tx = Transaction.from(bytes);
  if (tx.feePayer?.toBase58() !== expectedOwner || tx.signatures.length !== 1 || tx.signatures.some(s => s.signature)) throw new Error('Safety payer/signature mismatch');
  const i = tx.instructions[0];
  if (tx.instructions.length !== 1 || i.programId.toBase58() !== c.programs.memo || i.keys.length || i.data.toString() !== MAINNET_MEMO) throw new Error('Only the fixed, unsigned safety Memo is allowed');
  return tx;
}
export async function prepareMainnetMemo(owner, rpc) {
  const c = networkConfig('MAINNET');
  const payer = new PublicKey(owner);
  if (!PublicKey.isOnCurve(payer.toBytes())) throw new Error('Expected an on-curve wallet');
  const genesis = await rpc('getGenesisHash');
  if (genesis !== c.genesis) throw new Error('Wrong cluster: expected Mainnet genesis');
  const account = await rpc('getAccountInfo',[owner,{encoding:'base64',commitment:'finalized'}]);
  if (!account.value || account.value.executable || account.value.owner !== '11111111111111111111111111111111') throw new Error('Mainnet wallet must exist and be system-owned');
  const program = await rpc('getAccountInfo',[c.programs.memo,{encoding:'base64',commitment:'finalized'}]);
  if (!program.value?.executable) throw new Error('Memo program not verified executable on Mainnet');
  const recent = await rpc('getLatestBlockhash',[{commitment:'finalized'}]);
  const tx = new Transaction({feePayer:payer,...recent.value}).add(new TransactionInstruction({programId:new PublicKey(c.programs.memo),keys:[],data:Buffer.from(MAINNET_MEMO)}));
  const bytes = tx.serialize({requireAllSignatures:false,verifySignatures:false});
  assertSafetyMemo(bytes,owner);
  const fee = await rpc('getFeeForMessage',[tx.serializeMessage().toString('base64'),{commitment:'finalized'}]);
  if (!Number.isSafeInteger(fee.value) || fee.value < 0 || fee.value > c.maxFeeLamports) throw new Error('Invalid or excessive fee quote');
  if (account.value.lamports < c.maxFeeLamports + c.reserveLamports) throw new Error('Insufficient real SOL for conservative fee budget plus reserve; no preview requested');
  const simulation = await rpc('simulateTransaction',[bytes.toString('base64'),{encoding:'base64',sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized',minContextSlot:recent.context.slot}]);
  if (simulation.value.err) throw new Error(`Mainnet simulation failed: ${JSON.stringify(simulation.value.err)}`);
  return {network:'MAINNET',safetyMode:true,broadcastEnabled:false,genesis,payer:owner,
    wallet:{exists:true,lamports:account.value.lamports,owner:account.value.owner,slot:account.context.slot},
    verifiedProgram:{address:c.programs.memo,executable:true,owner:program.value.owner,slot:program.context.slot},
    recent:recent.value,feeLamports:fee.value,feeBudgetLamports:c.maxFeeLamports,reserveLamports:c.reserveLamports,
    transaction:bytes.toString('base64'),simulation,preparedAt:new Date().toISOString()};
}
