# 097 — Observed Phantom Lighthouse addition conflicts with exact-message approval

6 October 2026. CURRENT evidence and blocked compatibility decision, not approval
to change the signing contract. Decision096 native validity remains in force.

Execution a50e30db-a404-4c87-b3b7-5903265c567a received a real, manually approved
Phantom Wallet Standard transaction at20:53:35.291 WIB. Owner signature verifies
on the returned message. The mint signature is absent as required by owner-first
handoff. This proves wallet-side owner approval, not backend acceptance or launch.

Prepared message SHA256:
`17c1b1001bbb0c0171031351641a64fc8eb76cc1af8a0f78bbb4abd153ec0c6f`.
Returned message SHA256:
`3706b646efea422f77fcbddbc43efe2b089e9d1ebc611b6faefdedd1ec44a098`.
Raw and locally recompiled messages match on each side. The original three
ComputeBudget/Pump instruction payloads, accounts and privileges, blockhash,
fee payer and required signers are unchanged. Account keys are reordered and a
fourth instruction is appended by the wallet:

- Program: `L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95`.
- Data: `BgQDAMtDPAoAAAAABAMAAAEAAAAAAAAAAAA=`.
- Target: connected owner only, retaining existing privileges.
- Decode: AssertAccountInfoMulti(6), FailedPlaintextMessage(4), three assertions:
  lamports >=171721675, owner==System Program, account data length==0.

The [Phantom documentation](https://docs.phantom.com/developer-powertools/lighthouse)
explicitly permits Lighthouse augmentation. Decoding follows the maintainer's
[instruction schema](https://github.com/Jac0xb/lighthouse/blob/4c579479c98635e419b1b167f08be02a71604a71/clients/js/src/generated/instructions/assertAccountInfoMulti.ts)
and [assertion schema](https://github.com/Jac0xb/lighthouse/blob/4c579479c98635e419b1b167f08be02a71604a71/clients/js/src/generated/types/accountInfoAssertion.ts).
This is source-level identification, not independent deployed-bytecode verification.
The captured owner floor alone allows11114103lamports below starting balance,
more than TEKKTEAM's10000000 ceiling; it cannot replace application debit guards.

The frontend correctly refused the returned bytes before Submit. Backend signature
stays null, broadcast false, validated receipt journal empty and candidate mint
absent at finalized Mainnet. The existing mint signature covers the prepared message
and cannot validate the augmented message. It must not be copied onto changed bytes.
The later native expiry is separate from the earlier exact-message mismatch.
Do not retroactively attribute Lighthouse to first attempt15dd72ef, whose full
returned message was not captured.

## Current decision

Keep exact-byte refusal, wallet protection, spending/reserve guards and one-shot
claims unchanged. No third wallet attempt or blind retry. Do not strip Lighthouse,
disable Phantom protection, accept arbitrary assertions or exempt any instruction
from the fingerprint. Pre-including an assertion before review is technically
possible, but no documented Phantom deduplication/order-preservation guarantee was
found. Offline pre-inclusion also did not reproduce captured compiled ordering.
It is not verified as a compatible immutable-message path.

## Concrete protocol alternative requiring explicit approval

If the owner authorizes replacing literal pre-wallet message equality with a
narrowly constrained wallet-augmentation protocol, design/review must first cover:

1. Preserve every original instruction, privilege, signer, amount, program and fee;
   validate raw wire bytes and reject additions except a specifically decoded,
   bounded owner-only Lighthouse assertion. No generic program allowlist.
2. Pin the actual returned message and verify the owner's signature on those exact
   bytes. Revalidate Mainnet, native expiry, simulation, all account effects, current
   fee, reserve and the0.01SOL ceiling against the complete returned transaction.
3. Never reuse a mint signature from another message. Any delayed mint signer needs
   an independently reviewed narrowly scoped custody/lifecycle design, secret
   erasure, crash/restart behavior and exact final-message binding.
4. Verify all signatures on the final unchanged message, durable single-send claim,
   post-send reconciliation and receipt-derived provisioning. Changed economics or
   unrecognized assertions stop before broadcast and require a new explicit action.
5. Prove adversarial mutation/privilege/fee/signature/replay/expiry/failure cases
   locally before staging activation and any fresh manually approved wallet attempt.

This alternative is PLANNED, not implemented or authorized by this document. It
changes the user's explicit exact-prepared-message requirement; routine engineering
authorization must not silently reinterpret that requirement.

## Validation

24/24 local focused tests PASS. Synthetic frontend tests cover Wallet Standard and
injected-provider augmentation refusal/replay protection. Backend fixture proves a
valid owner signature on augmented bytes is rejected with unchanged durable record,
zero sends, and an invalid old mint signature on the new message. Real browser
evidence independently shows refusal before Submit. No fixture proves a launch.
