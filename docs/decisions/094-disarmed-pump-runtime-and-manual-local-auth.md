# 094 - Disarmed Pump runtime and manual local owner auth

Date: 2026-10-02. Status: CURRENT local implementation; Mainnet qualification BLOCKED.

The expanded direct mandate permits local runtime integration with explicit dependency
injection and disposable fixtures. It does not authorize signing, sending, activation,
deployment or a new coin-Agent association.

Pump routes register DISARMED without creating a ledger or providing adapters by
default. Only a non-production local backend can inject LOCAL_FIXTURE dependencies.
No environment flag supplies an adapter, signer, broadcaster or worker. Existing CPMM,
Paper and custody behavior remains separate. Mint association, authenticated ownership,
wallet authority, revision, Pause and kill switches are rechecked across awaits.

Unsigned preparations reserve native SOL, WSOL or the exact associated token separately.
Immutable finalized receipts settle fee/rent/deltas atomically, update quantity/cost basis
and realized PnL, and release the original hold. Rent is tracked separately from PnL.
Unrealized PnL is unavailable. SOL-equivalent lamports are an accounting unit, not an
authorization to convert or spend WSOL as native SOL. Null/pruned/nonfinalized reads
retain UNKNOWN and its hold. Passive recovery never resends and can run while paused.
Dependency evidence is snapshotted before later async authority checks.

The official pinned SDK adapter consumes existing decoded curve/PumpSwap state,
wallet inspection, quote and exact unsigned envelope reconstruction. Unsigned simulation,
finalized reader and finalized effect verifier are explicit DI dependencies. Local tests
do not qualify these dependencies against an actual Mainnet pool. A genuine chain effect
decoder/reader binding and venue qualification remain required before ON_CHAIN support.

Owner authentication uses the existing signature verifier in a separate loopback harness
with isolated persistent temp data, outbound denial, no jobs and a separate cookie name.
Challenges show domain, origin, public wallet, nonce, expiry and a disposable-data purpose.
Preparing or displaying a challenge never requests signing. Only a human explicit action
may request a wallet signature. Original preview seeded sessions are not renewed.

Exactly one authorized existing getTransaction finalized was consumed. It proves the
standalone transaction finalized successfully at slot 450686796, not the missing canonical
Agent ID/owner/application intent association. No new binding or receipt promotion occurs.
Publisher remains blocked on the actual nginx vhost/backend data-root/operator access;
local location config is not installed and PUBLIC_METADATA_ORIGIN is not assumed.
