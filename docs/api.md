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
| POST `/agents/:id/submit` | Owner session; signed base64 `transaction` | Persists signature then broadcasts approved message |
| POST `/agents/:id/reconcile` | Owner session | Updates confirmation/failure state |

Character/strategy IDs are supplied in `/state.config`. Limits: 50 drafts per owner, agent names 2–40 characters, token names 2–32, tickers 1–10 alphanumeric, description up to 300. Never trust client owner, balance or status fields.

Errors: `{ "error": "..." }`. Codes: 400 validation, 401 authentication, 403 origin, 404 no owned record, 409 idempotency/state conflict, 413 body too large, 429 rate limit, 503 devnet unavailable. Provider failures return sanitized 500.

States: `DRAFT → PREPARED → SUBMITTED → DEVNET_LIVE` or `FAILED`. Expired unsigned preparation may reuse the same mint. Unknown submitted signatures remain `SUBMITTED`, never automatically retried as another launch. A background worker checks every 15 seconds and rebroadcasts the identical encrypted saved transaction when pending; finalized block height determines expiry. Preparation returns `estimatedCostSol` and `balanceSol`, and rejects insufficient test SOL with 422.

Devnet tokens: 1,000,000 units, six decimals, no freeze authority and revoked mint authority. Name/description are local TEKKWORK metadata. No pool or pump.fun listing is created.
