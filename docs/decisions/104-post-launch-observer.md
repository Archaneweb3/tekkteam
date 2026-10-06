# 104 — Receipt-bound setup and an observer with no execution authority

7 October 2026. CURRENT canonical ret/3ED launch is finalized; one receipt,
Agent, encrypted wallet record and binding exist. No trading is authorized.

The owner-only setup GET reuses the canonical receipt authority and compares
owner, Agent, mint, network, signature, execution and wallet. It rereads those
facts and the owner session after the Mainnet balance read. Unknown balance is
null, never zero. The reserve comes from controlled-policy-v1; it excludes
future transaction fee/rent, and is not an executable trade budget.

The standalone observer opens the product SQLite read-only. A separate worker
SQLite owns leases, monotonically increasing fencing generations, per-Agent
locks and safe observations. Every commit checks unexpired leader and Agent
leases. Restart preserves UNKNOWN operation IDs; no new decisions are made.
The process imports no vault, signer, broadcaster or execution constructor.
It does not settle authoritative receipts. It observes only canonical receipt
bindings and leaves historical journal/quarantine unchanged.

TARGET financial worker: qualified Pump execution adapter plus owner-approved
bounded activation, transaction count/session/daily debit reservations in the
same product transaction as execution claims, revoke/expiry checks and all
existing safety guards. Worker-state writes are never authorization. Hosting
an observer is not evidence of Real trading readiness.

Rollback: revert only this API/read UI revision and stop the TEKKTEAM observer.
Keep worker-state evidence and the confirmed receipt/binding. Never delete or
roll back the product database to undo a UI or observation deployment.
