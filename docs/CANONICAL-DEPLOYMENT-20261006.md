# Canonical deployment — 6 October 2026

CURRENT: SSH verified against the expected VPS. Cutover completed 23:06:28 WIB;
independent read-only verification completed 23:09 WIB. No VPS restart.

Canonical https://tekkteam.tech serves API release d2516bc, loopback4190, with
UI follow-ups through0516940. Staging API remains loopback4395, externally403;
staging pages redirect to the canonical product. The old launch service is stopped.
Existing immutable staging images remain reachable to preserve historical URIs.

SQLite integrity passes. Three Agents exist: two preserved legacy Agents and the
single imported target aaaaada. Its ret/3ED draft, seven historical M4 attempts and
expired active attempt persist. Target wallet count remains zero. The existing
legacy encrypted wallet and all four raw legacy journal records are preserved.
No authentication sessions or wallet secrets were imported from staging.

Five bounded personalities and the opt-in weekly Real leaderboard are deployed.
Home uses the same Real ranking source; Paper statistics/history remain labeled.
The empty podium reflects no qualifying closed production positions. Stylesheet
content-hash URLs corrected stale browser CSS affecting wallet-list controls.

Builds and focused tests pass. Production Home was checked at360/390/412/1440/1920;
wallet selector at390/430, including expand/collapse/close. No page horizontal
overflow was measured. Actual Phantom connected and the human approved the
canonical owner Sign In message. Mainnet balance 0.182835778 SOL loaded and
Refresh returned the same value at23:23 WIB; reload retained authentication and
exactly one owner Agent. The Agent wallet remains absent. The browser tool rejects
extension URLs; no transaction prompt was requested. Responsive viewport evidence
is separate from real-device wallet evidence. A connection/authentication display
bug was corrected without opening private reads before owner authentication.

One legacy broadcast-attempted record remains unresolved. Configured Mainnet RPC
returned no finalized transaction/status and no mint account. These null results
do not prove historical failure. The existing M4 guard is unchanged. Resolving
this needs authoritative historical transaction evidence or a separately reviewed
and explicitly approved historical-isolation policy. Do not erase old records.

One fresh unsigned preparation at23:28 WIB passed Mainnet create_v2 simulation:
request deeaa9a4-8b53-44bb-8303-ab33b6a06e87; initialbuy0; fee10000lamports,
other5547360, total5557360;840bytes/1instruction. Metadata/image HTTP200.
Transaction SHA256 3b7e21c645e6d35989fbf825a516a7bbb3aa3dc11f621d750a626ac27264035a.
Review expired23:28:27.671 WIB and cannot be reused. This is preparation evidence,
not a live launch receipt. Persisted evidence records signed0/broadcasts0.

No new wallet launch attempt, transaction signing, broadcast or task-induced spend occurred.
Trading, funding and approval capabilities remain OFF. Receipt-dependent wallet
provisioning and Real acceptance are unverified; overall product status is PARTIAL.

Two earlier cutover probes rolled back safely: Node fetch rejected port4190 as
"bad port". Native HTTP corrected the probe; SQLite was not the cause. Writer-frozen
backups and each UI follow-up backup are retained on the VPS.

Evidence locations (tool-observed, not fixtures):

- VPS cutover log: `/var/log/tekkteam-canonical-d2516bc-r3.log`.
- VPS backup: `/var/backups/tekkteam/canonical-d2516bc-r3`.
- VPS preparation evidence: `/var/lib/tekkteam-mainnet/pump-metadata-site/preparation-evidence/0b59a8faa79139d709b016e158b9f052812ccb228520e95d2187eadb27fbb10a.json`.
- Local screenshots: `artifacts/m4-deterministic-attempt/canonical-agent-desktop.jpg`,
  `canonical-wallet-390.jpg`, and `canonical-unsigned-review.jpg` in that directory.
- The older file named `canonical-home-1440.jpg` actually contains a mobile-width
  capture; its filename must not be treated as evidence of a 1440px screenshot.
- The later Agent mobile screenshot was stale relative to the live DOM; do not
  use it as proof of the loaded Overview. DOM geometry showed no page overflow.
  Temporary viewport overrides were cleared and the normal browser view restored.

Independent final checkpoint review accepted the safety and evidence boundaries.
No additional broad audit or Lighthouse review was performed.
