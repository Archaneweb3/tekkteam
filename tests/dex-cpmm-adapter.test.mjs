import test from 'node:test';import assert from 'node:assert/strict';
import {createDisabledCpmmAdapter} from '../server/dex/cpmm-disabled-adapter.js';
import {fixture} from './cpmm-envelope-fixture.mjs';
test('production CPMM boundary proves unsigned envelopes but cannot prepare/sign/send',async()=>{const a=createDisabledCpmmAdapter();for(const side of ['BUY','SELL'])assert.equal(a.proveUnsigned(fixture(side)).validation.status,'SUPPORTED_BY_VALIDATOR');assert.equal(a.enabled,false);assert.equal(a.sign,undefined);assert.equal(a.broadcast,undefined);for(const method of ['build','snapshot','validationPolicy'])await assert.rejects(a[method](),/CPMM_EXECUTION_DISABLED/);});
