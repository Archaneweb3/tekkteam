import test from 'node:test';import assert from 'node:assert/strict';
test('wallet test client denies all transaction entrypoints before provider or fetch access',async()=>{
 const old=globalThis.window;globalThis.window={TekkworkWalletTestOnly:true,addEventListener(){},dispatchEvent(){}};
 const oldEvent=globalThis.CustomEvent;globalThis.CustomEvent=class {};
 try{
  const api=await import('../public/app/backend.js?wallet-test-locks');
  assert.throws(()=>api.launchWallet('owner'),/Transactions are disabled/);
  for(const fn of ['signTestTransaction','signFundingTransaction','sendTestTransaction'])await assert.rejects(api[fn](),/Transactions are disabled/);
 }finally{globalThis.window=old;globalThis.CustomEvent=oldEvent;}
});
