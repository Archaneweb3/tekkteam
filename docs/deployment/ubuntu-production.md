# Ubuntu production deployment audit (not a deployment authorization)

Target: Ubuntu 26.04 LTS, Node.js 22, PM2, Nginx. Application source lives at `/var/www/tekkteam`; persistent data and secrets must live outside that checkout. These commands are an operator runbook, not commands to run until the blockers below are resolved and a maintenance window is approved. No step below enables real-money operations.

## Processes and routing

- `npm run build` produces `dist/` (Vite). Nginx serves this; never run Vite's dev server in production.
- `server/index.js` is the singleton API on `127.0.0.1:4190`. Its in-process intervals perform wallet/transaction reconciliation, Paper ticks, and analytics. Do not PM2-cluster it.
- `server/pump-launch-index.js` is the singleton Pump.fun launch service on `127.0.0.1:4193`. Its launch and prepare journals share `DATA_DIR`. Do not PM2-cluster it.
- No standalone autonomous-trading or scheduler process is required. The API process owns its scheduler.
- `/api/pump-launch/*` must reach the launch service as `/pump-launch/*`; all other `/api/*` goes to the API. No WebSocket or SSE route was found. `/mainnet-rpc` is a local development diagnostic transport, not a production endpoint.
- `PUBLIC_METADATA_ORIGIN` must point at a separately verified HTTPS static host for the files written under `DATA_DIR/pump-metadata-site/public`. It is **not** the app origin unless Nginx explicitly serves this directory on that separate origin. The launch path verifies its published JSON and image over HTTPS before preparing.

## Preconditions and unresolved decisions

1. Supply the actual HTTPS app domain, metadata domain, and dedicated Mainnet RPC URL through operator-controlled configuration. Do not copy a local `.env` or a Devnet database.
2. Migrate the existing SQLite database and runtime journals **together**, offline, after all old writers stop. Migrate the existing custody master key separately via a secret channel; generating a new key would make existing encrypted Agent Wallets unreadable. Confirm ownership and `0600` permissions. Do not print the key or wallet records.
3. `DATA_DIR` should be `/var/lib/tekkteam`, owned by the service account, mode `0700`. Include `tekkwork.sqlite` and any `-wal`/`-shm` sidecars, `pump-agent-launches.json`, `pump-agent-launches-prepare-attempts.json`, `pump-mainnet-launch.json` if present, and `pump-metadata-site/`. Preserve other files already present in the existing runtime directory. Back up and restore these as one application dataset.
4. Set `VITE_BACKEND_ENABLED=true` **at build time**. Otherwise `src/bootstrap.js` enables the production demo fallback. `VITE_API_BASE` may remain `/api`. Never place secrets in `VITE_*`.
5. The production runtime requires `DATA_DIR`, `VAULT_KEY_BASE64`, `MAINNET_RPC_URL`, `APP_ORIGINS`, and `PUBLIC_METADATA_ORIGIN`; all origins must be exact HTTPS origins. Set `SOLANA_NETWORK=MAINNET`, `MAINNET_SAFETY_MODE=true`, `REAL_MONEY_NETWORK=MAINNET`, and, if supplied, `SOLANA_MAINNET_RPC_URL` equal to `MAINNET_RPC_URL`. Conflicting RPC values fail closed.
6. The supplied PM2 manifest forcibly keeps funding, withdrawal, Controlled Real, autonomous/live trading and Paper trading disabled, with emergency and kill switches active. Operational activation requires a separate security review; do not alter these defaults as part of deployment.
7. The legacy Caddy/systemd files under `deploy/` target the old TEKKWORK host/path and are **not** this Ubuntu/PM2 deployment plan.

## Prepare host (operator, after the preconditions)

Install Node.js **22.13.0 or later in the 22.x line** (the application uses `node:sqlite` without an experimental CLI flag), npm, Nginx, PM2 and a TLS certificate using the organization's approved package and certificate procedure. Verify `node --version` reports an appropriate v22 and `npm --version` works. Create a dedicated unprivileged `tekkteam` user. Prepare `/var/www/tekkteam`, `/var/lib/tekkteam`, `/var/log/tekkteam`, and `/etc/tekkteam` with restrictive ownership; do not expose ports 4190 or 4193 through the firewall.

Place a root/service-account-readable, mode-`0600` shell-compatible `/etc/tekkteam/production.env` containing the required variables above. This file is **never** committed or placed below `/var/www/tekkteam`. Do not echo its contents to logs. PM2 inherits these variables when started; safe flags in `ecosystem.config.cjs` override accidental enablement.

From the service account, after source checkout and data migration:

```sh
cd /var/www/tekkteam
npm ci
VITE_BACKEND_ENABLED=true VITE_API_BASE=/api npm run build
set -a
. /etc/tekkteam/production.env
set +a
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 status
curl --fail --silent http://127.0.0.1:4190/api/health
curl --silent --output /dev/null --write-out '%{http_code}\n' 'http://127.0.0.1:4193/pump-launch/status?agentId=invalid'
```

The launch status request may return a client error for an invalid ID; use it only to check loopback reachability, not as proof of launch readiness. Health `ok:true` alone is not proof of Mainnet: inspect the non-secret network fields and require `networkConsistent:true`, `rpc:"MAINNET VERIFIED"`, and disabled real-money flags. PM2 boot integration requires the generated `pm2 startup` command to be reviewed and run by the operator, then `pm2 save`; do not register two PM2 homes/users.

## Nginx routing sketch

Replace `APP_DOMAIN` and `METADATA_DOMAIN` with approved domains and install valid TLS first. This is a sketch to adapt to the host's existing Nginx configuration, not a ready-to-paste certificate configuration.

```nginx
server {
    listen 443 ssl;
    server_name APP_DOMAIN;
    root /var/www/tekkteam/dist;
    index index.html;

    location ^~ /api/pump-launch/ {
        proxy_pass http://127.0.0.1:4193/pump-launch/;
        proxy_set_header Host 127.0.0.1:4193;
        proxy_set_header Origin $http_origin;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:4190;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / { try_files $uri $uri/ /index.html; }
}

server {
    listen 443 ssl;
    server_name METADATA_DOMAIN;
    root /var/lib/tekkteam/pump-metadata-site/public;
    location / { try_files $uri =404; }
}
```

The API origin allowlist and secure cookies must be checked through the **public HTTPS** app domain. Add standard TLS, HTTP-to-HTTPS redirection, request-size limits, and security headers in the actual host config. Keep the metadata host read-only from the internet; only the service user writes it. Validate with `sudo nginx -t` before reloading Nginx. Do not proxy `/mainnet-rpc` publicly.

## Health, logs, update, rollback

```sh
pm2 status
pm2 logs tekkteam-api --lines 100
pm2 logs tekkteam-launch --lines 100
curl --fail --silent https://APP_DOMAIN/api/health
sudo nginx -t
```

Before updates: stop all old writers, capture a consistent backup of `/var/lib/tekkteam` (including SQLite WAL/SHM) and an independent secure backup of the custody key. Preserve the deployed commit ID. Then, in a maintenance window:

```sh
cd /var/www/tekkteam
pm2 stop tekkteam-api tekkteam-launch
git pull --ff-only
npm ci
VITE_BACKEND_ENABLED=true VITE_API_BASE=/api npm run build
set -a
. /etc/tekkteam/production.env
set +a
pm2 restart ecosystem.config.cjs --env production --update-env
pm2 save
```

Check the public app, API health, network fields, launch-service reachability, and logs before reopening access. For rollback, stop both writers, restore the **previous compatible code revision plus its matching data snapshot** and key, `npm ci`, rebuild with the same public build flags, then restart PM2 and recheck. Do not blindly roll an older code version over a newer SQLite schema or copy a database while writers are active. Do not retry any UNKNOWN signed transaction after restart; reconcile its persisted signature.

## Files and permissions

- Clone/copy: tracked source, `package-lock.json`, `ecosystem.config.cjs`; build `dist/` on the target.
- Migrate separately: `DATA_DIR` contents and `VAULT_KEY_BASE64`/RPC credentials. Service data directory `0700`; DB/journals and env `0600`; metadata static files readable by Nginx via a narrowly scoped group/ACL, never the custody database.
- Never upload: local `.env*`, `node_modules/`, local `dist/`, developer screenshots/fixtures, private keys, seed phrases, logs, diagnostics, or local test databases.
- No deployment, Agent activation, launch, sign, or broadcast is authorized by this runbook.
