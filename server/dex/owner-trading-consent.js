import {randomBytes, randomUUID} from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {createRequire} from 'node:module';
import {digest, reject, DEFAULT_RISK_POLICY} from './intent.js';
import {normalizeActivationPlan} from './activation-plan.js';
import {PERSONALITY_VERSION} from '../../public/app/agent-personalities.js';
import {defaultStrategyConfig} from '../../public/app/strategy-config.js';

const HEADER = 'TEKKTEAM BOUNDED AGENT TRADING AUTHORIZATION V1';
const {PUMP_PROGRAM_ID} = createRequire(import.meta.url)('@pump-fun/pump-sdk');
const GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const PROVENANCE = 'FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR';
const reserve = String(BigInt(DEFAULT_RISK_POLICY.minReserveLamports) + BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports) + BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports));
const fail = code => reject('OWNER_CONSENT_' + code);
const address = value => {
  try { if (typeof value !== 'string' || new PublicKey(value).toBase58() !== value) throw Error(); return value; }
  catch { fail('ADDRESS'); }
};
const text = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const sync = (reader, input) => {
  if (typeof reader !== 'function' || reader.constructor.name === 'AsyncFunction') fail('SYNC_DEPENDENCY_REQUIRED');
  const result = reader(structuredClone(input));
  if (result?.then) fail('ASYNC_DEPENDENCY');
  return structuredClone(result);
};
const message = terms => HEADER + '\n\nThis is trading consent, not wallet sign-in.\n' +
  'I authorize only the linked Agent wallet to BUY/SELL the linked token through the listed Pump program within these limits.\n' +
  'Total debit includes trade input, network fees and account rent. Withdrawal and transfers are not authorized.\n' +
  'Signing this message does not itself submit a transaction. Independent execution, funding, safety and revocation checks still apply.\n\n' + JSON.stringify(terms, null, 2);

// Library only: deliberately not imported by app/startup/routes. No custody,
// signer, RPC, worker activation or spending ledger. The existing reservation
// budget consumes resolveBudgetAuthority synchronously inside its own lock.
export function createOwnerTradingConsents(db, {readPlan, readAuthority, origin, now = Date.now} = {}) {
  let parsed;
  try { parsed = new URL(origin); } catch { fail('ORIGIN'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) fail('ORIGIN');
  if (typeof readPlan !== 'function' || typeof readAuthority !== 'function') fail('DEPENDENCIES');
  db.exec(`CREATE TABLE IF NOT EXISTS dex_owner_consent_state(agent_id TEXT PRIMARY KEY,owner TEXT NOT NULL,epoch INTEGER NOT NULL,active_id TEXT,observed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dex_owner_consent_reviews(id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dex_owner_consent_proofs(review_id TEXT PRIMARY KEY,signature TEXT NOT NULL,approved_at INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS owner_consent_review_no_update BEFORE UPDATE ON dex_owner_consent_reviews BEGIN SELECT RAISE(ABORT,'Immutable consent review'); END;
    CREATE TRIGGER IF NOT EXISTS owner_consent_review_no_delete BEFORE DELETE ON dex_owner_consent_reviews BEGIN SELECT RAISE(ABORT,'Immutable consent review'); END;
    CREATE TRIGGER IF NOT EXISTS owner_consent_proof_no_update BEFORE UPDATE ON dex_owner_consent_proofs BEGIN SELECT RAISE(ABORT,'Immutable consent proof'); END;
    CREATE TRIGGER IF NOT EXISTS owner_consent_proof_no_delete BEFORE DELETE ON dex_owner_consent_proofs BEGIN SELECT RAISE(ABORT,'Immutable consent proof'); END;`);
  const state = id => db.prepare('SELECT * FROM dex_owner_consent_state WHERE agent_id=?').get(id);
  let observedTime = db.prepare('SELECT max(observed_at) stamp FROM dex_owner_consent_state').get()?.stamp ?? 0;
  if(!Number.isSafeInteger(observedTime)||observedTime<0)fail('STATE_INTEGRITY');
  const context = ctx => {
    if (ctx?.authenticated !== true || !text(ctx.agentId)) fail('OWNER_AUTH_REQUIRED');
    return {authenticated: true, owner: address(ctx.owner), agentId: ctx.agentId};
  };
  const time = row => {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0 || at > Number.MAX_SAFE_INTEGER-86400000 || at < Math.max(row?.observed_at ?? 0, observedTime)) fail('CLOCK_ROLLBACK');
    observedTime = at;
    return at;
  };
  const own = ctx => {
    const row = state(ctx.agentId);
    if (row && row.owner !== ctx.owner) fail('OWNER_MISMATCH');
    if (row && (!Number.isSafeInteger(row.epoch) || row.epoch < 1 || !Number.isSafeInteger(row.observed_at) || row.observed_at < 0)) fail('STATE_INTEGRITY');
    return row;
  };
  const atomic = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); db.exec('COMMIT'); return out; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const canonical = ctx => {
    const raw = sync(readAuthority, ctx);
    const binding = Object.fromEntries(['owner','agentId','wallet','mint','network','executionId','signature','confirmedSlot','provenance'].map(key => [key, raw?.[key]]));
    if (binding.owner !== ctx.owner || binding.agentId !== ctx.agentId || binding.network !== 'solana:101' || !text(binding.executionId) || typeof binding.signature !== 'string' || !Number.isSafeInteger(binding.confirmedSlot) || binding.confirmedSlot <= 0 || binding.provenance !== PROVENANCE) fail('CONFIRMED_BINDING');
    address(binding.wallet); address(binding.mint);
    try { if (bs58.decode(binding.signature).length !== 64) fail('RECEIPT'); } catch { fail('RECEIPT'); }
    return binding;
  };
  const plan = (ctx, binding) => {
    const value = sync(readPlan, ctx), {planDigest, ...body} = value ?? {};
    if (!value || digest(body) !== planDigest || value.status !== 'DRAFT' || value.authorizationGranted !== false || value.withdrawalEnabled !== false || value.owner !== ctx.owner || value.agentId !== ctx.agentId || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.networkFeeCapLamports !== DEFAULT_RISK_POLICY.maxNetworkFeeLamports || value.protectedReserveLamports !== reserve) fail('PLAN');
    if (['owner','agentId','wallet','mint','network','executionId','signature','confirmedSlot'].some(k => value.scope?.[k] !== binding[k]) || value.scope.personalityVersion !== PERSONALITY_VERSION || value.scope.route !== 'PUMP_BONDING_CURVE_V1') fail('PLAN_BINDING');
    normalizeActivationPlan(value.policy);
    return value;
  };
  const termsFor = (ctx, binding, p, id, epoch, nonce, createdAt) => ({
    schema: 'OWNER_BOUNDED_TRADING_V1', origin, owner: ctx.owner, agentId: ctx.agentId,
    wallet: binding.wallet, mint: binding.mint, network: 'solana:101', genesis: GENESIS,
    launchBinding: binding, launchBindingDigest: digest(binding), planRevision: p.revision, planDigest: p.planDigest,
    personalityVersion: PERSONALITY_VERSION, policy: normalizeActivationPlan(p.policy), strategyConfig: defaultStrategyConfig(p.policy.personality),
    venue: 'PUMP_BONDING_CURVE_V1', program: PUMP_PROGRAM_ID.toBase58(), actions: ['BUY','SELL'],
    maxDailyTransactions: p.policy.maxTransactions, networkFeeCapLamports: DEFAULT_RISK_POLICY.maxNetworkFeeLamports,
    protectedReserveLamports: reserve, withdrawalEnabled: false, transfersEnabled: false,
    id, revision: epoch, sessionId: id, nonce, createdAt, reviewExpiresAt: createdAt + 120000,
    startsAt: createdAt, expiresAt: createdAt + p.policy.durationMinutes * 60000
  });
  const load = id => {
    const row = db.prepare('SELECT * FROM dex_owner_consent_reviews WHERE id=?').get(id);
    if (!row) fail('REVIEW_NOT_FOUND');
    const r = JSON.parse(row.data), t = r.terms;
    if (!t || t.id !== id || t.agentId !== row.agent_id || t.owner !== row.owner || t.origin !== origin || r.message !== message(t) || r.messageHash !== digest(r.message)) fail('REVIEW_INTEGRITY');
    return r;
  };
  const validate = (ctx, r, row) => {
    const t = r.terms;
    if (!row || t.owner !== ctx.owner || t.agentId !== ctx.agentId || t.revision !== row.epoch) fail('REVOKED_OR_REPLACED');
    const binding = canonical(ctx), p = plan(ctx, binding);
    if (!text(t.nonce) || !Number.isSafeInteger(t.createdAt) || t.createdAt < 0 || digest(termsFor(ctx,binding,p,t.id,row.epoch,t.nonce,t.createdAt)) !== digest(t)) fail('TERMS_CHANGED');
    const at = time(row);
    if (t.startsAt > at || t.expiresAt <= at) fail('EXPIRED');
    return at;
  };
  const verify = (r, signature) => {
    try {
      if (typeof signature !== 'string' || signature.length > 100) fail('SIGNATURE');
      const bytes = bs58.decode(signature);
      if (bytes.length !== 64 || !nacl.sign.detached.verify(Buffer.from(r.message), bytes, new PublicKey(r.terms.owner).toBytes())) fail('SIGNATURE');
    } catch { fail('SIGNATURE'); }
  };
  const grant = r => {
    const t = r.terms, p = t.policy;
    const body = {id: t.id, revision: t.revision, owner: t.owner, agentId: t.agentId, wallet: t.wallet, mint: t.mint, network: t.network,
      sessionId: t.sessionId, startsAt: t.startsAt, expiresAt: t.expiresAt, status: 'ACTIVE', authorizationGranted: true,
      withdrawalEnabled: false, revoked: false, perTradeLamports: p.perTradeLamports, sessionDebitLamports: p.sessionDebitLamports,
      dailyDebitLamports: p.dailyDebitLamports, maxTransactions: p.maxTransactions, maxDailyTransactions: t.maxDailyTransactions,
      launchBindingDigest: t.launchBindingDigest, consentMessageHash: r.messageHash, planDigest: t.planDigest,
      venue: t.venue, program: t.program, actions: t.actions, slippageBps: p.slippageBps,
      personality: p.personality, personalityVersion: t.personalityVersion,
      strategyConfig: structuredClone(t.strategyConfig),
      networkFeeCapLamports: t.networkFeeCapLamports, protectedReserveLamports: t.protectedReserveLamports};
    return {...body, digest: digest(body)};
  };
  const active = (ctx, row = own(ctx)) => {
    if (!row?.active_id) fail('INACTIVE');
    const r = load(row.active_id), proof = db.prepare('SELECT * FROM dex_owner_consent_proofs WHERE review_id=?').get(row.active_id);
    if (!proof) fail('PROOF_REQUIRED');
    verify(r, proof.signature); validate(ctx, r, row);
    if (!Number.isSafeInteger(proof.approved_at) || proof.approved_at < r.terms.createdAt || proof.approved_at >= Math.min(r.terms.reviewExpiresAt,r.terms.expiresAt) || proof.approved_at > time(row)) fail('PROOF_TIME');
    return grant(r);
  };
  return Object.freeze({
    prepareReview(ownerContext, {planRevision, planDigest} = {}) {
      const ctx = context(ownerContext);
      return atomic(() => {
        const row = own(ctx), at = time(row);
        if (row?.active_id && load(row.active_id).terms.expiresAt > at) fail('REVOKE_BEFORE_REPLACEMENT');
        const binding = canonical(ctx), p = plan(ctx, binding);
        if (p.revision !== planRevision || p.planDigest !== planDigest) fail('PLAN_CHANGED');
        const epoch = (row?.epoch ?? 0) + 1;
        if (!Number.isSafeInteger(epoch)) fail('REVISION_OVERFLOW');
        const terms = termsFor(ctx,binding,p,randomUUID(),epoch,randomBytes(24).toString('hex'),at);
        const r = {terms, message: message(terms)}; r.messageHash = digest(r.message);
        const finalAt = time(row); if (finalAt >= Math.min(terms.reviewExpiresAt, terms.expiresAt)) fail('EXPIRED');
        db.prepare('INSERT INTO dex_owner_consent_state VALUES(?,?,?,NULL,?) ON CONFLICT(agent_id) DO UPDATE SET epoch=excluded.epoch,active_id=NULL,observed_at=excluded.observed_at').run(ctx.agentId,ctx.owner,epoch,finalAt);
        db.prepare('INSERT INTO dex_owner_consent_reviews VALUES(?,?,?,?)').run(terms.id,ctx.agentId,ctx.owner,JSON.stringify(r));
        return structuredClone(r);
      });
    },
    approve(ownerContext, input) {
      const ctx = context(ownerContext);
      if (!input || Object.keys(input).sort().join(',') !== 'reviewId,signature' || !text(input.reviewId)) fail('APPROVAL_FIELDS');
      return atomic(() => {
        const row = own(ctx), r = load(input.reviewId);
        verify(r,input.signature); validate(ctx,r,row);
        const old = db.prepare('SELECT signature FROM dex_owner_consent_proofs WHERE review_id=?').get(input.reviewId);
        if (old) { if (old.signature !== input.signature || row.active_id !== input.reviewId) fail('APPROVAL_CONFLICT'); return active(ctx,row); }
        const at = time(row); if (at >= Math.min(r.terms.reviewExpiresAt,r.terms.expiresAt)) fail('REVIEW_EXPIRED');
        if (row.active_id) fail('REVOKE_BEFORE_REPLACEMENT');
        db.prepare('INSERT INTO dex_owner_consent_proofs VALUES(?,?,?)').run(input.reviewId,input.signature,at);
        db.prepare('UPDATE dex_owner_consent_state SET active_id=?,observed_at=? WHERE agent_id=?').run(input.reviewId,at,ctx.agentId);
        return grant(r);
      });
    },
    revoke(ownerContext) {
      const ctx = context(ownerContext);
      return atomic(() => {
        const row = own(ctx);
        // With no review/grant there is nothing to revoke. Do not let a signed-in
        // caller claim ownership of an arbitrary unused Agent ID via this path.
        if(!row)return {agentId:ctx.agentId,revision:0,authorizationGranted:false,executionEnabled:false};
        const wall=now(), at=Math.max(Number.isSafeInteger(wall)&&wall>=0?wall:0,row.observed_at,observedTime), epoch = row.epoch + 1;
        observedTime=at; // Clock rollback must not prevent removing authority.
        if (!Number.isSafeInteger(epoch)) fail('REVISION_OVERFLOW');
        db.prepare('INSERT INTO dex_owner_consent_state VALUES(?,?,?,NULL,?) ON CONFLICT(agent_id) DO UPDATE SET epoch=excluded.epoch,active_id=NULL,observed_at=excluded.observed_at').run(ctx.agentId,ctx.owner,epoch,at);
        return {agentId:ctx.agentId,revision:epoch,authorizationGranted:false,executionEnabled:false};
      });
    },
    // Call outside the reservation transaction before each worker cycle. A
    // committed clock watermark must precede claim-time read-only validation.
    // Even an expired read commits the observed time before reporting failure.
    checkpointClock(ownerContext) {
      const ctx = context(ownerContext);
      return atomic(() => { const row=own(ctx),at=time(row); if(!row)fail('INACTIVE'); db.prepare('UPDATE dex_owner_consent_state SET observed_at=? WHERE agent_id=?').run(at,ctx.agentId); return at; });
    },
    read(ownerContext) {
      const ctx = context(ownerContext); let error;
      const result = atomic(() => {
        const row=own(ctx),at=time(row); if(!row)fail('INACTIVE');
        db.prepare('UPDATE dex_owner_consent_state SET observed_at=? WHERE agent_id=?').run(at,ctx.agentId);
        try { return {authorization:active(ctx),executionEnabled:false}; } catch(e) { error=e; return null; }
        finally { db.prepare('UPDATE dex_owner_consent_state SET observed_at=? WHERE agent_id=?').run(observedTime,ctx.agentId); }
      });
      if(error)throw error; return result;
    },
    resolveBudgetAuthority(request) {
      const ctx = context({authenticated:true,owner:request?.owner,agentId:request?.agentId}), row=own(ctx);
      if(!row || time(row)-row.observed_at>5000)fail('CLOCK_CHECKPOINT_REQUIRED');
      const a = active(ctx,row);
      if (a.id !== request.authorizationId || a.revision !== request.authorizationRevision || a.digest !== request.authorizationDigest || ['owner','agentId','wallet','mint','network'].some(k => a[k] !== request[k])) fail('BUDGET_BINDING');
      return a;
    }
  });
}
