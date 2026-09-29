import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceFailureLabel} from '../public/app/autonomous-acceptance-error.js';

test('historical raw RPC -32016 is explained without displaying a bare internal number',()=>{
 for(const code of [-32016,'-32016','RPC_MIN_CONTEXT_SLOT_NOT_REACHED']){
  const label=acceptanceFailureLabel(code);
  assert.match(label,/Mainnet RPC.*pool snapshot slot/);
  assert.match(label,/before signing/);
  assert.doesNotMatch(label,/-32016/);
 }
 assert.match(acceptanceFailureLabel(-32099),/Mainnet RPC rejected a state read/);
 assert.match(acceptanceFailureLabel(-32016,{status:'UNKNOWN',signature:'existing-signature'}),/Do not retry/);
 assert.doesNotMatch(acceptanceFailureLabel(-32016,{status:'UNKNOWN',signature:'existing-signature'}),/no transaction was sent/);
});
