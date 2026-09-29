# Concrete proof: full-suite determinism investigation

The previous full run failed at market-radar.test.mjs's final enable/pause HTTP calls with `fetch failed`; the original report omitted the nested transport cause. It did not show a Paper assertion failure. That historical cause cannot be conclusively recovered from the old log.

Inspection found two test-harness dependencies: a 5ms sleep assumed the held market callback had been entered, and pooled fetch connections spanned synchronous SQLite writes. The latter is a possible stale-connection timing exposure, not a proven reconstruction of the historical error. A small synthetic socket probe did not reproduce it.

Changes are confined to the test fixture:

- Await an explicit callback-entry promise instead of sleeping before asserting SCANNING.
- Request connection-close for fixture HTTP calls so behavior tests do not depend on idle socket reuse.
- Preserve failed requests as failures (no retries), reporting endpoint and nested transport cause.
- Production Paper code and all behavior assertions remain unchanged.

Unmodified baseline this turn passed 313/313. After harness changes, two consecutive full runs passed 316/316 (including three new Pump evidence tests). Further final runs will include all completed CPMM tests. Repeated green runs are evidence of repeatability, not a mathematical guarantee that all future scheduling is deterministic. Do not call the historical root cause conclusively fixed or authorize Mainnet execution merely from reruns.

Final settled-tree verification: two consecutive full runs **322/322 PASS**, zero failed/skipped/cancelled, in `artifacts/ui/concrete-final-1.log` and `concrete-final-2.log`. Build PASS in `artifacts/ui/concrete-build.log` (existing bundle-size warning). No frozen runtime code was changed. Historical transport cause remains unconfirmed; the explicit callback synchronization and connection isolation remove the identified harness timing dependencies.
