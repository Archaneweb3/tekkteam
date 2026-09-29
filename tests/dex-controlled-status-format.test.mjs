import test from 'node:test';
import assert from 'node:assert/strict';
import {formatControlledExecution} from '../server/dex/controlled-status-format.js';

// Shape and key values from the persisted 7b09e6ea preparation, without its
// transaction bytes, capability secret, or live database dependency.
const mintData=Buffer.alloc(82);mintData[44]=6;
const prepared={
 id:'7b09e6ea-11b2-4a9f-b455-308e2ea6c7ba',requestKey:'fixture-request-key',status:'PREPARED',createdAt:1790510690230,preparedAt:1790510691868,
 intent:{agentId:'0f406135-35ea-437d-a27c-29052d279c3b',mode:'CONTROLLED_REAL',direction:'BUY',inputMint:'So11111111111111111111111111111111111111112',outputMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',inputAmount:'100000',slippageBps:100,expiresAt:1790510990230},
 quote:{estimatedOutput:'12342',minimumOutput:'12218',expiresAt:1790510715519,reference:'fixture-reference'},
 risk:{allowed:true},review:{ataRentLamports:'2976880',networkFeeLamports:'5000',reserveAfterLamports:'3908120'},
 validationPolicy:{envelope:'CPMM_NATIVE',intent:{direction:'BUY',inputAmount:'100000',slippageBps:100},agentBalanceLamports:'6995000',networkFeeCapLamports:'10000',snapshot:{accounts:[{address:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',data:mintData.toString('base64')}]}},
 pool:'7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny',snapshotSlot:450991715,
 messageHash:'2df2b53fdd6681da3c8463116c51f451a75415d2c08c03e1ef9d3d7e6f555e44',blockhash:'GAviD7tqebSHr6veQ8D9S7DBY37jhFiesbz23mpZNVLL',lastValidBlockHeight:429031565,
 capabilityHash:'fixture-hash',capabilityExpiresAt:1790510990230,
 reservation:{operationId:'dex:7b09e6ea-11b2-4a9f-b455-308e2ea6c7ba',status:'PREPARED',resources:[{lamports:'3086880'}]}
};

test('complete PREPARED status formats repeatedly from canonical persisted input without mutation',()=>{
 const record=structuredClone(prepared),before=JSON.stringify(record);
 for(let i=0;i<3;i++){
  const view=formatControlledExecution(record);
  assert.equal(view.status,'PREPARED');assert.equal(view.inputAmount,'100000');
  assert.equal(view.estimatedOutput,'12342');assert.equal(view.minimumOutput,'12218');assert.equal(view.usdcDecimals,6);
  assert.equal(view.review.estimatedOutput,'12342');assert.equal(view.review.minimumOutput,'12218');
  assert.equal(view.review.peakAvailableAfterLamports,'3908120');
  assert.equal(view.messageHash,record.messageHash);assert.equal(view.blockhash,record.blockhash);
  assert.equal(view.expiresAt,record.quote.expiresAt);
  assert.equal((BigInt(view.estimatedOutput)/1000000n)+'.'+String(BigInt(view.estimatedOutput)%1000000n).padStart(6,'0'),'0.012342');
  assert.equal(JSON.stringify(record),before);
 }
});

test('EXPIRED historical preparation remains terminal; formatting cannot revive or extend it',()=>{
 const record={...structuredClone(prepared),status:'EXPIRED',reason:'PREPARATION_EXPIRED',reservation:{...prepared.reservation,status:'EXPIRED'}};
 const before=JSON.stringify(record),view=formatControlledExecution(record);
 assert.equal(view.status,'EXPIRED');assert.equal(view.expiresAt,prepared.quote.expiresAt);
 assert.equal(view.review,null);
 assert.equal(JSON.stringify(record),before);
});
