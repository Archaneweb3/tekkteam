# 081 — Fresh Mainnet identity migration without Devnet mint secrets

## Context

The stopped local SQLite database contains two `agents` rows marked Devnet. Its `agents.secret TEXT NOT NULL` is an encrypted Devnet draft-mint key, while the actual Agent Wallet custody is held separately in `agent_wallets.secret` under the `trading:<agentId>` encryption context. Copying the source database into Mainnet production would promote Devnet token state, stale execution records, and unresolved real-money state. Fabricating a replacement secret would falsely satisfy the schema without valid custody.

The local read-only migration audit verified the source SQLite/WAL/SHM set, its vault key, one Agent Wallet public address, and Paper provenance. Independently read-only Mainnet checks found finalized chain evidence for some historical transactions, but other signed or unsigned records remain unresolved. No source database or destination was changed.

## Decision

Design a **fresh** version-2 Mainnet destination, not an in-place transformation of the source. In its `agents` table, the legacy Devnet mint `secret` column is nullable. Import allowlisted Agent identity fields with `secret=NULL`, preserving IDs and owner relationships; set Mainnet destination scope, DRAFT token state, and no copied Devnet mint/launch/coin or execution material. The Devnet prepare path explicitly rejects a missing mint secret. This does not change the source table or its existing rows.

Agent Wallet custody remains a separate encrypted `agent_wallets` row. Copy its ciphertext only for a verified Agent ID/address association and only with the same master key; re-derive its public address in a private verification step. Paper records retain mode `paper` and enter the destination paused. A source snapshot of SQLite+WAL+SHM and the key held separately is the immutable legacy archive, outside the live production `DATA_DIR`.

Real-money records are **not** imported based on local network labels, statuses, signatures, or receipts alone. A read-only Mainnet genesis check and finalized transaction/effect check must support each record. `NOT_FOUND`, unsigned, UNKNOWN, and mixed records stay in the legacy archive, never active production state. Proven failures can be preserved as terminal history but cannot create a position or authorization. Every independent transaction is counted once even if a local execution and receipt both reference it.

## Consequences

The current source schema cannot accept identity-only rows with NULL secrets; it remains untouched. An eventual authorized importer must create a fresh version-2 destination schema, populate parent Agent identities before custody/Paper references, validate foreign keys, integrity, network identity, vault check, custody addresses, and absence of active reservations/claims, then publish a reviewed manifest. Its rollback is to stop/discard the new destination and restore the separate pre-apply snapshot. This decision does not authorize `--apply`, production boot, or value movement.

Source sessions, challenges, idempotency requests, Devnet mint/launch secrets, and unproven historical real-money rows remain archive-only. Existing Mainnet product capability flags must still be evaluated before claiming migrated Agent identities are usable in production.
