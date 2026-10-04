import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DESTINATION_AGENTS_SQL,DESTINATION_SCHEMA_VERSION,destinationNetwork,projectAgentIdentity,projectPaperRecord,classifyMainnetProof,eligibleRealMoneyHistory,walletTransferEffect} from '../server/mainnet-migration-model.js';
import {NETWORKS} from '../src/networks.js';

const id='0f406135-35ea-437d-a27c-29052d279c3b';
const owner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
const wallet='7Bt9Q3EciD8ZhoRA6CviqwpLpGhn4tscPrsKfUqGfFVe';
const source={id,creator:owner,name:'lpad test',character:'robot',strategy:'Balanced',network:'devnet',status:'DRAFT',coin:{mint:'DEVNET_MINT'},launch:{signature:'DEVNET_SIGNATURE'},tradingWallet:wallet};

test('fresh destination v2 preserves identity and excludes Devnet mint material',()=>{
 const db=new DatabaseSync(':memory:');db.exec(DESTINATION_AGENTS_SQL);db.exec(`PRAGMA user_version=${DESTINATION_SCHEMA_VERSION}`);
 const projected=projectAgentIdentity(source,owner,{custodyAddress:wallet});
 db.prepare('INSERT INTO agents(id,owner,data,secret) VALUES(?,?,?,NULL)').run(projected.id,owner,JSON.stringify(projected));
 const stored=db.prepare('SELECT id,owner,data,secret FROM agents').get();
 assert.equal(destinationNetwork(),'MAINNET');assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
 assert.equal(stored.id,id);assert.equal(stored.owner,owner);assert.equal(stored.secret,null);
 assert.equal(JSON.parse(stored.data).tradingWallet,wallet);
 assert.equal(JSON.parse(stored.data).network,'mainnet');
 assert.equal(JSON.parse(stored.data).coin,null);assert.equal(JSON.parse(stored.data).launch,null);
 assert.equal(JSON.stringify(stored).includes('DEVNET_MINT'),false);
 assert.equal(JSON.stringify(stored).includes('DEVNET_SIGNATURE'),false);
 db.close();
});

test('custody association is exact; Paper remains Paper and paused',()=>{
 assert.throws(()=>projectAgentIdentity(source,'wrong',{custodyAddress:wallet}),/OWNER/);
 assert.throws(()=>projectAgentIdentity(source,owner,{custodyAddress:'wrong'}),/CUSTODY/);
 assert.deepEqual(projectPaperRecord({agentId:id,mode:'paper',enabled:true},{state:true}),{agentId:id,mode:'paper',enabled:false,migrationOrigin:'PAPER'});
 assert.throws(()=>projectPaperRecord({mode:'REAL'}),/NON_PAPER/);
});

test('only independent finalized Mainnet effects promote real history',()=>{
 const proof={signature:'sig',genesis:NETWORKS.MAINNET.genesis,status:{confirmationStatus:'finalized'},transaction:{signature:'sig',finality:'finalized',error:null},effectProven:true};
 assert.equal(classifyMainnetProof(proof),'MAINNET_PROVEN_SUCCESS');
 assert.equal(classifyMainnetProof({...proof,transaction:{...proof.transaction,error:'InstructionError'}}),'MAINNET_PROVEN_FAILURE');
 assert.equal(classifyMainnetProof({...proof,status:null,transaction:null}),'NOT_FOUND');
 assert.equal(classifyMainnetProof({...proof,transaction:null}),'INSUFFICIENT_EVIDENCE');
 assert.equal(classifyMainnetProof({...proof,genesis:'devnet'}),'INSUFFICIENT_EVIDENCE');
 assert.equal(classifyMainnetProof({...proof,effectProven:false}),'INSUFFICIENT_EVIDENCE');
 assert.equal(classifyMainnetProof({}),'INSUFFICIENT_EVIDENCE');
 for(const value of ['NOT_FOUND','INSUFFICIENT_EVIDENCE'])assert.equal(eligibleRealMoneyHistory(value),false);
 for(const value of ['MAINNET_PROVEN_SUCCESS','MAINNET_PROVEN_FAILURE'])assert.equal(eligibleRealMoneyHistory(value),true);
});

test('missing transaction cannot prove a wallet transfer or crash classification',()=>{
 const record={source:'source',destination:'destination',amountLamports:100,feeLamports:5000};
 assert.equal(walletTransferEffect(record,null),false);
 assert.equal(walletTransferEffect(record,undefined),false);
 const transaction={meta:{err:null,fee:5000,innerInstructions:[]},transaction:{message:{instructions:[
  {program:'system',parsed:{type:'transfer',info:{source:'source',destination:'destination',lamports:100}}}
 ]}}};
 assert.equal(walletTransferEffect(record,transaction),true);
 assert.equal(walletTransferEffect({...record,amountLamports:101},transaction),false);
});
