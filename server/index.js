import 'dotenv/config';
import { resolve } from 'node:path';
import { createServer } from './app.js';
const instance = createServer({ dbPath: resolve(process.env.DATA_DIR || 'server/data', 'tekkwork.sqlite'), vaultKey: process.env.VAULT_KEY_BASE64, origins: (process.env.APP_ORIGINS || 'http://127.0.0.1:5188,http://localhost:5188').split(','), network: process.env.CHAIN_MODE || 'local', rpc: process.env.SOLANA_RPC_URL, production: process.env.NODE_ENV === 'production' });
const server = instance.app.listen(Number(process.env.PORT || 4190), '127.0.0.1', () => console.log('TEKKWORK API listening on http://127.0.0.1:' + (process.env.PORT || 4190)));
const reconciliation = setInterval(() => instance.reconcilePending().catch(() => console.error('Reconciliation unavailable; will retry')), 15000);
const close = () => { clearInterval(reconciliation); server.close(() => process.exit(0)); };
process.on('SIGINT', close); process.on('SIGTERM', close);
