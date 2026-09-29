# Phantom devnet investigation — 2026-09-26

Status: unresolved in the real Phantom approval window. Do not describe backend
simulation, the isolated devnet mint script, or mock tests as an end-to-end fix.

## Verified facts

- User confirmed Microsoft Edge. Its installed public Phantom extension manifest
  is version 26.30.2. Another browser's installation is not equivalent evidence.
- A fresh read-only run of `devnetChain.prepare` and `preflight` against
  `https://api.devnet.solana.com` returned 5 test SOL, a 0.00256524 SOL quote,
  and a successful simulation for the user-provided payer. Genesis hash is
  checked. User signatures were not requested and nothing was broadcast.
- The exact installed `solana.js` Wallet Standard adapter was executed in an
  isolated VM with a stub provider. It validates `solana:devnet`, advertises all
  four Solana networks, and forwards the transaction message unchanged, but
  does not pass `chain` to its injected `signAndSendTransaction` provider.
  Reproduce with `node scripts/inspect-phantom-adapter.mjs <extension-directory>`.
- Source SHA-256:
  `d3333a25a4eacb555eea7ab386e8d1c1998b614fd9fc41b90ca8f1cb2677246f`.
- Public extension source selects its network from the selected account's
  networkID (`background/serviceWorker.js`, `getNetworkId`). Account addresses
  are derived using DeveloperMode and NetworkSetting (`chunk-LLVJJRZJ.js`).
- The transaction popup's `useSelectedAccountMeta` chooses that account network;
  `getScanTransaction` posts it as `chainId` to `/simulation/v1`.
  Therefore, dropping the Wallet Standard chain argument is NOT by itself proof
  of an incorrect network or a Phantom defect.
- Only extension package code was read. No wallet secrets, profile databases,
  private storage, or authentication tokens were accessed or modified.

## Corrected diagnostics

The application now explicitly distinguishes its requested chain from the
wallet's active network and scanner result, which Wallet Standard does not
expose. The existing unit test is labeled a mock, not a Phantom integration test.
Ten backend/adapter tests and the production build pass; neither checks the real
extension scanner.

## Historical evidence gap (before live inspection)

Capture the failing approval window's own simulation request and response using
the browser's normal developer tools: chainId, HTTP status, simulationError,
and requestId only. Do not export a full HAR containing authentication headers
or unrelated traffic. Do not execute code against wallet private APIs/storage.
Compare that payload with the prepared transaction and its blockhash lifetime.
No cause (wrong network, scanner failure, stale blockhash, unsupported payload)
is yet proven by the screenshots alone.

Do not fund mainnet to clear a devnet warning. Do not set skipPreflight, remove
security checks, or approve an unsafe warning. Any wallet unlock, connection
permission, or transaction approval is left to the user.

## References

- https://docs.phantom.com/solana/sending-a-transaction
- https://help.phantom.com/articles/use-testnets-in-phantom-5997313271699
- https://github.com/phantom/docs/issues/489 (community report, not proof of this case)

## Diagnostic Evidence panel

`phantom-diagnostic.html` now records two independent serialized snapshots:
the bytes provided to RPC `simulateTransaction` and the bytes immediately before
the injected provider `signTransaction` invocation. It hashes serialized bytes
and message bytes with SHA-256, decodes signer/header/account/instruction data,
records endpoint/genesis/fee/context/commitment and provider public properties,
and checks byte equality synchronously immediately before invoking the provider.
The memo construction, fee payer, blockhash selection and signing method are
unchanged. There are no sends, transfers, backend calls or automatic network
switches. RPC simulation still uses `replaceRecentBlockhash: false`.

Provider-call evidence is NOT an extension network capture. The injected API
does not expose a documented active-cluster or private-simulator-RPC property.
The page does not patch wallet internals or read extension storage. Internal
chain, payload, response and byte equality remain explicitly unknown until
independently observed. Advertised chain support is not active-network evidence.

To compare a real request, open DevTools for the actual Phantom preview window,
not just the app page, and record its simulation request Payload and Response.
Use a fresh run and correlate time and blockhash. Paste only the encoded
transaction/message into the panel, selecting its actual encoding (base64 or
base58) and whether it contains the complete transaction or only the message.
Record chainId and simulation response separately. Do not export full HARs or
paste headers/cookies/secrets. The panel compares locally and uploads nothing.
Message-only evidence cannot establish full transaction equality. A chainId is
a reported label, not proof of the upstream simulator endpoint or account state.

At implementation verification time, Chrome and Phantom DevTools were not open;
no fresh internal request was captured. Previous mint captures must not be
substituted for the memo request. No hypothesis A/B/C/D has been established by
the new panel yet. Its test uses a mock provider and mock RPC only:
`node tests/diagnostic-evidence.mjs`.

## Live isolation result — 2026-09-26

Read the mint preview's actual response in the extension's own Network panel:
`api.phantom.app/simulation/v1`, HTTP 200, `advancedDetails.chainId=solana:103`,
fee payer `ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS`, request ID
`18674e03-eb4d-416b-8d81-90c05a04f3af`. Error `INSUFFICIENT_FUNDS`,
`simulationError.idlErrorKind=AccountNotFound`, message
`Attempt to debit an account but found no record of a prior credit.`
The separate safeguard field reports `NETWORK_NOT_SUPPORTED`; that field alone
does not establish the cause of the simulation error.

After the user unlocked Phantom, ran `/phantom-diagnostic.html` in the same Edge
profile at 11:12:03 UTC. This development-only page builds one memo instruction,
with no mint, transfer, extra signer, app backend, or broadcasting code. It uses
injected `signTransaction` (not the production Wallet Standard sign-and-send
path), so this is an isolation test rather than exact transport parity.
The direct public devnet RPC genesis check passed, finalized balance was 5 SOL,
and simulation passed with the memo program success log. Blockhash:
`7YhTm33w1TywD2fnFhS8YeVST4Tsdym9BamU9tEUK4aW`.
Phantom still displayed insufficient SOL and simulation failure immediately.
No transaction was approved or broadcast. The existing DevTools target retained
the earlier mint capture after wallet locking; do not label its request ID as
the memo request ID.

Conclusion: the warning reproduces independently of TEKKWORK's mint instructions
and backend. This does not prove which Phantom component or upstream network
view is faulty, nor prove the complete mint flow correct. Do not rewrite mint
instructions or bypass security checks on this evidence. The next discriminating
test is the same minimal page in another current Phantom installation/profile,
or Phantom support investigation using this reproduction. User handles all
extension installation, wallet unlock, account access and approvals.
