# Provable route discovery: provider and source evidence

Date: 2026-09-27. Read-only research; no credential access, quote/build requests, signing, or broadcasting by this workstream. Deriverse remains `REJECTED_UNPROVEN_CPI`.

## Currently documented Jupiter V2 controls

The current [official Build reference](https://developers.jup.ag/docs/api-reference/swap/build) documents `GET https://api.jup.ag/swap/v2/build` with `inputMint`, `outputMint`, integer-base-unit `amount`, and `taker`. Relevant routing controls:

| Parameter | Documented contract | Discovery implication |
|---|---|---|
| `dexes` | Case-sensitive comma-separated labels | Restrict to one independently researched family; obtain exact label from provider mapping. |
| `excludeDexes` | Case-sensitive exclusions; mutually exclusive with `dexes` | Do not combine inclusion and exclusion. |
| `maxAccounts` | Integer 1–64, default 64 | Bound complexity, but independently count returned accounts and reject unwanted shapes. |
| `wrapAndUnwrapSol` | Boolean, default true | Still verify exact WSOL creation/funding/cleanup. |
| `slippageBps` | Fixed numeric bps or adaptive option | Use a fixed bounded value for deterministic review, not adaptive slippage. |
| `payer` | Defaults to taker | Do not introduce a second fee/rent payer. |
| `tipAmount` | Adds a tip instruction | Omit; no tip destination is approved. |

`onlyDirectRoutes` and `restrictIntermediateTokens` are **not listed in this current V2 Build reference**. Do not import legacy endpoint parameters into V2. One-hop, unsplit, two-mint shape is a local post-build requirement, not a claimed provider guarantee. Do not modify a returned transaction to achieve it.

Exact DEX labels come from the documented [V2 program-ID-to-label endpoint](https://developers.jup.ag/docs/api-reference/swap/program-id-to-label): `GET https://api.jup.ag/swap/v2/program-id-to-label`. An unknown label can return the same no-route error as absent liquidity; it is not sufficient evidence that the parameter was rejected.

## Recommended bounded discovery order

First investigate Raydium CPMM BUY/SELL. Second family, if needed and within the lead's four-build budget: Orca Whirlpool BUY/SELL. This ranks proof surface, not price or profitability. A successful build is only a candidate, never permission to execute.

### Raydium CPMM

Pinned official source: [raydium-io/raydium-cp-swap commit 59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92](https://github.com/raydium-io/raydium-cp-swap/tree/59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92).

- [Program declaration](https://github.com/raydium-io/raydium-cp-swap/blob/59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92/programs/cp-swap/src/lib.rs): Mainnet `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`, distinct from its feature-gated devnet address.
- [Swap input instruction source](https://github.com/raydium-io/raydium-cp-swap/blob/59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92/programs/cp-swap/src/instructions/swap_base_input.rs): explicit 13-account schema. Payer signer; derived authority; config bound to pool; writable pool, user input/output, pool input/output vaults, observation; input/output token programs and mints. Vaults bind to pool state, mints to vaults, observation to pool.
- The source debits exactly `amount_in` from user to input vault and requires post-transfer-fee output to meet `minimum_amount_out`. It credits the user output from the output vault under the derived authority. Swap fees update pool accounting rather than introducing arbitrary external recipients.
- Restrict a future narrow proof to classic SPL mint accounts with no extensions; a general Token2022 interface is not authorization for hooks or transfer-fee behavior.
- Source availability is much stronger than account-name inference, but it is not alone evidence of the current deployed binary or Jupiter's CPI argument construction.

### Orca Whirlpool

Pinned official source: [orca-so/whirlpools commit 408c945fef4c49ab70def4303377cfaf8f0f3c99](https://github.com/orca-so/whirlpools/tree/408c945fef4c49ab70def4303377cfaf8f0f3c99).

- [Program declaration](https://github.com/orca-so/whirlpools/blob/408c945fef4c49ab70def4303377cfaf8f0f3c99/programs/whirlpool/src/lib.rs): `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`.
- [Classic swap implementation](https://github.com/orca-so/whirlpools/blob/408c945fef4c49ab70def4303377cfaf8f0f3c99/programs/whirlpool/src/instructions/swap.rs) binds vaults/mints to Whirlpool state, checks amount-out minimum for exact-input, and uses direction/price-limit controls. Raw SHA256 `0d5b23ba9226a7c741bf1a8de949d80504c5b0cdb0d422bd9fe2b168ed8808ee`.
- [Generated SwapV2 instruction schema](https://github.com/orca-so/whirlpools/blob/408c945fef4c49ab70def4303377cfaf8f0f3c99/rust-sdk/client/src/generated/instructions/swap_v2.rs) contains explicit account metas/arguments. Raw SHA256 `130c3a7a2979b418a7ed4d06495895a439b52539f1015be574150c5fd20e7c8f`.
- Tick-array derivation/sequence, oracle/adaptive-fee write behavior, optional remaining accounts, transfer hooks and V2 token-program support make this a larger proof surface than classic-token CPMM. Reject unsupported extras rather than adopting the entire SDK.

## Jupiter adapter linkage: do not overclaim

The official [jup-ag/jupiter-amm-implementation source](https://github.com/jup-ag/jupiter-amm-implementation/tree/cc068c9d1df0060c62f9a8a4fc37ea13ea7b9b39) has enum conversion for `RaydiumCP`, `Whirlpool`, and `WhirlpoolSwapV2` in [jupiter-aggregator-v6/src/lib.rs](https://github.com/jup-ag/jupiter-amm-implementation/blob/cc068c9d1df0060c62f9a8a4fc37ea13ea7b9b39/jupiter-aggregator-v6/src/lib.rs). That generated client/interface conversion is not the deployed router's CPI implementation.

The prior independently reproduced Jupiter V2 Anchor IDL can prove top-level byte layout and route enum selection, but does not prove per-DEX remaining-account segmentation, CPI amount/minimum-output transformation, or complete value flow. A matching downstream direct-instruction schema must not be substituted for unverified Jupiter CPI behavior. Any observed route stays PARTIAL/UNPROVEN until the lead establishes these links and current deployment provenance. No positive executable fixture is asserted by this research note.
