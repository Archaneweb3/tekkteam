# 035 — Read-only pre-broadcast rejection diagnostics

The failed Edge signed payload is unavailable. Its exact cause is unproven; do
not label synthetic fixtures as a reproduction or weaken message validation.

Validate canonical legacy encoding, persisted expected message integrity, request
ID, blockhash, exact serialized message, reconstructed System transfer and Ed25519
signatures, in that order. Signature-only changes are valid; message changes are
not. Versioned transactions are not silently converted into legacy transactions.

Rejections expose only fixed classification codes and SHA-256 message digests.
The log adds the server-selected request ID, never raw payloads, signatures,
headers, authentication, vault data or low-level exception details. Codes are
DECODE_FAILURE, EXPECTED_REQUEST_INVALID, REQUEST_ASSOCIATION_MISMATCH,
BLOCKHASH_MISMATCH, MESSAGE_MISMATCH and SIGNATURE_VERIFICATION_FAILURE.
A transaction does not embed an application request ID: identical messages cannot
prove which UI request originally produced a signature. Association still relies
on authenticated agent-scoped ledger lookup and the existing one-active-request
and idempotency guards; no stronger provenance is claimed.

HTTP 409 with submissionState REJECTED_BEFORE_BROADCAST describes this attempt,
not cancellation of the durable PREPARED record. The UI clears local uncertainty
only for that explicit response; it exposes no automatic retry. The ledger remains
unchanged. If another submit already claimed the request, return its durable state
instead. Transport failures and post-claim uncertainty remain fail-closed.

Fixtures use deterministic test-only identities, the failed request's blockhash
and 0.01 SOL transfer shape, not its missing wallet-returned payload. No live
wallet signs, broadcasts or state changes are required. Funding remains disabled;
the old PREPARED request requires separately authorized resolution before any new
controlled acceptance attempt.
