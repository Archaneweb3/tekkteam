import { chromium } from 'playwright';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../server/app.js';
const base = process.env.BASE_URL || 'http://127.0.0.1:5188';
const dir = mkdtempSync(join(tmpdir(),'tekkwork-browser-'));
const service = createServer({ dbPath:join(dir,'db.sqlite'), origins:[base],network:'local' });
const server=service.app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
const backend=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844}}), key=Keypair.generate();
  await page.exposeFunction('testSignMessage',bytes=>Array.from(nacl.sign.detached(Uint8Array.from(bytes),key.secretKey)));
  await page.addInitScript(({owner})=>{
    window.phantom={solana:{connect:async()=>{},disconnect:async()=>{},publicKey:{toBase58:()=>owner},signMessage:async bytes=>({signature:Uint8Array.from(await window.testSignMessage(Array.from(bytes)))})}};
  },{owner:key.publicKey.toBase58()});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    const response=await route.fetch({url:backend+url.pathname,headers:{...route.request().headers(),origin:base}});
    await route.fulfill({response});
  });
  await page.goto(base+'/#/launch'); await page.locator('#agent-name').fill('Felix Browser Test');
  await page.locator('#token-name').fill('Workspace Token'); await page.locator('#token-ticker').fill('WORK');
  await page.locator('input[value="fomy"]').check({force:true});
  await page.locator('#tw-create button[type="submit"]').click();
  await page.locator('[data-wallet="phantom"]').click(); await page.locator('dialog').waitFor({state:'detached'});
  assert.equal(await page.locator('#agent-name').inputValue(),'Felix Browser Test');
  assert.equal(await page.locator('#tw-character-name').textContent(),'Otto Analyst');
  await page.locator('#tw-create button[type="submit"]').click(); await page.waitForURL('**/#/agent/**');
  await page.locator('.tw-detail h1').waitFor(); assert.equal(await page.locator('.tw-detail h1').textContent(),'Felix Browser Test');
  await page.locator('#tw-strategy').selectOption('selective'); await page.locator('#tw-save-strategy').click();
  await page.locator('#tw-toast').filter({hasText:'Strategy profile saved'}).waitFor();
  await page.reload(); await page.locator('#tw-strategy').waitFor(); assert.equal(await page.locator('#tw-strategy').inputValue(),'selective');
  await page.goto(base+'/#/agents'); await page.locator('.tw-agent').waitFor(); assert.equal(await page.locator('.tw-agent').count(),1);
  await page.locator('#tw-search').fill('does-not-exist'); await page.getByText('No matching agents.').waitFor();
  await page.locator('#tw-wallet').click(); await page.getByText('Make room for your first agent.').waitFor(); assert.equal(await page.locator('.tw-agent').count(),0);
  console.log('Authenticated browser flow passed: wallet signature, retained form, draft save, profile update, reload, search, logout.');
} finally {await browser.close();await new Promise(r=>server.close(r));service.close();rmSync(dir,{recursive:true,force:true});}
