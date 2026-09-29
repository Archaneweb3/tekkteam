import test from 'node:test';
import assert from 'node:assert/strict';
import {walletSelectionStatus,walletFailureStatus} from '../public/app/wallet-choice-copy.js';

test('healthy wallet choices have no technical secondary copy',()=>{
 for(const name of ['Phantom','Solflare','MetaMask'])for(const status of ['Ready','Connect to verify Solana account']){
  assert.equal(walletSelectionStatus({name,selectable:true,status}), '');
 }
});

test('only actionable wallet states get concise secondary copy',()=>{
 assert.equal(walletSelectionStatus({selectable:false,capabilityState:'NOT_INSTALLED'}),'Not installed');
 assert.equal(walletSelectionStatus({selectable:false,capabilityState:'SOLANA_ACCOUNT_UNAVAILABLE'}),'Solana unavailable');
 assert.equal(walletSelectionStatus({selectable:false,capabilityState:'SOLANA_SIGNING_UNSUPPORTED'}),'Solana unavailable');
 assert.equal(walletFailureStatus({walletAuthCode:'WALLET_CONNECTION_REJECTED'}),'Connection cancelled');
 assert.equal(walletFailureStatus({walletAuthCode:'WALLET_CONNECTION_FAILED'}),'Couldn’t connect');
 assert.equal(walletFailureStatus({walletAuthCode:'BACKEND_UNAVAILABLE'}),'Temporarily unavailable');
});
