# Concrete Raydium CPMM proof — partial, not execution approved

2026-09-27. One pool evaluated. Read-only Mainnet RPC and unsigned local construction only. Documentation skill used to record achieved proof layers and remaining boundaries; no adapter, custody, flag, funding, signing, simulation or broadcast changes.

## Concrete identity and deployment

- Program `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`.
- Pool `7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny`, independently derived from official `pool`, config, byte-sorted WSOL/USDC seeds, not frontend state. Four deterministic config addresses were existence-probed in one read; only config 0 pool was evaluated.
- Config `D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2`, index 0, derived `amm_config` + big-endian u16.
- Mint0 WSOL `So11111111111111111111111111111111111111112`; mint1 USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Both mint/vault programs are classic `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`; mint size 82 and vault size 165. No Token-2022 or extensions admitted.
- Authority `GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL`, independently derived `vault_and_lp_mint_auth_seed`, bump matches pool.
- WSOL vault `7VLUXrnSSDo9BfCa4NWaQs68g7ddDY1sdXBKW6Xswj9Y`; USDC vault `3rzbbW5Q8MA7sCaowf28hNgACNPecdS2zceWy7Ptzua9`. Both derived `pool_vault` + pool + mint, correct mint/authority, initialized, no delegate/close authority.
- Observation `4MYrPgjgFceyhtwhG1ZX8UVb4wn1aQB5wzMimtFqg7U8`, derived `observation` + pool; owner, discriminator, size and embedded pool verified.
- Creator `243GyFD8dXF5pumajGxRKBEk2BDQcBvNP8RmFWZoRMAs`; creator fees disabled, mode 0. Other modes rejected by this helper.
- Snapshot finalized slot **450943185**, `2026-09-27T08:29:12.349Z`; Mainnet genesis verified. Pool/config/mints/vault/observation bytes captured in `tests/fixtures/concrete-cpmm-mainnet.json`. This is historical fixture evidence, not permanently fresh state.
- Program executable, upgradeable loader owner. ProgramData `DMawCQzbgNTmbzaESc7o6pvL1KAeetY8zA7jNpzntHhU`; deployment slot **445763504**; upgrade authority `FytDrVzDybM1TwFQPGb8qaxZR7dBCzNeqT3vtQsceZQK`; full ProgramData SHA256 `c372a5948a4e3972698cf9699600c8b3dd5448281321d966e00075fd27098c0b`.

Official program source pinned to [59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92](https://github.com/raydium-io/raydium-cp-swap/tree/59fb845a9e5bb569c8b2f3415f13b0c0ebcc6b92). Schema uses Anchor `account:PoolState`, `account:AmmConfig`, `account:ObservationState`, `global:swap_base_input` SHA256 first-8 discriminators. Instruction is discriminator + amount_in u64 LE + minimum_amount_out u64 LE, 13 accounts. **Source-to-deployed-binary equivalence is not proven.** Trust remains in official source correspondence and upgrade governance; this is distinct from the validator integration gap below.

## Reserve accounting and differential math

| Asset | Vault token amount | Accrued protocol + fund + creator | Effective reserve |
|---|---:|---:|---:|
| WSOL | 384517323 | 822956 | 383694367 |
| USDC | 48064117 | 317140 | 47746977 |

Trade fee 2500 / 1,000,000; protocol share 120000 / 1,000,000; fund share 40000 / 1,000,000; creator zero. Trade fee rounds UP on input. Protocol/fund shares round DOWN on trade fee and remain accrued in the input vault, not transfers to external recipients. Output floors `(input - tradeFee) * outputReserve / (inputReserve + input - tradeFee)`. Slippage policy 100 bps floors expectedOutput * 9900 / 10000; source enforces received output >= minimum. Classic tokens have no transfer fees.

| Direction | Input base units | Trade fee | Protocol / fund | Effective input | Expected output | Minimum output |
|---|---:|---:|---:|---:|---:|---:|
| BUY WSOL→USDC | 100000 | 250 | 30 / 10 | 99750 | 12409 | 12284 |
| SELL USDC→WSOL | 10000 | 25 | 3 / 1 | 9975 | 80142 | 79340 |

Official SDK source pinned to [cc33ec28a8921a35609e83293e9e07ad830b0779](https://github.com/raydium-io/raydium-sdk-V2/tree/cc33ec28a8921a35609e83293e9e07ad830b0779). No SDK package installed; exact calculator/fee/constant-product source persisted with hashes in `concrete-cpmm-sdk-source.json`, transpiled offline in test and executed against the same captured reserves. **24 cases**, both directions, amounts 399/400/401, 9999/10000/10001, 99999/100000/100001, 499999/500000/500001. Exact integer output/trade/protocol/fund/creator agreement. Minimum-output floor boundary and decoder threshold ±1 mutations tested. Creator-enabled SDK/source paths are not covered or admitted.

## Complete swap account roles (both directions)

`tests/fixtures/concrete-cpmm-messages.json` records every concrete address in exact instruction order. BUY uses 0→1; SELL reverses only validated mint/vault/user directions.

| Index / role | Owner program | Signer / writable | Pre-state, derivation | Expected effect |
|---|---|---|---|---|
| 0 Agent `7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe` | System | yes / no in swap; writable fee-payer union | Exact agent identity | Authorizes debit; transaction fee/setup debit outside swap |
| 1 authority | PDA; need not have allocated account | no / no | Derived authority+bump | Signs vault output CPI |
| 2 config | CPMM | no / no | Config PDA, discriminator, pool binding | Fee reads |
| 3 pool | CPMM | no / yes | Pool PDA/schema/status/open-time | Protocol/fund accrual and epoch update |
| 4 Agent input ATA | Token when present | no / yes | Derived Agent+input mint; current ATAs absent | Exact input token debit |
| 5 Agent output ATA | Token after creation | no / yes | Derived Agent+output mint | Receive >= minimum output |
| 6 input vault | Token | no / yes | Pool binding+vault PDA+mint+authority | Receive exact input; retain LP/protocol/fund fees |
| 7 output vault | Token | no / yes | Opposite verified vault | Debit quoted output, subject to fresh reserves |
| 8 input token program | executable, loader-owned | no / no | Classic program exact | TransferChecked CPI |
| 9 output token program | executable, loader-owned | no / no | Classic program exact | TransferChecked CPI |
| 10 input mint | Token | no / no | Classic initialized mint, vault binding | Decimal/mint checks |
| 11 output mint | Token | no / no | Opposite mint | Decimal/mint checks |
| 12 observation | CPMM | no / yes | Observation PDA/schema+pool binding | Price observation update, no token transfer |

Six writable swap roles explained; no unexplained writable swap account. This is **not** a claim of six total transaction writables: Agent fee/rent payer adds another writable, while ATA setup uses existing swap token-account addresses.

## Locally constructed envelopes and remaining blockers

Agent snapshot slot **450943832**, balance **4995000 lamports**. WSOL ATA `HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR` and USDC ATA `FjPUygpFHEUVpSDUM7ByKRByYTsJoN8E7vTjQCuZKQ9G` independently derived and **absent**. RPC rent exemption for classic 165-byte account: **1488440 lamports** at this observation; not assumed historical default.

BUY unsigned legacy message: Compute price 0 + limit 200000; create both Agent ATAs idempotently; exact Agent→WSOL 100000 lamports; SyncNative; one local CPMM swap; close WSOL to Agent. SELL unsigned structural message: budget, create Agent WSOL ATA, one reversed local CPMM swap, close WSOL to Agent. **Actual SELL source ATA and balance are absent**, so SELL is only a structural fixture, not a currently executable trade. No hypothetical post-BUY state was fabricated as real RPC state.

- BUY message SHA256 `24eb4a55db73337e32912a5f7225f4c4d8cb66a525edb0357edf407b3195b4a4`.
- SELL message SHA256 `4f2ac560c6a7a1205ea2790203781294f8edb68ebcb9676146f5661d0dc4c809`.
- Both exact unsigned transactions persisted; one all-zero signature; legacy, no ALT.
- Existing standalone native lifecycle checker passes setup/cleanup, explicitly returns `routeVerified:false`.
- Full TEKKWORK validator unchanged: BUY **ATA_MISMATCH** (only one output ATA supported; WSOL input ATA not integrated); SELL **UNSUPPORTED_ROUTE_OR_PROGRAM** (no registered CPMM decoder). Tests additionally supply the real narrow fixture decoder, not a stub: BUY still rejects WSOL setup; SELL passes swap decoding then rejects unsupported Token Program cleanup. These are **current implementation gaps**, not proof that CPMM semantics are inherently unprovable.
- Narrow fixture-scoped swap decoder validates exact expected 13 keys/flags/data/amount/threshold and is **not registered** in production.
- Simulation **not attempted**: full validator rejects and actual SELL source is missing. No signing needed for hypothetical simulation, but it would not repair these proof gaps.
- Value flow: swap-level source/math/account paths are explained; full-envelope production authorization remains unapproved. ATA rent paid by Agent, temporary WSOL rent returned to Agent on close; USDC ATA rent persists. Fee ceiling/capital sufficiency not asserted because full BUY+SELL gate has not passed.
- Tests: 6 focused tests pass, including 24 official SDK differential vectors, real provenance, exact schema, account/data ±1 mutation rejection, unsigned message hashes/zero signatures, actual full-validator rejection with the narrow decoder, and separate limited native lifecycle proof. This is **not the complete supported-envelope adversarial suite**; extra SOL/SPL/ComputeBudget/ATA/close-destination mutations are not claimed as this route's positive-envelope tests.
- Status: **PARTIAL / NOT SUPPORTED_BY_VALIDATOR**. No production adapter created. No route-specific minimum funding recommendation.

Stop boundary: retain concrete proof and fixtures; do not sample additional pools or generalize creator/Token-2022 support. Next engineering step, if authorized, is narrowly integrating proven native lifecycle and CPMM decoder with full-message invariants, plus conditional SELL source-state proof and complete envelope mutations. Mainnet acceptance still requires fresh state and explicit authorization.
