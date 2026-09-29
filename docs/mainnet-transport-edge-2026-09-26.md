# Mainnet RPC transport and Phantom observation

Date: 2026-09-26. Evidence: [sanitized JSON](mainnet-transport-edge-2026-09-26.json).

## Outcome

The browser transport blocker is fixed locally. All required Mainnet RPC calls passed in Edge. One memo-only injected signTransaction call was invoked. Its captured Phantom simulation request uses solana:101 and its response no longer contains the Devnet AccountNotFound / INSUFFICIENT_FUNDS / NETWORK_NOT_SUPPORTED combination. Safeguard error is null, but a no-balance-changes warning remains. This is **not** a warning-free or production-readiness claim.

**Cancellation exception:** the provider promise resolved before cancellation was possible. The page reports "Unexpected approval: returned signature discarded; nothing broadcast". The assistant performed zero wallet approval actions. No returned signature/result was inspected or retained, so its cryptographic validity and the reason for resolution are unknown. There was no pending request left to cancel; no second preview was attempted. Do not describe this as a cancelled preview or claim that no approval occurred. A question was sent to the user to clarify whether they clicked Confirm. No transaction was broadcast by this diagnostic.

## 403 isolation

Endpoint: https://api.mainnet-beta.solana.com . Same getGenesisHash JSON body, same machine:

| Request variation | HTTP | Response |
|---|---:|---|
| Server request without Origin | 200 | Mainnet genesis; Access-Control-Allow-Origin: backend_traffic |
| Add Origin: http://127.0.0.1:5188 | 403 | JSON-RPC code 403, Access forbidden; Access-Control-Allow-Origin: * |
| Origin plus browser-like Referer and User-Agent | 403 | Same Access forbidden |
| Browser-style OPTIONS preflight | 200 | Origin allowed; methods OPTIONS, POST, GET |

The controlled difference demonstrates origin-dependent upstream denial. It is not merely the browser withholding a successful response under CORS. No API key is configured in this public endpoint, and its Mainnet genesis is correct. Exact provider policy internals are unknown. [Solana's documentation](https://solana.com/docs/references/clusters) describes public RPC 403 as IP/website blocking and warns against production reliance on public endpoints.

## Transport change only

Run `node server/mainnet-rpc.js`, then the existing Vite server on 127.0.0.1:5188. Vite forwards /mainnet-rpc to 127.0.0.1:4191. The diagnostic uses that same-origin URL; the server makes independent read-only upstream calls. It forwards no browser Origin, arbitrary headers or credentials. No API secret exists in frontend source.

The local server validates loopback socket/Host and an exact allowed Origin, limits body to 8 KB, disallows batches/client upstream URLs, applies rate/concurrency limits and verifies Mainnet genesis before every operation. Only getGenesisHash, getBalance, getAccountInfo, getLatestBlockhash, getFeeForMessage, simulateTransaction and isBlockhashValid are allowed. Fee/simulation payloads must decode to the existing fixed unsigned Memo. sendTransaction, sendRawTransaction, requestAirdrop, transfers and arbitrary program simulation are rejected. This is not a production-hosted RPC proxy.

Transaction construction file src/mainnet-safety.js is unchanged, SHA-256: `1754391b4553211685f6db6d924fb620b74c0a33ca16cc5235ba9f5f2ed04d3f`.

## Edge verification

At 2026-09-26T12:26:28.980Z, wallet/payer `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`:

- getGenesisHash: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` (Mainnet-beta).
- getBalance: 17,664,446 lamports; slot 450674148.
- getLatestBlockhash: `AamfggJjxqPbAJYKEw3o8mHKwjbXCRfD1Xwq2mjBt2oV`; last valid block height 428714073.
- getFeeForMessage: 5,000 lamports.
- simulateTransaction: err=null, units=20,455, slot=450674151. Exact original bytes; sigVerify=false; replaceRecentBlockhash=false.
- isBlockhashValid passed immediately before provider invocation.
- Post-test read at slot 450674793: still 17,664,446 lamports. This corroborates no fee debit, but is not by itself proof of all network activity.

## Exact boundary comparison

| Boundary | Bytes | SHA-256 |
|---|---:|---|
| App RPC simulation | 222 | 5c4964a382c4e412c76f1b6237c57dee493dfdd8c0427a0e2ddbb3e3d4b231e1 |
| Immediately before provider call | 222 | 5c4964a382c4e412c76f1b6237c57dee493dfdd8c0427a0e2ddbb3e3d4b231e1 |
| Phantom outbound simulation payload | 274 | 50df0a87232090e2935d34a1132d6ce8aea9a240dde35b36001df3da7b8bd5b3 |

Phantom adds Compute Budget instructions `03d8b8050000000000` and `02400d0300`. Payer, blockhash, Memo bytes and empty Memo account metas remain unchanged. No signatures are present in the captured simulation payload. The app's construction was not changed to imitate this transformation. Thus the app/provider bytes match exactly; the private simulator receives a transformed transaction, not byte-identical app input.

## Phantom request/response

Captured from the existing extension DevTools Network panel, matching diagnostic URL, public key and exact blockhash. Endpoint https://api.phantom.app/simulation/v1?language=id ; Phantom version 26.30.2 in Microsoft Edge.

- Request chainId and networkID: solana:101.
- Method: signTransaction; safeguard enabled.
- Response requestId: 6b843372-239f-45a6-8829-492cdcd8c200.
- Response advancedDetails.chainId: solana:101.
- Top-level error/simulationError: absent in observed Preview tree.
- safeguard.error: null; shouldBundle=false; recommended=false.
- expectedChanges=[]; tokenChange=[]; totalFee="80000" (Phantom's transformed fee estimate, not the original 5,000-lamport quote).
- Warning: kind=null, severity=4, "Perubahan saldo tidak ditemukan. Lanjutkan dengan waspada dan berikan konfirmasi hanya jika Anda memercayai situs ini."

No claim is made about which Phantom component caused prior Devnet errors. Phantom's upstream RPC, genesis and private account state remain UNKNOWN. The Mainnet response lacks the prior error combination, but manual preview cancellation and visual warning review were not completed because the call resolved first.

## Safety and validation

No production broadcasting or value-moving action enabled. No secrets requested/read/exposed. No deployment. Mainnet safety/transport tests pass. Historical Devnet evidence/report and transaction construction hashes remain unchanged. Any additional preview needs a new explicit decision; this run is finished after one invocation.
