# 073 — Gate wallet login on Solana Mainnet capabilities

Status: Accepted

## Context

The wallet picker labeled every Wallet Standard registration as detected when it exposed connect and sign-message functions. That did not prove that the selected wallet could supply a Solana Mainnet account; an EVM-only MetaMask registration could appear usable, and login could select a Devnet-only account. Multiple injected wallets also make generic provider fallbacks unsafe.

## Decision

Use Wallet Standard identity, icon, advertised chains, account chains, and features to classify each wallet. A registration is selectable only if it advertises Solana Mainnet plus the existing connect and Solana sign-message features. If a compatible account is not yet exposed, label it as requiring account verification rather than Ready; after connect, require an actual Mainnet account before requesting an authentication challenge. EVM-only MetaMask is disabled. Preserve the explicit Phantom fallback, but never silently substitute a generic injected provider for the selected wallet.

All supported wallets use the same challenge, UTF-8 message signing, backend signature verification, and session creation pipeline. Development-only probes sign fixed harmless text through that same selected provider without creating a session. A fixture proves interface behavior, not that a particular installed extension works; each provider still needs the owner's manual approval and browser test.

## Consequences

Wallets lacking a Mainnet account fail before backend authentication, and provider/account substitution remains blocked before signing. The backend authentication contract is unchanged. A wallet that does not advertise Mainnet until after connecting cannot be offered as Ready; it needs a standards-compliant capability advertisement or a separately proven explicit integration, not a generic EVM fallback.
