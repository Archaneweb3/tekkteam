# Phantom devnet preview: identical transaction passes public RPC but fails Phantom

## Summary

Test B provides a byte-for-byte control: the same unsigned 255-byte transaction passes public Solana devnet simulation and fails Phantom's preview/simulation. The serialized transaction used for public RPC simulation, immediately before `window.phantom.solana.signTransaction(tx)`, and in Phantom's captured simulation HTTP payload is identical, with the same SHA-256. No transaction-construction change is supported as the cause by this test.

Primary evidence: [phantom-differential-edge-2026-09-26.json](phantom-differential-edge-2026-09-26.json), Test B. Provider invocation: **2026-09-26T12:07:45.713Z**. Phantom traffic was captured through the extension's DevTools Network panel, independently of the page's provider-call instrumentation.

## Environment

- Microsoft Edge: **153.0.0.0**, as reported in the captured user agent; exact installed patch build was not independently captured.
- Phantom extension: **26.30.2**, observed in extension request payloads during capture; also recorded in [the preceding capture report](phantom-preview-edge-2026-09-26.md).
- Solana library: **`@solana/web3.js` 1.98.4**, verified from the installed package.
- OS: **Windows, x64**; captured user agent reports `Windows NT 10.0; Win64; x64`. Exact Windows edition/build is not established by this evidence.
- dApp origin: `http://127.0.0.1:5188`
- Diagnostic page: `http://127.0.0.1:5188/phantom-diagnostic.html?variant=B`
- Provider method: injected `window.phantom.solana.signTransaction(tx)` only.

## Primary reproduction: Test B

The connected wallet public key and fee payer are both:

```text
ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS
```

Public devnet balance at preparation: **5 SOL**. No seed phrase or private key is included.

- Recent blockhash: `J7ADSZEVoyEEmkaHtq6wLk1La1oGenfhJp1c7avh83rg`
- Last valid block height: `491653856`
- Format: unsigned legacy transaction; one required signer; zero signatures present.
- Serialized size: **255 bytes** at all three observed boundaries.
- Full SHA-256 at all three boundaries:

```text
91c7d3b8f15c588dcc784f7f3ca92fd791be109eb58d2f6dbf7d9130fc446d7b
```

Exact serialized transaction, base64:

```text
AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIDxBCUy3k0E8WhPDKok0ecQhbigVahqXQSTupJDaKqtYMDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSN/iqU2sfFP8ZP0KA/0X6c6eAAiyKMc3+D0ILUsBUy1YEDAQAJA9i4BQAAAAAAAQAFAkANAwACACJURUtLV09SSyBkZXZuZXQgcHJldmlldyBkaWFnbm9zdGlj
```

Instruction order (all instruction account-key lists are empty):

1. `ComputeBudget111111111111111111111111111111`: SetComputeUnitPrice, **375,000 micro-lamports/CU**; exact data hex `03d8b8050000000000`.
2. `ComputeBudget111111111111111111111111111111`: SetComputeUnitLimit, **200,000**; exact data hex `02400d0300`.
3. `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`: UTF-8 `TEKKWORK devnet preview diagnostic`; exact data hex `54454b4b574f524b206465766e6574207072657669657720646961676e6f73746963`.

These Compute Budget instructions were already present before the provider call. Decoding Phantom's captured base58 payload and comparing raw bytes confirmed equality with the app's base64 transaction—not merely equivalent instructions. Fee payer, blockhash, message, and instructions were unchanged.

## Public devnet simulation

- RPC and blockhash source: `https://api.devnet.solana.com`
- Genesis hash: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`
- Configuration: `sigVerify:false`, `replaceRecentBlockhash:false`, `commitment:"finalized"`.
- Result: **PASS**, no simulation error.
- Simulation slot: `504402072`.
- Units consumed: **13,805**.
- Expected fee from public RPC: **80,000 lamports**.

Captured logs:

```text
Program ComputeBudget111111111111111111111111111111 invoke [1]
Program ComputeBudget111111111111111111111111111111 success
Program ComputeBudget111111111111111111111111111111 invoke [1]
Program ComputeBudget111111111111111111111111111111 success
Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke [1]
Program log: Memo (len 34): "TEKKWORK devnet preview diagnostic"
Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr consumed 13505 of 199700 compute units
Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr success
```

This is a historical capture. The blockhash has a finite lifetime; a later expired-blockhash replay cannot validate or invalidate this recorded success. Replacing the blockhash creates different bytes and must be labelled a separate reproduction.

## Phantom request and response

- Endpoint: `https://api.phantom.app/simulation/v1?language=id`
- Request method field: `signTransaction`
- Request `chainId` and `networkID`: **`solana:103`**.
- Response `advancedDetails.chainId`: **`solana:103`**.
- Response request ID: **`c4b4b556-61d5-49a2-a072-92ac5000912e`**.

Relevant response fields, transcribed from DevTools (not a complete raw response):

```json
{
  "error": "INSUFFICIENT_FUNDS",
  "simulationError": { "kind": "TRANSACTION_ERROR" },
  "warnings": [{
    "message": "SOL Anda tidak cukup untuk transaksi ini",
    "severity": 3,
    "kind": "AccountNotFound"
  }],
  "advancedDetails": {
    "chainId": "solana:103",
    "requestId": "c4b4b556-61d5-49a2-a072-92ac5000912e",
    "totalFee": "80000",
    "safeguard": {
      "error": "NETWORK_NOT_SUPPORTED",
      "transactions": [],
      "shouldBundle": false,
      "recommended": false
    }
  }
}
```

`NETWORK_NOT_SUPPORTED` is specifically a **safeguard** response field; we do not assume it causes the separate simulation/account error. The page's original `phantomInternalRequest` placeholders remain unknown because the page cannot observe extension traffic; the separately captured `tests.B.phantom` evidence supplies the request/response comparison above.

## Supporting differential tests

All tests used the same wallet, fresh devnet blockhashes, and `signTransaction` only.

| Test | App structure | Public devnet | Phantom |
| --- | --- | --- | --- |
| A | Memo only | PASS, 13,505 CU | Same three errors |
| B | Exact Compute Budget pair + Memo | PASS, 13,805 CU | Same three errors; identical bytes |
| C | SystemProgram transfer of 0 lamports from wallet to itself | PASS, 150 CU | Same three errors |

Phantom prepended the Compute Budget pair in A and C; B was byte-for-byte unchanged. These results isolate a discrepancy between public devnet and Phantom preview, without claiming which Phantom internal component is responsible. **Phantom's upstream simulation RPC/account state is unknown.**

## Safety and question for Phantom

- No transaction was approved.
- No transaction was broadcast.
- Every Phantom preview was cancelled, confirmed by `4001: User rejected the request.`
- No production workaround has been implemented.
- This report does not claim which Phantom internal component is responsible.

**Why does Phantom preview/simulation return AccountNotFound / INSUFFICIENT_FUNDS / NETWORK_NOT_SUPPORTED for this solana:103 transaction when the exact serialized transaction passes simulation against public Solana devnet?**
