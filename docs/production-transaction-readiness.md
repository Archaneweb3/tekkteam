# Production transaction readiness — TEKKWORK

Date: 2026-09-26
Status: BLOCKED BEFORE CONSTRUCTION / WALLET REQUEST. Not ready for a live test.

## Authorized first transaction

- Mainnet-beta; Phantom identifier `solana:101` (Wallet Standard uses `solana:mainnet`).
- Pump.fun creation: `TEKKWORK TEST`, symbol `TEKK`.
- Protocol-defined supply; no custom supply instruction.
- Initial buy: zero. Official creation documentation exposes a standalone `create_v2` instruction, separate from buying. Successful execution of this particular launch has NOT yet been simulated.
- Maximum total wallet debit: 10,000,000 lamports (0.01 SOL), including rent, network, priority and protocol/platform costs.
- No broadcasting, automatic execution, buy, transfer or production workaround.
- Confirmed payer and creator: `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`. No new wallet request was made.

## Authoritative integration evidence

Official sources inspected directly:

- https://github.com/pump-fun/pump-public-docs
- https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md
- https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
- https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md
- https://pump.fun/docs/fees

The repository links `@pump-fun/pump-sdk` as its TypeScript SDK. No third-party transaction-building API was used, and no SDK dependency was installed in this pass. These are moving sources, not a pinned release: pin and hash the reviewed IDL before implementing a builder. Historical documentation examples are not live fee quotes or account-state evidence.

Direct read-only RPC inspection of `https://api.mainnet-beta.solana.com` returned genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.

| Official address | Mainnet observation |
| --- | --- |
| Pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Exists, executable; upgradeable loader owner |
| Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` | Exists, executable; upgradeable loader owner |
| Associated Token `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | Exists, executable; BPFLoader2 owner |
| Mayhem `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` | Exists, executable; upgradeable loader owner |
| Pump Global `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf` | Exists, non-executable, owned by Pump, 1087 data bytes |

Existence does not prove implementation correctness, an immutable executable, or a spend bound. No claim is made that all launch accounts have been validated: a new mint and its derived accounts have not been selected.

## Required creation structure

Official `create_v2` discriminator: `[214,144,76,236,95,139,49,180]`.

Ordered accounts from the official IDL:

1. New mint: writable signer; initialized as Token-2022, six decimals.
2. Mint authority: Pump PDA `["mint-authority"]`.
3. Bonding curve: writable Pump PDA `["bonding-curve", mint]`.
4. Curve token account: writable ATA derived from curve, Token-2022 and mint.
5. Global: Pump PDA `["global"]`.
6. User: writable signer; payer.
7. System Program `11111111111111111111111111111111`.
8. Token-2022 program above.
9. Associated Token program above.
10. Mayhem program above (writable in current IDL even for ordinary creation).
11. Global params: Mayhem PDA `["global-params"]`.
12. SOL vault: writable Mayhem PDA `["sol-vault"]`.
13. Mayhem state: writable Mayhem PDA `["mayhem-state", mint]`.
14. Mayhem token vault: writable Token-2022 ATA owned by SOL vault for mint.
15. Event authority: Pump PDA `["__event_authority"]`.
16. Pump program itself.

No optional quote accounts for the default SOL-paired creation. Do not reuse an existing Devnet mint. A new mint account is expected NOT to exist before creation; validate its new signer and canonical derivations rather than falsely requiring every account to already exist.

Arguments: name, symbol, **metadata URI**, creator public key, mayhem flag, and documented optional cashback/creator-fee/holder-reward arguments. Ordinary launch should explicitly review disabled mayhem/cashback/holder-reward modes. No custom creator fee or alternate quote asset is authorized.

## Blockers — do not substitute guesses

1. Metadata URI is not yet public. User approved the exact minimal JSON now saved at `public/metadata/tekkwork-test.json`, with empty image and no image upload. The existing `.vercel/project.json` links the Vite site to project `tekkteam`; no metadata upload/storage integration was found in the server, package manifest or environment template. Publishing this new static file requires deployment. Per the user's explicit stop condition, no deployment was performed and no prospective URL is presented as valid. Next step: publish this single asset through an approved deployment and verify its public HTTPS response and exact JSON before constructing the transaction. Do not deploy the dirty workspace incidentally.
2. Payer and creator were explicitly confirmed by the user as the public wallet above; this input is resolved. No agent custody substitution is needed for this test.
3. The official creation instruction has **no maximum SOL debit argument**. A simulation debit plus fee quote is evidence at a particular bank state, not an execution-time hard cap. In particular, Pump is upgradeable. A local numerical comparison alone cannot honestly guarantee the user's maximum possible debit across changed state/program execution. An explicit reviewed enforcement design is needed before requesting a signature under that guarantee; none was implemented or silently substituted.

Therefore no final transaction, mint keypair, exact fee quote, maximum debit or successful launch simulation is claimed. No Phantom request, signature or broadcast occurred in this pass.

## Value-moving transaction inventory

This distinguishes product/reference features from implemented capabilities. Only standalone Devnet SPL issuance exists in `server/chain.js`. The following Mainnet flows are NOT implemented or enabled. Unknown account choices remain blockers, not copied reference addresses.

| Flow / purpose | Programs and accounts | Signers / authority / fee payer | Amount and expected changes | Slippage |
| --- | --- | --- | --- | --- |
| Pump launch (selected) | Pump + System + Token-2022 + ATA; ordered accounts above; Mayhem accounts as required by IDL | New mint signer and user payer; protocol PDA mint authority; creator selected separately | Zero buy; payer loses fees and account funding; mint/curve/vault state created; supply from live protocol state, not app override | No swap; not applicable |
| Initial buy / curve buy | Current Pump buy interface, current fee program and canonical fee recipients; mint, curve, user token account, creator vault and required volume/sharing accounts | Buyer/agent signer, authorized spending wallet pays | SOL down, acquired token units up; include ATA rent and protocol fees; require explicit max cost and minimum received | Explicit user-approved ceiling required; unset means blocked |
| Curve sell | Current Pump sell interface and live canonical vault/fee accounts | Token owner or explicitly constrained delegate; fee payer approved | Token units down, net SOL up less fees | Minimum output and approved ceiling required |
| Post-migration trading | Official PumpSwap integration; pool, reserves, mints, token programs, user ATAs and fee accounts must be independently registered and verified | Trader signer/limited authority; approved payer | Exact input debited, output credited, all fees accounted; wrapped-SOL lifecycle if required | Explicit max input/min output; no generic arbitrary route |
| Fund agent wallet | System Program, source and approved agent public key | Source signer/payer; backend custody decision required before generating any spending key | Source minus amount/fee; destination plus amount | Not applicable |
| Withdraw agent SOL | System Program, agent and verified owner destination | Agent authority; owner's authenticated instruction is not itself an on-chain signature; fee payer explicit | Agent minus withdrawal/fee; owner plus withdrawal; reserve enforced | Not applicable |
| Withdraw agent tokens | Mint's actual Token/Token-2022 program, verified source/destination ATAs; ATA/System if needed | Token owner/delegate; fee payer pays fee/rent | Source token units down; recipient credited subject to mint extensions; reject unsupported transfer hooks/fees | Not swap; extension-aware exact amounts required |
| Collect creator fees | Official Pump/PumpSwap fee collection instruction, canonical creator vault, approved beneficiary | Verify current IDL authority requirements; approved payer | Vault decreases, entitled creator increases, network fee charged | Not applicable |
| Paid skins/NFTs/rewards (optional reference features) | No approved Mainnet program, mint or payment recipient configured | Purchase payer or distribution authority undefined | Undefined price, platform cut and destination; blocked | Depends on future implementation |

Authority revocation, metadata updates, ATA creation, account closing and pool migration can change permissions or move rent/liquidity even when not marketed as payments. They must be separately decoded and reviewed; none is implicit permission for this launch. Strategy editing, login and agent drafts are not value-moving transactions.

## Required pre-wallet gate (specification, not implemented functionality)

- Assert Mainnet genesis and explicit chain mapping; advertised wallet chains alone do not prove its current simulation context.
- Exact approved input commitment: name/symbol/URI/creator/mint/zero buy; no unexpected instructions, accounts, address lookup tables or signers.
- Pin reviewed instruction/account schema; verify deployed programs, owners, PDA/ATA derivations and all writable destinations. Audit transitive CPI program use from simulation logs/inner instructions.
- Read fresh finalized blockhash, payer balance, protocol state; simulate the exact candidate bytes with returned account state and no blockhash substitution. Reject errors, missing account evidence and unaccounted lamport/token deltas.
- Network fee from `getFeeForMessage`; priority fee from exact compute limit and micro-lamport price, rounded up. Avoid double-counting priority fee already included in RPC total. Include rent and every protocol/platform debit; unknown fee fails closed.
- Enforce 10,000,000 lamports total, no buy, no token transfer, no tips, no unknown recipients. A separate execution-time cap design must support the stronger maximum-possible-debit promise.
- Show the complete human-readable summary and simulation slot/time before enabling any wallet request. Until then show BLOCKED, never READY or SIGNED.
- Signing only after explicit user review; revalidate all inputs and freshness immediately before wallet call.
- On return compare full message bytes, all instructions/account metas, amounts, destinations, programs, fee payer and blockhash; verify required signatures. Phantom-added compute budget changes must be rejected, not automatically accepted. Only a fully verified signed result may display `SIGNED — NOT BROADCAST`.
- Do not persist or log a reusable fully signed Mainnet payload publicly. No submit endpoint, sendTransaction call, worker queue, retry, or broadcast trigger may consume it.

## Preservation

Mainnet safety controls, existing production code and historical Devnet/Phantom evidence remain unchanged. The loopback Mainnet RPC transport still accepts only its narrowly validated historical memo schema; it was not broadened into an arbitrary signing/simulation proxy. No more memo diagnostics were performed.
