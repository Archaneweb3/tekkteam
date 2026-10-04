import test from 'node:test';import assert from 'node:assert/strict';import {mobileWalletBrowse,mobileWalletPresentation,renderMobileWalletChoice} from '../public/app/wallet-mobile.js';
test('browse links carry only current public origin and public route, never auth context',()=>{const href='https://tekkteam.example/private?session=PRIVATE#/agent/OWNER_ID';for(const name of ['Phantom','Solflare','MetaMask']){const url=mobileWalletBrowse(name,href);assert.ok(url);assert.doesNotMatch(url,/PRIVATE|session|OWNER_ID|private/);assert.ok(decodeURIComponent(url).includes('tekkteam.example'));}assert.match(mobileWalletBrowse('Phantom',href),/^https:\/\/phantom.com\/ul\/browse\//);assert.match(mobileWalletBrowse('Solflare',href),/^https:\/\/solflare.com\/ul\/v1\/browse\//);assert.equal(mobileWalletBrowse('MetaMask',href),'https://link.metamask.io/dapp/tekkteam.example/');});
test('local/invalid origin has no app link; installed provider uses existing adapter',()=>{for(const href of ['http://127.0.0.1:5199/','https://localhost/','https://localhost./','https://app.local./','https://app.internal./','https://192.168.1.4/','https://[::1]/','https://app.local/','https://user:pass@tekkteam.example/','javascript:alert(1)'])assert.equal(mobileWalletBrowse('Phantom',href),null);assert.equal(mobileWalletBrowse('Unknown','https://tekkteam.example'),null);const p={name:'Phantom',href:'https://tekkteam.example',userAgent:'iPhone Safari'};assert.ok(mobileWalletPresentation(p).url);assert.equal(mobileWalletPresentation({...p,selectable:true}),null);assert.equal(mobileWalletPresentation({...p,userAgent:'Desktop Chrome'}),null);assert.equal(mobileWalletPresentation({...p,href:'http://127.0.0.1:5199/'}).url,null);});

test('mobile browse preserves only public route, with one primary wallet-app action',()=>{
 for(const name of ['Phantom','Solflare'])for(const userAgent of ['Android Chrome','iPhone Safari','iPad']){
  const mobile=mobileWalletPresentation({name,userAgent,href:'https://tekkteam.example/?token=PRIVATE#/wallet'});
  assert.equal(new URL(decodeURIComponent(mobile.url.split('/browse/')[1].split('?ref=')[0])).hash,'#/wallet');
  const markup=renderMobileWalletChoice({name},mobile,'<svg></svg>',String);
  assert.match(markup,/<a class="tw-wallet-choice tw-mobile-wallet-choice"/);
  assert.match(markup,new RegExp('Open in '+name));assert.doesNotMatch(markup,/data-wallet=|not installed|GET ↗|PRIVATE/);
 }
 assert.ok(mobileWalletPresentation({name:'Phantom',href:'https://tekkteam.example',userAgent:'Macintosh',touchPoints:5}));
 const blocked=mobileWalletPresentation({name:'Phantom',href:'http://127.0.0.1:5199',userAgent:'Android'});
 assert.match(renderMobileWalletChoice({name:'Phantom'},blocked,'',String),/disabled/);
 assert.match(blocked.note,/HTTPS/);assert.doesNotMatch(blocked.note,/install.*extension/i);
});
