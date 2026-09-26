import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { openStore } from './store.js';
import { publicConfig, strategies, characters } from './config.js';
import { devnetChain } from './chain.js';
import { mainnetSafetyChain } from './mainnet-safety.js';
import {assertUnlaunchedDraft,reserveDraftDeletion,deletionEligibility} from './draft-deletion.js';
import {installAgentTrading} from './agent-trading.js';
import {logError} from './runtime.js';
import {normalizeTokenImage,stageTokenImage} from './token-image.js';
import {mainnetWalletBalance} from './wallet-balance.js';

const hash = v => createHash('sha256').update(v).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (v, min, max, label) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max || /[\x00-\x1f]/.test(v)) fail(400, `Invalid ${label}`);
  return v.trim();
};
const address = v => { try { if (typeof v !== 'string' || !PublicKey.isOnCurve(new PublicKey(v).toBytes())) throw 0; return v; } catch { fail(400, 'Invalid wallet address'); } };
export function createServer({ dbPath, vaultKey, origins = ['http://127.0.0.1:5188'], network = 'local', rpc, mainnetSafetyMode = false, production = false, chain: injectedChain, now = Date.now, deletionGuard=reserveDraftDeletion, tradingOptions={} } = {}) {
  network = network.toLowerCase();
  if (!['local', 'devnet', 'mainnet'].includes(network)) throw new Error('Unknown network');
  if (network === 'mainnet' && (!mainnetSafetyMode || !rpc || injectedChain)) throw new Error('Mainnet requires explicit safety mode and separate RPC; injected execution adapters prohibited');
  if (network === 'devnet' && !rpc && !injectedChain) throw new Error('Devnet requires SOLANA_RPC_URL');
  const store = openStore(dbPath, vaultKey, production), { db } = store;
  const binding = db.prepare('SELECT value FROM settings WHERE key=?').get('network_binding');
  if ((binding && binding.value !== network) || (!binding && network === 'mainnet' && db.prepare('SELECT COUNT(*) AS n FROM agents').get().n > 0)) {
    store.close(); throw new Error('Database network mismatch; use a separate Mainnet data directory');
  }
  if (network === 'mainnet' && !binding) db.prepare('INSERT INTO settings VALUES (?,?)').run('network_binding',network);
  const chain = injectedChain || (network === 'devnet' ? devnetChain(rpc) : network === 'mainnet' ? mainnetSafetyChain(rpc) : null);
  const config = publicConfig(network), app = express(), locks = new Set();
  app.disable('x-powered-by');
  if(production)app.set('trust proxy','loopback');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !origins.includes(req.headers.origin)) return res.status(403).json({ error: 'Untrusted request origin' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/agents', (req,res,next) => {
    if (network === 'mainnet' && !['GET','HEAD','OPTIONS'].includes(req.method)) return res.status(403).json({error:'MAINNET SAFETY MODE: drafts, token issuance, submission and value-moving actions disabled'});
    next();
  });
  app.get('/api/safety/memo', async(req,res) => {
    if (network !== 'mainnet') return res.status(403).json({error:'Requires separate MAINNET SAFETY backend'});
    res.json(await chain.prepareMemo(address(req.query.address)));
  });
  const authLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const getSession = req => {
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('tw_session='))?.slice(11);
    return token ? db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(token), now()) : null;
  };
  const auth = (req, res, next) => { req.session = getSession(req); if (!req.session) return res.status(401).json({ error: 'Sign in with your wallet first' }); next(); };
  const ownerBalance=mainnetWalletBalance();
  app.get('/api/wallet/mainnet-balance',auth,async(req,res)=>{
    try{res.json(await ownerBalance(req.session.address,req.query.refresh==='1'));}
    catch{res.status(503).json({error:'Mainnet balance unavailable'});}
  });
  const rowAgent = row => row ? { ...JSON.parse(row.data), no: row.no } : null;
  const owned = (req) => {
    const row = db.prepare('SELECT * FROM agents WHERE (id=? OR CAST(no AS TEXT)=?) AND owner=?').get(req.params.id, req.params.id, req.session.address);
    if (!row) fail(404, 'Agent not found'); return { row, agent: rowAgent(row) };
  };
  const trading=installAgentTrading(app,{store,auth,owned,now,...tradingOptions});
  const event = (a, type, message) => db.prepare('INSERT INTO events (agent_id,owner,type,message,created_at) VALUES (?,?,?,?,?)').run(a.id, a.creator, type, message, now());
  const save = a => db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(a), a.id);
  const cookie = (res, token, maxAge) => res.cookie('tw_session', token, { httpOnly: true, sameSite: 'strict', secure: production, path: '/api', maxAge });
  let rpcCache=null, rpcPending=null;
  const rpcHealth=async()=>{
    if (!chain) return {ready:false,network,reason:'Devnet is not configured'};
    if(rpcCache && now()-rpcCache.checkedAt<15000)return rpcCache;
    if(rpcPending)return rpcPending;
    rpcPending=(async()=>{try{return rpcCache={...await chain.health(),checkedAt:now()};}catch{return rpcCache={ready:false,network,reason:'Devnet RPC unavailable or wrong network',checkedAt:now()};}finally{rpcPending=null;}})();
    return rpcPending;
  };
  app.get('/api/network', async(req,res)=>res.json(await rpcHealth()));
  app.get('/api/wallet', auth, async(req,res)=>{
    if(!chain)fail(503,'Devnet is not configured');
    res.json(await chain.wallet(req.session.address));
  });
  app.get('/api/health', (req, res) => {db.prepare('SELECT 1').get();res.json({ ok: true, service: 'tekkwork-api', network, mainnet: network === 'mainnet', safetyMode: network === 'mainnet', broadcastEnabled: network === 'devnet', trading: false,liveTradingEnabled:false,paperTrading:true,fundingEnabled:process.env.FUNDING_ENABLED==='true',globalTradingKillSwitch:process.env.GLOBAL_TRADING_KILL_SWITCH!=='false' });});
  app.get('/api/state', (req, res) => {
    const session = getSession(req);
    const agents = session ? db.prepare('SELECT * FROM agents WHERE owner=? ORDER BY no DESC').all(session.address).map(rowAgent).map(a=>({...a,tradingStatus:trading.projection(a).status})) : [];
    const events = session ? db.prepare('SELECT id,agent_id AS agentId,type,message,created_at AS createdAt FROM events WHERE owner=? ORDER BY id DESC LIMIT 50').all(session.address) : [];
    res.json({ config, session: session ? { address: session.address } : null, agents, events, coins: agents.filter(a => a.status === 'DEVNET_LIVE').map(a => a.coin), feed: [], tokens: [], bonded: [], stats: { agentsTotal: agents.length, agentsActive: 0, drafts: agents.filter(a => a.status === 'DRAFT').length, testLaunches: agents.filter(a => a.status === 'DEVNET_LIVE').length, trades24h: 0, aumSol: 0, pnlSol: 0, feesClaimedSol: 0 } });
  });
  app.post('/api/auth/challenge', authLimit, (req, res) => {
    const owner = address(req.body.address), id = randomUUID(), expires = now() + 5 * 60_000;
    const message = `TEKKWORK wallet sign-in\nOrigin: ${req.headers.origin}\nWallet: ${owner}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signature signs you in. It does not authorize a payment.`;
    db.prepare('DELETE FROM challenges WHERE expires<?').run(now());
    db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(id, owner, message, expires);
    res.json({ id, message, expires });
  });
  app.post('/api/auth/verify', authLimit, (req, res) => {
    const id = text(req.body.id, 1, 64, 'challenge'), challenge = db.prepare('SELECT * FROM challenges WHERE id=?').get(id);
    if (!challenge || challenge.expires <= now() || !challenge.message.includes(`Origin: ${req.headers.origin}\n`)) fail(401, 'Challenge expired or already used');
    let valid = false;
    try { valid = nacl.sign.detached.verify(Buffer.from(challenge.message), bs58.decode(req.body.signature), new PublicKey(challenge.address).toBytes()); } catch {}
    if (!valid) fail(401, 'Wallet signature is invalid');
    db.prepare('DELETE FROM challenges WHERE id=?').run(id);
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), challenge.address, now() + 8 * 3600_000);
    cookie(res, token, 8 * 3600_000); res.json({ address: challenge.address });
  });
  app.post('/api/auth/logout', (req, res) => {
    const session = getSession(req); if (session) db.prepare('DELETE FROM sessions WHERE hash=?').run(session.hash);
    cookie(res, '', 0); res.json({ ok: true });
  });
  app.post('/api/agents', auth, async (req, res) => {
    const key = text(req.headers['idempotency-key'], 8, 100, 'idempotency key');
    const input = { name: text(req.body.name, 2, 40, 'agent name'), tokenName: text(req.body.tokenName, 2, 32, 'token name'), ticker: text(req.body.ticker, 1, 10, 'ticker').toUpperCase(), description: text(req.body.description || '', 0, 300, 'description'), character: req.body.character, strategy: req.body.strategy };
    if (!/^[A-Z0-9]+$/.test(input.ticker)) fail(400, 'Ticker must contain letters and numbers only');
    if (!characters.some(c => c.id === input.character) || !strategies.some(s => s.id === input.strategy)) fail(400, 'Unknown character or strategy');
    const imageBytes=req.body.tokenImage?await normalizeTokenImage(req.body.tokenImage):null;
    const fingerprint = hash(JSON.stringify({...input,imageHash:imageBytes?hash(imageBytes):null}));
    const prior = db.prepare('SELECT * FROM requests WHERE owner=? AND key=?').get(req.session.address, key);
    if (prior) { if (prior.fingerprint !== fingerprint) fail(409, 'This request key belongs to another draft'); return res.json(rowAgent(db.prepare('SELECT * FROM agents WHERE id=?').get(prior.agent_id))); }
    if (db.prepare('SELECT COUNT(*) AS n FROM agents WHERE owner=?').get(req.session.address).n >= 50) fail(409, 'Agent limit reached');
    const mint = Keypair.generate(), id = randomUUID();
    const image=imageBytes?await stageTokenImage(id,imageBytes):'';
    const a = { id, creator: req.session.address, name: input.name, character: input.character, avatarSeed: `skin:${input.character}`, strategy: input.strategy, status: 'DRAFT', createdAt: now(), updatedAt: now(), network, description: input.description, coin: { name: input.tokenName, ticker: input.ticker, mint: null }, launch: null };
    a.coin.image=image;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare('INSERT INTO agents (id,owner,data,secret) VALUES (?,?,?,?)').run(id, a.creator, JSON.stringify(a), store.seal(mint.secretKey, id));
      a.no = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO requests VALUES (?,?,?,?)').run(a.creator, key, fingerprint, id);
      event(a, 'draft', `${a.name} joined your workspace as a draft.`); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.status(201).json(a);
  });
  app.get('/api/agents/:id', auth, (req, res) => {const a=owned(req).agent;res.json({...a,tradingStatus:trading.projection(a).status});});
  app.patch('/api/agents/:id', auth, (req, res) => {
    const { agent: a } = owned(req);
    if (!strategies.some(s => s.id === req.body.strategy)) fail(400, 'Unknown strategy');
    trading.setStrategy(a.id,req.body.strategy);a.strategy = req.body.strategy; a.updatedAt = now(); save(a); event(a, 'settings', `${a.name}'s strategy profile was updated. Live execution remains locked.`); res.json(a);
  });
  const locked = handler => async (req, res) => {
    const { row, agent } = owned(req);
    if (locks.has(agent.id)) fail(409, 'An operation is already in progress');
    locks.add(agent.id); try { await handler(req, res, row, agent); } finally { locks.delete(agent.id); }
  };
  const eligibility=async a=>{
    const result=await deletionEligibility(a);
    if(result.canDelete&&(db.prepare('SELECT 1 FROM agent_wallets WHERE agent_id=?').get(a.id)||db.prepare('SELECT 1 FROM submissions WHERE agent_id=?').get(a.id)))return {...result,canDelete:false,launchState:'unknown',reason:'Agent wallet or pending submission exists. Deletion is locked.'};
    return result;
  };
  app.get('/api/agents/:id/deletion-eligibility',auth,async(req,res)=>res.json(await eligibility(owned(req).agent)));
  app.delete('/api/agents/:id',auth,locked(async(req,res,row,a)=>{
    const permission=await eligibility(a);if(!permission.canDelete)fail(409,permission.reason);
    assertUnlaunchedDraft(a);
    if(db.prepare('SELECT 1 FROM agent_wallets WHERE agent_id=?').get(a.id))fail(409,'An agent wallet exists. Normal draft deletion is blocked.');
    if(db.prepare('SELECT 1 FROM submissions WHERE agent_id=?').get(a.id))fail(409,'Pending transaction exists; draft preserved');
    await deletionGuard(a,req);
    // All embedded token/profile/character data and encrypted draft mint go with
    // this row. Keep transaction/event history and every other agent unchanged.
    db.exec('BEGIN IMMEDIATE');
    try{
      assertUnlaunchedDraft(owned(req).agent);
      db.prepare('DELETE FROM requests WHERE agent_id=?').run(a.id);
      trading.removeDraft(a.id);
      db.prepare("DELETE FROM events WHERE agent_id=? AND type IN ('draft','settings')").run(a.id);
      db.prepare('DELETE FROM agents WHERE id=? AND owner=?').run(a.id,req.session.address);
      db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    res.json({deleted:true,agentId:a.id});
  }));
  app.post('/api/agents/:id/prepare', auth, locked(async (req, res, row, a) => {
    if (!chain || network !== 'devnet') fail(503, 'Devnet launch is not configured. Your draft is saved.');
    if (a.status === 'DEVNET_LIVE' || a.status === 'SUBMITTED') fail(409, 'This mint was already submitted. Check its status instead.');
    if (!a.launch || a.launch.expiresAt <= now() || a.status === 'FAILED' || req.body.fresh === true) {
      a.launch = await chain.prepare(a, store.unseal(row.secret, a.id)); a.status = 'PREPARED'; a.network='devnet'; save(a);
    }
    res.json({ ...a.launch, message: undefined, network: 'devnet', note: 'Creates 1,000,000 test tokens with 6 decimals; mint authority is revoked. No liquidity, metadata upload or pump.fun listing.' });
  }));
  app.post('/api/agents/:id/preflight', auth, locked(async (req,res,row,a) => {
    if (!chain || network !== 'devnet') fail(503,'Devnet is not configured');
    if (a.status !== 'PREPARED' || a.launch.expiresAt <= now()) fail(409,'Preparation expired. Review the same draft again.');
    if (req.body.message !== a.launch.message) fail(409,'Preparation changed. Review the same draft again.');
    res.json(await chain.preflight(a.launch,a.creator));
  }));
  app.post('/api/agents/:id/wallet-send', auth, locked(async (req,res,row,a)=>{
    if(!chain || network!=='devnet')fail(503,'Devnet is not configured');
    if(a.status!=='PREPARED' || a.launch.expiresAt<=now())fail(409,'Review a fresh transaction first');
    if(req.body.message!==a.launch.message)fail(409,'Preparation changed');
    const diagnostic=await chain.preflight(a.launch,a.creator);
    a.status='SUBMITTED';a.launch.mode='wallet';save(a);
    event(a,'wallet-pending',`${a.name} is awaiting wallet approval or on-chain confirmation. Do not retry before reconciliation.`);
    res.json(diagnostic);
  }));
  app.post('/api/agents/:id/submit', auth, locked(async (req, res, row, a) => {
    if (!chain || network !== 'devnet') fail(503, 'Devnet launch is not configured');
    if (a.status === 'SUBMITTED' || a.status === 'DEVNET_LIVE') return res.json({ signature: a.launch.signature, status: a.status });
    if (a.status !== 'PREPARED' || a.launch.expiresAt <= now()) fail(409, 'Prepare a fresh transaction first');
    const bytes = text(req.body.transaction, 1, 8192, 'transaction');
    const prepared = await chain.submit(bytes, a.launch.message);
    a.status = 'SUBMITTED'; a.launch.signature = prepared.signature;
    db.exec('BEGIN IMMEDIATE');
    try { save(a); db.prepare('INSERT OR REPLACE INTO submissions VALUES (?,?)').run(a.id,store.seal(Buffer.from(bytes),`submission:${a.id}`)); db.exec('COMMIT'); }
    catch(e){ db.exec('ROLLBACK'); throw e; }
    event(a, 'submitted', `${a.name}'s test mint was submitted for devnet confirmation.`);
    try { await prepared.send(); } catch { /* Do not recreate: submission can succeed despite a network timeout. */ }
    res.json({ signature: prepared.signature, status: a.status });
  }));
  async function reconcileAgent(a) {
    if (network === 'devnet' && chain && a.status === 'SUBMITTED') {
      const walletResult=a.launch.mode==='wallet'?await chain.walletStatus(a.launch):null;
      const status = walletResult?walletResult.status:await chain.status(a.launch.signature,a.launch.lastValidBlockHeight);
      if(walletResult?.signature)a.launch.signature=walletResult.signature;
      if (status === 'confirmed') { a.status = 'DEVNET_LIVE'; a.coin.mint = a.launch.mint; save(a); event(a, 'minted', `${a.name}'s test token is confirmed on Solana devnet.`); }
      else if (status === 'failed' || status === 'expired') { a.status = 'FAILED'; a.launch.failure=status; save(a); event(a, 'failed', `${a.name}'s devnet transaction ${status === 'expired'?'expired without confirmation':'failed on-chain'}.`); }
      else {
        const saved=db.prepare('SELECT payload FROM submissions WHERE agent_id=?').get(a.id);
        if(saved){const signed=store.unseal(saved.payload,`submission:${a.id}`).toString(); const replay=await chain.submit(signed,a.launch.message); if(replay.signature!==a.launch.signature)throw new Error('Stored signature mismatch'); try{await replay.send();}catch{}}
      }
      if(a.status!=='SUBMITTED')db.prepare('DELETE FROM submissions WHERE agent_id=?').run(a.id);
    }
    return a;
  }
  app.post('/api/agents/:id/reconcile', auth, async (req, res) => {
    const {agent:a}=owned(req);
    // The worker owns the same lock. A status check must not compete with it,
    // release its lock, or turn a normal in-flight check into a launch error.
    if(locks.has(a.id))return res.status(202).set('Retry-After','5').json({...a,confirmationCheckInProgress:true});
    locks.add(a.id);
    try { await reconcileAgent(a); res.json(a); }
    finally { locks.delete(a.id); }
  });
  let workerRunning=false;
  const reconcilePending=async()=>{
    if(network !== 'devnet'||!chain||workerRunning)return;
    workerRunning=true;
    try{for(const row of db.prepare('SELECT * FROM agents').all()){
      const a=rowAgent(row); if(a.status!=='SUBMITTED'||locks.has(a.id))continue;
      locks.add(a.id);try{await reconcileAgent(a);}catch{/* Preserve unknown state during provider outages. */}finally{locks.delete(a.id);}
    }}finally{workerRunning=false;}
  };
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) logError('api',err);
    res.status(status).json({ error: status >= 500 ? 'Service unavailable. Your saved data has been preserved; try again later.' : err.message });
  });
  return { app, close: store.close, store, reconcilePending, paperTick:trading.tick };
}
