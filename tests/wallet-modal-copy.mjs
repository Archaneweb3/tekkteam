import {chromium} from 'playwright';
import {createServer} from '../server/app.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

const base=process.env.BASE_URL||'http://127.0.0.1:5188';
const dir=mkdtempSync(join(tmpdir(),'tekkwork-wallet-copy-'));
const service=createServer({dbPath:join(dir,'db.sqlite'),origins:[base],network:'local'});
const server=service.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const backend=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.addInitScript(()=>{
   const wallet=name=>({name,icon:'data:image/png;base64,AAAA',chains:['solana:mainnet'],accounts:[],features:{'standard:connect':{connect:()=>new Promise((resolve,reject)=>{if(name==='Solflare')window.rejectSolflare=reject;else window.resolveWallet=resolve;})},'solana:signMessage':{signMessage:async()=>[{signature:new Uint8Array(64)}]}}});
   window.addEventListener('wallet-standard:app-ready',event=>event.detail.register(wallet('Phantom'),wallet('Solflare'),wallet('MetaMask')));
  });
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:backend+url.pathname,headers:{...route.request().headers(),origin:base}});await route.fulfill({response});});
  await page.goto(base+'/#/agents/new');await page.locator('#tw-new-connect').click();
  const dialog=page.locator('.tw-connect-dialog');
  assert.equal(await dialog.locator('[data-wallet]').count(),3);
  assert.deepEqual(await dialog.locator('[data-wallet] strong').allTextContents(),['Phantom','Solflare','MetaMask']);
  assert.equal(await dialog.locator('[data-wallet] small:visible').count(),0);
  assert.equal(await dialog.locator('[data-wallet-probe]').count(),0);
  const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
  await dialog.locator('[data-wallet] strong').getByText('Solflare').click();
  await dialog.locator('[data-wallet] small:visible').getByText('Connecting...').waitFor();
  await page.evaluate(()=>window.rejectSolflare(Error('fixture provider error')));
  await dialog.locator('[data-wallet] small:visible').getByText('Couldn’t connect').waitFor();
  assert.equal(await dialog.locator('[data-wallet] small:visible').count(),1);
  assert.equal(await dialog.locator('[data-wallet="standard-0"]').isEnabled(),true);
  assert.equal(await dialog.locator('[data-wallet="standard-2"]').isEnabled(),true);
  assert.equal(await dialog.locator('.tw-connect-details').isVisible(),false);
  await page.close();
 }
 console.log('Wallet modal copy passed at 1440px and 390px.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));service.close();rmSync(dir,{recursive:true,force:true});}
