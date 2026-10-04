import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Use the SDK's documented CJS entry: its ESM transitive BN export fails on Node22.
// No Online SDK, wallet, provider connection, network or signing is constructed.
const require=createRequire(import.meta.url);
export const pumpSdk=require('@pump-fun/pump-sdk');
export const swapSdk=require('@pump-fun/pump-swap-sdk');
export const BN=require('bn.js');
function version(name,expected){
 const pkg=JSON.parse(readFileSync(resolve(dirname(require.resolve(name)),'../package.json'),'utf8'));
 if(pkg.version!==expected)throw Error('PUMP_SDK_VERSION_MISMATCH');return pkg.version;
}
export const sdkPin=Object.freeze({curve:version('@pump-fun/pump-sdk','2.0.0'),swap:version('@pump-fun/pump-swap-sdk','1.20.0'),curveIdlSha256:createHash('sha256').update(JSON.stringify(pumpSdk.pumpIdl)).digest('hex'),swapIdlSha256:createHash('sha256').update(JSON.stringify(swapSdk.pumpAmmJson)).digest('hex')});
export const curveProgram=pumpSdk.getPumpProgram(null);
export const swapProgram=swapSdk.OFFLINE_PUMP_AMM_PROGRAM;
export const rejectPump=code=>{throw Object.assign(Error(code),{code});};
