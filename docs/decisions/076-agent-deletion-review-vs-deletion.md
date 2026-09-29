# 076 — Delete Agent review is separate from deletion authority

Status: Accepted

## Context

The Agent overflow menu disabled Delete Draft whenever blockers existed and printed the entire deletion policy in the menu. That prevented owners from learning what was actionable. The backend deletion path, however, physically removes only unlaunched drafts with no Agent Wallet, custody records, or unresolved operations. It cannot safely turn a wallet-bearing real-money Agent into a deleted UI object while retaining immutable audit history.

## Decision

The authenticated owner's Delete Agent action always opens a review dialog; it never deletes on click. The dialog fetches the server's current deletion eligibility and renders each returned blocker separately. Wallet, Paper position, and launch rows can link to the existing product surfaces, but none automatically move funds, transfer tokens, close positions, sign, or broadcast. If the server reports eligible, the owner must type `DELETE`; eligibility is fetched again immediately before the existing DELETE endpoint, which independently rechecks its guard.

We retain the narrow backend draft-only deletion contract. A wallet or real-money audit record remains a hard blocker even after funds are resolved. A future user-visible archive for such Agents requires its own lifecycle design and must preserve the required records; the UI must not imply the current Delete endpoint already supports that.

## Consequences

The overflow menu stays concise, blockers are actionable where an existing safe path exists, and a stale eligibility snapshot cannot authorize deletion. Historical custody and transaction records are preserved. No real Agent is deleted by the fixture tests.
