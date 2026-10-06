# 105 - Persisted Pump preparation and native validity

CURRENT local/disarmed. No source qualification, route activation, signing or
broadcast permission is granted. Existing production launch is unchanged.

Persist the decoder-validated raw accounts, original blockhash, last valid block
height, finalized context, wallet snapshot, intent, caps and evidence digest in
the immutable Pump plan. JSON/SQLite restart re-decodes evidence and compares the
exact original message, quote, balances and effect policy. A digest detects
corruption; it is not owner authorization or independent on-chain evidence.

ON_CHAIN preparation requires finalized native validity. The read-only reader
uses getGenesisHash, getBlockHeight and isBlockhashValid at the original minimum
context. It never fetches a replacement hash. Native block height is not a slot.
A transient last-check cache supports a synchronous freshness fence after the
last owner await and before persistence/import. It cannot reconstruct a plan.
All persisted input is detached before awaits. UNKNOWN reconciliation remains
passive and independent of current expiry/qualification; no automatic retry.

Funding uses the existing transfer implementation. Launchpad receipt, mint,
owner, Agent and wallet authority must match before and after asynchronous
preparation/review/submit. GENERAL behavior remains separate only when there is
no durable launch binding. No financial flags are enabled.

Validation: synthetic restart/expiry/mutation tests plus existing finality,
route, wallet-transfer and setup regressions. Independent reviewer PASS. Actual
funding/trading remain OFF and no trade is qualified by these test results.

References: https://solana.com/docs/rpc/http/getblockheight and
https://solana.com/docs/rpc/http/isblockhashvalid .
