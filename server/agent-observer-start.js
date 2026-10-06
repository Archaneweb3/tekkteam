// Explicit entrypoint also works when PM2 loads ESM through its own wrapper.
import {startAgentObserver} from './agent-observer-worker.js';
await startAgentObserver();
