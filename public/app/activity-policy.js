// One curated view shared by global API, Trading Desk and the optional phone.
export function meaningfulActivity(events){
 const ids=new Set(),last=new Map();return events.filter(e=>{
  if(['SIGNAL_DETECTED','POSITION_OPENED','POSITION_CLOSED'].includes(e.type))return false;
  if(ids.has(e.eventId))return false;if(e.eventId)ids.add(e.eventId);
  if(['SIGNAL_SKIPPED','RISK_REJECTED'].includes(e.type)){const key=JSON.stringify([e.agentId,e.tokenMint,e.type,e.reason,e.strategyConfigVersion]);const recent=last.get(key);if(recent!=null&&Math.abs(recent-e.timestamp)<300000)return false;last.set(key,e.timestamp);}
  return true;
 });
}
