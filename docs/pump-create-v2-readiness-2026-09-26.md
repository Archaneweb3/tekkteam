# Pump.fun create_v2 — unsigned readiness result

Date: 2026-09-26T12:39:02.193Z
Status: **REJECTED — UNPROVEN_CPI_PAYER_DEBIT**

## Result

A real-format unsigned create_v2 candidate was constructed against the pinned official Pump IDL, decoded again and inspected. Structural validation passed. Absolute spending validation failed; therefore Mainnet simulation was not attempted. This is NOT a successful launch simulation or production approval.

No Phantom request, signing, broadcast, memo diagnostic, application deployment or production enablement occurred. Mainnet Safety Mode and the 10,000,000-lamport cap remain unchanged. The guard is an isolated construction/readiness module, not a new production wallet route or an on-chain spending limiter.

## Exact candidate

- Official Pump program: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`.
- Instruction: only `create_v2`; no buy, sell, direct System transfer, compute-budget instruction or platform tip.
- Payer and creator: `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`.
- Metadata: https://tekkwork-test-metadata.vercel.app/metadata/tekkwork-test.json
- Metadata fetched without credentials and matched approved JSON; SHA-256 `96600409bc6599ea1c0341737abe335056ac94a9c1167836add78f47ca3ee508`.
- Name TEKKWORK TEST; ticker TEKK; ordinary SOL-paired creation; mayhem/cashback/holder-reward false and custom creator fee argument zero. No custom supply.
- Mint: `5Nis1XziD7SW7HEvaoy2RvdXzuc6KwZyer7EiudskZn3`, absent on Mainnet at the observation slot.
- Required signers: payer and new mint. Both signatures are absent. The candidate mint secret was not retained/exported; this is construction evidence, not a signing-ready artifact.
- Mainnet genesis: `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`; configured Phantom chain `solana:101`, not an observed wallet request.
- Blockhash: `G4W1GLRUew4d4naLJ189wG2GSAX1DHywRiD451o1SLCQ`; last valid block height 428716872. Historical bytes may expire; never silently replace them.
- Serialized size: 847 bytes.
- Transaction SHA-256: `903bf0494b66609ed175133a1a8d9de0885c5fbf6168025b2fd210d285a5850a`.
- [Complete bytes, message, account observations and machine-readable result](pump-create-v2-readiness-2026-09-26.json).

## Payer debit accounting

| Component | Established amount |
| --- | --- |
| Network/base fee from getFeeForMessage | 10,000 lamports / 0.00001 SOL |
| Priority fee | 0; no compute-unit price instruction |
| Initial buy | 0; no buy instruction |
| Explicit top-level SOL transfers | 0 |
| Explicit TEKKWORK platform fee | 0; no platform fee instruction |
| Protocol-internal fee | Unknown; not encoded as an explicit bounded debit |
| Account creation/rent via CPI | Unknown absolute maximum; delegated to program execution |
| Total proven maximum payer debit | **UNKNOWN — not approved under the 10,000,000 cap** |

Rent applies to new mint/metadata, curve and token-account state as determined by the program, not standalone System createAccount lamport literals in this message. The IDL specifies instruction arguments/account roles, not a complete proof of every CPI debit or allocated size. Do not substitute zero for unknown rent or treat the protocol's advertised creation fee as total wallet cost.

Payer observed balance: 17664446 lamports at slot 450676948; this is above the cap and does not itself constrain spending to 0.01 SOL. Executable Pump, Token-2022, ATA, System and Mayhem accounts were observed on Mainnet; Pump Global was owned by Pump. Account existence/ownership is not proof of bounded program behavior.

## Why the guard stops

create_v2 carries the wallet as a writable signer and includes the System Program. Lamport transfers/account funding can occur inside CPI without explicit amounts in the outer message. There is no max-total-debit argument in this schema, and no reviewed execution-time balance assertion limits the payer's decrease. The deployed Pump program is also upgradeable.

This does not prove pump.fun will overcharge. It means this final message and the verified evidence do not prove it cannot exceed the requested absolute cap. A successful simulation would only describe one bank state, not supply the missing bound.

A future enforceable guard design needs explicit review. No replacement wallet, reduced balance, proxy program, on-chain guard deployment or higher spending allowance was assumed.

## Simulation

**NOT RUN — static spending guard rejected first.**

Payer before/after simulation comparison, logs and units consumed: unavailable. No result is inferred. getFeeForMessage and read-only account/genesis/blockhash calls are not transaction simulations.

## All instruction accounts

| Role | Address | Signer | Writable |
| --- | --- | --- | --- |
| mint | `5Nis1XziD7SW7HEvaoy2RvdXzuc6KwZyer7EiudskZn3` | yes | yes |
| mint_authority | `TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM` | no | no |
| bonding_curve | `9PmbZNY2FY2wLXKxPXTB5CAQyWUASwzk4kXZiLk6EFfs` | no | yes |
| associated_bonding_curve | `DAWqHQYxrohndteif9AGbg4UjsZpUtyg16hiuoPN1eL4` | no | yes |
| global | `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf` | no | no |
| user | `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS` | yes | yes |
| system_program | `11111111111111111111111111111111` | no | no |
| token_program | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | no | no |
| associated_token_program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | no | no |
| mayhem_program_id | `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | no | yes |
| global_params | `13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ` | no | no |
| sol_vault | `BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s` | no | yes |
| mayhem_state | `GQXDAkAzScWkiEFcJrRzG9NG44BZrGL3GXmkckHPpAW` | no | yes |
| mayhem_token_vault | `3qKZFD4qFSpiMZus5EJtq3d4SxoZwbDYxZFJgGzobCPo` | no | yes |
| event_authority | `Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1` | no | no |
| program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | no | no |

## Provenance and reproduction

Pinned official IDL: https://raw.githubusercontent.com/pump-fun/pump-public-docs/81091419e4457566469d4e2a27f64ed84d42419c/idl/pump.json

IDL SHA-256: `ffe966c42f1af41652ee753fe2f1e3f7cd4077d7e6f49faf3138959c8b56064b`.

`node scripts/pump-readiness.mjs` performs read-only fetching, construction and guard evaluation; outputs evidence to stdout. It has no wallet, sign, send or simulate invocation. Each invocation creates a different unsigned candidate mint/blockhash, not a replay of this report.

`node --test tests/pump-readiness.test.mjs tests/mainnet-safety.test.mjs tests/mainnet-transport.test.mjs`: 10 tests passed. Covers canonical rejection, unexpected instructions/programs/accounts/metadata, payer/network/hash changes, unknown/excessive fees and immutable cap, plus existing Mainnet safety controls.
