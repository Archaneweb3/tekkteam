import {assertAssociatedCoinRealTarget} from '../server/associated-coin-real-policy.js';
import {installLaunchpadScopeLedger} from '../server/launchpad-scope.js';

// Explicit local fixture authority, with Agent fixed independently of intent.
export const fixtureGeneralTarget=agent=>intent=>assertAssociatedCoinRealTarget({agent,scope:{available:true,scoped:false,reason:null},intent});

// HTTP fixtures exercise the actual initialized ledger (General row absence).
export function fixtureGeneralScope(db,agents){
 db.exec('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,owner TEXT,data TEXT);');
 for(const agent of agents){
  const prior=db.prepare('SELECT data FROM agents WHERE id=?').get(agent.id);
  db.prepare('INSERT OR REPLACE INTO agents(id,owner,data) VALUES(?,?,?)').run(agent.id,agent.creator,JSON.stringify({...prior?JSON.parse(prior.data):{},...agent}));
 }
 return installLaunchpadScopeLedger(db,{now:()=>1000}).readLaunchpadScope;
}
