# 107 - First BUY preparation without execution authority

CURRENT 7 October 2026: the canonical ret/3ED launch is finalized. Its Agent
wallet is not funded. A fresh Mainnet read at slot454084391 found no Agent ATA
or user-volume accumulator. The exact unsigned candidate has two instructions,
768 bytes and a message-bound RPC fee quote of5000lamports. Nothing was signed,
simulated or broadcast in this inspection.

Reuse the existing deterministic buyExactSolIn instruction and prepend the
standard idempotent ATA instruction only when an explicit same-context absence
was read. Explicit Token-2022 derivation is required. The convenience Pump SDK
buy wrapper changes instruction semantics and recipient selection; do not use
it. Existing V1 preparation/finality remains unchanged.

The allowed Token-2022 mint subset requires a170-byte ATA. The user-volume
137-byte allocation is documented for buy_v2, not independently proven for this
legacy buyExactSolIn execution. Record its RPC rent as a candidate estimate.
Existing auxiliary accounts do not imply zero rent. Only a bound System-owned,
zero-data creator vault permits an exact rent-floor top-up calculation.
Other unqualified existing layouts keep total rent/debit unknown.

The production probe uses only genesis/accounts/blockhash/rent/message-fee
reads through configured TEKKTEAM RPC and read-only canonical binding checks.
Fees are bound to message hash/source/genesis/time; no simulated balance or
substitute payer is permitted. Candidate flags stay unqualified/non-authorizing.
Current draft session/daily ceilings500000lamports are below the known first-BUY
rent subtotal2860040lamports. Do not silently raise safety policy ceilings.

Preparation-only coordinator reconciles existing pending signatures before new
decisions. UNKNOWN without signature stays blocked, including after expiry.
Server-only budget DI is revalidated after awaits and reserved atomically.
No product grant resolver, signing port, worker execution or HTTP activation is
mounted. Future execution claims require product-DB generation/lease fencing
and explicit active owner consent in the same atomic transaction as the claim.
Observer leases in a separate DB are not that authority.

Sources: pinned pump-sdk2.0.0 sdk.ts1113 and buy_exact_sol_in IDL;
[official BUY docs](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/BUY.md),
[SPL ATA processor](https://github.com/solana-program/associated-token-account/blob/main/program/src/processor.rs),
[Solana rent RPC](https://solana.com/docs/rpc/http/getminimumbalanceforrentexemption).
