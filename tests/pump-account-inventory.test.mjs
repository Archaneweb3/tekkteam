import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpAccountFixture,pumpWalletFixture,encoded} from './pump-account-fixture.mjs';
import {PublicKey} from '@solana/web3.js';
import {AccountLayout,TOKEN_PROGRAM_ID,NATIVE_MINT} from '@solana/spl-token';
import {curveProgram,swapProgram,pumpSdk,swapSdk,BN} from '../server/dex/pump-sdk-boundary.js';
import {decodePumpVenueBundle,decodedPumpState} from '../server/dex/pump-account-decoder.js';
import {buildOfflinePumpInstruction} from '../server/dex/pump-offline-instruction.js';
import {inspectOfflinePumpAccountInventory} from '../server/dex/pump-account-inventory.js';
const now=1800000000000,executionWallet='1111111QLbz7JHiBTspS962RLKV8GndWFwiEaqKM';
async function fixture(migrated=false,side='BUY'){
 const bundle=await pumpAccountFixture({migrated});bundle.context.observedAt=now;
 const venue=decodePumpVenueBundle(bundle),intent={agentId:venue.agentId,owner:venue.owner,network:'solana:101',side,inputMint:side==='BUY'?venue.quoteMint:venue.mint,outputMint:side==='BUY'?venue.mint:venue.quoteMint,inputAmount:side==='BUY'?'100000000':'1000000000',slippageBps:100,expiresAt:now+10000};
 const options={venue,intent,executionWallet,walletAccounts:pumpWalletFixture(venue,executionWallet),networkFeeLamports:'5000',now};
 const built=await buildOfflinePumpInstruction(options),keys=new Set(built.instruction.keys.map(k=>k.pubkey.toBase58()));
 options.instructionAccounts=[...Object.values(bundle.accounts),...Object.values(options.walletAccounts)].filter(a=>keys.has(a.address));
 options.instructionAccounts=[...new Map(options.instructionAccounts.map(a=>[a.address,a])).values()];return options;
}
for(const migrated of [false,true])for(const side of ['BUY','SELL'])test(`instruction inventory ${migrated} ${side} never assumes absent PDA readiness`,async()=>{
 const x=await fixture(migrated,side),r=await inspectOfflinePumpAccountInventory(x);
 assert.equal(r.executable,false);assert.equal(r.authorizationGranted,false);assert.equal(r.allAccountsQualified,false);
 assert(r.rows.some(a=>a.status==='VERIFIED_LOCAL_LAYOUT'));assert(r.rows.some(a=>a.status==='MISSING_REQUIRES_READ'));
 assert(r.rows.find(a=>a.role==='user').isSigner);assert(r.rows.find(a=>a.role==='user').isWritable);
 assert.equal(decodedPumpState(x.venue).context.slot,100);
});
test('explicit missing ATA reports provisioning requirement without creating it',async()=>{const x=await fixture();const built=await buildOfflinePumpInstruction(x),address=built.accountRoles.find(a=>a.role==='associatedBondingCurve').address;x.instructionAccounts.push({address,slot:100,exists:false});const r=await inspectOfflinePumpAccountInventory(x);assert.equal(r.rows.find(a=>a.address===address).status,'MISSING_REQUIRES_PROVISIONING');});
test('unqualified auxiliary owner/layout stays unsupported',async()=>{const x=await fixture();const built=await buildOfflinePumpInstruction(x),address=built.accountRoles.find(a=>a.role==='creatorVault').address;x.instructionAccounts.push({address,slot:100,exists:true,owner:executionWallet,executable:false,data:Buffer.alloc(0)});const r=await inspectOfflinePumpAccountInventory(x);assert.equal(r.rows.find(a=>a.address===address).status,'UNSUPPORTED_LAYOUT');});
for(const [name,mutate]of [
 ['duplicate',x=>x.instructionAccounts.push(x.instructionAccounts[0])],
 ['wrong slot',x=>x.instructionAccounts[0].slot++],
 ['wrong owner',x=>x.instructionAccounts[0].owner=executionWallet],
 ['wrong layout',x=>x.instructionAccounts[0].data=Buffer.from([1])],
 ['wrong executable',x=>x.instructionAccounts[0].executable=true],
 ['unrelated account',x=>x.instructionAccounts.push({address:'So11111111111111111111111111111111111111112',slot:100,exists:false})],
])test(`inventory rejects ${name}`,async()=>{const x=await fixture();mutate(x);await assert.rejects(inspectOfflinePumpAccountInventory(x));});
test('proof snapshot cannot mutate during asynchronous ABI construction',async()=>{const x=await fixture();const pending=inspectOfflinePumpAccountInventory(x);x.intent.side='SELL';x.walletAccounts.base.data.fill(0);x.instructionAccounts[0].data.fill(0);const r=await pending;assert.equal(r.executable,false);assert(r.rows.some(a=>a.status==='VERIFIED_LOCAL_LAYOUT'));});
for(const role of ['mint','curve','wallet','base'])test(`same-slot ${role} cannot be both present and absent`,async()=>{const x=await fixture(),state=decodedPumpState(x.venue),address=state.copied[role]?.address??x.walletAccounts[role].address;const index=x.instructionAccounts.findIndex(a=>a.address===address);x.instructionAccounts[index]={...x.instructionAccounts[index],exists:false};await assert.rejects(inspectOfflinePumpAccountInventory(x),/PROOF_MISMATCH/);});
test('same-slot migrated pool cannot be both present and absent',async()=>{const x=await fixture(true);x.instructionAccounts.find(a=>a.address===x.venue.venue).exists=false;await assert.rejects(inspectOfflinePumpAccountInventory(x),/PROOF_MISMATCH/);});
async function auxiliary(migrated,role){
 const x=await fixture(migrated),built=await buildOfflinePumpInstruction(x),roles=new Map(built.accountRoles.map(a=>[a.role,a.address]));let data,owner,lamports=2039280;
 if(role.endsWith('VolumeAccumulator')){
  const program=migrated?swapProgram:curveProgram;owner=(migrated?swapSdk.PUMP_AMM_PROGRAM_ID:pumpSdk.PUMP_PROGRAM_ID).toBase58();
  data=await encoded(program,role,role==='userVolumeAccumulator'?{user:new PublicKey(executionWallet)}:{startTime:new BN(1),endTime:new BN(2),secondsInADay:new BN(86400)});
 }else{
  const state=decodedPumpState(x.venue),native=migrated,mint=native?NATIVE_MINT:state.mint;
  const authority=new PublicKey(roles.get(role==='associatedBondingCurve'?'bondingCurve':role==='protocolFeeRecipientTokenAccount'?'protocolFeeRecipient':role==='coinCreatorVaultAta'?'coinCreatorVaultAuthority':'remaining1'));
  owner=(native?TOKEN_PROGRAM_ID:state.tokenProgram).toBase58();data=Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({mint,owner:authority,amount:1000n,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:native?1:0,isNative:native?2039280n:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);if(native)lamports+=1000;
 }
 const raw={address:roles.get(role),owner,data,lamports,slot:100,exists:true,executable:false};x.instructionAccounts.push(raw);return {x,raw};
}
for(const migrated of [false,true])for(const role of ['globalVolumeAccumulator','userVolumeAccumulator'])test(`pinned ${migrated} ${role} auxiliary layout`,async()=>{const {x}=await auxiliary(migrated,role);const r=await inspectOfflinePumpAccountInventory(x);assert.equal(r.rows.find(a=>a.role===role).status,'VERIFIED_LOCAL_LAYOUT');assert.equal(r.executable,false);});
for(const [migrated,role]of [[false,'associatedBondingCurve'],[true,'protocolFeeRecipientTokenAccount'],[true,'coinCreatorVaultAta'],[true,'remaining2']])test(`canonical auxiliary token ${role}`,async()=>{const {x}=await auxiliary(migrated,role);const r=await inspectOfflinePumpAccountInventory(x);assert.equal(r.rows.find(a=>a.role===role).status,'VERIFIED_LOCAL_LAYOUT');});
for(const [name,change]of [['owner',a=>a.owner=executionWallet],['user',a=>a.data.fill(0,8,40)],['discriminator',a=>a.data[0]^=1],['trailing bytes',a=>a.data=Buffer.concat([a.data,Buffer.from([0])])]])test(`volume rejects ${name}`,async()=>{const {x,raw}=await auxiliary(true,'userVolumeAccumulator');change(raw);await assert.rejects(inspectOfflinePumpAccountInventory(x));});
for(const [name,change]of [['authority',a=>a.data.fill(0,32,64)],['mint',a=>a.data.fill(0,0,32)],['freeze',a=>a.data[108]=2],['delegate',a=>a.data.writeUInt32LE(1,72)],['close',a=>a.data.writeUInt32LE(1,129)],['program',a=>a.owner=executionWallet],['WSOL sync',a=>a.lamports++],['unsafe lamports',a=>a.lamports=Number.MAX_SAFE_INTEGER+1]])test(`auxiliary destination rejects ${name}`,async()=>{const {x,raw}=await auxiliary(true,'coinCreatorVaultAta');change(raw);await assert.rejects(inspectOfflinePumpAccountInventory(x));});
