import { Connection, PublicKey, Transaction, VersionedTransaction, SystemProgram, Keypair } from '@solana/web3.js';
import { MINT_SIZE, ACCOUNT_SIZE, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getMinimumBalanceForRentExemptMint, createInitializeMint2Instruction, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createMintToInstruction, createSetAuthorityInstruction, AuthorityType } from '@solana/spl-token';
import bs58 from 'bs58';

// Devnet-only token issuance. This is deliberately NOT a pump.fun launch adapter.
export function devnetChain(rpc, injectedConnection) {
  const connection = injectedConnection || new Connection(rpc, { commitment: 'confirmed', confirmTransactionInitialTimeout: 30000, disableRetryOnRateLimit: true, fetch: (url, options) => fetch(url, {...options,signal:AbortSignal.timeout(15000)}) });
  async function verifyNetwork() {
    if (await connection.getGenesisHash() !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('RPC is not Solana devnet');
  }
  return {
    async health() { await verifyNetwork(); return { ready: true, network: 'devnet', slot: await connection.getSlot('confirmed') }; },
    async wallet(address) { await verifyNetwork(); return { network:'devnet', balanceSol:await connection.getBalance(new PublicKey(address),'confirmed') / 1e9 }; },
    async preflight(launch, owner) {
      await verifyNetwork();
      const tx = Transaction.from(Buffer.from(launch.transaction, 'base64'));
      if (tx.feePayer.toBase58() !== owner) throw new Error('Prepared payer mismatch');
      const height = await connection.getBlockHeight('finalized');
      if (height > launch.lastValidBlockHeight) throw Object.assign(new Error('Blockhash expired. Review the same draft again.'), {status:409});
      const balanceSol = await connection.getBalance(tx.feePayer, 'confirmed') / 1e9;
      if (balanceSol < launch.estimatedCostSol) throw Object.assign(new Error('Insufficient devnet test SOL'),{status:422});
      // Simulate the exact message; do not replace its blockhash or request a user signature.
      const result = await connection.simulateTransaction(VersionedTransaction.deserialize(Buffer.from(launch.transaction,'base64')), {sigVerify:false,replaceRecentBlockhash:false,commitment:'finalized'});
      if (result.value.err) throw Object.assign(new Error(`Devnet simulation failed: ${JSON.stringify(result.value.err)}`),{status:422});
      return {network:'solana:devnet',payer:owner,balanceSol,blockhash:tx.recentBlockhash,lastValidBlockHeight:launch.lastValidBlockHeight,currentBlockHeight:height,simulation:'passed',signatureVerification:false,checkedAt:Date.now(),unitsConsumed:result.value.unitsConsumed};
    },
    async prepare(agent, secret) {
      await verifyNetwork();
      const payer = new PublicKey(agent.creator), mint = Keypair.fromSecretKey(secret);
      const rent = await getMinimumBalanceForRentExemptMint(connection);
      // Wallet simulation uses a different RPC. Finalized hashes reduce cross-node fork/lag mismatch.
      const recent = await connection.getLatestBlockhash('finalized');
      const ata = getAssociatedTokenAddressSync(mint.publicKey, payer);
      const tx = new Transaction({ feePayer: payer, ...recent }).add(
        SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
        createInitializeMint2Instruction(mint.publicKey, 6, payer, null),
        createAssociatedTokenAccountInstruction(payer, ata, payer, mint.publicKey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
        createMintToInstruction(mint.publicKey, ata, payer, 1_000_000_000_000n),
        createSetAuthorityInstruction(mint.publicKey, payer, AuthorityType.MintTokens, null),
      );
      const fee = (await connection.getFeeForMessage(tx.compileMessage(), 'confirmed')).value;
      if (fee === null) throw new Error('RPC could not quote a network fee');
      const tokenRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
      const estimatedLamports = rent + tokenRent + fee;
      const balance = await connection.getBalance(payer, 'confirmed');
      if (balance < estimatedLamports) throw Object.assign(new Error(`Not enough devnet SOL. Need approximately ${(estimatedLamports / 1e9).toFixed(6)} test SOL. Add test SOL through the Solana faucet, then try again.`), { status:422 });
      tx.partialSign(mint);
      return { transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'), message: tx.serializeMessage().toString('base64'), mint: mint.publicKey.toBase58(), lastValidBlockHeight: recent.lastValidBlockHeight, estimatedCostSol:estimatedLamports / 1e9, balanceSol:balance / 1e9, expiresAt: Date.now() + 90_000 };
    },
    async submit(serialized, expectedMessage) {
      await verifyNetwork();
      let tx;
      try { tx = Transaction.from(Buffer.from(serialized, 'base64')); }
      catch { throw Object.assign(new Error('Invalid signed transaction'),{status:400}); }
      if (tx.serializeMessage().toString('base64') !== expectedMessage || !tx.verifySignatures()) throw Object.assign(new Error('Transaction differs from the approved devnet mint'),{status:400});
      const signature = bs58.encode(tx.signature);
      // Return the deterministic signature before submission to let the caller persist it.
      return { signature, send: () => connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment:'finalized', maxRetries: 2 }) };
    },
    async walletStatus(launch) {
      await verifyNetwork();
      const mint=new PublicKey(launch.mint);
      const finalized=await connection.getEpochInfo('finalized');
      if(finalized.blockHeight>launch.lastValidBlockHeight) {
        // This flow creates a persistent legacy SPL mint (not a closable
        // Token-2022 mint). Once the hash is finalized-expired, absence at that
        // same or later finalized slot proves this mint did not succeed.
        // Avoid unavailable history queries for a mint that never existed.
        const balance=await connection.getBalanceAndContext(mint,{commitment:'finalized',minContextSlot:finalized.absoluteSlot});
        if(balance.context.slot>=finalized.absoluteSlot && balance.value===0)return {status:'expired'};
      }
      const find=async()=>{
        const rows=await connection.getSignaturesForAddress(mint,{limit:20},'confirmed');
        for(const row of rows) {
          const tx=await connection.getTransaction(row.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
          if(!tx || Buffer.from(tx.transaction.message.serialize()).toString('base64')!==launch.message)continue;
          if(!tx.meta)return {status:'pending'};
          return {status:tx.meta.err?'failed':'confirmed',signature:row.signature};
        }
        return null;
      };
      const found=await find();if(found)return found;
      // A nonzero or insufficiently fresh balance is not expiry evidence.
      // Keep unknown existing mints pending rather than issue another launch.
      return {status:'pending'};
    },
    async status(signature, lastValidBlockHeight) {
      await verifyNetwork();
      const result = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const s = result.value[0];
      if (!s && Number.isSafeInteger(lastValidBlockHeight) && await connection.getBlockHeight('finalized') > lastValidBlockHeight) {
        // Re-query after the finalized height: never infer expiry from wall time alone.
        const again = (await connection.getSignatureStatuses([signature], {searchTransactionHistory:true})).value[0];
        if (!again) return 'expired';
        return again.err ? 'failed' : ['confirmed','finalized'].includes(again.confirmationStatus) ? 'confirmed' : 'pending';
      }
      return !s ? 'pending' : s.err ? 'failed' : ['confirmed', 'finalized'].includes(s.confirmationStatus) ? 'confirmed' : 'pending';
    },
  };
}
