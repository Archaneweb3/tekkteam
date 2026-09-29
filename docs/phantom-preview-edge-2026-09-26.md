# Phantom Edge preview evidence — 2026-09-26

## Scope and outcome

One new memo-only injected `window.phantom.solana.signTransaction(tx)` preview was invoked at 2026-09-26T11:52:12.375Z in Microsoft Edge with Phantom 26.30.2. The preview was cancelled. The page returned `User rejected the request.`, code `4001`. No approval, broadcast, transaction-construction change, or production fix was performed.

Evidence was read from the diagnostic page and the Phantom popup extension's DevTools Network panel. The request payload and response below belong to the same selected simulation request. Only relevant sanitized fields are retained; no device identifiers, headers, or credentials are included.

## Comparison

| Boundary | Bytes | SHA-256 |
| --- | ---: | --- |
| App devnet RPC simulation / immediately before provider call | 203 | ea2ad2871808a8c13eab430a58cb8f57d462f5e4651428ced6edb50387e51a46 |
| Exact serialized provider-call transaction argument | 203 | ea2ad2871808a8c13eab430a58cb8f57d462f5e4651428ced6edb50387e51a46 |
| Phantom HTTP simulation request transaction, decoded from base58 | 255 | 2450bdcbce0d42a9300370ca15bf9a45e15a7433c7733a8062c49ea2732a687b |

The first two byte arrays match exactly. The extension simulation transaction differs: two Compute Budget instructions precede the unchanged Memo instruction. The fee payer and recent blockhash are unchanged. All captured transactions are unsigned, with one required signer.

**Classification: A is supported at the provider-to-extension-simulation boundary.** The app did not pass different bytes to its RPC and the provider. Phantom's outbound simulation payload contains different bytes. This does NOT establish that those added instructions caused the simulation failure.

B is not established: the captured request and response identify `solana:103`; no different chain identifier was observed. C as defined (identical transaction reaching the simulator) is not established because the bytes differ. No additional reproducible root cause (D) is established. The simulator's actual upstream RPC, genesis hash, and account state remain **UNKNOWN**.

## App RPC and transaction

- Endpoint and blockhash source: `https://api.devnet.solana.com`
- Commitment: `finalized`
- Genesis hash: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`
- Fee payer: `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`
- Balance: 5 devnet SOL
- Expected base fee: 5,000 lamports
- Recent blockhash: `649tjWsMYmwCemLUQAMRzwAtNrM1kBNtRTfkwFTSC5KK`
- Last valid block height: 491649822
- Fee context / simulation slot: 504398033
- Simulation: passed; `sigVerify:false`, `replaceRecentBlockhash:false`; 13,505 compute units
- Message SHA-256: `9d7819a3b79b3c22f42cf124bc0875ae1b89731eaaef9bf03ad7c9d6fc11d830`
- Required signer: fee payer above; signatures present: 0
- Only instruction program: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
- Instruction account keys: `[]`
- Instruction UTF-8 data: `TEKKWORK devnet preview diagnostic`
- Instruction data hex: `54454b4b574f524b206465766e6574207072657669657720646961676e6f73746963`

Serialized transaction (base64), identical at app simulation and provider invocation:

```text
AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAECxBCUy3k0E8WhPDKok0ecQhbigVahqXQSTupJDaKqtYMFSlNamSkhBk0k6HFg2jh8fDW13bySu4HkH6hAQQVEjUsZOzEORUKLqJ8ooMd2kacaTYyws4vfpUspGARM3T6+AQEAIlRFS0tXT1JLIGRldm5ldCBwcmV2aWV3IGRpYWdub3N0aWM=
```

Message (base64):

```text
AQABAsQQlMt5NBPFoTwyqJNHnEIW4oFWoal0Ek7qSQ2iqrWDBUpTWpkpIQZNJOhxYNo4fHw1td28kruB5B+oQEEFRI1LGTsxDkVCi6ifKKDHdpGnGk2MsLOL36VLKRgETN0+vgEBACJURUtLV09SSyBkZXZuZXQgcHJldmlldyBkaWFnbm9zdGlj
```

## Observable provider information

Provider `window.phantom.solana`, `isPhantom:true`, `isConnected:true`, public key matching fee payer. Origin `http://127.0.0.1:5188`; Edge 153.0.0.0. The injected method received no app RPC endpoint/cluster argument. The page itself did not expose the wallet's private simulator network; the following evidence was captured independently from extension DevTools.

## Phantom HTTP simulation request

Endpoint: `https://api.phantom.app/simulation/v1?language=id`

```json
{
  "appVersion": "26.30.2",
  "chainId": "solana:103",
  "networkID": "solana:103",
  "platform": "extension",
  "type": "transaction",
  "url": "http://127.0.0.1:5188/phantom-diagnostic.html",
  "userAccount": "ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS",
  "params": {
    "method": "signTransaction",
    "safeguard": {
      "enabled": true,
      "lighthouseProgramId": "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95"
    }
  }
}
```

`params.transactions[0]` (base58):

```text
cE7qKX9canD3t9EXYmahtN6XPyU8VTU48WpdwxLYdz7ZMNRzxYzHuUCXK3tg2TdNhSAAY62FJFNuY1wN22h6Jw5DW5kD5EGQ5ckJ1kGBtQur7E74tTbUqA5hgUDRkJ7ohyptyW2VbzVo6HXymNHgDAZk3EhvH52KKaACGN6AfdpsD8V5Jg7JZCwHGGNvCTWBJY7jytEmTJ9i1G6cqYQgoaEWaLbD6ZxQc2bu8hEQ5Dj5GHmmdgX4MSt5Qqo6T254nHtLmCE6HBi5R4BYVyJUyYzPLZzzLJnSzXE27MAd6GHbBna4uKhHHc7d4nx2VXggnhozUwkMmaTQw68TQsMvcZkvXJS
```

Decoded transaction (base64):

```text
AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIDxBCUy3k0E8WhPDKok0ecQhbigVahqXQSTupJDaKqtYMDBkZv5SEXMv/srbpyw5vnvIzlu8X3EmssQ5s6QAAAAAVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNSxk7MQ5FQouonyigx3aRpxpNjLCzi9+lSykYBEzdPr4DAQAJA9i4BQAAAAAAAQAFAkANAwACACJURUtLV09SSyBkZXZuZXQgcHJldmlldyBkaWFnbm9zdGlj
```

Decoded message (base64):

```text
AQACA8QQlMt5NBPFoTwyqJNHnEIW4oFWoal0Ek7qSQ2iqrWDAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAAAFSlNamSkhBk0k6HFg2jh8fDW13bySu4HkH6hAQQVEjUsZOzEORUKLqJ8ooMd2kacaTYyws4vfpUspGARM3T6+AwEACQPYuAUAAAAAAAEABQJADQMAAgAiVEVLS1dPUksgZGV2bmV0IHByZXZpZXcgZGlhZ25vc3RpYw==
```

Decoded instructions, each with no instruction account keys:

1. `ComputeBudget111111111111111111111111111111`, hex `03d8b8050000000000`: SetComputeUnitPrice 375,000 micro-lamports/CU.
2. `ComputeBudget111111111111111111111111111111`, hex `02400d0300`: SetComputeUnitLimit 200,000.
3. Original Memo program and original memo data above, unchanged.

## Associated Phantom response (relevant fields)

```json
{
  "type": "transaction",
  "expectedChanges": [],
  "error": "INSUFFICIENT_FUNDS",
  "warnings": [{
    "message": "SOL Anda tidak cukup untuk transaksi ini",
    "severity": 3,
    "kind": "AccountNotFound"
  }],
  "simulationError": {
    "humanReadableError": "The solana program reverted with the following error -- Attempt to debit an account but found no record of a prior credit.",
    "idlErrorKind": "AccountNotFound",
    "kind": "TRANSACTION_ERROR",
    "legacyHumanReadableError": "Attempt to debit an account but found no record of a prior credit.",
    "legacyKind": "ATTEMPT_TO_DEBIT_AN_ACCOUNT_BUT_FOUND_NO_RECORD_OF_A_PRIOR_CREDIT."
  },
  "advancedDetails": {
    "chainId": "solana:103",
    "feePayers": ["ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS"],
    "requestId": "f2bc1c51-7fb1-4755-9ba7-484e86e7a148",
    "safeguard": {
      "error": "NETWORK_NOT_SUPPORTED",
      "transactions": [],
      "shouldBundle": false,
      "recommended": false
    },
    "tokenChange": [],
    "totalFee": "80000"
  }
}
```

The response's advanced instruction rows also list set_compute_unit_price, set_compute_unit_limit, and createMemo. Its fee of 80,000 lamports is consistent with a 75,000-lamport priority fee plus the original 5,000-lamport base fee. This does not explain AccountNotFound by itself. `NETWORK_NOT_SUPPORTED` is scoped to safeguard; it is not proof the whole devnet preview flow is unsupported.

## Limits

The outbound extension HTTP request and its response were accessible. The simulation service's internal upstream request, actual cluster genesis, and balance lookup were not accessible. The main UI label “Solana” alone is not evidence of mainnet. No root-cause claim about the private simulator or a wrong cluster is made.
