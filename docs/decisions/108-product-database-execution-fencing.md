# 108 - Product database execution fencing, unmounted

CURRENT source contract only; no runtime execution enabled. Observer coordination
continues in its separate database and cannot authorize a financial claim.

Opt-in Pump ledger fencing uses the existing reservation SQLite transaction.
Leader and Agent generations are monotonic; takeover never deletes old rows.
Agent leases bind to the current leader generation and cannot outlive it.
Clock rollback, stale holder/generation/parent, expired lease and wrong Agent
all reject. Defaults create no execution-fence store or active dependencies.

claimSigning requires the exact immutable preparation/source/message, current
control revision, canonical receipt/owner/Agent/wallet/mint binding, explicit
active bounded authorization with the same launch-binding digest, and a trusted
synchronous final-message/native-validity qualification port. Missing ports fail
closed. It inserts the existing unique claim, marks the reservation and execution
UNKNOWN and records the event in one transaction. Final lease, grant/day,
intent/quote/risk expiry and control checks can roll everything back.

A claim is a durable fact, not a returned signing capability. No signer,
broadcaster, worker mount or HTTP route is added. UNKNOWN without a signature
survives restart/takeover/expiry and cannot be canceled or signed again.
The existing verified-signature import can attach only the claimed exact message.

LOCAL_FIXTURE evidence:19/19 tests. Includes two actual SQLite worker connections
racing one execution, final-write rollback, lease/grant expiry during validation,
source isolation, takeover, parent generation, clock rollback and default-OFF.
Independent review repaired three time/source findings and accepted final scope.
No fixture result qualifies first-BUY CPI effects or Mainnet trading.
