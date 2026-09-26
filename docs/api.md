# TEKKWORK API contract

All paths start with `/api`. JSON requests use `Content-Type: application/json`. Mutations require an exact allowed `Origin`. Session cookies are HTTP-only, SameSite=Strict, scoped to `/api`, and Secure in production. Mainnet is not supported.

| Method and path | Request | Result |
| --- | --- | --- |
| GET `/health` | None | Service/network status |
| GET `/network` | None | Verified devnet RPC readiness, cached for 15 seconds |
| GET `/wallet` | Owner session | Devnet wallet balance in SOL |
| GET `/state` | Optional session | Capabilities; session-owned agents/events only |
| POST `/auth/challenge` | On-curve Solana `address` | `id`, exact sign-in `message`, five-minute expiry |
| POST `/auth/verify` | `id`, base58 Ed25519 `signature` | Consumes challenge; eight-hour session cookie |
| POST `/auth/logout` | None | Deletes session/cookie |
| POST `/agents` | Session; `Idempotency-Key`; `name`, `tokenName`, `ticker`, `description`, `character`, `strategy` | Saved draft; identical retry returns original |
| GET `/agents/:id` | Owner session | Owned record by ID or numeric sequence |
| PATCH `/agents/:id` | Owner session; `strategy` | Saves profile without executing trades |
| POST `/agents/:id/prepare` | Owner session; devnet configured | Partially signed base64 test transaction, mint, expiry |
| POST `/agents/:id/preflight` | Owner session; prepared transaction `message` in base64 | Exact-message devnet simulation, payer, balance, blockhash and heights; no broadcast |
| POST `/agents/:id/wallet-send` | Owner session; exact prepared base64 `message` | Simulates and persists wallet broadcast intent before approval; blocks further preparation |
| POST `/agents/:id/submit` | Owner session; signed base64 `transaction` | Persists signature then broadcasts approved message |
| POST `/agents/:id/reconcile` | Owner session | 200 updates confirmation/failure state; 202 returns current record plus `confirmationCheckInProgress:true` and `Retry-After: 5` if a worker/request already owns its lock |

Character/strategy IDs are supplied in `/state.config`. Limits: 50 drafts per owner, agent names 2–40 characters, token names 2–32, tickers 1–10 alphanumeric, description up to 300. Never trust client owner, balance or status fields.

Prepare accepts `fresh:true` to rebuild an unsigned preparation with the same mint and fresh blockhash. Submitted or live mints cannot be prepared again. The UI runs preflight after cost review and before invoking the wallet; failed/expired simulations stop the flow. Signature verification is disabled for this unsigned simulation, and the blockhash is not replaced. Wallet diagnostics show advertised chains, not proof of the wallet's internal RPC. Passing backend preflight never overrides wallet security warnings.

Errors: `{ "error": "..." }`. Codes: 400 validation, 401 authentication, 403 origin, 404 no owned record, 409 idempotency/state conflict, 413 body too large, 429 rate limit, 503 devnet unavailable. Provider failures return sanitized 500.

States: `DRAFT → PREPARED → SUBMITTED → DEVNET_LIVE` or `FAILED`. Expired unsigned preparation may reuse the same mint. Unknown submitted signatures remain `SUBMITTED`, never automatically retried as another launch. A background worker checks every 15 seconds and rebroadcasts the identical encrypted saved transaction when pending; finalized block height determines expiry. Preparation returns `estimatedCostSol` and `balanceSol`, and rejects insufficient test SOL with 422.

Devnet tokens: 1,000,000 units, six decimals, no freeze authority and revoked mint authority. Name/description are local TEKKWORK metadata. No pool or pump.fun listing is created.

The browser now uses Wallet Standard signAndSendTransaction with explicit Devnet. Wallet intent is SUBMITTED even before approval; rejection/timeout requires reconciliation, not immediate retry. The worker discovers the reserved mint's transaction and checks the exact message and on-chain error status; no signature supplied by the browser is trusted. Wallet-mode recovery does not rebroadcast signed bytes. See decision 014.

Concurrent confirmation checks do not launch another RPC job or release the existing operation's lock. A 202 response is pending, never success/expiry evidence. Prepare/submit protections remain unchanged. The detail page shows a neutral waiting status and its regular state poll refreshes the view when the agent status changes. This fixes worker/UI contention, not Phantom's separate simulation warning.

For wallet-mode recovery, an expired blockhash plus zero lamports at this persistent legacy SPL mint's address at the same or later finalized slot permits expiry without a history lookup: a successful mint must retain its rent balance. `getEpochInfo(finalized)` supplies the height and slot; `getBalanceAndContext` uses that slot as `minContextSlot`, and the returned context slot is also checked. Nonzero balances still require exact-message transaction verification and are never declared successful merely because an account exists. This shortcut is specific to the current legacy SPL mint flow and must not be reused for closable accounts or arbitrary transactions. Live diagnostics found history/account-data methods timing out while the context-bound balance method returned successfully.
