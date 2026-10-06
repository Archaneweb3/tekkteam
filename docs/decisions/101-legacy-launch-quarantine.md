# 101 — Preserve uncertain legacy history; require explicit isolation approval

7 October 2026. Quarantine implementation accepted after independent review.
New-launch isolation policy below is PROPOSED, NOT APPROVED or activated.

## Evidence and classification

Legacy operation `6b713ac6-cfcb-4ca6-8090-72a9b9c1654f` belongs to Agent
`0f406135-35ea-437d-a27c-29052d279c3b` (lpad test), owner
`ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`. This is not the current
aaaaada owner or its ret / 3ED draft. Preparation completed 28 September 2026,
23:35:47.111 WIB; operation creation 23:35:56.211 WIB. Exact send time was not retained.

Stored signature:
`4tXbX9bPu5K5rZ1PmuuVPkD8kS4tMmvpq8d8WjirvW2pHoVqrXESypqNmpn4Hso8wdszJmc4NpBYDv2K9dFRkj64`.
Stored mint: `581XgZBidohhg1zuDyDz7pUwUzzLN4wBc5ZkukQKEquT`.

All configured TEKKTEAM Mainnet URLs (local, production, staging) deduplicate to
the same Helius endpoint. Mainnet genesis matches. Signature-history lookup and
finalized getTransaction return HTTP 200/null. Mint, Pump curve, curve ATA, Mayhem
state/vault and legacy Metaplex metadata account are absent. Bounded mint signature
history is empty. Owner-history scanning was not performed: the user's conditional
step applies when the signature is missing; here it exists. No unrelated wallet
history or CUDA resources were inspected.

Recorded blockhash `2npsRXsfw6jzg5DVDntB4CyM1CuQABuuEBQKxoyq3Goo` is invalid;
finalized height 431998931 exceeds lastValidBlockHeight 429414145. Original signed
bytes, prepared/final message fingerprints, broadcast timestamp, HTTP send response
and provider acknowledgment were not recovered. The retained sender records intent
before RPC and does not persist acknowledgment. Available TEKKTEAM logs contain no
matching operation/signature. Preparations prove PREPARED only. Canonical M4 tables
have no record for this legacy ID.

**Classification: LEGACY_UNKNOWN_QUARANTINED; chain outcome UNKNOWN.** Null history,
absent accounts and expiry do not prove historical failure. Without signed bytes,
the recorded blockhash cannot be cryptographically tied to the saved signature.
No receipt/association is invented. See [Solana getTransaction](https://solana.com/docs/rpc/http/gettransaction)
and [isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid).

## Quarantine enforcement

Keep the four-record raw journal byte-for-byte unchanged. Add an immutable sidecar
binding journal/record/evidence hashes and exact identifiers, with authorizationGranted,
isolationPolicyApproved and resumeAllowed all false. Do not edit SQLite or promote
the old Failed label to authoritative failure.

The retired TEKKTEAM sender stays stopped. Back up its exact old bootstrap and
replace it with a fail-closed exit, with no listener or custody imports. Canonical
source also enforces quarantine at startup, request, persistence and send boundaries.
While unapproved, all legacy journal writes are frozen; authenticated status may
expose the separate classification. Missing/corrupt/changed required manifests fail
closed. M4's journal gate stays unchanged. No VPS, PM2, Nginx or shared-service restart.

## Proposed one-operation isolation policy — OWNER APPROVAL REQUIRED

Approval would permit implementing and qualifying a narrowly scoped exception for
one NEW canonical operation for owner `C2nddai75FJZWWkNdUF7csEBryRCMikJyTTZZqYcMiBv`,
existing Agent `8fc6fe77-16a0-4fed-8ca0-ddd1f6ef9fa7` (aaaaada), existing ret / 3ED.
It would not declare the old transaction failed or reassign its token to that Agent.

- Preserve immutable evidence and keep the old sender/operation fenced.
- Pin quarantine/evidence hashes; reject changed or additional uncertain records.
  Preserve three unsigned Deleted records and every M4 historical record.
- New operation/idempotency key, cryptographically fresh mint/keypair and blockhash.
  Never import or reuse any legacy signer, mint, message or signature.
- Validate fresh canonical bytes/semantic fingerprint, finalized-context simulation,
  fee/rent/debit/security/reserve checks. Mainnet only, initial buy 0, debit at most
  0.01 SOL. Expired reviews confer no permission.
- Preserve durable one-shot claim/reconciliation; no auto-retry or resend.
- Stop at the actual clean Phantom transaction screen for manual financial approval.
  No warning bypass. Final-message/Lighthouse validation and final simulation must
  precede one broadcast; confirmed provenance precedes wallet provisioning.
- Funding/Real trading remain OFF. No duplicate Agent or Agent wallet.

Owner approval must expressly accept that historical outcome is UNKNOWN and the
proposed launch is independent, not a retry or proven replacement. Exact old-message
comparison is unavailable: isolation relies on preserved local fences, distinct
owner/Agent/draft and newly generated identifiers, with that limitation disclosed.
Isolation approval is not financial transaction approval.

No exception or activation ships in this checkpoint. The proposal checker always
returns allowed=false. No fresh wallet request before approval.

## Verification and evidence

Targeted LOCAL_FIXTURE tests cover bound finalized success/failure, strict pre-send
terminal evidence, signature recovery, null/timeout uncertainty, immutable sidecar,
startup/removal/corruption, in-flight and other-Agent writes, identifier collisions,
retired bootstrap and unchanged M4 denial.

Actual read-only evidence: `/var/lib/tekkteam-mainnet/legacy-reconciliation/rpc-evidence-20261006.json`.
SHA256 `7cb0d76b0f31b6ce0e37c649260cdc7163d9f11aa7f99eb20504c9648782d892`.
Local copy: `artifacts/legacy-reconciliation/rpc-evidence-20261006.json`.
Original journal SHA256 `20a29acc34732cf993a607cca2dfc61073dcb239ced60a2c9164bb414487af91`.

## Actual deployment checkpoint

Applied 7 October 2026, 00:11:05 WIB, source59a8de8. Sidecar SHA256
`de59ada07f456ed9ffbe128d49acd098714cbba97de082848126567b948bf190`.
Guard source hashes match Git blobs. The original journal is byte-identical;
SQLite quick_check is OK and no database writes/migration were performed.
Target Agent count1, target wallet0; total Agents3. Retired legacy process PID0;
canonical API PID62737 and root/health return HTTP200. No process was restarted.

Backups: `/var/backups/tekkteam/legacy-quarantine-59a8de8-r2`.
Deployment evidence: `/var/lib/tekkteam-mainnet/legacy-reconciliation/deployment-evidence-59a8de8.json`.
Final suite12/12 passed on Ubuntu;41 existing local regressions passed. Independent
review accepted. Build passed18.48s with pre-existing bundle warnings. No standalone
typecheck/lint configuration exists; syntax/diff checks passed. No UI changes.
