import {Keypair,PublicKey} from '@solana/web3.js';

const fail=()=>{throw Object.assign(Error('Confirmed launch provisioning requires reconciliation'),{code:'LAUNCH_PROVISIONING_CONFLICT'});};
// Called only by the verified-receipt reconciler, never by a client-supplied receipt.
// Uses the existing custody table, vault encryption and AAD; no funding or signing.
export function provisionLaunchAgent(store,receipt){
 const {db}=store;
 if(receipt?.confirmed!==true||receipt.status!=='Success'||receipt.network!=='solana:101'||!receipt.signature||!receipt.executionId||!Number.isSafeInteger(receipt.confirmedSlot)||receipt.pumpProvenance!=='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR')fail();
 for(const address of [receipt.owner,receipt.mint])try{new PublicKey(address);}catch{fail();}
 const binding={owner:receipt.owner,agentId:receipt.agentId,mint:receipt.mint,network:receipt.network,signature:receipt.signature,executionId:receipt.executionId};
 db.exec('BEGIN IMMEDIATE');
 let secret;
 try{
  db.exec('CREATE TABLE IF NOT EXISTS launch_agent_bindings(agent_id TEXT PRIMARY KEY,owner TEXT NOT NULL,network TEXT NOT NULL,mint TEXT NOT NULL,signature TEXT NOT NULL,execution_id TEXT NOT NULL UNIQUE,wallet TEXT NOT NULL,UNIQUE(network,mint),UNIQUE(network,signature))');
  const row=db.prepare('SELECT owner,data FROM agents WHERE id=?').get(binding.agentId);
  if(!row||row.owner!==binding.owner)fail();
  const agent=JSON.parse(row.data);
  if(agent.id!==binding.agentId||agent.creator!==binding.owner)fail();
  if(agent.launchWalletBinding&&JSON.stringify(agent.launchWalletBinding)!==JSON.stringify(binding))fail();
  let wallet=db.prepare('SELECT address,secret FROM agent_wallets WHERE agent_id=?').get(agent.id);
  if(wallet){
   secret=store.unseal(wallet.secret,'trading:'+agent.id);
   if(Keypair.fromSecretKey(secret).publicKey.toBase58()!==wallet.address||agent.tradingWallet&&agent.tradingWallet!==wallet.address)fail();
  }else{
   if(agent.tradingWallet)fail();
   const key=Keypair.generate();secret=key.secretKey;wallet={address:key.publicKey.toBase58()};
   db.prepare('INSERT INTO agent_wallets(agent_id,address,secret) VALUES(?,?,?)').run(agent.id,wallet.address,store.seal(secret,'trading:'+agent.id));
  }
  agent.tradingWallet=wallet.address;agent.launchWalletBinding=binding;
  const prior=db.prepare('SELECT * FROM launch_agent_bindings WHERE agent_id=?').get(agent.id);
  if(prior){if(prior.owner!==binding.owner||prior.network!==binding.network||prior.mint!==binding.mint||prior.signature!==binding.signature||prior.execution_id!==binding.executionId||prior.wallet!==wallet.address)fail();}
  else db.prepare('INSERT INTO launch_agent_bindings VALUES(?,?,?,?,?,?,?)').run(agent.id,binding.owner,binding.network,binding.mint,binding.signature,binding.executionId,wallet.address);
  db.prepare('UPDATE agents SET data=? WHERE id=? AND owner=?').run(JSON.stringify(agent),agent.id,binding.owner);
  db.exec('COMMIT');
  return {status:'READY',agentId:agent.id,wallet:wallet.address};
 }catch(error){db.exec('ROLLBACK');throw error;}finally{secret?.fill(0);}
}
