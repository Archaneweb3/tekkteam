# 106 - Budget attribution on existing Real reservations

7 October 2026. CURRENT source, production authority unmounted.

Use existing real_balance_reservations and its SQLite mutex/savepoint, not a
parallel funds ledger. Trusted synchronous readBudgetAuthority must return a
bounded active owner grant with revision/digest and exact owner/Agent/wallet/
mint/Mainnet/session scope. DRAFT activation plans are never authority.

Reserve total reviewed debit and transaction count; daily usage spans session
renewals and counts unsettled holds from previous days conservatively. Claim
revalidates expiry/revocation/day/message and inserts the existing unique
signing claim in the same transaction. Fixed SQL replaces arbitrary callbacks:
a promise callback can schedule a write after rollback and is not safe here.
Initial signed/pending allocation and retroactive attribution are forbidden.

Unsigned cancellation releases held debit/count; claimed attempts retain count.
UNKNOWN stays reserved until proven terminal. Finalized failure charges fee only.
BUY consumption includes actual input + fee + positive rent, including WSOL input
when native hold is smaller. SELL charges fee + positive rent; proceeds/refunds
never refill a cap. Settlement/receipt/accounting are atomic. Unattributed legacy
records retain prior behavior; finalized evidence does not need an active grant.

Pump storage accepts trusted optional budget attribution only after exact plan
scope/message/economics checks. The HTTP executor does not accept client grants
and no production resolver or Pump signing coordinator is mounted. Tests manually
exercise the future custody boundary in disposable SQLite, never a real signer.
The current observer remains OBSERVER_ONLY. No claim of Real trading readiness.

Validation: budget/restart/renewal/count/expiry/rollback/scope tests, competing
SQLite connections with distinct wallets reach the daily budget cap; PumpSwap
native-hold versus WSOL-total accounting; real DexLedger failure settlement.
Extended regression133 passed, one older acceptance E2E fixture lacked the current
paper_states schema and creator field; repaired fixture, rerun1/1 passed. No
production guard was relaxed. Independent storage/security review PASS.

NEXT: qualified Pump first-BUY account/rent/CPI evidence and exact-message
simulation; then an explicit bounded owner grant and default-off qualified
coordinator. Funding/activation remain owner financial gates, never inferred.
