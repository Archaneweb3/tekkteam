# TEKKTEAM 3D Studio

TEKKTEAM is an AI-agent platform concept. This clean-slate website visualizes six specialized AI agent roles as original 3D avatars in an interactive studio. The current release is a front-end preview: it does not execute AI tasks, connect external tools, or contain token/wallet integrations. It does not copy BAGWORK assets.

## Run

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). Drag to orbit, scroll to zoom, hover or click a character, or choose an agent in the list. Routes: `#/`, `#/agents`, `#/tokens`, `#/launch`, `#/skins`, `#/post`, `#/how`, and `#/agent/1` through `#/agent/6`. `npm run build` creates `dist/`; `npm test` checks desktop/mobile routes and key interactions with Playwright.

## Architecture

- `src/main.js` builds the room and six voxel characters as actual Three.js meshes. Character animation, raycast hover, camera controls, and grid pathfinding share one world coordinate system.
- `src/style.css` handles the page shell and responsive layout. The HTML UI is separate from the WebGL scene so it stays readable and accessible.
- `src/pages.js` provides six subpages. Launch saves a draft in the local browser only; Tokens explicitly shows that no market feed is connected; Social draft is a local-only text composer.
- `src/skin-viewer.js` powers three rotatable skin concepts directly inside their cards and the real 3D character viewer on each detail page. `src/laptop-viewer.js` powers the Tokens 3D laptop. `src/agent-detail.js` renders the six role profiles.
- No generated 2D background is used for the room. Desks, walls, floor, props, and avatars have 3D depth, so the camera, shadowing, and object overlap are consistent.
- Agent profiles describe planned AI roles, not active workers. Avatar movement is a 3D presentation, not AI task execution. Launch, wallet, live token prices, and autonomous-agent backends are intentionally not simulated or claimed to work.

See [the architecture decision](docs/decisions/001-realtime-3d.md) for the rationale and trade-offs.

## Release

The prototype is a static Vite build. Run `npm ci`, `npm test` with a local dev server, and `npm run build` before publishing. Vercel should build with `npm run build` and serve `dist/`. See [the hosting decision](docs/decisions/002-vercel-static-hosting.md).
