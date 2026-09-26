import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {publicConfig} from '../server/config.js';

// An isolated browser fixture; never touches the user's wallet or database.
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let status='SUBMITTED',checks=0;
  const agent=()=>({id:'confirmation-test',no:1,name:'Confirmation test',creator:'test-owner',createdAt:Date.now(),character:'frank',avatarSeed:'skin:frank',strategy:'balanced',status,coin:{name:'Test',ticker:'TEST'},launch:{mode:'wallet',failure:status==='FAILED'?'expired':undefined}});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let body;
    if(path==='/api/state')body={config:publicConfig('devnet'),session:{address:'test-owner'},agents:[agent()],events:[],coins:[],feed:[],tokens:[],bonded:[],stats:{}};
    else if(path.endsWith('/reconcile')) {checks++;return route.fulfill({status:202,json:{...agent(),confirmationCheckInProgress:true}});}
    else if(path==='/api/agents/confirmation-test')body=agent();
    else throw Error('Unexpected fixture request: '+path);
    await route.fulfill({json:body});
  });
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/agent/confirmation-test');
  await page.locator('#tw-reconcile').click();
  await page.locator('#tw-confirmation-status').waitFor();
  assert.match(await page.locator('#tw-confirmation-status').textContent(),/already running/);
  assert.equal(await page.locator('#tw-detail-error').textContent(),'');
  assert.equal(await page.locator('#tw-test-mint').count(),0);
  assert.equal(checks,1);
  status='FAILED';
  await page.locator('#tw-test-mint').waitFor({timeout:22000});
  assert.equal(await page.locator('#tw-reconcile').count(),0);
  console.log('Confirmation UI passed: 202 is neutral, no duplicate mint, verified expiry updates automatically.');
}finally{await browser.close();}
