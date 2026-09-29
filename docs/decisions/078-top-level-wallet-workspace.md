# 078 — Owner-scoped Wallet command center

Status: Accepted

## Context

The shared Agent Wallet drawer from decision 077 made wallet actions available inside Agent Settings and Delete Agent, but owners also need a workforce-wide treasury view. Duplicating Deposit/Withdraw logic in that view would create divergent real-money authorization and reconciliation paths.

## Decision

Add a top-level Wallet route below Guide. It uses the authenticated Owner Mainnet balance endpoint and the existing owner-scoped Agent Wallet endpoint for each Agent returned by `/api/state`. Reads of Agent wallets are bounded to two concurrent requests; unavailable balances remain unavailable, not zero. The total SOL balance is shown as exact only when every included wallet balance was verified.

Wallet rows open the existing `openAgentWalletDrawer`; Settings and Delete Agent retain that same entry point. Transfer history comes from the existing wallet ledger, and CHECK STATUS uses the existing read-only same-operation reconciliation. No Wallet page action itself prepares, signs, or broadcasts.

The optional withdrawal MAX uses a new authenticated read-only `GET /api/agents/:id/trading/withdrawal/max`. It verifies owner, mapping, Mainnet, and the Withdrawal gate, then subtracts the existing approved network-fee ceiling from a fresh Agent SOL balance. The existing final preparation still determines the actual fee and validates balance. The current System Program SOL transfer creates no additional account, so its account-rent requirement is zero. This endpoint creates no transfer record or signature.

## Consequences

One owner can see 1–20 Agent wallets without burst-loading all RPC reads at once. The page remains a read-only overview until the owner opens the shared drawer and follows the existing transfer confirmation path. SPL holdings are display-only: the current transfer service supports SOL withdrawals, not SPL-token withdrawal. No token-withdraw button is shown until a separate authorized custody flow exists.
