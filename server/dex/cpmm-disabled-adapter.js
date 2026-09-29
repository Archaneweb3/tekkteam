import {buildCpmmEnvelope,CPMM_ENVELOPE} from './cpmm-envelope.js';
import {validateDexTransaction} from './transaction-validator.js';
import {reject} from './intent.js';

// Wired into the production dependency boundary, but intentionally offers NO
// execution build/snapshot/sign/send capability. Flags cannot unlock this stub.
// Proof inputs are internal verified state, never accepted by an HTTP endpoint.
export function createDisabledCpmmAdapter(){
 return Object.freeze({
  kind:CPMM_ENVELOPE,enabled:false,
  proveUnsigned(policy){if(policy.envelope!==CPMM_ENVELOPE)reject('UNSUPPORTED_EXECUTION_VENUE');const transaction=buildCpmmEnvelope(policy);return {transaction,validation:validateDexTransaction(transaction,policy)};},
  async build(){reject('CPMM_EXECUTION_DISABLED');},
  async snapshot(){reject('CPMM_EXECUTION_DISABLED');},
  async validationPolicy(){reject('CPMM_EXECUTION_DISABLED');},
 });
}
