// DERIVED LOCAL_FIXTURE only. Explicitly build synthetic RPC atomic arrays.
// Never used by runtime or presented as Mainnet evidence.
import {Transaction} from '@solana/web3.js';
export function fixtureAtomicBalances(bytes,structure,before,simulation,fee=10000){
 const keys=Transaction.from(bytes).compileMessage().accountKeys.map(k=>k.toBase58());
 simulation.value.preBalances=keys.map(key=>before.value[structure.accounts.findIndex(a=>a.address===key)]?.lamports??0);
 simulation.value.postBalances=keys.map(key=>simulation.value.accounts[structure.accounts.findIndex(a=>a.address===key)]?.lamports??0);
 simulation.value.fee=fee;simulation.value.loadedAddresses={readonly:[],writable:[]};
}
