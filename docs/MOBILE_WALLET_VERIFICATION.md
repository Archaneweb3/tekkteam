# M2B real-device verification handoff

## CURRENT — M2B HTTPS staging, 3 October 2026 14:49 WIB

READY FOR HUMAN ANDROID VERIFICATION; not M2 wallet/launch/trading PASS.
Resume began14:12WIB, checkpoint14:42WIB; bounded verification follow-up ends14:57WIB.
Web console recovered twice. Sessions expire after a short interval; latest console
expired after setup, while PM2 staging and HTTPS remain available independently.
No SSH key was created. No VPS reboot or production PM2 action was performed.

- URL: https://staging.tekkteam.tech/#/overview — HTTPS frontend/API200 and actual
  browser Overview rendered at390px; scrollWidth375 <= viewport390.
- Frontend archive SHA256 verified; missing /src/token-draft-schema.js initially
  caused404/blank bootstrap. Existing pure schema copied into staging site; hash
  5cb639dfd38d40a172742d69f7148f74f8c351ad55386ac0f31156abfa8d2d06 matches local.
  Vite now emits that asset. New build PASS with byte-identical schema.
- Backend archive hash preserved; dependencies installed only in staging.
  PM2 tekkteam-staging-api PID33196 online/restarts0 at final PM2 observation.
  Entrypoint server/index.js --wallet-test, loopback4395; configuration
  /etc/tekkteam-staging/wallet-test.json; isolated /var/lib/tekkteam-staging SQLite,
  application key/nonces/sessions; logs /var/log/tekkteam-staging. No production DB copy.
- PM2 does not recognize this .cjs name as ecosystem configuration: transient
  ecosystem.wallet-test script process was removed; JSON ecosystem starts correctly.
  Use deploy/ecosystem.wallet-test.json. No global pm2 save/startup modification;
  automatic restoration after a VPS reboot is NOT VERIFIED.
- DNS A staging ->179.198.214.104 TTL300 verified at Hostinger and public resolver.
  Separate Nginx staging server block; nginx -t PASS, graceful reload only.
  Let's Encrypt cert tekkteam-staging valid through2027-01-01; HTTP redirects HTTPS.
- /api/health and /api/runtime-capabilities200: M2B_WALLET_ONLY, solana:101,
  auth/balance only. Unauthenticated balance401. Launch/funding/withdrawal/transfers/
  trading and wrong-origin auth challenge403. No signing/broadcast/jobs enabled.
- Real challenge endpoint binds https://staging.tekkteam.tech and non-payment text.
  Probe created an unsigned challenge only; no human session was fabricated.
- Dedicated TEKKTEAM Reown ID present in existing built configuration. AppKit opens;
  All Wallets visibly lists Trust Wallet, Backpack, Jupiter and others. Catalog HTTP200
  with staging Origin. No wallet selected; unapproved pairing times out after180s.
  Actual relay pairing, app switch, owner sign-in, balance/Refresh on Android PENDING.
  Do not infer an allowlist failure from that timeout. If required, exact origin is
  https://staging.tekkteam.tech; no Reown Cloud configuration was changed.
- Production preserved: tekkteam-api PID10722/restarts0 and tekkteam-launch
  PID10893/restarts0 online. Production Nginx hash unchanged:
  597de3ad5d9caff9d17c0a8fc52f253a8828cad39c7e736a6736eafa289ac8f9.
  /var/www/tekkteam untouched; production URL and local5199/proxy health200.

Remaining: human Android wallet test. Direct Phantom desktop prior PASS retained;
no fresh desktop-wallet/device proof claimed. All money operations remain OFF.
Evidence: artifacts/mobile-wallet-m2b/staging-mobile-overview.png,
staging-reown-discovery.png, staging-dns.png, https-denials.json, https-assets.json, build-resume.log.


## Human Android test steps (after URL qualification)

Never approve a transaction, transfer, token approval or funding. Only approve the
manual Sign In message. Its product text is:

```text
TEKKTEAM wallet sign-in
Origin: https://staging.tekkteam.tech
Wallet: <your connected Solana public key>
Nonce: <one-time server nonce>
Expires: <server expiration>
This signature signs you in. It does not authorize a payment.
```

- **Phantom from Chrome:** open the qualified URL → Connect Wallet → Open in
  Phantom. The official browse link opens the site inside Phantom. Connect there,
  then Sign In → review the message → approve authentication only → check SOLANA
  MAINNET and real SOL balance → Refresh Balance. This browse transport keeps the
  connected/authenticated session in Phantom's browser; Chrome is a separate
  browser and is not silently authenticated. Return to Chrome manually and record
  its actual state. Also open the URL directly in Phantom's browser and repeat.
- **Solflare:** same URL → Connect Wallet → Open in Solflare → Connect inside the
  app → Sign In/review → approve message → Mainnet balance → Refresh Balance.
  Record whether app opening/back navigation works and where the session lives.
- **Backpack:** choose Backpack/open its browser, select Solana, Connect → Sign In
  → Mainnet balance → Refresh. Do not infer support from the button alone.
- **MetaMask:** requires its Solana Wallet Standard provider/account. EVM `0x...`
  is rejected. Reown is not advertised as a substitute for unsupported MetaMask
  Solana transport. Report "Solana account not detected" if that is the result.
- **Trust Wallet / More Wallets:** choose More Wallets → search/select Trust Wallet
  (or another listed Solana wallet) → use SDK-provided mobile Open/Connect action.
  Do not scan a QR displayed on the same phone. Approve connection to Solana,
  return to TEKKTEAM in the originating browser, then Sign In separately and
  approve only its message. Verify name/provider, public key, Mainnet balance and
  Refresh. If the installed wallet does not support the requested Solana session,
  record the exact error; do not approve an Ethereum account instead.

For every working path, also cancel one connection, reject one authentication,
retry, switch app/back, reload, disconnect, and change wallet account. No duplicate
prompt, endless Connecting, reload loop, stale owner or old balance may remain.
Check the existing session before signing again; no unnecessary reconnect.

## Results requested

Send Android/browser/wallet app names+versions, last successful step, whether app
opened and returned, exact error text, balance/Refresh result, and whether any
transaction approval appeared (expected none). Capture chooser, connected wallet
panel and successful balance or error. Redact public address if desired; never
send recovery phrases/private keys, session cookies, full auth signatures or
pairing QR/URI. Check portrait around390/430: close reachable, modal scrollable,
address/badge/Sign In/Refresh/Disconnect visible, safe-area clear, no overflow.

Desktop regression: existing local5199 Phantom Connect → Sign In if needed →
balance → Refresh. Local human M1 PASS is preserved; new fixture tests do not
replace real extension/device evidence. **Stop at M2B human handoff; no M3.**

References: [Reown Core](https://docs.reown.com/appkit/javascript/core/installation),
[Reown relay allowlist](https://docs.reown.com/walletkit/ios/cloud/relay),
[Vercel function storage](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).
