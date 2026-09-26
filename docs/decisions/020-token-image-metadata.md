# 020 — Token images remain separate from agent identity

## Status
Accepted.

## Decision
Create Agent submits a normalized PNG in `tokenImage`; server validates decoded
PNG/JPEG/WebP with a 3 MB and 16-megapixel limit and stores a stripped 512-square PNG.
The draft's `coin.image` is the token metadata HTTPS URL. `character` and
`avatarSeed` remain unchanged. Character-as-image uses the existing canonical
renderer, never a second robot identity.

Images are content-addressed below the existing agent metadata directory, so
existing draft cleanup remains scoped to that agent. Draft save stages the image;
the existing metadata publisher publishes it at preparation time. Publication is
verified byte-for-byte over HTTPS before preparation continues. Missing images,
wrong-agent URLs, unavailable hosting or mismatched bytes stop preparation.
Existing image-less drafts remain readable but cannot prepare a new launch.
No wallet, instruction, simulation, spending, signing or broadcast logic changes.
