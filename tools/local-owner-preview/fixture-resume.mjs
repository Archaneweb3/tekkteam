import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {readReceiptJournal} from '../../server/launch-receipt-journal.js';

export function validateFixtureResume(directory,ports){
 const dir=path.resolve(directory),parent=fs.realpathSync(tmpdir());
 if(!/^tekkteam-owner-fixture-[a-zA-Z0-9]+$/.test(path.basename(dir))||fs.realpathSync(path.dirname(dir))!==parent||fs.lstatSync(dir).isSymbolicLink()||!fs.lstatSync(dir).isDirectory())throw Error('FIXTURE_RESUME_PATH_DENIED');
 if(!fs.existsSync(path.join(dir,'vault.key')))throw Error('FIXTURE_RESUME_VAULT_KEY_UNAVAILABLE');
 for(const name of ['fixture.sqlite','browser-session.json','pump-agent-launches.json','vault.key']){
  const stat=fs.lstatSync(path.join(dir,name));if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('FIXTURE_RESUME_FILE_DENIED');
 }
 readReceiptJournal(path.join(dir,'pump-agent-launches.json'));
 const descriptor=JSON.parse(fs.readFileSync(path.join(dir,'browser-session.json'),'utf8'));
 if(descriptor.origin!==`http://127.0.0.1:${ports.frontend}`||descriptor.dataSource!=='LOCAL_FIXTURE'||descriptor.realWalletAuthenticated!==false||descriptor.backgroundJobs!==false||!Array.isArray(descriptor.cookies))throw Error('FIXTURE_RESUME_PROVENANCE_DENIED');
 const db=new DatabaseSync(path.join(dir,'fixture.sqlite'),{readOnly:true});
 try{
  // Fixture custody is out of scope even with a persisted development fixture key.
  if(db.prepare('SELECT count(*) n FROM agents WHERE secret IS NOT NULL').get().n||db.prepare('SELECT count(*) n FROM agent_wallets').get().n||db.prepare('SELECT count(*) n FROM submissions').get().n)throw Error('FIXTURE_RESUME_CUSTODY_KEY_UNAVAILABLE');
 }finally{db.close();}
 return dir;
}
