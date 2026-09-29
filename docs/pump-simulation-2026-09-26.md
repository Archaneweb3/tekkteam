# Pump Mainnet simulation report

Date: 2026-09-26T12:41:46.117Z

## Result

**PASS — Simulation-verified estimated spending limit.** This is NOT an absolute on-chain spending cap. No Phantom request, signing, broadcast or production enablement occurred.

| Measurement | Lamports |
| --- | ---: |
| Payer before | 17,664,446 |
| Payer after (simulated) | 12,152,806 |
| Estimated payer debit | **5,511,640** |
| Allowed estimated threshold | 10,000,000 |
| Base/network fee | 10,000 |
| Priority fee | 0 |
| Initial buy | 0 |
| New mint including metadata rent | 2,702,560 |
| Bonding curve rent | 1,285,240 |
| Curve associated token account rent | 1,513,840 |
| Identifiable protocol/platform fee credit | 0 |

All observed debit reconciles: 5,501,640 account funding + 10,000 fee = 5,511,640. Each of the three funded new accounts matches the RPC rent-exempt minimum for its final size (404, 125 and 170 bytes respectively). Zero-lamport empty Mayhem placeholders are NOT funded account creations. No external fee recipient gained lamports; this is an observation of this simulation, not a general zero-fee protocol guarantee.

## Exact simulation

- RPC: https://api.mainnet-beta.solana.com
- Mainnet genesis: 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
- Configured network identifier: solana:101; no wallet chain was queried.
- Payer/creator: ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS
- Metadata: https://tekkwork-test-metadata.vercel.app/metadata/tekkwork-test.json
- Mint candidate: DJVY8fE3nQrCuxf4BwdN27Yn44VUoHTB8gzt97t7mGkK
- One create_v2, no initial buy or outer SOL transfer; static validation unchanged.
- Transaction SHA-256: aa62b6bf5d9e1da5b98bd083df22193a490d746d102fde5081cc8f63725cd344
- Simulation input SHA-256: aa62b6bf5d9e1da5b98bd083df22193a490d746d102fde5081cc8f63725cd344
- sigVerify=false; replaceRecentBlockhash=false. No byte/blockhash substitution.
- Pre-read, simulation and post-read slots: 450677556, 450677556, 450677556. Actual account reads matched before/after; the lower simulated balance was never committed.
- Units consumed: 103485 of 200,000 default budget.
- Error: null.
- [Full evidence: transaction bytes, accounts, inner instructions and RPC results](pump-simulation-2026-09-26.json). Large account data is represented by SHA-256/length; comparisons were performed on full raw data before compacting output.

## Invoked programs

- 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
- 11111111111111111111111111111111
- TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
- ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL

All are in the existing account/program allowlist. Mayhem remains an expected instruction account but was not invoked. Inner System operations funded only mint, curve and curve ATA; an 863,600-lamport mint top-up is part of the final metadata rent, not an extra debit beyond the listed total.

## Uncertainty and limits

This is bank-state-dependent evidence, not a spending guarantee for future execution. Fresh simulation is required before any later wallet consideration; hashes/blockhashes in this report are historical. The candidate mint key was not retained, so this evidence transaction is not signing-ready. Signature verification was deliberately disabled; no signature validity is claimed.

Two unsigned simulations were run. The initial console output was oversized and truncated; a fresh candidate was then simulated with compact account-data reporting. Only the second complete capture supports the results above. No failed simulation was bypassed and no instruction construction was changed between runs.

The old absolute-proof rejection remains as historical behavior. The new opt-in --simulate path evaluates the explicitly authorized estimate policy and does not add a wallet or broadcast route. Same-bank prestate, full logs, recognized inner operations, known destinations, reconciled balance effects and threshold compliance are required. Missing or inconsistent evidence fails closed.

## Full program logs

```text
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]
Program log: Instruction: CreateV2
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: MetadataPointerInstruction::Initialize
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 925 of 187464 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: Instruction: InitializeMint2
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1772 of 184876 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL invoke [2]
Program log: Create
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]
Program log: Instruction: GetAccountDataSize
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1447 of 159049 compute units
Program return: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb qgAAAAAAAAA=
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program 11111111111111111111111111111111 invoke [3]
Program 11111111111111111111111111111111 success
Program log: Initialize the associated token account
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]
Program log: Instruction: InitializeImmutableOwner
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 736 of 152780 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [3]
Program log: Instruction: InitializeAccount3
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1969 of 149708 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL consumed 18447 of 165882 compute units
Program ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL success
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: TokenMetadataInstruction: Initialize
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 3586 of 122805 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: TokenMetadataInstruction: UpdateAuthority
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 3769 of 116969 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: Instruction: MintTo
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1714 of 111008 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [2]
Program log: Instruction: SetAuthority
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb consumed 1044 of 107358 compute units
Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb success
Program data: G3KpTd7rY3YNAAAAVEVLS1dPUksgVEVTVAQAAABURUtLRQAAAGh0dHBzOi8vdGVra3dvcmstdGVzdC1tZXRhZGF0YS52ZXJjZWwuYXBwL21ldGFkYXRhL3Rla2t3b3JrLXRlc3QuanNvbrbHYiw6b8pbfbL3hPVxSZ0I7r2og8ipZ0FjVxXLOfWMwQs+SWqxU/ph8fUEchHaOXFy6pVrIFLJpWISACNjmnPEEJTLeTQTxaE8MqiTR5xCFuKBVqGpdBJO6kkNoqq1g8QQlMt5NBPFoTwyqJNHnEIW4oFWoal0Ek7qSQ2iqrWDf723agAAAAAAENhH488DAACsI/wGAAAAAHjF+1HRAgAAgMakfo0DAAbd9uHudY/eGEJdvORszdq2GvxNg7kNJ/69+SjYoYv8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACsI/wGAAAAAAAAAAAAAAAA
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [2]
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P consumed 2149 of 99943 compute units
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P success
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P consumed 103485 of 200000 compute units
Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P success
```

