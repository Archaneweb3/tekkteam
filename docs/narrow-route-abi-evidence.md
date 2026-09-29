# Narrow Jupiter route ABI evidence

Date: 2026-09-27. Scope: read-only source research of the three existing sanitized builds. No new quote, execution, vault access, signing, or broadcast was performed by this investigation. **Result: NOT_READY.**

## Smallest observed candidate, not an approved route

Corpus sample 0 is the smallest: BUY 100000 lamports WSOL to USDC, provider-reported single 100% Deriverse leg, one ALT, 20 unique transaction keys. Its Jupiter instruction has 26 account-meta entries because several keys repeat. Samples 1 and 2 add shared/split or multiple downstream programs and are not narrower candidates.

The captured Jupiter program is `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`. Sample 0/2 data begin with `bb64facc31c4af14`, the Anchor discriminator candidate for `route_v2`; sample 1 begins `d19853937cfed8e9`, candidate for `shared_accounts_route_v2`. A matching discriminator establishes neither the remaining Borsh layout nor the semantics of an enum variant, remaining-account slice, amount, or minimum output. No amount-offset inference is used as authorization.

## Primary sources checked and pinned

| Source | Revision / content fingerprint | Evidence and limitation |
|---|---|---|
| [Official Jupiter V2 announcement](https://t.me/s/jup_dev?before=157) | Public announcement retrieved 2026-09-27 | Names four V2 instructions and links current IDL to Solscan. The accessible [linked program page](https://solscan.io/account/JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4) did not expose the IDL in the retrieved document. |
| [jup-ag/jupiter-cpi IDL](https://github.com/jup-ag/jupiter-cpi/blob/12bc5f67b94a2c3edc74d6e721a19442124a0bad/idl.json) | commit `12bc5f67b94a2c3edc74d6e721a19442124a0bad`; raw SHA256 `764ea6d71b77458fd33aeb308d6e6bb19e660fc5320c5359f3b9cac96eba5c50` | Checked official public IDL; it lacks the sampled V2 instruction layouts. Cannot substitute its V1 schema. |
| [jup-ag/instruction-parser IDL](https://github.com/jup-ag/instruction-parser/blob/e6f77951377847c579112e6a16d8c17c5c092485/src/idl/jupiter.ts) | commit `e6f77951377847c579112e6a16d8c17c5c092485`; raw SHA256 `3f3bac24cd8a588be906a52173432f3e21b779d814814c25fc8ed6d4fa9e392b` | Checked official parser IDL; no sampled V2 layout. |
| [Deriverse program constant](https://github.com/deriverse/kit/blob/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5/src/constants.ts) | commit `5f17de893332d76fd04a01bc4a3fa9a4ed3581b5`; raw SHA256 `7bda893e03e63b4ed2a9a359ec58c4af886e51a3b78c00391dd73901eb0bb070` | Line 5 declares `DRVSpZ2YUYYKgZP8XtLhAGtT1zYSCKzeHfb4DgRnrgqD`, matching sample 0. This corroborates program identity, not audited behavior or deployed-bytecode equivalence. |
| [Deriverse swap constructor](https://github.com/deriverse/kit/blob/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5/src/engine/instructions.ts#L338-L400) | raw SHA256 `df8096d29d6eae8a48efe9e680389f44e66403b337037ccaabcec00dbc2baef7` | Explicit direct SDK swap account construction. Does not prove Jupiter's current CPI adapter slice/variant. |
| [Deriverse instruction data](https://github.com/deriverse/kit/blob/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5/src/instruction_models.ts#L187-L196) | raw SHA256 `dbeb9cf94d8daf47761befd2f4e240150cddac16282dcf5064d3c7859e4675fc` | Direct SDK swap is 32 bytes: tag, direction, padding, instrument ID, signed i64 price, amount, minAmountOut. Constructor supplies tag 26. Captured top-level Jupiter bytes are not those CPI bytes. |
| [Deriverse context builder](https://github.com/deriverse/kit/blob/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5/src/engine/context-builders.ts#L131-L164) | same pinned kit commit | Six writable roles are instrument, side-specific tree, side-specific orders, lines, maps, client infos. |
| [Deriverse PDA helpers](https://github.com/deriverse/kit/blob/5f17de893332d76fd04a01bc4a3fa9a4ed3581b5/src/engine/account-helpers.ts#L50-L92) | same pinned kit commit | Context derivation depends on version, tags, instrument token IDs and authority. None may be guessed from account position or provider label. |

The official [Jupiter build documentation](https://developers.jup.ag/docs/swap/build) describes instruction delivery, not an independent proof of all underlying CPI semantics. Public source checked is not a verified reproducible build of the currently deployed router or Deriverse executable. Fresh deployment fingerprints in `tests/fixtures/narrow-route-chain-evidence.json` identify upgradeable deployments; a hash/upgrade authority snapshot is observation, not approval.

## Exact remaining-account proof gap for sample 0

The apparent downstream slice starts with the Deriverse program at Jupiter account-meta index 10. The following role names are **SDK-inspired candidates only**, never acceptance facts:

| Meta index | Captured key | Candidate requiring independent state/ABI proof |
|---|---|---|
| 14 | `CJ1fhvsz9FwFM54JyXpNvAj6dvxtiRQjMhYmG1aQVVX8` | Program asset token vault |
| 15 | `EPUHjseXG3izk3MVUJ1PcyWT9xeBhtAnq8gUpq3j8Uni` | Program currency token vault |
| 16 | `8Wk2L1yDovBJifCN1o86X7g7pDcqLau39m6tEsJ9Sheh` | Instrument |
| 17 | `3vCToKSjuzX3dZ48hert2LsCTRyfDS6Cf7fXULfxsoPy` | Side-specific tree |
| 18 | `BaojxUEuwerwQHQRBtTpuuMUreboaxymjyySPsdoJkYc` | Side-specific orders |
| 19 | `5163SrbBvsKPQz86yfSGXLnPqu83X6bAQD1Gy7AA4n3` | Lines |
| 20 | `9zeBhQkMGmvko7CyPcYg3TUmfneES329dTYtMGs3wx6j` | Maps |
| 21 | `HfJ9RgUGSrcsx1ctERFUUkHaMeeNr4a6vB7QQDFBKFwJ` | Client infos |

All eight are writable. Token mint/owner parsing can establish that a vault is a token account but cannot by itself establish the correct instrument, PDA authority, allowable debit/credit behavior, or absence of a different value recipient. The two Agent ATAs are independently derivable; that fact does not explain these eight downstream writables.

There is a concrete incompatibility with naively reusing the direct SDK constructor: its classic-token case appends one token program, System Program, and Associated Token Program (lines 393–398). The captured downstream-looking slice instead ends with **two repeated classic token program metas** at indices 24 and 25, without the latter two program metas inside that slice. This need not imply malice: a Jupiter-specific CPI adapter can legitimately differ from a direct SDK constructor. It does mean the direct constructor is insufficient evidence for the captured slice. Do not silently pad, reorder, normalize, or infer the adapter ABI.

## Additional canonical-IDL discovery

After the repository research, the [Solana IDL service](https://idl.solana.com/docs) returned a V2 schema through `https://idl-one.vercel.app/api/latest?programId=JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4&cluster=mainnet-beta`. This supersedes the *retrieval gap* above, not the downstream proof gap. The captured observation is `tests/fixtures/jupiter-v2-idl-observation.json`: service type `anchor`, service `valid=true`, Anchor address `C88XWfp26heEmDkmfSzeXP7Fd7GQJ2j9dDTUsyiZbUTa`, no PMP entries, raw content SHA256 `cf5b1abb503ba25caf3423a89e29c7aa127c44867fabe6a22e143c554d813b7d`. Service validity is not independently verified authority/content provenance; require a Mainnet IDL account read and authority check before treating this as canonical authorization evidence.

The retrieved schema gives `route_v2`: in amount u64, quoted output u64, slippage/platform/positive-slippage bps u16 each, then vector of route steps. A step contains Swap enum, bps u16, input/output indexes u8. Deriverse is enum index 161 with `Side` then instrument ID u32. Schema-led sample 0 decoding fully consumes 44 bytes: input 100000, quoted output 12224, slippage 100, platform fee 0, positive slippage 0, one Deriverse step, side discriminant 1, instrument 0, allocation 10000 bps, indexes 0 to 1. This is no longer offset inference; publication provenance is independently reproduced below. The exact router implementation's rounding and CPI min-output enforcement are not established merely by argument names.

Mainnet RPC independently returned this canonical Anchor account at finalized slot **450938335**, owned by the Jupiter program, 6314 data bytes, standard Anchor IDL discriminator `184662bf3a907b9e`, compressed payload length 5021. Independently deriving `createWithSeed(findProgramAddress([], Jupiter).address, 'anchor:idl', Jupiter)` matches the service's Anchor address. Decompressing the payload reproduced the exact raw SHA256 above and JSON service content. IDL authority is `9u9iZBWqGsp5hXBxkVZtBTuLSGNAG9gEQLgpuVw39ASg`; it differs from the observed program upgrade authority, so publication under the program's Anchor IDL ownership is established, not authority equivalence or binary correctness. The decoder is deliberately observation-only and not inserted into the execution allowlist.

The IDL exposes the ten top-level route account roles, including optional destination account (sample uses the Jupiter program sentinel). It does **not** specify the Deriverse remaining-account slice or its CPI implementation. Thus obtaining it does not authorize any downstream writable, prove fees, or establish source-to-deployed-binary correspondence. Do not claim the sample's provider threshold 12102 is independently proven: flooring quoted output times 99% would give 12101, whereas ceiling gives 12102. IDL argument names alone do not resolve on-chain rounding.

## Missing links required before a decoder can authorize

Lead reverified the same IDL at finalized slot 450938741 and retained its public
compressed account bytes in `tests/fixtures/jupiter-v2-idl-rpc-proof.json`.
Deterministic tests reproduce account derivation, IDL header/authority, decompressed
hash and schema. Current narrow decoder tests: **25 PASS**, not full route acceptance.

1. Mainnet IDL content is now pinned and independently reproduced; remaining-account segmentation and source-to-deployed semantics still need independent adapter evidence.
2. Verified Jupiter-to-Deriverse CPI construction for that variant: exact instruction tag/layout, amount/slippage transformation, signer propagation, account roles and duplicate handling.
3. Independent live account state decoding/PDA derivation linking the two vaults and six context accounts to the intended instrument, mints, program authority, version and side.
4. A trustworthy connection between approved implementation/schema and the currently deployed upgradeable programs; SDK identity and provider labels alone are insufficient.
5. Exact end-to-end value-flow/fee proof including all writable recipients. WSOL/ATA proof and finalized post-execution checks cannot replace this pre-signing proof.

No supported real fixture exists at this checkpoint. Tests that simply reject all mutations are useful fail-closed regression tests, but must not be reported as a positive supported-route mutation matrix. Keep approved route/CPI sets empty and production adapter disconnected; do not obtain more quotes solely to search for a route while this proof gate remains unresolved.
