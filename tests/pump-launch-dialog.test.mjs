import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('shared launch dialog only mounts inspect flow, closes cleanly and drops stale errors',async()=>{
 const source=readFileSync('public/app/pump-launch-dialog.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 let mounted=0,closed=0,current=true,dialog;const button={},panel={textContent:''};
 const page={isConnected:true,querySelector:()=>dialog?.isConnected?dialog:null,append:d=>{dialog=d;d.isConnected=true;}};
 const context={launchWallet:()=>{},preparationWallet:()=>{},m4LaunchWallet:()=>{},document:{createElement:()=>({open:false,isConnected:false,querySelector:s=>s==='[data-launch-close]'?button:panel,showModal(){this.open=true;},close(){this.open=false;this.onclose();},remove(){this.isConnected=false;}})}};
 vm.runInNewContext(source,context);
 await context.openPumpLaunchDialog(page,{agent:{id:'a'},isCurrent:()=>current,onClose:()=>closed++,mount:async(host,options)=>{mounted++;assert.equal(host,panel);assert.equal(options.agent.id,'a');assert.equal(options.isCurrent(),true);assert.equal(options.getWallet,context.launchWallet);assert.equal(options.getM4Wallet,context.m4LaunchWallet);}});
 assert.equal(mounted,1);assert.equal(await context.openPumpLaunchDialog(page),null);button.onclick();assert.equal(closed,1);assert.equal(dialog.isConnected,false);
 await context.openPumpLaunchDialog(page,{isCurrent:()=>current,mount:async()=>{current=false;throw Error('late');}});assert.equal(panel.textContent,'');
});
test('bundled launch consumes injected canonical signer, never creates a second backend provider registry',()=>{
 const source=readFileSync('src/pump-launch-ui.js','utf8');assert.doesNotMatch(source,/import.*backend|provider\.connect|provider\.signAndSendTransaction|window\.phantom/);
 assert.match(source,/getWallet\(owner\)/);assert.match(source,/verifyLaunchTransaction\(serialized,prepared\.evidence,true\)/);
 const workspace=readFileSync('public/app/workspace.js','utf8');assert.match(workspace,/getWallet:launchWallet/);assert.match(workspace,/openPumpLaunchDialog/);
});
