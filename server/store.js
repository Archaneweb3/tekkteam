import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export function openStore(path, suppliedKey, production = false) {
  mkdirSync(dirname(path), { recursive: true });
  const keyPath = join(dirname(path), 'vault.key');
  let key;
  if (suppliedKey) key = Buffer.from(suppliedKey, 'base64');
  else if (production) throw new Error('Production requires VAULT_KEY_BASE64');
  else if (existsSync(keyPath)) key = readFileSync(keyPath);
  else {
    if (existsSync(path)) throw new Error('Vault key missing: restore the original key before opening the database');
    key = randomBytes(32); writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
  }
  if (key.length !== 32) throw new Error('Vault key must contain exactly 32 bytes');
  const seal = (plain, context) => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  };
  const unseal = (encoded, context) => {
    const b = Buffer.from(encoded, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]);
  };
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS submissions (agent_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS agents (no INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL, secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, owner TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (owner TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, agent_id TEXT NOT NULL, PRIMARY KEY(owner,key));`);
  const check = db.prepare('SELECT value FROM settings WHERE key=?').get('vault_check');
  if (check) unseal(check.value, 'vault-check');
  else db.prepare('INSERT INTO settings VALUES (?,?)').run('vault_check', seal(Buffer.from('TEKKWORK'), 'vault-check'));
  return { db, seal, unseal, close: () => db.close() };
}
