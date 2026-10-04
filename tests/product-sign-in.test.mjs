import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderLaunchpadPage} from '../public/app/launchpad-page.js';
import {publicConfig} from '../server/config.js';
import {mobileWalletPresentation} from '../public/app/wallet-mobile.js';
import {selectorWalletRows} from '../public/app/wallet-selector.js';
import {createOwnerConnectFlow} from '../public/app/owner-connect-flow.js';

test('connected address changes only the guest CTA, never grants creation',()=>{
 for(const walletConnected of [false,true]){
  const html=renderLaunchpadPage({walletConnected,config:publicConfig('mainnet')});
  assert.match(html,walletConnected?/Sign In →/:/Connect Wallet →/);
  assert.doesNotMatch(html,/data-launchpad-create/);
 }
});

test('opening the chooser asks for no signature; failed explicit Sign In preserves connection and permits manual retry',async()=>{
 const source=readFileSync('public/app/workspace.js','utf8');
 const code=source.slice(source.indexOf('function openWallet('),source.indexOf('async function refresh()'));
 const address='11111111111111111111111111111111',connection={name:'Phantom',address};
 const effects={auth:0,providerConnect:0,disconnect:0,sessionRead:0,ownerClear:0,shell:0,render:0},messages=[];
 const serverState={config:publicConfig('mainnet'),session:null,agents:[],events:[],stats:{}};
 let dialog,auth,handler,task,rows;
 const button=()=>{
  const parts={small:{},strong:{textContent:'Sign In'},'.tw-wallet-choice-arrow':{}};
  const action={dataset:{},hidden:false,querySelector:s=>parts[s],focus(){},click(){task=handler({target:{closest:s=>s==='[data-wallet]'?action:null}});}};
  return action;
 };
 const createDialog=()=>{
  const status={},error={},details={hidden:true},detailText={},heading={nextElementSibling:{}},close={},list={append:b=>auth=b};
  rows=[{}];auth=undefined;
  const modal={dataset:{},isConnected:true,showModal(){},close(){this.onclose?.();},remove(){this.isConnected=false;},
   querySelector(s){return ({h2:heading,'.tw-close':close,'.tw-wallet-list':list,'[data-wallet-authenticate]':auth,'.tw-connect-progress':status,'.tw-error':error,'.tw-connect-details':details,'.tw-connect-details p':detailText})[s];},
   querySelectorAll(s){return s==='[data-wallet]'?[auth].filter(Boolean):s==='.tw-wallet-choice-wrap'?rows:[];},
   addEventListener(_,h){handler=h;}};
  dialog=modal;return modal;
 };
 const review=()=>{throw Error('Only the authentication adapter invokes this review');};
 const ctx={
  document:{querySelector:()=>null,activeElement:null,createElement:type=>type==='dialog'?createDialog():button(),body:{append(){}}},
  $:(s,d)=>d?.querySelector(s)??null,ownerSignInAvailable:()=>true,
  wallets:()=>[{id:'phantom',name:'Phantom',publicKey:address,selectable:true}],
  publicWalletPresentation:()=>connection,selectorWalletRows,createOwnerConnectFlow,
  icon:()=>'',esc:String,phantomSignProbeAvailable:()=>false,reviewOwnerAuthChallenge:review,
  request:async path=>{assert.equal(path,'/state');effects.sessionRead++;return serverState;},
  refresh:()=>{throw Error('A failed signature must not refresh owner access');},
  connectPublicWallet:()=>{effects.providerConnect++;throw Error('Manual Sign In retry must not reconnect');},
  connect:async(id,options)=>{effects.auth++;assert.equal(id,'phantom');assert.equal(options.connectedOwner,address);assert.strictEqual(options.reviewChallenge,review);throw Error('Authentication cancelled');},
  walletAuthPresentation:()=>({title:'Sign-in cancelled',message:'Try again.',details:''}),walletFailureStatus:()=>'',
  clearOwnerView(){effects.ownerClear++;},shell(){effects.shell++;},render(){effects.render++;},toast:message=>messages.push(message),
  disconnectPublicWallet:async()=>{effects.disconnect++;},disconnect:async()=>{effects.disconnect++;},
  mobileWalletPresentation,location:{href:'https://staging.tekkteam.tech/#/overview',origin:'https://staging.tekkteam.tech'},navigator:{userAgent:'Desktop test',maxTouchPoints:0}
 };
 vm.runInNewContext(code,ctx);
 ctx.openWallet();
 assert.match(dialog.innerHTML,/Load More Wallets/);assert.ok(auth);assert.equal(effects.auth,0);assert.equal(effects.sessionRead,0);
 dialog.close();
 ctx.openWallet({authenticate:true});await task;
 assert.equal(effects.auth,1);assert.equal(rows[0].hidden,true);assert.equal(dialog.isConnected,false);
 assert.equal(connection.address,address);assert.equal(serverState.session,null);assert.equal(effects.providerConnect,0);assert.equal(effects.disconnect,0);
 assert.equal(effects.ownerClear,1);assert.equal(effects.shell,1);assert.equal(effects.render,1);assert.match(messages[0],/Wallet connected\. Sign in required\. Try again\./);
 await Promise.resolve();assert.equal(effects.auth,1);
 // Reopening exposes the existing Sign In action; it remains idle until the user clicks it.
 ctx.openWallet();assert.ok(auth);assert.equal(auth.hidden,false);assert.equal(effects.auth,1);
 auth.click();await task;
 assert.equal(effects.auth,2);assert.equal(effects.sessionRead,2);assert.equal(effects.providerConnect,0);assert.equal(effects.disconnect,0);
 assert.equal(connection.address,address);assert.equal(serverState.session,null);assert.equal(messages.length,2);
});
