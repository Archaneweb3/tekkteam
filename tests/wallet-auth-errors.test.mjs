import test from 'node:test';
import assert from 'node:assert/strict';
import {walletAuthError,walletAuthPresentation} from '../public/app/wallet-auth-errors.js';

test('wallet auth errors retain only safe stage and code',()=>{
 const cases=[
  ['PROVIDER_CONNECT',Object.assign(Error('User rejected request'),{code:4001}),'WALLET_CONNECTION_REJECTED'],
  ['SIGN_MESSAGE',Error('User cancelled'),'SIGNATURE_CANCELLED'],
  ['AUTH_CHALLENGE',Error('Unexpected error'),'AUTH_CHALLENGE_FAILED'],
  ['VERIFY',Error('Signature invalid'),'SIGNATURE_VERIFICATION_FAILED'],
  ['SESSION',Error('Missing cookie'),'SESSION_FAILED'],
  ['AUTH_CHALLENGE',TypeError('Failed to fetch'),'BACKEND_UNAVAILABLE'],
  ['VERIFY',Object.assign(Error('Service unavailable'),{httpStatus:503}),'BACKEND_UNAVAILABLE'],
 ];
 for(const [stage,error,code] of cases){const tagged=walletAuthError(stage,error),presented=walletAuthPresentation(tagged);assert.equal(tagged.walletAuthCode,code);assert.equal(tagged.walletAuthStage,stage);assert.match(presented.details,new RegExp(`Code: ${code} · Stage: ${stage}`));assert.doesNotMatch(JSON.stringify(presented),/Unexpected error|Missing cookie|Signature invalid|Failed to fetch/);}
 assert.match(walletAuthPresentation({walletAuthCode:'PROVIDER_CONFLICT',walletAuthStage:'PROVIDER_CONNECT'}).message,/Multiple wallet providers/);
 const phantom=walletAuthError('SIGN_MESSAGE',Error('Unexpected error'),{phantom:true,source:'WALLET_STANDARD',publicKey:'ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS',messageByteLength:88});
 assert.equal(phantom.walletAuthCode,'PHANTOM_SIGNING_ERROR');
 assert.match(walletAuthPresentation(phantom).details,/Provider source: WALLET_STANDARD/);
 assert.match(walletAuthPresentation(phantom).details,/Message bytes: 88/);
 assert.equal(walletAuthError('SIGN_MESSAGE',Error('Method not supported'),{phantom:true}).walletAuthCode,'SIGN_MESSAGE_UNSUPPORTED');
 assert.equal(walletAuthPresentation({walletAuthCode:'PROVIDER_MISMATCH',walletAuthStage:'SIGN_MESSAGE'}).title,'WALLET PROVIDER MISMATCH');
});
