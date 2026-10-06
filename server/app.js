import express from 'express';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {realpathSync,lstatSync} from 'node:fs';
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
import {installAgentTrading,launchReceipt} from './agent-trading.js';
import {logError} from './runtime.js';
import {normalizeTokenImage,stageTokenImage} from './token-image.js';
import {mainnetWalletBalance} from './wallet-balance.js';
import {installControlledDex} from './dex/routes.js';
import {createRealMoneyNetwork} from './real-money-network.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {deleteBlockers} from './delete-policy.js';
import {strategyRegistry} from './strategy-registry.js';
import {operatingPlan,ownerAgentContract,ownerTokenDraftContract,readLaunchEvidence,lifecycleProjection} from './launchpad-contracts.js';
import {installLaunchpadScopeLedger} from './launchpad-scope.js';
import {installFirstTokenStore,readFirstTokenReceiptAuthority} from './launchpad-token-store.js';
import {createTokenImageAuthority} from './launchpad-token-image.js';
import {normalizeTokenDraft} from '../src/token-draft-schema.js';
import {agentLaunchData,assertAgentLaunch} from '../src/agent-launch-data.js';
import {parseInitialBuy} from '../src/initial-buy.js';
import {installRealLeaderboard} from './real-leaderboard.js';
import {resolveTokenDraftConfiguration} from './launchpad-token-configuration.js';

const hash = v => createHash('sha256').update(v).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (v, min, max, label) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max || /[\x00-\x1f]/.test(v)) fail(400, `Invalid ${label}`);
  return v.trim();
};
const address = v => { try { if (typeof v !== 'string' || !PublicKey.isOnCurve(new PublicKey(v).toBytes())) throw 0; return v; } catch { fail(400, 'Invalid wallet address'); } };
export function createServer({ dbPath, vaultKey, origins = ['http://127.0.0.1:5188'], network = 'local', rpc, mainnetSafetyMode = false, production = false, chain: injectedChain, now = Date.now, deletionGuard=reserveDraftDeletion, tradingOptions={}, realMoneyNetwork, tokenDraftOptions, tokenDraftConfiguration, pumpRuntimeDependencies, localOwnerAuthHarness=false, ownerBalanceReader, launchPreparation, launchPreparationEvidence,m4ExecutionFactory,launchReceiptAuthorityFactory } = {}) {
  if(localOwnerAuthHarness){
    const base=resolve(tmpdir())+'/',file=resolve(dbPath??'').replaceAll('\\','/'),parent=file.slice(0,file.lastIndexOf('/'));
    if(production||network!=='mainnet'||!mainnetSafetyMode||injectedChain||!parent.startsWith(base.replaceAll('\\','/'))||!/^tekkteam-owner-auth-[a-zA-Z0-9]+$/.test(parent.slice(parent.lastIndexOf('/')+1))||!origins.length||origins.some(o=>!/^http:\/\/127\.0\.0\.1:\d+$/.test(o)))throw Error('Owner auth harness requires isolated disposable loopback Mainnet-safety store');
    const resolvedParent=realpathSync(parent).replaceAll('\\','/'),resolvedTmp=realpathSync(tmpdir()).replaceAll('\\','/')+'/';
    if(vaultKey!==undefined||lstatSync(parent).isSymbolicLink()||!resolvedParent.startsWith(resolvedTmp))throw Error('Owner auth harness foreign key/path denied');
    for(const candidate of [file,resolve(parent,'vault.key'),file+'-wal',file+'-shm']){let stat;try{stat=lstatSync(candidate);}catch(error){if(error.code==='ENOENT')continue;throw error;}if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('Owner auth harness linked data denied');}
  }
  if(pumpRuntimeDependencies!==undefined&&(production||network!=='local'))throw Error('Pump runtime DI requires isolated local backend');
  if(tokenDraftConfiguration!==undefined){
    if(tokenDraftOptions!==undefined)throw Error('Ambiguous token configuration');
    tokenDraftOptions=resolveTokenDraftConfiguration(tokenDraftConfiguration).options??undefined;
  }
  network = network.toLowerCase();
  if (!['local', 'devnet', 'mainnet'].includes(network)) throw new Error('Unknown network');
  if (network === 'mainnet' && (!mainnetSafetyMode || !rpc || injectedChain)) throw new Error('Mainnet requires explicit safety mode and separate RPC; injected execution adapters prohibited');
  if (network === 'devnet' && !rpc && !injectedChain) throw new Error('Devnet requires SOLANA_RPC_URL');
  if(launchPreparation!==undefined&&(network!=='mainnet'||!mainnetSafetyMode||typeof launchPreparation!=='function'||!tokenDraftOptions))throw Error('Unsigned launch preparation requires explicit Mainnet safety and token authority');
  if(launchPreparationEvidence!==undefined&&(!launchPreparation||typeof launchPreparationEvidence!=='function'))throw Error('Preparation evidence requires explicit unsigned preparation');
  if(m4ExecutionFactory!==undefined&&(!launchPreparation||typeof m4ExecutionFactory!=='function'||network!=='mainnet'||!mainnetSafetyMode))throw Error('M4 requires explicit isolated Mainnet preparation authority');
  const store = openStore(dbPath, vaultKey, production), { db } = store;
  let m4Execution;
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
    const paperAction=req.method==='POST'&&/^\/[^/]+\/trading\/(configure|enable|pause|strategy-config)$/.test(req.path)&&(!req.body?.mode||req.body.mode==='paper')&&(!req.query.mode||req.query.mode==='paper');
    if (network === 'mainnet' && !['GET','HEAD','OPTIONS'].includes(req.method) && !paperAction && !(req.method==='POST' && /^\/[^/]+\/(character|publication)$/.test(req.path))) return res.status(403).json({error:'MAINNET SAFETY MODE: drafts, token issuance, submission and value-moving actions disabled'});
    next();
  });
  app.get('/api/safety/memo', async(req,res) => {
    if (network !== 'mainnet') return res.status(403).json({error:'Requires separate MAINNET SAFETY backend'});
    res.json(await chain.prepareMemo(address(req.query.address)));
  });
  const authLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  const getSession = req => {
    const name=localOwnerAuthHarness?'tw_owner_harness_session':'tw_session';
    const token = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(name+'='))?.slice(name.length+1);
    return token ? db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(token), now()) : null;
  };
  const auth = (req, res, next) => { req.session = getSession(req); if (!req.session) return res.status(401).json({ error: 'Sign in with your wallet first' }); next(); };
  const realMoney=realMoneyNetwork??createRealMoneyNetwork();
  const ownerBalance=ownerBalanceReader??mainnetWalletBalance({connection:realMoney.connection,verifyNetwork:realMoney.verify});
  app.get('/api/wallet/mainnet-balance',auth,async(req,res)=>{
    try{res.json(await ownerBalance(req.session.address,req.query.refresh==='1'));}
    catch(error){res.status(503).json({error:'Mainnet balance unavailable',code:error.code?.startsWith('BALANCE_RPC_')?error.code:'BALANCE_RPC_UNREACHABLE'});}
  });
  const rowAgent = row => row ? { ...JSON.parse(row.data), no: row.no } : null;
  const owned = (req) => {
    const row = db.prepare('SELECT * FROM agents WHERE (id=? OR CAST(no AS TEXT)=?) AND owner=?').get(req.params.id, req.params.id, req.session.address);
    if (!row) fail(404, 'Agent not found'); return { row, agent: rowAgent(row) };
  };
  let receiptAuthority;try{receiptAuthority=launchReceiptAuthorityFactory?.({db,store});}catch(error){store.close();throw error;}
  const receiptReader=receiptAuthority?.read;
  let scopeLedger;try{scopeLedger=installLaunchpadScopeLedger(db,{now});}catch(error){store.close();throw error;}
  let tokenStore=null,tokenImages=null;
  if(tokenDraftOptions!==undefined){
    try{
      if(typeof tokenDraftOptions.journalPath!=='string'||!tokenDraftOptions.journalPath)throw Error('Explicit initialized token receipt journal path required');
      tokenImages=tokenDraftOptions.imageAuthority??createTokenImageAuthority({root:tokenDraftOptions.assetRoot,origin:tokenDraftOptions.publicOrigin});
      if(typeof tokenImages.stage!=='function'||typeof tokenImages.verify!=='function')throw Error('Token image authority unavailable');
      tokenStore=installFirstTokenStore(db,{now,readLaunchpadScope:scopeLedger.readLaunchpadScope,readReceiptAuthority:a=>readFirstTokenReceiptAuthority(a,tokenDraftOptions.journalPath,receiptReader)});
    }catch(error){store.close();throw error;}
  }
  try{m4Execution=m4ExecutionFactory?.({db,store,receiptAuthority});}catch(error){store.close();throw error;}
  const launchEvidence=a=>readLaunchEvidence(a,tokenDraftOptions?.journalPath,receiptReader);
  const trading=installAgentTrading(app,{store,auth,owned,now,realMoney,...(tokenDraftOptions?{receipt:a=>launchReceipt(a,tokenDraftOptions.journalPath,receiptReader)}:{}),sessionValid:req=>getSession(req)?.address===req.session?.address,...tradingOptions,readLaunchpadScope:scopeLedger.readLaunchpadScope});
  const controlledDex=installControlledDex(app,{db,store,auth,owned,now,realMoney,pumpRuntimeDependencies,productionOrigin:production&&network==='mainnet'&&origins.length===1&&origins[0]==='https://tekkteam.tech'?origins[0]:null,sessionValid:req=>getSession(req)?.address===req.session?.address,readLaunchpadScope:scopeLedger.readLaunchpadScope,readReceiptAuthority:a=>readFirstTokenReceiptAuthority(a,tokenDraftOptions?.journalPath??resolve(process.env.DATA_DIR||'server/data','pump-agent-launches.json'),receiptReader)});
  installRealLeaderboard(app,{db,auth,owned,now});
  if(controlledDex.autonomousScheduler)trading.tick.setAutonomousTick(()=>controlledDex.autonomousScheduler.tick());
  const event = (a, type, message) => db.prepare('INSERT INTO events (agent_id,owner,type,message,created_at) VALUES (?,?,?,?,?)').run(a.id, a.creator, type, message, now());
  const save = a => db.prepare('UPDATE agents SET data=? WHERE id=?').run(JSON.stringify(a), a.id);
  const cookie = (res, token, maxAge) => res.cookie(localOwnerAuthHarness?'tw_owner_harness_session':'tw_session', token, { httpOnly: true, sameSite: 'strict', secure: production, path: '/api', maxAge });
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
  app.get('/api/health', (req, res) => {db.prepare('SELECT 1').get();const arm=controlledDex.oneShot?.status(),autonomousKillSwitch=process.env.AUTONOMOUS_KILL_SWITCH!=='false'||process.env.GLOBAL_TRADING_KILL_SWITCH!=='false',realMoneyEmergencyStop=process.env.REAL_MONEY_EMERGENCY_STOP!=='false';res.json({ ok: true, service: 'tekkwork-api', network, applicationNetwork:network, mainnet: network === 'mainnet', safetyMode: network === 'mainnet', broadcastEnabled: network === 'devnet', applicationBroadcastEnabled:network==='devnet', controlledRealBroadcastArmed:arm?.status==='ARMED', trading: false,liveTradingEnabled:process.env.LIVE_TRADING_ENABLED==='true'&&process.env.LIVE_AUTONOMOUS_ENABLED==='true'&&!autonomousKillSwitch&&!realMoneyEmergencyStop,paperTrading:true,fundingEnabled:process.env.FUNDING_ENABLED==='true',withdrawalEnabled:process.env.WITHDRAWAL_ENABLED==='true',walletTransfersPaused:process.env.WALLET_TRANSFERS_PAUSED==='true',globalTradingKillSwitch:process.env.GLOBAL_TRADING_KILL_SWITCH!=='false',autonomousKillSwitch,realMoneyEmergencyStop,controlledRealEnabled:false,controlledRealRequested:process.env.CONTROLLED_REAL_ENABLED==='true',controlledPrepareReviewEnabled:process.env.CONTROLLED_BUY_PREPARE_ENABLED==='true',controlledDexAdapter:arm?.status==='ARMED'?'CPMM_ONE_SHOT_ARMED':'CPMM_WIRED_DISARMED',...realMoney.status() });});
  app.get('/api/state', (req, res) => {
    const session = getSession(req);
    const agents = session ? db.prepare('SELECT * FROM agents WHERE owner=? ORDER BY no DESC').all(session.address).map(rowAgent).map(a=>({...a,tradingStatus:trading.projection(a).status})) : [];
    const events = session ? db.prepare('SELECT id,agent_id AS agentId,type,message,created_at AS createdAt FROM events WHERE owner=? ORDER BY id DESC LIMIT 50').all(session.address) : [];
    res.json({ config, session: session ? { address: session.address } : null, agents, events, coins: agents.filter(a => a.status === 'DEVNET_LIVE').map(a => a.coin), feed: [], tokens: [], bonded: [], stats: { agentsTotal: agents.length, agentsActive: 0, drafts: agents.filter(a => a.status === 'DRAFT').length, testLaunches: agents.filter(a => a.status === 'DEVNET_LIVE').length, trades24h: 0, aumSol: 0, pnlSol: 0, feesClaimedSol: 0 } });
  });
  app.post('/api/auth/challenge', authLimit, (req, res) => {
    const owner = address(req.body.address), id = randomUUID(), expires = now() + 5 * 60_000;
    const message = localOwnerAuthHarness?`TEKKTEAM isolated local owner authentication\nDomain: ${new URL(req.headers.origin).host}\nOrigin: ${req.headers.origin}\nWallet: ${owner}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nPurpose: authenticate this wallet to disposable local TEKKTEAM data only.\nNo launch, transaction, payment, funding, withdrawal or trading is authorized.`:`TEKKTEAM wallet sign-in\nOrigin: ${req.headers.origin}\nWallet: ${owner}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signature signs you in. It does not authorize a payment.`;
    db.prepare('DELETE FROM challenges WHERE expires<?').run(now());
    db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(id, owner, message, expires);
    res.json({ id, message, expires,...(localOwnerAuthHarness?{manualApprovalRequired:true}: {}) });
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
  app.get('/api/strategy-registry',(req,res)=>res.json(strategyRegistry()));
  const paperFor=id=>{const r=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(id);return r?JSON.parse(r.data):null;};
  app.get('/api/agents/:id/operating-plan',auth,(req,res)=>{const a=owned(req).agent;res.json(operatingPlan(a,paperFor(a.id)));});
  app.get('/api/agents/:id/launch-lifecycle',auth,(req,res)=>{const a=owned(req).agent,p=paperFor(a.id);res.json(lifecycleProjection(a,{...launchEvidence(a),operation:p?{status:p.enabled?'WORKING':'PAUSED',mode:'PAPER'}:null}));});
  app.get('/api/agents/:id/contract',auth,async(req,res)=>{
    const initial=owned(req).agent,owner=req.session.address,initialBinding=tokenStore?.readTokenBinding(initial.id,owner);
    const verifiedImage=initialBinding?.token?.image;
    let imageVerified=false;
    if(initialBinding?.available===true&&initialBinding.bound===true&&typeof verifiedImage==='string')try{const image=await tokenImages.verify(initial.id,verifiedImage);imageVerified=image?.image===verifiedImage&&image.localAsset==='VERIFIED'&&image.publicDelivery==='UNVERIFIED';}catch{}
    if(getSession(req)?.address!==owner)fail(401,'Owner session changed; token capability unavailable');
    const {agent:a,row}=owned(req),scope=scopeLedger.readLaunchpadScope(a),binding=tokenStore?.readTokenBinding(a.id,owner),receiptAuthority=tokenStore?readFirstTokenReceiptAuthority(a,tokenDraftOptions.journalPath,receiptReader):null;
    const original=db.prepare('SELECT owner,source FROM launchpad_agent_scopes WHERE agent_id=?').get(a.id);
    imageVerified=imageVerified&&binding?.token?.image===verifiedImage;
    const tokenDraft=ownerTokenDraftContract(a,{configured:!!tokenStore,binding,scope,originalScope:original?.owner===owner&&original.source==='LAUNCHPAD_IDENTITY',tokenless:row.secret===null&&a.coin===null&&a.launch==null&&a.tokenDraftRevision==null,receiptAuthority,imageVerified});
    const evidence=receiptAuthority??launchEvidence(a);
    res.json({...ownerAgentContract(a,{...evidence,tokenDraft,paper:paperFor(a.id),wallet:db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id)}),launchpadScope:scope});
  });
  // Narrow off-chain identity write. Legacy Mainnet draft/transaction middleware remains closed.
  const createIdentity=scoped=>(req,res)=>{
    if(Object.keys(req.body).some(k=>!['name','description','character','strategy'].includes(k)))fail(400,'Identity creation accepts identity fields only');
    const key=text(req.headers['idempotency-key'],8,100,'idempotency key');
    const input={name:text(req.body.name,2,40,'agent name'),description:text(req.body.description??'',0,300,'description'),character:req.body.character,strategy:req.body.strategy??'operator'};
    if(!characters.some(c=>c.id===input.character)||!strategies.some(s=>s.id===input.strategy))fail(400,'Unknown character or strategy');
    const fingerprint=hash(JSON.stringify({kind:scoped?'LAUNCHPAD_IDENTITY':'IDENTITY_ONLY',...input}));
    const prior=db.prepare('SELECT * FROM requests WHERE owner=? AND key=?').get(req.session.address,key);
    if(prior){
      if(prior.fingerprint!==fingerprint)fail(409,'This request key belongs to another intent');
      const row=db.prepare('SELECT * FROM agents WHERE id=? AND owner=?').get(prior.agent_id,req.session.address);
      if(!row)fail(409,'Identity replay requires a consistent owned Agent');
      let replay;try{replay=rowAgent(row);}catch{fail(409,'Identity replay requires a consistent owned Agent');}
      if(!replay||replay.id!==prior.agent_id||replay.creator!==req.session.address)fail(409,'Identity replay requires a consistent owned Agent');
      if(scoped){const scope=scopeLedger.readLaunchpadScope(replay),row=db.prepare('SELECT source FROM launchpad_agent_scopes WHERE agent_id=?').get(replay.id);if(!scope.available||!scope.scoped||row?.source!=='LAUNCHPAD_IDENTITY')fail(409,'Launchpad identity replay requires consistent scope');return res.json({...replay,launchpadScope:scope,replayed:true});}
      return res.json(replay);
    }
    if(db.prepare('SELECT COUNT(*) AS n FROM agents WHERE owner=?').get(req.session.address).n>=50)fail(409,'Agent limit reached');
    store.ensureIdentitySchema();
    const a={id:randomUUID(),creator:req.session.address,...input,avatarSeed:`skin:${input.character}`,status:'DRAFT',createdAt:now(),updatedAt:now(),network,coin:null,launch:null};
    db.exec('BEGIN IMMEDIATE');
    try{const result=db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run(a.id,a.creator,JSON.stringify(a));a.no=Number(result.lastInsertRowid);if(scoped)scopeLedger.insertLaunchpadScope(a,{source:'LAUNCHPAD_IDENTITY'});db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(a.creator,key,fingerprint,a.id);event(a,'draft',`${a.name} joined your workspace.`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.status(201).json(scoped?{...a,launchpadScope:scopeLedger.readLaunchpadScope(a)}:a);
  };
  app.post('/api/agent-identities',auth,createIdentity(false));
  app.post('/api/launchpad/agent-identities',authLimit,auth,createIdentity(true));
  app.post('/api/launchpad/agents/:id/enter',authLimit,auth,(req,res)=>{
    if(!req.body||Array.isArray(req.body)||typeof req.body!=='object'||Object.keys(req.body).length)fail(400,'Launchpad entry accepts an empty object only');
    const a=owned(req).agent,key=text(req.headers['idempotency-key'],8,100,'idempotency key');
    const fingerprint=hash(JSON.stringify({kind:'LAUNCHPAD_ENTRY',agentId:a.id}));
    const prior=db.prepare('SELECT * FROM requests WHERE owner=? AND key=?').get(req.session.address,key);
    if(prior&&(prior.fingerprint!==fingerprint||prior.agent_id!==a.id))fail(409,'This request key belongs to another intent');
    const scope=scopeLedger.readLaunchpadScope(a);if(!scope.available)fail(409,'Launchpad scope unavailable');
    if(prior&&!scope.scoped)fail(409,'Launchpad entry replay requires consistent scope');
    if(scope.scoped){
      if(!prior){db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(a.creator,key,fingerprint,a.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
      return res.json({agentId:a.id,launchpadScope:scope});
    }
    if(typeof trading.assertCanEnterLaunchpadScope!=='function')fail(409,'Launchpad Paper entry guard unavailable');
    trading.assertCanEnterLaunchpadScope(a.id);
    if(paperFor(a.id)?.targetPolicy==='GENERAL')fail(409,'Explicit GENERAL Paper policy cannot enter associated scope without a separate validated transition');
    db.exec('BEGIN IMMEDIATE');
    try{scopeLedger.insertLaunchpadScope(a,{source:'LAUNCHPAD_ENTRY'});db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(a.creator,key,fingerprint,a.id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    res.status(201).json({agentId:a.id,launchpadScope:scopeLedger.readLaunchpadScope(a)});
  });
  // Explicitly configured first-token off-chain write; no launch, publication or custody effects.
  app.post('/api/launchpad/agents/:id/token-draft',authLimit,auth,async(req,res)=>{
    const a=owned(req).agent,owner=req.session.address;
    if(req.params.id!==a.id)fail(404,'Use the canonical Agent ID');
    if(!tokenStore)fail(503,'First-token configuration is unavailable');
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['draft','expectedRevision','tokenImage'].includes(k))||body.expectedRevision!==0)fail(400,'First-token save requires draft and expected revision zero');
    const key=text(req.headers['idempotency-key'],8,100,'idempotency key');
    const originalScope=()=>{const row=db.prepare('SELECT owner,source FROM launchpad_agent_scopes WHERE agent_id=?').get(a.id);if(row?.owner!==owner||row.source!=='LAUNCHPAD_IDENTITY')fail(409,'First-token save requires an original Launchpad identity');};
    originalScope();
    const initialBinding=tokenStore.readTokenBinding(a.id,owner);
    if(!initialBinding.available)fail(409,'First-token authority unavailable');
    if(!initialBinding.bound){
      const evidence=readFirstTokenReceiptAuthority(a,tokenDraftOptions.journalPath,receiptReader);
      if(a.coin!==null||a.launch!=null||!evidence.available||!evidence.initialized||evidence.receipt!==null)fail(409,'Initialized absence of prior token and launch is required');
    }
    let input,draft;
    try{draft=normalizeTokenDraft(body.draft);}catch{fail(400,'Invalid token draft metadata');}
    input={...draft};
    let imageAuthority;
    if(Object.hasOwn(body,'tokenImage')){
      if(Object.hasOwn(draft,'image'))fail(400,'Use one token image source');
      imageAuthority=await tokenImages.stage(a.id,body.tokenImage);input.image=imageAuthority.image;
      try{draft=normalizeTokenDraft(input);}catch{fail(400,'Invalid normalized token image');}
    }else{
      if(!Object.hasOwn(draft,'image'))fail(400,'An immutable Agent token image is required');
      imageAuthority=await tokenImages.verify(a.id,draft.image);
    }
    if(imageAuthority?.image!==draft.image||imageAuthority.localAsset!=='VERIFIED'||imageAuthority.publicDelivery!=='UNVERIFIED')fail(503,'Token image authority unavailable');
    if(getSession(req)?.address!==owner)fail(401,'Owner session changed; token draft was not saved');
    const fingerprint=hash(JSON.stringify({kind:'FIRST_TOKEN_DRAFT_V1',agentId:a.id,expectedRevision:0,draft}));
    db.exec('BEGIN IMMEDIATE');
    let saved;
    try{
      originalScope();
      const prior=db.prepare('SELECT * FROM requests WHERE owner=? AND key=?').get(owner,key);
      if(prior&&(prior.agent_id!==a.id||prior.fingerprint!==fingerprint))fail(409,'This request key belongs to another intent');
      if(prior){const binding=tokenStore.readTokenBinding(a.id,owner);if(!binding.available||!binding.bound)fail(409,'First-token replay requires consistent immutable binding');}
      saved=tokenStore.bindFirstToken(a.id,owner,draft);
      if(!saved.replayed){
        const current=rowAgent(db.prepare('SELECT * FROM agents WHERE id=? AND owner=?').get(a.id,owner));
        const binding=tokenStore.readTokenBinding(a.id,owner);
        let snapshot;try{snapshot=agentLaunchData({...current,tokenDraftAuthority:{available:binding.available&&binding.bound,revision:1}});}catch{fail(400,'Token draft cannot form a valid launch snapshot');}
        // Reserve the current prepare envelope, including both UUIDs and decimal buy text.
        const envelope={attemptId:'x'.repeat(36),agentId:current.id,agent:snapshot,payer:owner,initialBuy:'9007199.254740991',replacePreparationId:'x'.repeat(36)};
        if(Buffer.byteLength(JSON.stringify(envelope),'utf8')>8192)fail(400,'Token metadata exceeds the current launch request size');
      }
      if(!prior){db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(owner,key,fingerprint,a.id);const current=rowAgent(db.prepare('SELECT * FROM agents WHERE id=? AND owner=?').get(a.id,owner));if(!saved.replayed)event(current,'token-configured','First immutable token draft configured. Trading remains separately authorized.');}
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    const {mint,...normalized}=saved.token;
    res.status(saved.replayed?200:201).json({agentId:a.id,revision:saved.revision,draft:normalized,imageAuthority:{localAsset:'VERIFIED',publicDelivery:'UNVERIFIED'},replayed:saved.replayed});
  });
  // Default-off M3 boundary: existing owner/token authority, no signing/submit route.
  if(launchPreparation)app.post('/api/launchpad/agents/:id/preparation',authLimit,auth,async(req,res)=>{
    const owner=req.session.address,body=req.body;
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['initialBuy','requestId'].includes(k))||typeof body.initialBuy!=='string'||body.initialBuy.length>30||typeof body.requestId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.requestId))fail(400,'Explicit initial buy and preparation request ID required');
    const snapshot=()=>{
      if(getSession(req)?.address!==owner)fail(401,'Owner session changed; preparation stopped');
      const {row,agent:a}=owned(req),scope=db.prepare('SELECT owner,source FROM launchpad_agent_scopes WHERE agent_id=?').get(a.id),scopeAuthority=scopeLedger.readLaunchpadScope(a),binding=tokenStore.readTokenBinding(a.id,owner),receipt=readFirstTokenReceiptAuthority(a,tokenDraftOptions.journalPath,receiptReader);
      if(req.params.id!==a.id||a.creator!==owner||row.secret!==null||scope?.owner!==owner||scope.source!=='LAUNCHPAD_IDENTITY'||scopeAuthority?.available!==true||scopeAuthority.scoped!==true||scopeAuthority.reason!==null||binding?.available!==true||binding.bound!==true||binding.revision!==1||a.tokenDraftRevision!==1||a.coin?.mint!==null||a.launch!=null||!receipt.available||!receipt.initialized||receipt.receipt!==null)fail(409,'Original immutable Agent token and initialized receipt absence required');
      return agentLaunchData({...a,tokenDraftAuthority:{available:true,revision:1}});
    };
    const identity=snapshot(),image=await tokenImages.verify(identity.agentId,identity.image);
    if(image.image!==identity.image||image.localAsset!=='VERIFIED')fail(503,'Immutable image unavailable');
    if(JSON.stringify(snapshot())!==JSON.stringify(identity))fail(409,'Agent changed; preparation stopped');
    try{
      const result=await launchPreparation(identity,body.initialBuy,body.requestId);
      if(JSON.stringify(snapshot())!==JSON.stringify(identity))fail(409,'Agent changed; preparation stopped');
      assertAgentLaunch(identity,result.launch);
      if(result.id!==body.requestId||result.feePayer!==owner||result.launch.initialBuyLamports!==parseInitialBuy(body.initialBuy))fail(409,'Preparation authority mismatch');
      if(launchPreparationEvidence){await launchPreparationEvidence(result);if(JSON.stringify(snapshot())!==JSON.stringify(identity))fail(409,'Agent changed; preparation stopped');}
      res.json(result);
    }catch(error){
      if(error.status===401||error.status===409)throw error;
      res.status(error.status??503).json({error:'Unsigned preparation stopped',code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'PREPARATION_FAILED',httpStatus:error.httpStatus??null,rpcCode:error.rpcCode??null});
    }
  });
  if(m4Execution){
   for(const action of ['prepare','recover','review','submit','reject','status','estimate','wallet-prepare','wallet-status','wallet-claim','wallet-diagnostic'])app[['status','wallet-status'].includes(action)?'get':'post']('/api/launchpad/agents/:id/execution/'+action,authLimit,auth,async(req,res)=>{
    const owner=req.session.address;
    const snapshot=()=>{
     if(getSession(req)?.address!==owner)fail(401,'Owner session changed');
     const {row,agent:a}=owned(req),scope=db.prepare('SELECT owner,source FROM launchpad_agent_scopes WHERE agent_id=?').get(a.id),scopeAuthority=scopeLedger.readLaunchpadScope(a),binding=tokenStore.readTokenBinding(a.id,owner);
     if(a.creator!==owner||row.secret!==null||scope?.owner!==owner||scope.source!=='LAUNCHPAD_IDENTITY'||scopeAuthority?.available!==true||scopeAuthority.scoped!==true||scopeAuthority.reason!==null||binding?.available!==true||binding.bound!==true||binding.revision!==1||a.tokenDraftRevision!==1||a.coin?.mint!==null)fail(409,'Immutable original owner/Agent/draft authority required');
     return agentLaunchData({...a,tokenDraftAuthority:{available:true,revision:1}});
    };
    const identity=snapshot(),body=['status','wallet-status'].includes(action)?{}:req.body;
    const allowed={prepare:['initialBuy','requestId','replaceExecutionId'],recover:['initialBuy','requestId','previousExecutionId'],review:['requestId','reviewDigest','transactionBase64'],submit:['requestId','reviewDigest','transactionBase64','signedTransactionBase64'],reject:['requestId'],status:[],estimate:['initialBuy','requestId'],'wallet-prepare':['initialBuy','requestId','previousExecutionId'],'wallet-status':[],'wallet-claim':['requestId','reviewDigest','transactionBase64'],'wallet-diagnostic':['requestId','reviewDigest','returnedTransactionBase64','returnedMessageBase64','clientStage']}[action];
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'Invalid M4 request');
    try{const verifyIdentity=()=>{if(JSON.stringify(snapshot())!==JSON.stringify(identity))fail(409,'Owner/Agent changed');};const result=action==='wallet-diagnostic'?m4Execution.diagnose(identity,body,verifyIdentity):await m4Execution.run(action,identity,body,verifyIdentity);verifyIdentity();res.json(result);}
    catch(error){res.status(error.status??503).json({error:'Controlled launch stopped',code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'M4_FAILED'});}
   });
  }
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
  app.get('/api/agents/:id', auth, (req, res) => {const a=owned(req).agent;const first=a.tokenDraftRevision===1?tokenStore?.readTokenBinding(a.id,a.creator):null;res.json({...a,...(a.tokenDraftRevision===1?{tokenDraftAuthority:{available:first?.available===true&&first.bound===true,revision:first?.available&&first.bound?1:null}}:{}),tradingStatus:trading.projection(a).status});});
  app.patch('/api/agents/:id', auth, (req, res) => {
    const { agent: a } = owned(req);
    if (!strategies.some(s => s.id === req.body.strategy)) fail(400, 'Unknown strategy');
    trading.setStrategy(a.id,req.body.strategy);a.strategy = req.body.strategy; a.updatedAt = now(); save(a); event(a, 'settings', `${a.name}'s strategy profile was updated. Live execution remains locked.`); res.json(a);
  });
  app.post('/api/agents/:id/character', auth, (req,res) => {
    const {agent:a}=owned(req);
    const next=text(req.body.character,1,40,'character');
    if(!characters.some(c=>c.id===next))fail(400,'Unknown character');
    const expected=text(req.body.expectedCharacter,1,40,'current character');
    if(a.character!==expected && a.character!==next)fail(409,'Agent character changed. Review the assignment again.');
    if(a.character===next)return res.json(a);
    a.character=next;a.avatarSeed=`skin:${next}`;a.updatedAt=now();save(a);
    event(a,'settings',`${a.name}'s character was assigned.`);
    res.json(a);
  });
  const locked = handler => async (req, res) => {
    const { row, agent } = owned(req);
    if (locks.has(agent.id)) fail(409, 'An operation is already in progress');
    locks.add(agent.id); try { await handler(req, res, row, agent); } finally { locks.delete(agent.id); }
  };
  const eligibility=async a=>{
    if(a.tokenDraftRevision!=null){
      const binding=tokenStore?.readTokenBinding(a.id,a.creator),known=binding?.available===true&&binding.bound===true;
      const reason=known?'The first token and Agent relationship is immutable; deletion is unavailable.':'Immutable token authority is unavailable; deletion is locked.';
      return {agentId:a.id,canDelete:false,deleteEligible:false,launchState:'immutable_token',reason,deleteBlockedReasons:[{code:known?'IMMUTABLE_FIRST_TOKEN_BOUND':'TOKEN_AUTHORITY_UNAVAILABLE',message:reason}]};
    }
    const result=await deletionEligibility(a);
    const wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(a.id);
    const executions=db.prepare('SELECT status,data FROM dex_executions WHERE agent_id=?').all(a.id);
    const transfers=db.prepare('SELECT data FROM agent_funding WHERE agent_id=?').all(a.id).map(row=>JSON.parse(row.data));
    const position=db.prepare('SELECT data FROM dex_positions WHERE agent_id=?').all(a.id).some(row=>BigInt(JSON.parse(row.data).quantity)>0n);
    const paperRow=db.prepare('SELECT data FROM paper_states WHERE agent_id=?').get(a.id);
    const paperPosition=!!(paperRow&&JSON.parse(paperRow.data).position);
    const activeReservation=db.prepare("SELECT 1 FROM real_balance_reservations WHERE status IN ('PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN','Prepared','Confirming') AND (data LIKE ? OR data LIKE ?) LIMIT 1").get('%'+a.id+'%','%'+(wallet?.address||'!no-wallet!')+'%');
    const pendingSubmission=!!db.prepare('SELECT 1 FROM submissions WHERE agent_id=?').get(a.id);
    let solLamports=wallet?null:0,tokenBalances=[];
    if(wallet){
      try{
        await realMoney.verify();
        const key=new PublicKey(wallet.address);
        const [balance,legacy,t22]=await Promise.all([realMoney.connection.getBalance(key,'confirmed'),realMoney.connection.getParsedTokenAccountsByOwner(key,{programId:TOKEN_PROGRAM_ID},'confirmed'),realMoney.connection.getParsedTokenAccountsByOwner(key,{programId:TOKEN_2022_PROGRAM_ID},'confirmed')]);
        solLamports=balance;
        tokenBalances=[...legacy.value,...t22.value].map(row=>({mint:row.account.data.parsed.info.mint,amount:row.account.data.parsed.info.tokenAmount.amount,decimals:row.account.data.parsed.info.tokenAmount.decimals})).filter(t=>BigInt(t.amount)>0n);
      }catch{solLamports=null;tokenBalances=[];}
    }
    const active=executions.some(e=>['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN'].includes(e.status))||transfers.some(t=>['PREPARED','Prepared','Confirming','SIGNED','SUBMITTED','UNKNOWN'].includes(t.status));
    const unresolved=executions.some(e=>['SIGNED','SUBMITTED','UNKNOWN'].includes(e.status))||transfers.some(t=>['Confirming','SIGNED','SUBMITTED','UNKNOWN'].includes(t.status));
    const blockers=deleteBlockers({wallet:!!wallet,solLamports,tokenBalances,realPosition:position,activeExecution:active,unresolvedExecution:unresolved,activeReservation:!!activeReservation,pendingSubmission,tokenLaunched:!!a.coin?.mint,realHistory:executions.length>0||transfers.length>0,paperPosition});
    if(!result.canDelete&&!blockers.length)blockers.push({code:'LAUNCH_OR_DRAFT_STATE',message:result.reason||'The Agent is not an unlaunched draft.'});
    return {...result,canDelete:result.canDelete&&!blockers.length,deleteEligible:result.canDelete&&!blockers.length,deleteBlockedReasons:blockers,reason:blockers[0]?.message||result.reason,walletAddress:wallet?.address||null,solLamports,tokenBalances,realPositionOpen:position,paperPositionOpen:paperPosition,activeExecution:active,unresolvedExecution:unresolved,activeReservation:!!activeReservation,pendingSubmission};
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
      if (!row.secret) fail(409, 'This Agent has no Devnet mint key. Do not prepare a Devnet launch from an identity-only migration.');
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
  return { app, close: store.close, store, realMoney, reconcilePending, paperTick:trading.tick,analyticsTick:trading.analyticsTick,walletReconcile:trading.walletReconcile };
}
