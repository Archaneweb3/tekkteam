// Passive public read model. No RPC, signing, scheduling or receipt mutation.
const uint=v=>{if(!/^(0|[1-9]\d*)$/.test(String(v)))throw Error('INVALID_ACCOUNTING');return BigInt(v);};
export function utcTradingWeek(now=Date.now()){
 const day=new Date(now);day.setUTCHours(0,0,0,0);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
 const start=day.getTime();return {start,end:start+7*86400000};
}
export function realLeaderboard({agents,publications,records,now=Date.now(),sort='roi'}){
 const week=utcTradingWeek(now),published=new Map(publications.filter(p=>p.enabled===true).map(p=>[p.agentId,p.owner]));
 const identities=new Map(agents.filter(a=>typeof a.creator==='string'&&published.has(a.id)&&published.get(a.id)===a.creator).map(a=>[a.id,a]));
 const cycles=new Map(),totals=new Map(),signatures=new Map(),invalid=new Set();
 const ordered=[...records].sort((a,b)=>(a.receipt?.slot??0)-(b.receipt?.slot??0)||String(a.id).localeCompare(String(b.id)));
 // Ordering inside the same slot is unavailable. A same-pair collision is excluded.
 const slots=new Set();
 for(const r of ordered){
  const i=r.intent??{},x=r.receipt??{},mint=i.direction==='BUY'?i.outputMint:i.inputMint;
  if(!identities.has(i.agentId))continue;
  const key=JSON.stringify([i.agentId,i.agentWallet,mint,i.network]);
  try{
   const a=identities.get(i.agentId),p=r.productionProvenance;
   if(i.owner!==a.creator||i.network!=='solana:mainnet'||x.finalized!==true||x.executionId!==r.id||x.signature!==r.signature||x.messageHash!==r.messageHash||JSON.stringify(x.intent)!==JSON.stringify(i)||!x.signature||!Number.isSafeInteger(x.slot)||x.slot<0)throw Error('UNQUALIFIED');
   if(signatures.has(x.signature)){invalid.add(signatures.get(x.signature));throw Error('DUPLICATE_SIGNATURE');}signatures.set(x.signature,key);
   // Atomic on-chain failure has no token effect. Fees remain in the expense
   // ledger, outside this closed-position ranking (never erase known basis).
   if(r.status==='FAILED'&&x.status==='FAILED'&&r.reason==='FINALIZED_ONCHAIN_ERROR')continue;
   if(r.status!=='CONFIRMED')throw Error('UNQUALIFIED');
   const slot=key+':'+x.slot;if(slots.has(slot))throw Error('INTRASLOT_ORDER_UNKNOWN');slots.add(slot);
   const qualified=i.mode==='LIVE_AUTONOMOUS'&&p?.environment==='PRODUCTION'&&p.origin==='https://tekkteam.tech'&&p.network===i.network&&p.classification==='USER_OPERATION';
   const input=uint(x.actualInput),output=uint(x.actualOutput),fee=uint(x.networkFeeLamports);
   if(input===0n||output===0n||input!==uint(i.inputAmount))throw Error('INVALID_ECONOMICS');
   let c=cycles.get(key);
   if(i.direction==='BUY'){
    if(c?.quantity>0n)throw Error('OVERLAPPING_POSITION');
    cycles.set(key,{agentId:i.agentId,quantity:output,cost:input+fee,proceeds:0n,qualified});
   }else if(i.direction==='SELL'){
    if(!c||input>c.quantity)throw Error('MISSING_BASIS');
    c.quantity-=input;c.proceeds+=output-fee;c.qualified&&=qualified;
    if(c.quantity===0n){
     if(c.qualified&&(!Number.isSafeInteger(x.chainBlockTime)||x.chainBlockTime<0))throw Error('CLOSE_TIME_UNAVAILABLE');
     const closed=x.chainBlockTime*1000;
     if(c.qualified&&closed>=week.start&&closed<week.end&&closed<=now){const t=totals.get(key)??{agentId:i.agentId,cost:0n,pnl:0n,closed:0,wins:0};const pnl=c.proceeds-c.cost;t.cost+=c.cost;t.pnl+=pnl;t.closed++;if(pnl>0n)t.wins++;totals.set(key,t);}
     cycles.delete(key);
    }
   }else throw Error('DIRECTION');
  }catch{invalid.add(key);}
 }
 const aggregate=new Map();
 for(const [key,t] of totals){if(invalid.has(key))continue;const sum=aggregate.get(t.agentId)??{cost:0n,pnl:0n,closed:0,wins:0};sum.cost+=t.cost;sum.pnl+=t.pnl;sum.closed+=t.closed;sum.wins+=t.wins;aggregate.set(t.agentId,sum);}
 const rows=[...aggregate].filter(([,t])=>t.cost>0n).map(([id,t])=>{const a=identities.get(id);return {agentId:id,name:a.name,character:a.character,strategy:a.strategy,realizedPnlLamports:String(t.pnl),entryCostLamports:String(t.cost),closedPositionCount:t.closed,winCount:t.wins,roiBps:String(t.pnl*10000n/t.cost)};});
 rows.sort((a,b)=>{const delta=sort==='sol'?BigInt(b.realizedPnlLamports)-BigInt(a.realizedPnlLamports):BigInt(b.realizedPnlLamports)*BigInt(a.entryCostLamports)-BigInt(a.realizedPnlLamports)*BigInt(b.entryCostLamports);return delta===0n?a.agentId.localeCompare(b.agentId):delta>0n?1:-1;});
 return {mode:'REAL',provenance:'FINALIZED_PRODUCTION_CLOSED_POSITIONS',sort:sort==='sol'?'sol':'roi',week:{startsAt:new Date(week.start).toISOString(),endsBefore:new Date(week.end).toISOString()},accounting:'NET_REALIZED_INCLUDING_NETWORK_FEES_EXCLUDING_ACCOUNT_RENT',agents:rows.map((r,i)=>({...r,rank:i+1})),authorizationGranted:false};
}
export function installRealLeaderboard(app,{db,auth,owned,now=Date.now}){
 db.exec('CREATE TABLE IF NOT EXISTS agent_publication(agent_id TEXT PRIMARY KEY,owner TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),updated_at INTEGER NOT NULL)');
 app.get('/api/leaderboard',(req,res)=>{
  if(req.query.sort&&!['roi','sol'].includes(req.query.sort))return res.status(400).json({error:'Choose ROI or SOL'});
  const agents=db.prepare('SELECT id,owner,data FROM agents').all().flatMap(r=>{const a=JSON.parse(r.data);return a.id===r.id&&a.creator===r.owner?[a]:[];});
  const publications=db.prepare('SELECT agent_id,owner,enabled FROM agent_publication').all().map(r=>({agentId:r.agent_id,owner:r.owner,enabled:r.enabled===1}));
  const records=db.prepare('SELECT e.data,r.data AS receipt FROM dex_executions e JOIN dex_receipts r ON r.execution_id=e.id').all().map(r=>({...JSON.parse(r.data),receipt:JSON.parse(r.receipt)}));
  res.set('Cache-Control','no-store').json(realLeaderboard({agents,publications,records,now:now(),sort:req.query.sort}));
 });
 app.get('/api/agents/:id/publication',auth,(req,res)=>{const {agent}=owned(req);const p=db.prepare('SELECT enabled FROM agent_publication WHERE agent_id=? AND owner=?').get(agent.id,req.session.address);res.json({enabled:p?.enabled===1});});
 app.post('/api/agents/:id/publication',auth,(req,res)=>{const {agent}=owned(req);if(typeof req.body.enabled!=='boolean'||Object.keys(req.body).some(k=>k!=='enabled'))return res.status(400).json({error:'Explicit publication choice required'});db.prepare('INSERT INTO agent_publication VALUES(?,?,?,?) ON CONFLICT(agent_id) DO UPDATE SET owner=excluded.owner,enabled=excluded.enabled,updated_at=excluded.updated_at').run(agent.id,req.session.address,Number(req.body.enabled),now());res.json({enabled:req.body.enabled});});
}
