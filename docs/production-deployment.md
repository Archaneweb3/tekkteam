# Controlled VPS deployment

## Status and boundaries

Single VPS, single instance of each service, SQLite/WAL on persistent local disk.
Browser uses same-origin `/api`; loopback is private server-to-server transport,
not a dependency on the user's computer. Cross-origin frontend hosting is not
supported by the cookie policy; proxy API through the frontend origin.

Live execution is locked unconditionally. `LIVE_TRADING_ENABLED=true` refuses
startup. `GLOBAL_TRADING_KILL_SWITCH=true` rejects live intents. Paper trading
remains simulated and starts paused after restart. Funding is separately gated
by `FUNDING_ENABLED=false`; its prepared flow uses one System transfer, exact
message/signature verification and a durable submission latch. Confirmation
checks exact destination credit before reporting confirmed balance. Never resend
an ambiguous submission. No funding or live trade has been tested with funds.

## Secrets and environment

Copy `deploy/production.env.example` to `/etc/tekkwork/production.env` outside Git.
Set real HTTPS frontend/metadata origin, private HTTPS Mainnet RPC, absolute data
directory and 32-byte base64 vault key. Keep flags disabled. No secret may use a
VITE_ prefix. Restrict environment file to root/service user (0640).
Generate a NEW installation key with `openssl rand -base64 32` in a private
terminal. When migrating existing encrypted data use its ORIGINAL vault key:
changing the key makes existing agent secrets unreadable. Store a separate
encrypted backup; do not print keys in logs, tickets or shell history.

`SOLANA_NETWORK=local` is deliberate for off-chain workspace CRUD. The separate
Pump.fun service, funding and market feed enforce Mainnet. Do not switch this
workspace to the historical read-only Mainnet diagnostic backend.

## Install and start (Linux, Node 22.13+)

1. Install Node/npm and Caddy; create a dedicated `tekkwork` service account.
2. Place reviewed application source in `/opt/tekkwork` (exclude local `.env`,
   server/data, vaults, diagnostics and node_modules from the transfer).
3. Create `/var/lib/tekkwork`, owned by tekkwork; configure the environment file.
4. Run `npm ci`, then `VITE_BACKEND_ENABLED=true VITE_API_BASE=/api npm run build`.
5. Install `deploy/tekkwork@.service` into `/etc/systemd/system/`.
6. Replace example hostname in `deploy/Caddyfile`; install as `/etc/caddy/Caddyfile`.
   Allow Caddy read/traverse access ONLY to `pump-metadata-site/public`, never
   database/vault files. Use a shared read group or default ACL on that subtree.
   Metadata writes must remain readable by Caddy across restarts/new agents.
7. Point DNS at VPS; open only 80/443 and restricted SSH. Keep 4190/4193 private.
8. `sudo systemctl daemon-reload`
9. `sudo systemctl enable --now tekkwork@index tekkwork@pump-launch-index`
10. `sudo caddy validate --config /etc/caddy/Caddyfile`
11. `sudo systemctl reload caddy`
12. Verify HTTPS `/api/health`, wallet login, roster, paper state and public
    metadata HTTP 200. Do NOT launch/fund as a deployment smoke test.

Use journalctl for errors; error logs exclude raw RPC URLs/bodies/keys. Back up
SQLite with SQLite backup API (not a live file copy), launch receipt journal and
metadata together; keep the encryption key separately. Stop both services before
restoring/migrating. Never run multiple launch or worker instances against these
files. Restore tests and VPS TLS/permissions checks are required before public use.

## Remaining live gate

A chosen DEX requires a reviewed deterministic builder, exact message/account
validator, executable quote/liquidity validation, atomic daily-spend reservations,
custody signer integration, confirmed position/PnL accounting and reconciliation.
`live-execution.js` is a deny-by-default boundary, not a completed DEX adapter.
Do not enable funding until a separate controlled user-approved funding test.
