# 077 — One Agent Wallet drawer and transfer flow

Status: Accepted

## Context

Agent Settings needs a compact wallet summary, while Settings, Delete Agent recovery guidance, and future wallet surfaces need the same detailed Mainnet holdings and transfer controls. Duplicating transfer UI would risk divergent custody, idempotency, and confirmation behavior.

## Decision

Use one reusable right-side `openAgentWalletDrawer` component that mounts the existing `mountAgentWallet` flow. Settings and Delete Agent open that component; neither implements its own deposit or withdrawal. The drawer keeps amount entry, preparation, review, confirmation, and transfer history in one surface. Opening it never prepares, signs, or broadcasts a transaction.

The authenticated `GET /api/agents/:id/trading/wallet` response now also provides `assetStatus`, `assetCount`, and `assets` (`mint`, raw decimal-string `amount`, `decimals`). It reads both SPL Token programs on Mainnet and aggregates positive holdings by mint. An RPC or parsing failure reports `assetStatus: UNAVAILABLE` and `assetCount: null`, not zero. The UI labels tokens by mint until a verified metadata source is available.

## Consequences

Settings remains a summary. Every entry point uses the existing owner-scoped wallet endpoint and transfer state machine. The drawer may be reused by a future Wallets workspace without adding another transaction path. Failed asset reads do not falsely imply an empty wallet; transfer gates remain server-authoritative.
