// Scoped legacy upgrade; V2 is already nullable and requires no rebuild.
export function ensureIdentitySchema(db){
 const columns=db.prepare('PRAGMA table_info(agents)').all();
 if(!columns.find(c=>c.name==='secret')?.notnull)return;
 if(columns.map(c=>c.name).join(',')!=='no,id,owner,data,secret')throw Error('Unsupported legacy Agent schema; explicit migration required');
 const objects=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='agents' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
 const sequence=db.prepare("SELECT seq FROM sqlite_sequence WHERE name='agents'").get()?.seq??0;
 const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
 db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
 try{
  db.exec('CREATE TABLE agents_identity_v2(no INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,secret TEXT NULL); INSERT INTO agents_identity_v2 SELECT no,id,owner,data,secret FROM agents; DROP TABLE agents; ALTER TABLE agents_identity_v2 RENAME TO agents;');
  for(const object of objects)db.exec(object.sql);
  db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='agents'").run(sequence);
  if(!db.prepare("SELECT 1 FROM sqlite_sequence WHERE name='agents'").get())db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES('agents',?)").run(sequence);
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Agent schema integrity violation');
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.exec(`PRAGMA foreign_keys=${foreignKeys?'ON':'OFF'}`);}
}
