# 072 — Bind Phantom message signing to the selected provider

Status: Accepted

## Context

Wallet login reached `SIGN_MESSAGE` and the browser reported an unexpected provider error. Multiple wallet extensions may inject overlapping Solana provider interfaces, so a public key obtained during connect is insufficient proof that the same provider signs the challenge.

## Decision

Prefer a Phantom Wallet Standard registration only when its connect and sign-message features are both available. Otherwise, use only the explicitly identified `window.phantom.solana` provider. Never select a generic `window.solana` object as Phantom. Before signing, require the selected provider object, registration, account, and public key to remain bound to the provider used at connect. Encode the server challenge exactly once as UTF-8 bytes and submit only the resulting 64-byte signature through the existing authentication flow.

Expose a localhost-only, manually triggered Phantom signing probe with fixed harmless text. It does not call authentication endpoints, create a session, or invoke transaction signing. Surface only allowlisted diagnostic metadata; do not expose signature bytes or provider internals.

## Consequences

Provider substitution fails before signing, while normal login keeps its existing challenge and verification path. The probe can distinguish a provider-level signing failure from backend authentication without authorizing any value movement. A successful mocked fixture does not establish that the actual Edge extension works; that requires the owner's manual probe.
