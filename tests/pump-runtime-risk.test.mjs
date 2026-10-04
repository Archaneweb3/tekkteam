import test from 'node:test';import assert from 'node:assert/strict';
import {evaluatePumpRuntimeRisk} from '../server/dex/pump-runtime-risk.js';
import {DEFAULT_RISK_POLICY} from '../server/dex/intent.js';
const now=1800000000000,intent={side:'BUY',inputAmount:'1000000',slippageBps:100,expiresAt:now+10000};
const plan={source:'LOCAL_FIXTURE',observedAt:now,venueKind:'PUMPSWAP',feeCapLamports:'10000',rentCapLamports:'2000',balances:{native:'2032000',wsol:'1000000',token:'100'}};
test('asset-aware risk preserves default ceiling/protected native reserve without counting WSOL as native',()=>{const r=evaluatePumpRuntimeRisk(intent,plan,undefined,now);assert.equal(r.nativeDebit,'12000');assert.equal(r.nativeReserveAfter,'2020000');assert.equal(r.authorizationGranted,false);assert.throws(()=>evaluatePumpRuntimeRisk(intent,{...plan,venueKind:'PUMP_BONDING_CURVE'},undefined,now),/NATIVE_RESERVE/);});
for(const [name,i,p] of [['trade',{inputAmount:'1000001'},{}],['slippage',{slippageBps:101},{}],['fee',{}, {feeCapLamports:'10001'}],['native',{}, {balances:{...plan.balances,native:'2031999'}}],['WSOL',{}, {balances:{...plan.balances,wsol:'999999'}}],['stale',{}, {observedAt:now-10001}],['future',{}, {observedAt:now+1}]])test(`risk rejects ${name}`,()=>assert.throws(()=>evaluatePumpRuntimeRisk({...intent,...i},{...plan,...p},DEFAULT_RISK_POLICY,now)));
