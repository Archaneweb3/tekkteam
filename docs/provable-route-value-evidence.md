# Provable route discovery: account and value-flow gate

2026-09-27. Offline evidence and official-source review only. No signing, broadcast, provider credential access, custody changes, or flags changed by this workstream.

## Security preference, not route approval

Raydium CPMM with classic SPL tokens is the first research preference: its exact-input instruction has a fixed account structure and explicit input/minimum-output parameters. Whirlpool is also source-available but adds tick-array and adaptive-oracle state to the proof boundary. This ranks verifiability, not returns. Neither family is supported merely by appearing in Jupiter's route plan. See [CPMM instruction source](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/swap_base_input.rs) and [Whirlpool swap source](https://github.com/orca-so/whirlpools/blob/main/programs/whirlpool/src/instructions/swap.rs).

## CPMM downstream account template

This is an authoritative downstream template, NOT an assignment of unknown Jupiter remaining-account positions. A concrete sample must prove the mapping separately.

| Role | Expected owner / binding | Writable? | Purpose and expected effect |
|---|---|---|---|
| Payer | Exact Agent signer | No in CPI declaration; message may union fee-payer write | Authorizes input token debit |
| Authority | Program-derived authority | No | Signs pool output transfer |
| AMM config | CPMM program; pool binding | No | Fee configuration |
| Pool state | CPMM program | Yes | Pool/fee accounting |
| Agent input/output | Classic Token Program; Agent authority, exact mints | Yes | Authorized debit / minimum credit |
| Input/output vaults | Classic Token Program; pool bindings, authority | Yes | Receive input / pay output |
| Input/output token programs | Classic Token Program executable | No | Token transfer implementation |
| Input/output mints | Classic Token Program; vault mint bindings | No | Asset identity |
| Observation | CPMM program; pool binding | Yes | Observation update |

The instruction checks minimum received output and transfers input to its input vault and output vault to the designated destination. [Official instruction definition](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/swap_base_input.rs).

Pool state stores config, vault, mint, token-program and observation addresses plus authority bump; direction must bind the two opposite vaults, not just either valid vault twice. [Official pool definition](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/states/pool.rs).

## Required concrete proof

1. Match pinned source/IDL to deployed executable program identities; an official mutable repository branch is not a deployed-binary attestation.
2. Decode every byte of Jupiter's selected variant and tie each remaining account to the downstream account slot. Prove forwarded amount, destination and threshold semantics, including Jupiter's own final-output enforcement if downstream minimum is zero.
3. Fetch Mainnet pool/config/vault/mint/observation bytes independently. Validate discriminator, owner, freshness and exact state bindings. Derive authority rather than accepting provider labels.
4. Reject nonclassic token programs, extensions, delegates, unexpected close authorities, fee recipients, shared user intermediates and unrelated writable accounts for the initial narrow policy.
5. Prove all transaction-level and CPI-level accounts. Top-level program enumeration alone misses executable accounts passed to CPI.
6. Explain the fee payer, ATA creation and WSOL lifecycle outside the swap CPI. Keep peak rent separate from final net rent.
7. Repeat the proof on SELL. A BUY fixture does not prove reversed account ordering, token source authority or SOL proceeds destination.

## Expected flow, conditional on successful proof

BUY: Agent SOL → exact Agent WSOL ATA → verified input vault → verified pool swap → exact Agent target ATA. WSOL close returns only to Agent.

SELL: exact Agent target ATA → verified input vault → verified pool swap → exact Agent WSOL ATA → close to Agent SOL.

No edge in these diagrams is considered proven by merely copying the user's intended amount/recipient or provider quote. Mint identity, input bound, output bound and all side effects must follow from decoded instruction semantics plus independently verified accounts.

## Adversarial acceptance criteria

Only after an actual BUY and SELL fixture passes positive validation may selective mutation rejection demonstrate a supported route. Mutate amount, threshold, both mints, user source/destination, vault, authority, program, extra writable, ALT contents/index, WSOL close destination, ATA owner/mint, budget and added SOL/token transfer. Each must fail the corresponding invariant, not merely an unrelated deny-all gate. Same-message/hash checks alone do not prove the original route safe.

No positive fixture or production adapter is approved by this template. Route-specific capital requirements remain unavailable until the supported shape is established; this is not a recommendation to fund.
