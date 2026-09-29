# PumpSwap concrete Mainnet proof — blocked before construction

## Scope and outcome

One canonical pool; public read-only RPC. `REJECTED_UNPROVEN_BUYBACK_REMAINING_ACCOUNTS`. No adapter, transaction, signing, simulation, broadcast, custody read, or flags changed. Documentation skill used to preserve the exact stop boundary rather than imply protocol support from a pool provenance check.

## Concrete evidence

Discovery seed is the official PumpSwap documentation example, not frontend data. Independent derivation reproduces the account:

| Role | Address / state |
|---|---|
| Program | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` |
| Pool | `GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J` |
| Index / bump | 0 / 254 |
| Canonical creator | `9XDYTfQKwW8sHPqnFdUreMmtmffmkHVPGTNV2e3LKxNW` |
| Base | `7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump` |
| Quote | `So11111111111111111111111111111111111111112` |
| Base vault | `5jMpkf4JF4noHftLgNKyPNh6roVfPSGSjuEk3U4eLKRa` |
| Quote vault | `43DVcZR4kQFjh4Xm2i3DcneRxNjZp7HMud8yDrJWrDr8` |
| Global config | `ADyA8hdefvWN2dbGGWFotbzWxrAvLW83WG6QCVXvJKqw` |
| Fee config | `5PHirr8joyTMp9JMm6nW7hNDVyEYdkzDqazxPD7RaTjx` |
| Fee program | `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` |
| Coin creator | `5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q` |

Finalized snapshot slot **450943197**. Pool discriminator `f19a6d0411b16dbc`; program ownership correct. PDA seeds `[pool,index LE-u16,creator,base,quote]` reproduce address/bump. Creator equals Pump program `[pool-authority,base]` PDA. Both mints are 82-byte classic SPL Token accounts. Both vaults are derived pool ATAs, 165-byte classic Token accounts, correct mint/authority, initialized/unfrozen, no delegate or close authority.

Captured base reserve **649990598160447** base units. Quote reserve **127429505686** lamports. `virtual_quote_reserves=0`, hence effective quote is raw quote + 0; not a general assumption. Pool mayhem/cashback/holder-reward flags false; configurable creator fee zero. Global feature availability is not confused with this pool's flags.

## Deployment identity

Official IDL source commit `81091419e4457566469d4e2a27f64ed84d42419c`; fetched IDL SHA256 `2091433899b07d003d98118ae6cd3c628960fd393b40710b6e15bce6d0e7f2d1`. Fetch and commit lookup were adjacent, not an atomic Git snapshot; the content hash is the actual reference.

RPC program is executable and upgradeable-loader owned. ProgramData `6naEzKeUuFh1Jeeu51NXQgr5qkXgXtc9WKNct4xynVJc`, deployment slot `446462733`, upgrade authority `7gZufwwAo17y5kg8FMyJy2phgpvv9RSdzWtdXiWHjFr8`; binary-region SHA256 `feb2ec72199f35999bbfd26ada811a37d297464ab265c78593b2d4717d7d42b5`. Binary equivalence to source/IDL is **not proved**. Upgrade authority and published schema remain trust assumptions, not semantic proof.

## Concrete blocker

Captured GlobalConfig contains **buyback_basis_points=5000** and eight buyback recipients. This is not asserted to mean 50% of input; its economic basis must be independently modeled.

Official SDK **1.20.0** builders append a buyback recipient and **writable buyback recipient token account** unconditionally for BUY and SELL. This pool's nondefault coin creator additionally triggers a `poolV2Pda` remaining account. Those are outside the baseline IDL named-account shape and this proof's modeled recipient/value-flow set. Omitting these because the pool flags are classic would be unsafe; accepting them merely because SDK supplies them would be unsafe too.

Additionally, SDK `buyQuoteInput` calculates a base quantity and builds `buy(baseOut,maxQuoteIn)`, whereas the requested proof requires `buy_exact_quote_in(spendable_quote_in,min_base_amount_out)`. They are different instruction contracts. The published helper is not an exact-in semantic differential oracle merely because its name mentions quote input. IDL exact-in discriminator `c62e1552b4d9e870` and args are captured, but ABI declaration alone does not prove rounding and side transfers.

Strict instruction to stop on a concrete blocker applies. No extra protocol-mode implementation was added to force success.

## Proof status

| Required item | Result |
|---|---|
| Token subset / pool provenance | Verified for this snapshot |
| Reserve snapshot | Verified and reproducible offline |
| BUY/Sell account tables | Baseline IDL schema captured; **complete table not proved** |
| Unexplained writable accounts | At least buyback recipient ATA semantics unresolved; zero not established |
| Fee/creator/accumulator value effects | Incomplete; fee-config bytes captured but not interpreted as approved math |
| Local math parity | Not claimed; exact-in reference contract gap |
| WSOL / ATA envelope | Not built; pool ATA provenance alone does not prove Agent lifecycle |
| BUY final message | Not constructed; rejected at evidence gate |
| SELL final message | Not constructed; rejected at evidence gate |
| Simulation | Not run after evidence rejection |
| Value-flow proof | Incomplete |
| Mutation suite | Not applicable without canonical SUPPORTED fixture |
| Capital model | Not calculated; no funding recommendation |
| Production adapter | None |
| Status | NOT SUPPORTED_BY_VALIDATOR |

Three deterministic fixture tests pass: pool/PDA/classic provenance; vault/effective reserve evidence; concrete SDK/config blocker. These are evidence tests, **not** a successful swap validator/mutation suite.

## Reproduction and sources

`scripts/concrete-pump-capture.mjs` uses only public read RPC and official source fetches, emitting sanitized JSON; no filesystem writes, signer or transaction APIs. Fixture `tests/fixtures/concrete-pump-pool.json` preserves account bytes; `concrete-pump-sdk-evidence.json` preserves relevant SDK excerpts plus whole-file hash. Run `node --test tests/dex-concrete-pump-proof.test.mjs` offline.

- [Official pool/state rules](https://github.com/pump-fun/pump-public-docs/blob/81091419e4457566469d4e2a27f64ed84d42419c/docs/PUMP_SWAP_README.md)
- [Official IDL](https://github.com/pump-fun/pump-public-docs/blob/81091419e4457566469d4e2a27f64ed84d42419c/idl/pump_amm.json)
- [Pinned SDK artifact](https://unpkg.com/@pump-fun/pump-swap-sdk@1.20.0/dist/index.js)
