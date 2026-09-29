# Narrow route: historical offline value-flow evidence

Date: 2026-09-27. Scope: read-only decoding of the captured unsigned production corpus and historical RPC ALT snapshots. No network, signing, simulated execution, or broadcast is performed by this evidence tool. `server/dex/route-evidence.js` is not imported by an execution route and always reports `approved:false`, `executionAllowed:false`.

## Observed graphs

| Corpus index | Provider description (not proof) | Keys | Writable | Unproven writable roles | Referenced ALTs | Top-level instructions |
|---|---|---:|---:|---:|---:|---:|
| 0 | Direct Deriverse, SOL to USDC | 20 | 11 | 8 | 1 | 8 |
| 1 | Split/multi-hop SOL to USDC | 54 | 30 | 27 | 5 | 8 |
| 2 | Split USDC to SOL | 35 | 18 | 15 | 3 | 5 |

All captured variants have one required signer (the intended Agent Wallet), one zero-filled signature, and no execution authorization. Index 0 supports decoding both its legacy and v0 representations; after replacing compiled indices with resolved addresses their complete ordered instruction graphs are identical. Samples 1 and 2 have only the captured v0 representation because the legacy form exceeded packet size. Historical table contents can establish what these fixture bytes resolve to, not current on-chain account state or trusted pool provenance.

V0 message hashes:

- 0: `f93674fb722625a9060cc3d051020fd7bed82d99e69c374fa835cb8475e83e72`
- 1: `cd8047fa3ea2b39f61ca9b92cd6ca22a94062a9f1e400d00fbbaeabfb22b6fc0`
- 2: `b7e0f394a37309c655e1f2cc68f071ef9777215d8943e6b1b757104b77c4762b`

## Candidate 0: smallest observed graph

Top-level order: Compute Budget, Compute Budget, create idempotent WSOL ATA, System transfer, SPL SyncNative, create idempotent USDC ATA, Jupiter router, SPL CloseAccount.

The System transfer bytes independently decode to 100000 lamports from `7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe` to its derived WSOL ATA `HK9b1xCN5kQdjWofPyU3DKexoNcA7Nr1uDCKvdUBfihR`. The final close instruction names that ATA, the Agent Wallet as rent destination and the Agent Wallet as authority. The graph inspector labels the ATA operation **unvalidated**: account derivation alone is not a full privilege, ownership, mint, rent, or lifecycle proof.

The Jupiter instruction is an opaque value-flow boundary. Neither the System transfer amount nor quote/intent output threshold proves what that instruction will consume or deliver. No route input amount, route minimum output, CPI program set, or pool authority is populated by copying intent/quote fields. The corresponding evidence fields remain `null`.

Eight writable addresses are outside the independently derived Agent Wallet/ATA identity set:

1. `CJ1fhvsz9FwFM54JyXpNvAj6dvxtiRQjMhYmG1aQVVX8`
2. `EPUHjseXG3izk3MVUJ1PcyWT9xeBhtAnq8gUpq3j8Uni`
3. `8Wk2L1yDovBJifCN1o86X7g7pDcqLau39m6tEsJ9Sheh`
4. `3vCToKSjuzX3dZ48hert2LsCTRyfDS6Cf7fXULfxsoPy`
5. `BaojxUEuwerwQHQRBtTpuuMUreboaxymjyySPsdoJkYc`
6. `5163SrbBvsKPQz86yfSGXLnPqu83X6bAQD1Gy7AA4n3`
7. `9zeBhQkMGmvko7CyPcYg3TUmfneES329dTYtMGs3wx6j`
8. `HfJ9RgUGSrcsx1ctERFUUkHaMeeNr4a6vB7QQDFBKFwJ`

These are **unproven roles**, not a claim that each is malicious or unknown to its protocol. A provider `ammKey`/label match does not prove pool state, vault mint, PDA seeds, vault authority, fee recipient, writable necessity, or CPI program deployment. A compiled account can also be passed to a CPI even when not a top-level instruction program. Therefore listing top-level programs does not establish a CPI allowlist.

## Invariants still requiring independent proof

- Version-matched Jupiter route ABI, complete payload decode including route plan and trailing fields, no ignored bytes.
- Exact routed input, minimum output and slippage semantics; these must be decoded and bound to policy rather than copied from it.
- All possible CPI programs for the specific approved shape, independently derived pool/vault addresses and authorities, account ownership and executable deployment provenance.
- Exact output recipient, fee recipient and fee cap, no alternate destinations or token-account authority mutation.
- No extra source debit, hidden intermediate transfer, rent diversion or unrelated writable account effect through the route.
- Current Mainnet ATA/token/mint state, extension policy, balance and peak rent requirements. Historical fixture state cannot satisfy pre-signing freshness.

## Tests and limits

`node --test tests/dex-route-evidence.test.mjs`: 8 PASS. Checks all three historical graphs remain unapproved; legacy/v0 resolve equivalently; changed claimed intent amount does not fabricate route decoding; changed captured hash rejects; substituted ALT contents reject; wrong ALT owner rejects.

These are observation integrity regressions, **not** a supported positive-route fixture or a route security proof. Rejecting all inputs cannot demonstrate selective acceptance of safe CPI behavior. Until a genuine independently decoded positive fixture exists, amount/recipient/CPI/fee mutations must remain denied, but claiming those denials prove a functioning route validator would be misleading. Existing deny-all registry remains unchanged. No readiness upgrade follows from this artifact.
