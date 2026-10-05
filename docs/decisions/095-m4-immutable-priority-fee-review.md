# Decision 095 — M4 explicit priority fee before immutable multisigner review

Date: 5 October 2026. Status: ACCEPTED for staging source; real Phantom fee
reconciliation remains unverified. Production and Real trading unchanged.

## Context

Canceled execution d16d20e3 had two null signature slots, one create_v2,
840 bytes, no Compute Budget and a 10,000 lamport RPC fee. Phantom displayed
90,000. Prepared and delivered bytes matched. No signed response was returned;
its final message, CU limit/price and the actual cause of the 80,000 delta are
UNAVAILABLE. Eligibility for automatic fee addition is not proof it occurred.

[Phantom's documented automatic-fee conditions](https://docs.phantom.com/developer-powertools/solana-priority-fees)
are consistent with these incoming bytes. Its yellow new-domain advisory is
distinct from the earlier red blocking warning; neither is suppressed or bypassed.

## Decision

Use Option B for M4 only. The mint signature is computed before owner approval
and its secret wiped immediately. Wallet message mutation invalidates that stored
signature. Option A would require a new mint-key retention/signing contract; this
change does not introduce that custody boundary or relax exact-message checks.

Prepend precisely SetComputeUnitLimit and SetComputeUnitPrice before simulation,
review and mint signature. Keep 200,000 CU, the original one non-builtin instruction
default; successful simulation must still prove this limit suffices. Select price
from the current RPC writable-account quote's latest 20-slot window, 75th percentile.
Reject stale/malformed/over-limit quotes. Priority cap is 100,000 lamports (1% of
the existing 0.01 SOL debit budget), not a target fee or the old Phantom delta.

Compute priority with integer ceiling arithmetic. getFeeForMessage of the entire
message returns total fee; subtract priority to obtain base, which must be 10,000
for exactly two signatures and no precompile. Never add priority twice. Full atomic
proof includes the extra readonly Compute Budget program account. Non-fee debit +
base + priority must equal simulated owner debit and stay within 0.01 SOL/reserve.

Only signature fields may differ at wallet return. Added, removed or changed fee
instructions also reject: explicit fee construction removes Phantom's documented
automatic-addition condition. Preserve fixed 30-second review, pre-broadcast fresh
fee/simulation checks, durable one-shot and exact finalized bytes/fee/spend/receipt.

## Evidence and limits

Separate prepared, delivered and returned message fingerprints, owner-returned
payload and fully signed payload hashes. A canceled request has no returned hash.
Tests are LOCAL_FIXTURE; unsigned Mainnet simulation is preparation evidence, not
a launch receipt. Do not open a second real wallet request merely to fill the
historical evidence gap. Original Phantom CU parameters remain unknown.

References: [Solana fees](https://solana.com/docs/core/fees),
[RPC fee calculation](https://solana.com/docs/rpc/http/getfeeformessage),
[Phantom explicit-fee recipe](https://docs.phantom.com/recipes/transactions/add-priority-fees).
