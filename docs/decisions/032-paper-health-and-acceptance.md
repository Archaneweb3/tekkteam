# 032 — Independent Paper lifecycle and discovery health

## Status
Accepted, 2026-09-27.

## Context
A single failed candidate incorrectly marked a usable batch unavailable. Pausing
then hid this warning. Lifecycle and market transport health are independent.

## Decision
Radar adds `agentStatus` (READY/WORKING/PAUSED), `marketHealth`
(HEALTHY/DEGRADED/STALE/RATE_LIMITED/PROVIDER_UNAVAILABLE, null before checking),
`lastScanHealth`, `dataStale`, and nullable `coverage`. Legacy `status` remains for
compatibility. UI displays lifecycle and data badges separately, including warnings
while paused. A healthy old scan becomes STALE; degraded old scans retain DEGRADED
and also expose dataStale, so neither missing data nor ageing is hidden.

Coverage counts the full bounded discovery batch, not just eight displayed cards.
`discovered = quoted + unavailable`. Quoted means complete, fresh usable market
facts at scan time (not merely an HTTP response); unavailable includes invalid,
missing, stale and failed quotes. Strategy liquidity/volume floors do not determine
provider health. Partial failures with usable quotes are DEGRADED, even on 429.
No usable quotes: rate limiting takes precedence, all-stale becomes STALE, other
failures become PROVIDER_UNAVAILABLE. Held-market failure also degrades usable
discovery. Successful empty discovery is HEALTHY, not a fabricated provider error.
Unknown legacy quote counts remain null; no history reconstruction or migration.

## Alternatives
Rejected treating pause as data health, marking an entire usable batch down,
deriving complete counts from a truncated queue, and loosening real strategies.

## Verification
tests/paper-completion.test.mjs uses actual strategy, risk, execution, projection
and in-memory SQLite decision persistence. Fixed time and market inputs exercise
market failure, signal failure, risk allow, max-trade rejection, stale blocking,
partial coverage and four lifecycle/health combinations. HOLD remains the existing
internal non-executable strategy outcome; its risk is null. No engine thresholds,
real histories, agent balances or launch code change. Browser fixture uses the
production Radar renderer with clearly labelled isolated data.
