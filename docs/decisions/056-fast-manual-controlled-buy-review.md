# 056 — Direct owner review, Arm, and Confirm within the quote window

## Context

The fixed first-buy quote expires after 25 seconds. An external chat verification round-trip between Prepare and Arm consistently expired otherwise valid unsigned reviews. Extending the TTL would weaken the established freshness policy.

## Decision

Keep Prepare, Arm, and Confirm as separate owner actions in Agent Detail. Show the current review expiry and a conspicuous `ARMED FOR ONE MANUAL CONFIRMATION` state after Arm. Arm uses the selected canonical execution ID and server-derived eligibility; the Arm endpoint independently repeats owner, policy, Mainnet, quote, state, blockhash, capability, reservation, Risk, validator, simulation, and exact-message checks. Failed arming refreshes status so unsigned expiry can be reconciled rather than inviting a blind retry.

Only a separate owner Confirm may claim the one-shot latch and reach custody signing or broadcast. Confirm repeats the security checks; expiry between clicks prevents signing. The client disables repeat confirmation and the server's durable claim/signature/broadcast state prevents duplicate submission. Neither Prepare nor Arm signs or broadcasts. Live Autonomous remains disabled.

## Consequences

The owner can perform the entire review and explicit two-click authorization within the unchanged 25-second quote window. The browser remains a presentation layer: a displayed card, enabled button, or stale tab cannot override backend eligibility. A hard refresh loses the in-memory confirmation capability and cannot silently recover signing authority.
