# Phase A browser regression gate

## Proven failure: TEST_ENVIRONMENT

`tests/workspace-auth.mjs` has no framework test name: it is the authenticated browser flow (signature, draft, profile, reload, search, logout). It opens `http://127.0.0.1:5188/#/agents/new`, clicks `#tw-new-connect`, then expects `[data-wallet="phantom"]` at the first chooser click (formerly line 29).

The failed run served default `vite build` output through `vite preview`. `src/bootstrap.js` intentionally installs `window.TekkworkDemo` when PROD and VITE_BACKEND_ENABLED is not true. `workspace.js` then returns from `openWallet()` before creating a dialog. Browser inspection proved demo=true, injected Phantom=true, no dialog and zero wallet rows. This guard also exists in HEAD before Phase A; the current injected Phantom selector is unchanged. No asynchronous discovery delay or authentication contract change explains this failure.

The same browser test passes unchanged on Vite development with its existing temporary API/database. `npm test` now owns a deterministic development frontend and temporary baseline API, uses strict port binding, preserves every existing test command, propagates failures and closes resources. Occupied port 5188 fails rather than silently testing another app. Browser tests retain their own API fixtures/interception. Persistent server/data, production services and wallet adapters are untouched.

Running `workspace-auth.mjs` directly requires that development frontend; a new explicit assertion rejects the intentionally auth-disabled client demo before attempting login. Authentication signatures in tests use generated fixture keys only; no owner transaction, real wallet approval or broadcast is involved.

## Validation, 2026-09-30

- Minimal `workspace-auth.mjs`: PASS on the development frontend without application changes.
- Wallet/auth focused tests: 23/23 PASS, including Phantom, Solflare and Solana MetaMask paths, origin/ownership/session checks and actionable errors.
- Wallet chooser browser coverage: PASS at 1440px and 390px; three supported rows, close button, Escape, reopen and isolated provider failure.
- Phase A foundation: 7/7 PASS; identity-only/coin-null, registry labels and effective exposure, read-only plans/lifecycle and allowlisted projections unchanged.
- Full `npm test`: PASS with every original suite retained. Backend 12/12, transfers 34/34, all eight browser scripts complete.
- Build: PASS; existing large-chunk warning remains non-fatal.

No wallet/auth production code, Launchpad contract, real-money flag, persistent database or deployment changed for this gate. Phase B remains unimplemented and requires separate authorization.
