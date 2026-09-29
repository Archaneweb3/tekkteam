// Offline proof helper only. Not connected to execution, custody, or production policy.
import { createHash } from 'node:crypto';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
export const CPMM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const hash = (s) => createHash('sha256').update(s).digest().subarray(0, 8);
const pk = (b, o) => new PublicKey(b.subarray(o, o + 32)).toBase58();
const eq = (a, b, reason) => { if (a !== b) throw new Error(reason); };
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, CPMM);
export function inspectCpmmSnapshot(snapshot, expectedPool='7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny') {
  eq(snapshot.genesis, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'NOT_MAINNET');
  const account = (address) => { const a = snapshot.accounts.find(x => x.address === address); if (!a || !a.data) throw new Error('MISSING_ACCOUNT'); return { ...a, bytes: Buffer.from(a.data, 'base64') }; };
  const pool = account(expectedPool);
  eq(pool.owner, CPMM.toBase58(), 'POOL_OWNER'); eq(pool.length, 637, 'POOL_SCHEMA');
  eq(pool.bytes.subarray(0, 8).toString('hex'), hash('account:PoolState').toString('hex'), 'POOL_DISCRIMINATOR');
  const names = ['config', 'creator', 'vault0', 'vault1', 'lpMint', 'mint0', 'mint1', 'program0', 'program1', 'observation'];
  const s = Object.fromEntries(names.map((n, i) => [n, pk(pool.bytes, 8 + i * 32)]));
  s.pool = pool.address; s.authority = pda(Buffer.from('vault_and_lp_mint_auth_seed'))[0].toBase58();
  eq(pool.bytes[328], pda(Buffer.from('vault_and_lp_mint_auth_seed'))[1], 'AUTH_BUMP');
  if (pool.bytes[329] & 4) throw new Error('SWAP_DISABLED');
  s.openTime = pool.bytes.readBigUInt64LE(373); if (s.openTime > BigInt(Math.floor(Date.parse(snapshot.observedAt) / 1000))) throw new Error('POOL_NOT_OPEN');
  if (pool.bytes[389] !== 0 || pool.bytes[390] !== 0) throw new Error('UNSUPPORTED_CREATOR_FEE_MODE');
  const cfg = account(s.config); eq(cfg.owner, CPMM.toBase58(), 'CONFIG_OWNER'); eq(cfg.length, 236, 'CONFIG_SCHEMA'); eq(cfg.bytes.subarray(0, 8).toString('hex'), hash('account:AmmConfig').toString('hex'), 'CONFIG_DISCRIMINATOR');
  const index = Buffer.alloc(2); index.writeUInt16BE(cfg.bytes.readUInt16LE(10)); eq(pda(Buffer.from('amm_config'), index)[0].toBase58(), s.config, 'CONFIG_PDA');
  eq(pda(Buffer.from('pool'), new PublicKey(s.config).toBuffer(), new PublicKey(s.mint0).toBuffer(), new PublicKey(s.mint1).toBuffer())[0].toBase58(), s.pool, 'POOL_PDA');
  const ob = account(s.observation); eq(ob.owner, CPMM.toBase58(), 'OBS_OWNER'); eq(ob.length, 4075, 'OBS_SCHEMA'); eq(ob.bytes.subarray(0, 8).toString('hex'), hash('account:ObservationState').toString('hex'), 'OBS_DISCRIMINATOR');
  eq(pk(ob.bytes, 11), s.pool, 'OBS_POOL'); eq(pda(Buffer.from('observation'), new PublicKey(s.pool).toBuffer())[0].toBase58(), s.observation, 'OBS_PDA');
  s.vaultBalances = []; s.reserves = []; s.feesAccrued = [];
  for (let i = 0; i < 2; i++) {
    eq(s['program' + i], TOKEN_PROGRAM_ID.toBase58(), 'NONCLASSIC_TOKEN');
    const mint = account(s['mint' + i]), vault = account(s['vault' + i]);
    eq(mint.owner, TOKEN_PROGRAM_ID.toBase58(), 'MINT_PROGRAM'); eq(mint.length, 82, 'MINT_EXTENSION'); eq(mint.bytes[45], 1, 'MINT_UNINITIALIZED');
    eq(vault.owner, TOKEN_PROGRAM_ID.toBase58(), 'VAULT_PROGRAM'); eq(vault.length, 165, 'VAULT_EXTENSION'); eq(pk(vault.bytes, 0), mint.address, 'VAULT_MINT'); eq(pk(vault.bytes, 32), s.authority, 'VAULT_AUTHORITY'); eq(vault.bytes[108], 1, 'VAULT_STATE');
    eq(vault.bytes.readUInt32LE(72), 0, 'VAULT_DELEGATE'); eq(vault.bytes.readUInt32LE(129), 0, 'VAULT_CLOSE_AUTHORITY');
    eq(pda(Buffer.from('pool_vault'), new PublicKey(s.pool).toBuffer(), new PublicKey(mint.address).toBuffer())[0].toBase58(), vault.address, 'VAULT_PDA');
    const accrued = pool.bytes.readBigUInt64LE(341 + i * 8) + pool.bytes.readBigUInt64LE(357 + i * 8) + pool.bytes.readBigUInt64LE(397 + i * 8);
    const balance = vault.bytes.readBigUInt64LE(64); if (balance <= accrued) throw new Error('EMPTY_RESERVE');
    s.vaultBalances.push(balance); s.feesAccrued.push(accrued); s.reserves.push(balance - accrued);
  }
  s.tradeFeeRate = cfg.bytes.readBigUInt64LE(12); s.protocolFeeRate = cfg.bytes.readBigUInt64LE(20); s.fundFeeRate = cfg.bytes.readBigUInt64LE(28);
  if (s.tradeFeeRate >= 1000000n || s.protocolFeeRate + s.fundFeeRate > 1000000n) throw new Error('INVALID_FEE_RATES');
  s.creatorFeeRate = 0n; return s;
}
export function quoteCpmm(s, direction, amount, slippageBps = 100) {
  if (![0, 1].includes(direction) || typeof amount !== 'bigint' || amount <= 0n || amount > 18446744073709551615n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) throw new Error('INVALID_INTENT');
  const tradeFee = (amount * s.tradeFeeRate + 999999n) / 1000000n;
  const effectiveInput = amount - tradeFee;
  const output = effectiveInput * s.reserves[1 - direction] / (s.reserves[direction] + effectiveInput);
  if (effectiveInput <= 0n || output <= 0n) throw new Error('ZERO_OUTPUT');
  return { amount, tradeFee, creatorFee: 0n, protocolFee: tradeFee * s.protocolFeeRate / 1000000n, fundFee: tradeFee * s.fundFeeRate / 1000000n, effectiveInput, output, minimumOutput: output * BigInt(10000 - slippageBps) / 10000n };
}
export function buildCpmmSwap(s, agent, direction, amount, minimumOutput) {
  if (![0, 1].includes(direction) || amount <= 0n || minimumOutput <= 0n) throw new Error('INVALID_INTENT');
  const owner = new PublicKey(agent), inputMint = new PublicKey(s['mint' + direction]), outputMint = new PublicKey(s['mint' + (1 - direction)]);
  const roles = ['payer','authority','config','pool','userInput','userOutput','inputVault','outputVault','inputProgram','outputProgram','inputMint','outputMint','observation'];
  const addresses = [owner, new PublicKey(s.authority), new PublicKey(s.config), new PublicKey(s.pool), getAssociatedTokenAddressSync(inputMint, owner), getAssociatedTokenAddressSync(outputMint, owner), new PublicKey(s['vault' + direction]), new PublicKey(s['vault' + (1-direction)]), TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, inputMint, outputMint, new PublicKey(s.observation)];
  const data = Buffer.alloc(24); hash('global:swap_base_input').copy(data); data.writeBigUInt64LE(amount, 8); data.writeBigUInt64LE(minimumOutput, 16);
  const instruction = new TransactionInstruction({ programId: CPMM, keys: addresses.map((pubkey, i) => ({pubkey, isSigner: i === 0, isWritable: [3,4,5,6,7,12].includes(i)})), data });
  return {instruction, roles};
}
// Fixture-scoped decoder factory: no registry insertion or production approval.
export function cpmmProofDecoder(s, agent, direction, amount, minimumOutput) {
  const expected=buildCpmmSwap(s,agent,direction,amount,minimumOutput).instruction;
  return (ix) => {
    if (!ix.programId.equals(CPMM) || !Buffer.from(ix.data).equals(expected.data) || ix.keys.length!==13) throw new Error('CPMM_INSTRUCTION_MISMATCH');
    for(let i=0;i<13;i++) {
      const actual=ix.keys[i], wanted=expected.keys[i];
      // Fee payer may be writable after transaction privilege union.
      if(!actual.pubkey.equals(wanted.pubkey)||actual.isSigner!==wanted.isSigner||(i!==0&&actual.isWritable!==wanted.isWritable)) throw new Error('CPMM_ACCOUNT_MISMATCH');
    }
    return {inputMint:s['mint'+direction],outputMint:s['mint'+(1-direction)],inputAmount:amount.toString(),minimumOutput:minimumOutput.toString(),authority:new PublicKey(agent).toBase58(),inputTokenAccount:expected.keys[4].pubkey.toBase58(),outputTokenAccount:expected.keys[5].pubkey.toBase58()};
  };
}
