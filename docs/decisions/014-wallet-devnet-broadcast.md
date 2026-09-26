# Wallet-owned devnet broadcast

Status: Accepted
Date: 2026-09-26

## Context
Phantom sign-only displayed simulation failures despite a successful backend simulation. Official transaction documentation recommends signAndSendTransaction. This migration is not proof that Phantom's warning is resolved.

## Decision
Browser uses Wallet Standard solana:signAndSendTransaction with an explicit solana:devnet chain and preflight enabled. Before invoking the wallet, an owner-authenticated wallet-send endpoint checks the exact prepared message, simulates, and persists SUBMITTED with mode wallet. No private signing key leaves the backend. A worker discovers transactions referencing the reserved mint and verifies the exact serialized prepared message and successful on-chain metadata before confirmation. Client-provided signatures are not accepted as proof.

## Consequences
Rejected or timed-out approval remains pending until reconciliation establishes expiry or confirmation. No immediate retry or mint replacement is allowed. Unknown existing mint accounts stay pending for investigation. A wallet that changes instructions or blockhash will not be accepted by exact-message verification. This is conservative: investigate rather than silently broaden validation. The prior backend-broadcast endpoint remains for the isolated test script, but the UI no longer calls it. No mainnet support or public deployment is added.

References: https://docs.phantom.com/solana/sending-a-transaction and https://docs.phantom.com/sdks/browser-sdk/sign-and-send-transaction
