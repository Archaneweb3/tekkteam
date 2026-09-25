# TEKKTEAM frontend preview

TEKKTEAM is a frontend-only AI-agent concept studio. Its underlying frontend began from the user-owned BAGWORK website, but its homepage now leads with a full-width interactive workspace map, followed by a separate Signals section. Floating navigation and blue glass panels define the shared interface. The characters, avatars, and WebGL scene assets use original toy-brick models. This repository has no BAGWORK backend, live agent service, wallet integration, or transaction capability.

## Run

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173/#/`. `npm test` checks the key desktop/mobile routes, local snapshot loading, and 3D canvases; `npm run build` creates `dist/`.

## Architecture and limits

- `public/app/` and `public/shared/` contain the recovered frontend modules. The 3D office, phone, boss, and skins are WebGL generated in JavaScript, not model files.
- `public/styles.css` retains the reference geometry and responsive behavior. `public/tekkteam.css` applies the requested blue palette. `index.html` loads these modules as static ES modules through Vite.
- `public/demo-state.json`, `public/demo-agents/`, and `public/demo-media/` are saved public data and media snapshots. They are illustrative and do not update. Some IPFS coin images could not be mirrored because the public gateways rate-limited the requests; the UI uses its original fallback for those.
- `public/app/api.js` serves only local snapshot files. Write methods reject. `public/app/wallet.js` does not connect, sign, or transfer. Do not re-enable financial actions without the authorized backend, end-to-end security review, and accurate product copy.
- The original earlier TEKKTEAM 3D prototype remains in Git history at commit `46d925c`. A prior in-progress redesign was saved in Git stash before this adaptation.

See [ADR-004](docs/decisions/004-frontend-parity-preview.md) for the reasoning and parity boundary.
