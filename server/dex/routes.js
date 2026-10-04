import {createAssociatedCoinRealGuard} from '../associated-coin-real-policy.js';
import {installPumpRuntimeRoutes} from './pump-runtime-routes.js';
import {createDexLedger} from './ledger.js';
import {createJupiterQuoteProvider} from './quote.js';
import {createControlledExecutor} from './executor.js';
import {reject,DEFAULT_RISK_POLICY,SOL_MINT,evaluateControlledRisk} from './intent.js';
import {createDisabledCpmmAdapter} from './cpmm-disabled-adapter.js';
import {Connection} from '@solana/web3.js';
import {createCpmmProductionAdapter} from './cpmm-production-adapter.js';
import {cpmmReview,loadFreshCpmmPolicy,simulateUnsignedCpmm,CONTROLLED_USDC_MINT,CONTROLLED_CPMM_POOL} from './cpmm-mainnet-state.js';
import {formatControlledExecution} from './controlled-status-format.js';
import {createOneShotArm} from './one-shot-arm.js';
import {VersionedTransaction,PublicKey} from '@solana/web3.js';
import {assertFirstBuyAcceptance} from './first-buy-acceptance.js';
import {createAutonomousClaim} from './autonomous-claim.js';
import {createAutonomousExecutionPort} from './autonomous-execution-port.js';
import {createAutonomousHealth} from './autonomous-health.js';
import {markRealPosition} from './autonomous-v1.js';
import {createAutonomousOrchestrator} from './autonomous-orchestrator.js';
import {createAutonomousScheduler} from './autonomous-scheduler.js';
import {createAutonomousAcceptance,ENGINE_ACCEPTANCE,RECOVERY_CYCLE_ID} from './autonomous-acceptance.js';
import {createAutonomousAcceptanceWorker} from './autonomous-acceptance-worker.js';
import {createMarketFeed} from '../market-data.js';
import {createMarketDiscovery} from '../market-discovery.js';
import {evaluateAutonomousRisk} from './intent.js';
import {getAssociatedTokenAddressSync} from '@solana/spl-token';
import {resolveMarketProvenance} from './market-provenance.js';

// No custody or sending dependency is reachable from this production installer.
// Enabling an environment flag cannot bypass the unverified adapter gate.
export function installControlledDex(app,{db,store,auth,owned,sessionValid,now=Date.now,provider=createJupiterQuoteProvider({apiKey:process.env.JUPITER_API_KEY||'',now}),productionAdapter,productionProvider,productionFlags,realMoney,acceptanceCandidate=ENGINE_ACCEPTANCE,readLaunchpadScope,readReceiptAuthority,pumpRuntimeDependencies}){
 const ledger=createDexLedger(db);
 const flags=()=>({controlledEnabled:process.env.CONTROLLED_REAL_ENABLED==='true',liveEnabled:process.env.LIVE_TRADING_ENABLED==='true',killSwitch:process.env.GLOBAL_TRADING_KILL_SWITCH!=='false',realMoneyEmergencyStop:process.env.REAL_MONEY_EMERGENCY_STOP!=='false'});
 const authorize=req=>{if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');const {agent}=owned(req);const w=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(agent.id);if(!w||agent.tradingWallet!==w.address)reject('AGENT_WALLET_UNAVAILABLE');return {authenticated:true,agentId:agent.id,owner:req.session.address,agentWallet:w.address,configReference:'controlled-policy-v1'};};
 const assertTarget=createAssociatedCoinRealGuard({readAgent:id=>{const row=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(id);if(!row)return null;const agent=JSON.parse(row.data);if(agent.id!==id||agent.creator!==row.owner)return null;return agent;},readLaunchpadScope,readReceiptAuthority});
 const requestTarget=(c,body)=>assertTarget({...body,agentId:c.agentId,owner:c.owner});
 installPumpRuntimeRoutes(app,{db,auth,owned,sessionValid,assertTarget,now,dependencies:pumpRuntimeDependencies});
 const directAdapter=createDisabledCpmmAdapter();
 const engine=createControlledExecutor({ledger,provider,adapter:directAdapter,authorize,flags,assertTarget,now});
 // The production dependency is wired but physically disarmed in this phase.
 // Test injection exercises these exact HTTP handlers with fixture custody.
 const connection=productionAdapter?null:realMoney?.connection??new Connection(process.env.MAINNET_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 const verifyNetwork=realMoney?.verify??(async()=>{});
 const prepareRequested=process.env.CONTROLLED_BUY_PREPARE_ENABLED==='true';
 const oneShot=productionAdapter?undefined:createOneShotArm(db,{now});
 const controlledAdapter=productionAdapter??createCpmmProductionAdapter({connection,db,store,oneShot,allowValueMovement:false,allowPrepare:prepareRequested,assertNetwork:verifyNetwork,now});
 // A prepare-only acceptance gate may pass PREPARE authorization while the
 // global emergency stop and the physical signer/send latch stay closed.
 const controlledFlags=productionFlags??(()=>{const f=flags();return prepareRequested?{...f,controlledEnabled:true,realMoneyEmergencyStop:false}:f;});
 const controlledEngine=createControlledExecutor({ledger,provider:productionProvider??{quote:i=>controlledAdapter.quote(i)},adapter:controlledAdapter,authorize,flags:controlledFlags,oneShot,assertTarget,now,riskPolicy:{...DEFAULT_RISK_POLICY,maxSnapshotAgeMs:prepareRequested?300000:30000},requireSimulation:!productionAdapter,reviewLifetimeMs:prepareRequested?300000:30000});
 // Construct the separate production port but never schedule or invoke it from
 // this HTTP installer. All three real-money switches default closed.
 const autonomousFlags=()=>({liveAutonomousEnabled:process.env.LIVE_AUTONOMOUS_ENABLED==='true'&&process.env.LIVE_TRADING_ENABLED==='true',autonomousKillSwitch:process.env.AUTONOMOUS_KILL_SWITCH!=='false'||process.env.GLOBAL_TRADING_KILL_SWITCH!=='false',realMoneyEmergencyStop:process.env.REAL_MONEY_EMERGENCY_STOP!=='false'});
 const acceptance=createAutonomousAcceptance(db,{activationConfigured:!productionAdapter,now,candidate:acceptanceCandidate});
 const autonomousClaim=productionAdapter?null:createAutonomousClaim({db,ledger,flags:autonomousFlags,acceptance});
 const autonomousAdapter=productionAdapter?null:createCpmmProductionAdapter({connection,db,store,autonomousClaim,assertNetwork:verifyNetwork,now});
 const autonomousPort=autonomousAdapter?createAutonomousExecutionPort({ledger,adapter:autonomousAdapter,flags:autonomousFlags,network:{verify:async()=>{const result=await verifyNetwork();return {network:'solana:mainnet',verified:result.networkConsistent===true};}},currentAgent:id=>liveAgent(id),acceptance,assertTarget,now}):null;
 const autonomousHealth=createAutonomousHealth(db,{now});
 db.exec('CREATE TABLE IF NOT EXISTS dex_autonomous_runtime_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,agent_id TEXT NOT NULL,event TEXT NOT NULL,execution_id TEXT,data TEXT NOT NULL,created_at INTEGER NOT NULL)');
 const liveEvent=(agentId,event,executionId=null,reason=null)=>{
  const last=db.prepare('SELECT event,execution_id,data,created_at FROM dex_autonomous_runtime_events WHERE agent_id=? AND event=? ORDER BY seq DESC LIMIT 1').get(agentId,event);
  const data=JSON.stringify(typeof reason==='object'&&reason!==null?reason:{reason});if(last?.execution_id===executionId&&last.data===data&&(executionId||now()-last.created_at<120000))return;
  db.prepare('INSERT INTO dex_autonomous_runtime_events(agent_id,event,execution_id,data,created_at) VALUES(?,?,?,?,?)').run(agentId,event,executionId,data,now());
 };
 const autonomousNetwork={verify:async()=>{const result=await verifyNetwork();return {network:'solana:mainnet',verified:result.networkConsistent===true};}};
 const liveAgent=async id=>{
  const row=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(id),wallet=db.prepare('SELECT address FROM agent_wallets WHERE agent_id=?').get(id);
  if(!row||!wallet)reject('AGENT_WALLET_UNAVAILABLE');
  const agent=JSON.parse(row.data);if(agent.tradingWallet!==wallet.address)reject('AGENT_WALLET_UNAVAILABLE');
  await autonomousAdapter.assertCustody({agentId:id,agentWallet:wallet.address});
  const lifecycle=autonomousScheduler.read(id);
  return {...agent,agentId:id,owner:row.owner,agentWallet:wallet.address,mode:lifecycle.mode,enabled:lifecycle.enabled,paused:lifecycle.paused,vaultVerified:true};
 };
 let autonomousScheduler=null,acceptanceWorker=null;
 if(autonomousPort&&connection){
  const discovery=createMarketDiscovery({market:createMarketFeed({now}),now});
  const positions={
   read:id=>ledger.activePosition(id),
   async actualTokenBalance(id,mint){const agent=await liveAgent(id);await verifyNetwork();const ata=getAssociatedTokenAddressSync(new PublicKey(mint),new PublicKey(agent.agentWallet));const account=await connection.getTokenAccountBalance(ata,'confirmed');return account.value.amount;},
   async riskState(id){const records=ledger.list(id).filter(r=>r.intent.mode==='LIVE_AUTONOMOUS');const start=Math.floor(now()/86400000)*86400000;const daily=records.filter(r=>r.status==='CONFIRMED'&&r.confirmedAt>=start).reduce((sum,r)=>sum+(r.intent.direction==='BUY'?BigInt(r.intent.inputAmount):0n)+BigInt(r.confirmedEffects?.networkFeeLamports??'0'),0n);const recent=records.find(r=>r.status==='CONFIRMED');return {unknown:false,unresolved:false,reservationConflict:false,cooldownUntil:recent?recent.confirmedAt+60000:0,dailyTurnoverLamports:daily.toString()};}
  };
  const orchestrator=createAutonomousOrchestrator({discovery,
   market:{async sellQuote(position){const agent=await liveAgent(position.agentId),intent={mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:agent.agentId,owner:agent.owner,agentWallet:agent.agentWallet,direction:'SELL',inputMint:position.mint,outputMint:SOL_MINT,inputAmount:position.quantity,slippageBps:100,pool:position.pool};assertTarget(intent);const quote=await autonomousAdapter.quote(intent);assertTarget(intent);return {...quote,verified:true,direction:'SELL',observedAt:quote.createdAt};}},
   positions,executions:{list:id=>ledger.list(id)},health:autonomousHealth,executionPort:autonomousPort,network:autonomousNetwork,agentContext:liveAgent,flags:autonomousFlags,
   resolveProvenance:args=>resolveMarketProvenance({...args,connection,now}),
   decision:(id,result)=>{if(result.action==='CANDIDATE')liveEvent(id,'AUTONOMOUS_CANDIDATE',null,{tokenMint:result.mint,discoveryMarket:result.marketIdentity?.pair??null,reportedVenue:result.marketIdentity?.venue??null,executionSupport:'UNSUPPORTED'});else if(result.action==='BUY_INTENT')liveEvent(id,'AUTONOMOUS_BUY_INTENT',null,{tokenMint:result.mint,discoveryMarket:result.marketIdentity?.market??null,verifiedVenue:result.verifiedVenue,verifiedPool:result.verifiedPool,executionSupport:'SUPPORTED',marketBinding:result.marketBinding});else if(result.action==='EXIT_TRIGGERED')liveEvent(id,'AUTONOMOUS_EXIT_TRIGGERED',null,result.reason);else if(result.status==='CONFIRMED'&&result.action==='BUY'){liveEvent(id,'AUTONOMOUS_BUY_CONFIRMED',result.executionId);liveEvent(id,'REAL_POSITION_OPENED',result.executionId);}else if(result.status==='CONFIRMED'&&result.action==='SELL'){liveEvent(id,'AUTONOMOUS_SELL_CONFIRMED',result.executionId);liveEvent(id,'REAL_POSITION_CLOSED',result.executionId);}else if(result.reason==='UNRESOLVED_EXECUTION')liveEvent(id,'AUTONOMOUS_UNKNOWN');else if(result.reason==='AUTONOMOUS_CIRCUIT_OPEN')liveEvent(id,'AUTONOMOUS_CIRCUIT_BREAKER');else if(result.reason==='UNSUPPORTED_EXECUTION_VENUE')liveEvent(id,'AUTONOMOUS_SKIPPED',null,{tokenMint:result.mint??null,discoveryMarket:result.marketIdentity?.market??null,verifiedVenue:null,verifiedPool:null,executionSupport:'UNSUPPORTED',reason:result.provenanceReason??result.reason});},
   risk:{async evaluate({intent}){assertTarget(intent);const full={...intent,createdAt:now(),expiresAt:now()+30000};const quote=await autonomousAdapter.quote(full);assertTarget(intent);const pre=await autonomousAdapter.reservePlan({intent:full,quote});assertTarget(intent);return evaluateAutonomousRisk(full,pre.snapshot,DEFAULT_RISK_POLICY,now());}},now});
  autonomousScheduler=createAutonomousScheduler(db,{orchestrator,executions:{list:id=>ledger.list(id)},executionPort:autonomousPort,flags:autonomousFlags,network:autonomousNetwork,
   vault:{verify:async id=>{try{await liveAgent(id);return true;}catch{return false;}}},
   balance:{verify:async id=>{const a=await liveAgent(id);await verifyNetwork();const lamports=await connection.getBalance(new PublicKey(a.agentWallet),'confirmed');return BigInt(lamports)>=BigInt(DEFAULT_RISK_POLICY.minReserveLamports)+BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports)+BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports);}},
   health:autonomousHealth,now});
  acceptanceWorker=createAutonomousAcceptanceWorker({acceptance,ledger,port:autonomousPort,adapter:autonomousAdapter,agentContext:liveAgent,network:autonomousNetwork,
   marketRead:createMarketFeed({now,pairAddress:acceptanceCandidate.pool}),resolveProvenance:args=>resolveMarketProvenance({...args,connection,now,preSignRetry:true}),actualTokenBalance:positions.actualTokenBalance,now});
 }
 const publicRecord=r=>Object.fromEntries(['id','requestKey','status','intent','quote','review','messageHash','signature','createdAt','confirmedAt','reason'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
 const safe=handler=>async(req,res)=>{try{await handler(req,res);}catch(e){res.status(e.status===404?404:409).json({error:/^[A-Z_]+$/.test(e.code||'')?e.code:'CONTROLLED_SWAP_UNAVAILABLE'});}};
 const acceptanceBase='/api/agents/:id/autonomous-acceptance';
 app.post(acceptanceBase+'/start',auth,safe(async(req,res)=>{
  const c=authorize(req);if(Object.keys(req.body||{}).length||c.agentId!==acceptanceCandidate.agentId||c.owner!==acceptanceCandidate.owner||c.agentWallet!==acceptanceCandidate.agentWallet)reject('ACCEPTANCE_POLICY_MISMATCH');
  if(realMoney?.productionRpcConfigured!==true)reject('ACCEPTANCE_RPC_CAPACITY_UNVERIFIED');
  if(!acceptanceWorker||!autonomousPort||!connection)reject('ACCEPTANCE_RUNTIME_UNAVAILABLE');
  const n=await autonomousNetwork.verify(),agent=await liveAgent(c.agentId);
  if(autonomousScheduler.read(c.agentId).enabled)reject('LIVE_MODE_CONFLICT');
  const rows=ledger.list(c.agentId),activeExecution=rows.some(r=>['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN'].includes(r.status));
  const activeReservation=!!db.prepare('SELECT 1 FROM real_reserved_accounts WHERE wallet=?').get(c.agentWallet);
  const cycle=acceptance.ownerEnable({ownerAuthenticated:c.authenticated,ownershipVerified:agent.owner===c.owner,vaultVerified:agent.vaultVerified===true,networkVerified:n.verified,owner:c.owner,agentId:c.agentId,agentWallet:c.agentWallet},{acceptanceOverrideConfigured:true},{activePosition:!!ledger.activePosition(c.agentId),activeExecution,activeReservation});
  res.json({cycleId:cycle.cycleId,status:cycle.status,mode:cycle.mode,candidate:{token:'USELESS',mint:acceptanceCandidate.tokenMint,pool:acceptanceCandidate.pool,buyLimitLamports:acceptanceCandidate.maxBuyLamports,maxSlippageBps:acceptanceCandidate.maxSlippageBps,maxHoldMs:acceptanceCandidate.maxHoldMs}});
 }));
 // Stopping must not depend on custody, RPC, quote, or execution readiness.
 // Authentication and agent ownership are the only prerequisites here.
 app.post(acceptanceBase+'/emergency-stop',auth,safe(async(req,res)=>{if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');const {agent}=owned(req);if(Object.keys(req.body||{}).length||agent.id!==acceptanceCandidate.agentId||req.session.address!==acceptanceCandidate.owner)reject('ACCEPTANCE_POLICY_MISMATCH');const s=acceptance.ownerEmergencyStop();res.json({cycleId:s?.cycleId??null,status:s?.status??'DISARMED',emergencyStopped:true});}));
 app.post(acceptanceBase+'/recover-exit',auth,safe(async(req,res)=>{
  const c=authorize(req),s=acceptance.read();if(Object.keys(req.body||{}).length||c.agentId!==acceptanceCandidate.agentId||c.owner!==acceptanceCandidate.owner||c.agentWallet!==acceptanceCandidate.agentWallet||s?.cycleId!==RECOVERY_CYCLE_ID||!acceptanceWorker||!connection||autonomousScheduler.read(c.agentId).enabled)reject('ACCEPTANCE_RECOVERY_LOCKED');
  const n=await autonomousNetwork.verify(),agent=await liveAgent(c.agentId),position=ledger.activePosition(c.agentId),buy=s.buyExecutionId&&ledger.get(s.buyExecutionId),receipt=buy&&ledger.receipt(buy.id),rows=ledger.list(c.agentId);
  const activeExecution=rows.some(r=>['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN'].includes(r.status)),activeReservation=!!db.prepare('SELECT 1 FROM real_reserved_accounts WHERE wallet=?').get(c.agentWallet);
  const context={ownerAuthenticated:c.authenticated,ownershipVerified:agent.owner===c.owner,vaultVerified:agent.vaultVerified===true,networkVerified:n.verified,owner:c.owner,agentId:c.agentId,agentWallet:c.agentWallet};
  if(!acceptance.recoveryEligibility(context,{position,buy,receipt,activeExecution,activeReservation}).eligible)reject('ACCEPTANCE_RECOVERY_LOCKED');
  const ata=getAssociatedTokenAddressSync(new PublicKey(acceptanceCandidate.tokenMint),new PublicKey(c.agentWallet));const [balance,tokens]=await Promise.all([connection.getBalance(new PublicKey(c.agentWallet),'confirmed'),connection.getTokenAccountBalance(ata,'confirmed')]);
  if(balance<=0||tokens.value.amount!==position.quantity)reject('ACCEPTANCE_POSITION_BALANCE_MISMATCH');
  const market=await createMarketFeed({now,pairAddress:acceptanceCandidate.pool})(acceptanceCandidate.tokenMint),proof=await resolveMarketProvenance({snapshot:market,mint:acceptanceCandidate.tokenMint,agentWallet:c.agentWallet,connection,now,preSignRetry:true});
  if(proof.status!=='SUPPORTED_RAYDIUM_CPMM'||proof.binding?.pool!==acceptanceCandidate.pool)reject('ACCEPTANCE_PROVENANCE_INVALID');
  const recovered=acceptance.ownerRecoverExit(context,{position,buy,receipt,activeExecution,activeReservation});
  res.json({cycleId:recovered.cycleId,status:recovered.status,recoveryExit:true,emergencyStopped:true});
 }));
 app.get(acceptanceBase,auth,safe(async(req,res)=>{
  const c=authorize(req);if(c.agentId!==acceptanceCandidate.agentId||c.owner!==acceptanceCandidate.owner)reject('ACCEPTANCE_POLICY_MISMATCH');
  const s=acceptance.read(),p=ledger.position(c.agentId,acceptanceCandidate.tokenMint),open=BigInt(p.quantity)>0n&&p.acceptanceCycleId===s?.cycleId;
  const n=await autonomousNetwork.verify();let agentBalanceLamports=null,tokenBalanceRaw=null,mark={available:false,reason:'NO_OPEN_POSITION'};
  let vaultVerified=false;try{vaultVerified=(await liveAgent(c.agentId)).vaultVerified===true;}catch{}
  const activeExecution=ledger.list(c.agentId).some(r=>['QUOTED','PREPARING','PREPARED','SIGNED','SUBMITTED','UNKNOWN'].includes(r.status));
  const activeReservation=!!db.prepare('SELECT 1 FROM real_reserved_accounts WHERE wallet=?').get(c.agentWallet);
  const canStart=realMoney?.productionRpcConfigured===true&&acceptance.retryEligible()&&n.verified&&vaultVerified&&!activeExecution&&!activeReservation&&!ledger.activePosition(c.agentId)&&!autonomousScheduler.read(c.agentId).enabled&&!!acceptanceWorker;
  const buy=s?.buyExecutionId?ledger.get(s.buyExecutionId):null,receipt=buy?ledger.receipt(buy.id):null;
  const recovery=autonomousScheduler.read(c.agentId).enabled?{eligible:false,reason:'LIVE_MODE_CONFLICT'}:acceptance.recoveryEligibility({ownerAuthenticated:c.authenticated,ownershipVerified:c.owner===acceptanceCandidate.owner,vaultVerified,networkVerified:n.verified,owner:c.owner,agentId:c.agentId,agentWallet:c.agentWallet},{position:open?p:null,buy,receipt,activeExecution,activeReservation});
  const canRecoverExit=recovery.eligible;
  if(n.verified&&connection){agentBalanceLamports=String(await connection.getBalance(new PublicKey(c.agentWallet),'confirmed'));if(open){try{const ata=getAssociatedTokenAddressSync(new PublicKey(acceptanceCandidate.tokenMint),new PublicKey(c.agentWallet));tokenBalanceRaw=(await connection.getTokenAccountBalance(ata,'confirmed')).value.amount;mark=await acceptanceWorker.valuation(p);}catch{mark={available:false,reason:'PRICE_UNAVAILABLE'};}}}
  const history=s?ledger.list(c.agentId).filter(r=>r.intent?.acceptanceCycleId===s.cycleId).map(r=>({id:r.id,status:r.status,direction:r.intent.direction,signature:r.signature??null,reason:r.reason??null})):[];
  res.json({mode:acceptanceCandidate.mode,cycleId:s?.cycleId??null,status:s?.status??'DISARMED',canStart,canRecoverExit,recoveryCandidate:s?.cycleId===RECOVERY_CYCLE_ID&&open,recoveryEligible:recovery.eligible,recoveryDisabledReason:recovery.reason,recoveryExit:s?.recoveryExit===true,candidate:{token:'USELESS',mint:acceptanceCandidate.tokenMint,pool:acceptanceCandidate.pool,buyLimitLamports:acceptanceCandidate.maxBuyLamports,maxSlippageBps:acceptanceCandidate.maxSlippageBps,maxHoldMs:acceptanceCandidate.maxHoldMs},emergencyPermission:s?.emergencyPermission===true,emergencyStopped:s?.emergencyStopped===true,networkVerified:n.verified,vaultVerified,agentBalanceLamports,tokenBalanceRaw,position:p.acceptanceCycleId===s?.cycleId?{...p,holdingMs:Number.isSafeInteger(p.openedAt)?Math.max(0,(p.closedAt??now())-p.openedAt):null}:null,valuation:mark,buyExecutionId:s?.buyExecutionId??null,buySignature:s?.buySignature??null,sellExecutionId:s?.sellExecutionId??null,sellSignature:s?.sellSignature??null,exitReason:s?.exitReason??null,strategyResult:s?.strategyResult??null,failureReason:s?.failureReason??null,lastReconciliationAt:s?.lastReconciliationAt??null,history});
 }));
 for(const action of ['start','pause','resume'])app.post(`/api/agents/:id/autonomous-real/${action}`,auth,safe(async(req,res)=>{
  const c=authorize(req);if(Object.keys(req.body||{}).length)reject('UNEXPECTED_FIELD');
  if(!autonomousScheduler)reject('AUTONOMOUS_EXECUTION_PORT_UNAVAILABLE');
  const state=action==='start'?await autonomousScheduler.ownerStart(c.agentId):action==='resume'?await autonomousScheduler.ownerResume(c.agentId):autonomousScheduler.ownerPause(c.agentId);
  liveEvent(c.agentId,action==='start'?'LIVE_STARTED':action==='resume'?'LIVE_RESUMED':'LIVE_PAUSED');
  res.json({mode:'LIVE_AUTONOMOUS',lifecycle:state,health:autonomousHealth.read(c.agentId)});
 }));
 app.get('/api/agents/:id/autonomous-real',auth,safe(async(req,res)=>{
  const c=authorize(req),position=ledger.activePosition(c.agentId)??ledger.position(c.agentId,CONTROLLED_USDC_MINT),open=BigInt(position.quantity)>0n;
  let balanceLamports=null,valuation={available:false,reason:'NO_OPEN_POSITION'};
  if(connection){try{await verifyNetwork();balanceLamports=String(await connection.getBalance(new PublicKey(c.agentWallet),'confirmed'));}catch{}}
  if(open){valuation={available:false,reason:'PRICE_UNAVAILABLE'};if(autonomousAdapter&&position.pool)try{
   const quote=await autonomousAdapter.quote({mode:'LIVE_AUTONOMOUS',network:'solana:mainnet',agentId:c.agentId,owner:c.owner,agentWallet:c.agentWallet,direction:'SELL',inputMint:position.mint,outputMint:SOL_MINT,inputAmount:position.quantity,slippageBps:100,pool:position.pool});
   valuation=markRealPosition({position,quote:{...quote,verified:true,network:'solana:mainnet',direction:'SELL',observedAt:quote.createdAt},now:now()});
  }catch{}}
  const records=ledger.list(c.agentId).filter(r=>r.intent.mode==='LIVE_AUTONOMOUS');
  const lifecycle=autonomousScheduler?.read(c.agentId)??{mode:'PAPER',enabled:false,paused:true,lastTick:null,lastDecision:null};
  const totalPnlLamports=(BigInt(position.realizedPnlLamports??'0')+BigInt(valuation.available?valuation.unrealizedPnlLamports:'0')).toString();
  const runtimeEvents=db.prepare('SELECT event,execution_id AS executionId,data,created_at AS createdAt FROM dex_autonomous_runtime_events WHERE agent_id=? ORDER BY seq DESC LIMIT 30').all(c.agentId).map(e=>({event:e.event,executionId:e.executionId,...JSON.parse(e.data),createdAt:e.createdAt}));
  res.json({mode:'LIVE_AUTONOMOUS',lifecycle,scheduler:{running:lifecycle.enabled&&!lifecycle.paused,lastTick:lifecycle.lastTick,lastDecision:lifecycle.lastDecision},liveEnabled:autonomousFlags().liveAutonomousEnabled&&!autonomousFlags().autonomousKillSwitch&&!autonomousFlags().realMoneyEmergencyStop,agentWallet:c.agentWallet,balanceLamports,position:open?{...position,holdingMs:Number.isSafeInteger(position.openedAt)?Math.max(0,now()-position.openedAt):null,stopLossPercent:position.strategyConfig?.position?.stopLossPercent??null,takeProfitPercent:position.strategyConfig?.position?.takeProfitPercent??null}:null,valuation,realizedPnlLamports:position.realizedPnlLamports,totalPnlLamports,health:autonomousHealth.read(c.agentId),lastExecution:records[0]?{id:records[0].id,status:records[0].status,direction:records[0].intent.direction,signature:records[0].signature??null}:null,runtimeEvents,history:records.filter(r=>r.status==='CONFIRMED').map(r=>({id:r.id,direction:r.intent.direction,mint:r.intent.direction==='BUY'?r.intent.outputMint:r.intent.inputMint,venue:'RAYDIUM_CPMM',pool:r.pool,signature:r.signature,confirmedAt:r.confirmedAt,effects:r.confirmedEffects}))});
 }));
 const base='/api/agents/:id/controlled-swap';
 app.get(base,auth,safe(async(req,res)=>{
  if(!sessionValid(req))reject('OWNER_AUTH_REQUIRED');const {agent}=owned(req);
  res.json({mode:'CONTROLLED_REAL',enabled:false,requested:flags().controlledEnabled,liveEnabled:flags().liveEnabled,killSwitch:flags().killSwitch,realMoneyEmergencyStop:flags().realMoneyEmergencyStop,adapterReady:false,quoteAvailable:!!process.env.JUPITER_API_KEY,reason:'UNVERIFIED_ROUTE_ADAPTER',riskPolicy:{version:DEFAULT_RISK_POLICY.version,protectedLamports:(BigInt(DEFAULT_RISK_POLICY.minReserveLamports)+BigInt(DEFAULT_RISK_POLICY.futureSellFeeLamports)+BigInt(DEFAULT_RISK_POLICY.reconciliationMarginLamports)).toString(),maxNetworkFeeLamports:DEFAULT_RISK_POLICY.maxNetworkFeeLamports},records:ledger.list(agent.id).map(publicRecord)});
 }));
 app.post(base+'/quote',auth,safe(async(req,res)=>res.json(publicRecord(await engine.quote(req,req.body)))));
 app.post(base+'/:executionId/cancel',auth,safe(async(req,res)=>{if(Object.keys(req.body||{}).length)reject('UNEXPECTED_FIELD');res.json(publicRecord(await engine.cancel(req,req.params.executionId)));}));
 for(const action of ['prepare','confirm'])app.post(base+'/'+action,auth,safe(async(req,res)=>{authorize(req);reject('UNVERIFIED_ROUTE_ADAPTER');}));
 const controlledBase='/api/agents/:id/controlled-execution';
 db.exec('CREATE TABLE IF NOT EXISTS dex_controlled_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,execution_id TEXT NOT NULL,agent_id TEXT NOT NULL,event TEXT NOT NULL,created_at INTEGER NOT NULL)');
 const audit=(r,event)=>{if(!db.prepare('SELECT 1 FROM dex_controlled_audit WHERE execution_id=? AND event=?').get(r.id,event))db.prepare('INSERT INTO dex_controlled_audit(execution_id,agent_id,event,created_at) VALUES(?,?,?,?)').run(r.id,r.intent.agentId,event,now());};
 const exposed=formatControlledExecution;
 app.get(controlledBase,auth,safe(async(req,res)=>{
  const c=authorize(req),f=controlledFlags(),global=flags(),network=realMoney?await verifyNetwork():{networkConsistent:true},networkReady=network.networkConsistent===true;
  // Status polling reconciles only unsigned preparations. Signed/unknown
  // executions retain their reservation until chain reconciliation proves it safe.
  for(const record of ledger.list(c.agentId))if(['QUOTED','PREPARING','PREPARED'].includes(record.status)&&!record.signature&&!record.broadcastAttemptedAt){
   const next=await controlledEngine.expire(req,record.id);
   if(next.status==='EXPIRED')audit(next,'CONTROLLED_EXPIRED');
  }
  const prior=ledger.list(c.agentId),selected=prior.find(r=>r.status==='PREPARED')??prior[0]??null;
  let acceptanceEligible=false;try{assertFirstBuyAcceptance({direction:'BUY',inputMint:SOL_MINT,outputMint:CONTROLLED_USDC_MINT,inputAmount:'100000',slippageBps:100,pool:CONTROLLED_CPMM_POOL},c,{adapterKind:controlledAdapter.kind,history:ledger.acceptanceHistory(c.agentId)});acceptanceEligible=true;}catch{}
  const armed=oneShot?.status();
  let armEligibility={executionId:selected?.id??null,eligible:false,reason:selected?.status??'NO_EXECUTION'};
  if(selected?.status==='PREPARED'&&networkReady){
   try{assertFirstBuyAcceptance({...selected.intent,requestKey:selected.requestKey,pool:selected.pool},c,{adapterKind:controlledAdapter.kind,history:ledger.acceptanceHistory(c.agentId)});armEligibility=await controlledEngine.armEligibility(req,selected.id);}
   catch(e){armEligibility={executionId:selected.id,eligible:false,reason:e.code??'ARM_UNAVAILABLE'};}
  }
  res.json({mode:'CONTROLLED_REAL',enabled:networkReady&&f.controlledEnabled&&!f.realMoneyEmergencyStop&&f.liveEnabled===false&&(controlledAdapter.prepareEnabled===true||controlledAdapter.enabled===true),prepareEnabled:networkReady&&(controlledAdapter.prepareEnabled===true||controlledAdapter.enabled===true),acceptanceEligible,liveEnabled:f.liveEnabled,autonomousKillSwitch:f.killSwitch,realMoneyEmergencyStop:global.realMoneyEmergencyStop,adapter:'CPMM_CLASSIC_WSOL_USDC_V1',signingArmed:networkReady&&(controlledAdapter.enabled===true||armed?.status==='ARMED'),armedExecutionId:armed?.status==='ARMED'?armed.execution_id:null,currentExecutionId:selected?.id??null,armEligibility,records:prior.map(exposed)});
 }));
 // Read-only production path: no ledger write, capability, reservation or
 // custody dependency. It cannot become a prepared operation by replay.
 app.post(controlledBase+'/dry-run',auth,safe(async(req,res)=>{
  const c=authorize(req),body=req.body;requestTarget(c,body);if(!connection)reject('DRY_RUN_UNAVAILABLE');await verifyNetwork();
  if(!body||Object.keys(body).some(k=>!['direction','inputMint','outputMint','inputAmount','slippageBps','pool'].includes(k))||body.direction!=='BUY'||body.inputMint!==SOL_MINT||body.outputMint!==CONTROLLED_USDC_MINT||body.pool!==CONTROLLED_CPMM_POOL||body.inputAmount!=='100000'||!Number.isSafeInteger(body.slippageBps)||body.slippageBps<0||body.slippageBps>100)reject('DRY_RUN_POLICY_MISMATCH');
  assertFirstBuyAcceptance(body,c,{adapterKind:controlledAdapter.kind,history:ledger.acceptanceHistory(c.agentId)});
  const intent={mode:'CONTROLLED_REAL',network:'solana:mainnet',version:1,agentId:c.agentId,owner:c.owner,agentWallet:c.agentWallet,direction:body.direction,inputMint:body.inputMint,outputMint:body.outputMint,inputAmount:body.inputAmount,slippageBps:body.slippageBps,createdAt:now(),expiresAt:now()+10000};
  await controlledAdapter.assertCustody(intent);
  const p=await loadFreshCpmmPolicy(connection,intent,{now});
  const fee=(await connection.getFeeForMessage(VersionedTransaction.deserialize(Buffer.from(p.transaction,'base64')).message,'confirmed')).value;
  if(!Number.isSafeInteger(fee)||fee<0||fee>10000)reject('NETWORK_FEE_UNAVAILABLE');
  const snapshot={network:'solana:mainnet',agentWallet:c.agentWallet,inputMint:intent.inputMint,outputMint:intent.outputMint,mintsVerified:true,tokenAccountsVerified:true,routeAvailable:true,solBalanceLamports:p.policy.agentBalanceLamports,networkFeeLamports:String(fee),ataRentLamports:p.context.rentCost.toString(),ataExists:p.context.rentCost===0n,inputTokenBalance:'0',observedAt:now()};
  const risk=evaluateControlledRisk(intent,snapshot,DEFAULT_RISK_POLICY,now());
  const simulation=await simulateUnsignedCpmm(connection,p);if(!simulation.success)reject('UNSIGNED_SIMULATION_FAILED');
  res.json({readOnly:true,notPrepared:true,noSigner:true,noBroadcast:true,review:cpmmReview(p),risk:{allowed:risk.allowed,policyVersion:risk.policyVersion,reserveAfterLamports:risk.reserveAfterLamports},messageHash:p.validation.messageHash,lastValidBlockHeight:p.lastValidBlockHeight,reviewExpiresAt:intent.expiresAt,simulation});
 }));
 app.post(controlledBase+'/prepare',auth,safe(async(req,res)=>{
  const c=authorize(req);requestTarget(c,req.body);const f=controlledFlags();if(!f.controlledEnabled||f.liveEnabled!==false||f.realMoneyEmergencyStop!==false||(controlledAdapter.prepareEnabled!==true&&controlledAdapter.enabled!==true))reject('CONTROLLED_REAL_DISABLED');await verifyNetwork();
  if(!productionAdapter){assertFirstBuyAcceptance(req.body,c,{adapterKind:controlledAdapter.kind,history:ledger.acceptanceHistory(c.agentId)});await controlledAdapter.assertCustody(c);}
  const q=await controlledEngine.quote(req,req.body);let r;
  try{r=await controlledEngine.prepare(req,q.id);}catch(e){const latest=ledger.get(q.id);if(latest?.status==='REJECTED_BEFORE_SIGNING')audit(latest,'CONTROLLED_REJECTED');throw e;}
  if(r.status==='PREPARED'&&r.confirmationToken)audit(r,'CONTROLLED_PREPARED');
  res.json({...exposed(r),...(r.confirmationToken?{confirmationToken:r.confirmationToken}:{})});
 }));
 app.get(controlledBase+'/:executionId',auth,safe(async(req,res)=>{
  const before=ledger.get(req.params.executionId);if(!before)reject('EXECUTION_NOT_FOUND');
  let r=await controlledEngine.expire(req,req.params.executionId);if(r.status==='EXPIRED'&&before.status!=='EXPIRED')audit(r,'CONTROLLED_EXPIRED');
  if(['SIGNED','SUBMITTED','UNKNOWN'].includes(r.status)){r=await controlledEngine.reconcile(req,r.id);if(r.status==='CONFIRMED')audit(r,'CONTROLLED_CONFIRMED');}
  res.json(exposed(r));
 }));
 app.post(controlledBase+'/:executionId/arm',auth,safe(async(req,res)=>{
  const c=authorize(req);
  if(Object.keys(req.body||{}).length)reject('UNEXPECTED_FIELD');
  if(!oneShot||controlledAdapter.prepareEnabled!==true||controlledFlags().liveEnabled!==false)reject('ONE_SHOT_ARMING_UNAVAILABLE');
  const record=ledger.get(req.params.executionId);
  if(!record||record.intent.agentId!==c.agentId)reject('EXECUTION_OWNERSHIP_MISMATCH');
  assertTarget(record.intent);await verifyNetwork();assertTarget(record.intent);
  assertFirstBuyAcceptance({...record.intent,requestKey:record.requestKey,pool:record.pool},c,{adapterKind:controlledAdapter.kind,history:ledger.acceptanceHistory(c.agentId)});
  const armed=await controlledEngine.arm(req,record.id);
  res.json(armed);
 }));
 app.post(controlledBase+'/:executionId/confirm',auth,safe(async(req,res)=>{
  if(oneShot){const armed=oneShot.status();if(armed?.status!=='ARMED'||armed.execution_id!==req.params.executionId)reject('CPMM_EXECUTION_DISARMED');}
  else if(controlledAdapter.enabled!==true)reject('CPMM_EXECUTION_DISARMED');
  if(!req.body||Object.keys(req.body).some(k=>!['confirm','confirmationToken','messageHash','quoteReference'].includes(k)))reject('UNEXPECTED_FIELD');
  let r;try{r=await controlledEngine.confirm(req,req.params.executionId,req.body);}catch(e){const latest=ledger.get(req.params.executionId);if(latest?.status==='REJECTED_BEFORE_SIGNING')audit(latest,'CONTROLLED_REJECTED');else if(latest?.status==='EXPIRED')audit(latest,'CONTROLLED_EXPIRED');throw e;}
  res.json(exposed(r));
 }));
 app.post(controlledBase+'/:executionId/cancel',auth,safe(async(req,res)=>{
  if(Object.keys(req.body||{}).length)reject('UNEXPECTED_FIELD');const r=await controlledEngine.cancel(req,req.params.executionId);audit(r,'CONTROLLED_CANCELLED');res.json(exposed(r));
 }));
 return {ledger,directAdapter,controlledAdapter,oneShot,autonomousPort,autonomousScheduler:autonomousScheduler?{...autonomousScheduler,tick:async()=>{const live=await autonomousScheduler.tick();const oneShot=await acceptanceWorker.tick();return {live,oneShot};}}:null,acceptance,acceptanceWorker};
}
