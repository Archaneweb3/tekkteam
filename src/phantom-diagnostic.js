import { Buffer } from 'buffer';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { describeTransaction, equalBytes, compareCapture } from './diagnostic-evidence.js';

window.Buffer = Buffer;
const button = document.querySelector('#test');
const output = document.querySelector('#result');
const owner = 'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const variant = new URLSearchParams(location.search).get('variant') || 'A';
if (!['A', 'B', 'C'].includes(variant)) throw new Error('Unknown diagnostic variant');
const report = value => { output.textContent = JSON.stringify(value, null, 2); };
const local = import.meta.env.DEV && ['127.0.0.1', 'localhost'].includes(location.hostname);
let lastEvidence = null;
const providerSnapshot = wallet => ({
  capturedAt: new Date().toISOString(), provider: 'window.phantom.solana',
  isPhantom: wallet.isPhantom === true, isConnected: wallet.isConnected === true,
  publicKey: wallet.publicKey?.toBase58() || null,
  method: 'signTransaction', clusterArgument: 'None: injected signTransaction does not take the app RPC endpoint',
  walletActiveCluster: 'Not exposed by documented injected provider API',
  simulatorRpcEndpoint: 'Not observable from this page',
  simulatorChainId: 'Not observable from this page',
  browserUserAgent: navigator.userAgent, origin: location.origin,
});
document.querySelector('#compare').onclick = async () => {
  const target = document.querySelector('#comparison');
  try {
    if (!lastEvidence?.providerCall?.transaction) throw new Error('Run a diagnostic first to establish a baseline.');
    const result = await compareCapture(document.querySelector('#capture-bytes').value,
      document.querySelector('#capture-encoding').value, document.querySelector('#capture-kind').value,
      lastEvidence.providerCall.transaction);
    target.textContent = JSON.stringify({ ...result,
      manuallyReportedChainId: document.querySelector('#capture-chain').value || 'Unknown',
      manuallyReportedSimulationResponse: document.querySelector('#capture-response').value || 'Not captured',
      conclusion: 'Byte comparisons only. Chain labels do not prove upstream RPC/account state.',
    }, null, 2);
  } catch (error) { target.textContent = error.message; }
};
button.disabled = !local;
button.onclick = async () => {
  if (!local || button.disabled) return;
  button.disabled = true;
  lastEvidence = null;
  document.querySelector('#comparison').textContent = 'New run: independent Phantom capture not available.';
  for (const id of ['capture-bytes', 'capture-chain', 'capture-response']) document.querySelector('#' + id).value = '';
  let evidence = { test: variant, structure: { A: 'memo-only', B: 'captured-compute-budget-plus-memo', C: 'zero-lamport-self-transfer' }[variant], method: 'injected signTransaction', broadcast: false };
  try {
    const wallet = window.phantom?.solana;
    if (!wallet?.isPhantom) throw new Error('Open this page in a browser with Phantom.');
    // Silent trusted reconnect only; no login/sign-message or permission automation.
    await wallet.connect({ onlyIfTrusted: true });
    if (wallet.publicKey?.toBase58() !== owner) throw new Error('Select the expected devnet wallet before testing.');
    const rpc = new Connection('https://api.devnet.solana.com', {
      commitment: 'finalized', disableRetryOnRateLimit: true,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    });
    const genesisHash = await rpc.getGenesisHash();
    if (genesisHash !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('Not devnet');
    const recent = await rpc.getLatestBlockhash('finalized');
    const payer = new PublicKey(owner);
    const tx = new Transaction({ feePayer: payer, ...recent });
    // Diagnostic variants only; exact previously captured Compute Budget data.
    if (variant === 'B') for (const hex of ['03d8b8050000000000', '02400d0300']) tx.add(new TransactionInstruction({
      programId: new PublicKey('ComputeBudget111111111111111111111111111111'), keys: [], data: Buffer.from(hex, 'hex'),
    }));
    if (variant === 'C') tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 }));
    else tx.add(new TransactionInstruction({
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys: [], data: Buffer.from('TEKKWORK devnet preview diagnostic'),
    }));
    const balance = await rpc.getBalance(payer, 'finalized');
    const simulatedBytes = tx.serialize({ requireAllSignatures: false });
    const simulatedTransaction = await describeTransaction(simulatedBytes);
    const fee = await rpc.getFeeForMessage(tx.compileMessage(), 'finalized');
    const simulation = await rpc.simulateTransaction(VersionedTransaction.deserialize(simulatedBytes), {
      sigVerify: false, replaceRecentBlockhash: false, commitment: 'finalized',
    });
    evidence = { ...evidence, payer: owner, network: 'devnet', balanceSol: balance / 1e9, blockhash: recent.blockhash,
      lastValidBlockHeight: recent.lastValidBlockHeight, rpcSimulation: simulation.value.err || 'passed',
      logs: simulation.value.logs, preparedAt: new Date().toISOString(), walletPreview: 'Not invoked yet',
      rpcEvidence: { endpoint: rpc.rpcEndpoint, genesisHash, commitment: 'finalized',
        blockhashSource: rpc.rpcEndpoint, expectedFeeLamports: fee.value, feeContextSlot: fee.context.slot,
        simulationConfig: { sigVerify: false, replaceRecentBlockhash: false, commitment: 'finalized' },
        simulationSlot: simulation.context.slot, unitsConsumed: simulation.value.unitsConsumed, transaction: simulatedTransaction },
      phantomInternalRequest: { status: 'Not observed. Extension traffic is isolated from page fetch/network instrumentation.',
        chainId: null, serializedTransaction: null, simulationResponse: null },
    };
    report(evidence);
    if (simulation.value.err) throw new Error('RPC simulation failed; wallet request not opened');
    const boundaryBytes = tx.serialize({ requireAllSignatures: false });
    const boundaryTransaction = await describeTransaction(boundaryBytes);
    // Recheck synchronously after hashing: no await between this check and provider invocation.
    const immediateBytes = tx.serialize({ requireAllSignatures: false });
    if (!equalBytes(boundaryBytes, immediateBytes) || !equalBytes(simulatedBytes, immediateBytes)) throw new Error('Transaction mutated between RPC simulation and provider call; preview blocked');
    if (wallet.publicKey?.toBase58() !== owner) throw new Error('Wallet account changed; preview blocked');
    evidence.providerCall = { transaction: boundaryTransaction, provider: providerSnapshot(wallet),
      invokedAt: new Date().toISOString(), rpcBytesMatchProviderArgument: true,
      phantomInternalBytesMatch: 'Unknown: provider argument is not proof of internal simulator payload' };
    evidence.walletPreview = 'Inspect Phantom, then cancel';
    lastEvidence = evidence;
    report(evidence);
    await wallet.signTransaction(tx);
    report({ ...evidence, walletPreview: 'Signature returned and discarded. NOTHING broadcast.' });
  } catch (error) {
    report({ ...evidence, result: error.message, code: error.code, broadcast: false });
  } finally { button.disabled = !local; }
};
