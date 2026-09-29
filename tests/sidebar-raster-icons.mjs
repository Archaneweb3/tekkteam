import {chromium} from 'playwright';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const names=['home','agents','tokens','characters-robot','trading','leaderboard','payroll','guide'];
for(const name of names){const meta=await sharp(`public/assets/nav-icons/${name}.webp`).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);assert.equal(meta.channels,4);}
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:5188')+'/#/overview');
  if(width===390)await page.getByRole('button',{name:'Open navigation'}).click();
  const nav=page.locator('.tw-header nav');await nav.locator('img.tw-sidebar-icon').first().waitFor();
  assert.equal(await nav.locator('img.tw-sidebar-icon').count(),8);
  assert.equal(await nav.locator('svg').count(),0,'Navigation contains no SVG icons');
  const images=await nav.locator('img.tw-sidebar-icon').evaluateAll(els=>els.map(el=>({loaded:el.complete&&el.naturalWidth>0,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  assert.ok(images.every(image=>image.loaded&&image.width===27&&image.height===27),`Icons load at shared sidebar size: ${JSON.stringify(images)}`);
  await page.screenshot({path:join(tmpdir(),`tekkwork-sidebar-2d-icons-${width}.png`),fullPage:true});
  await page.locator('.tw-header').screenshot({path:join(tmpdir(),`tekkwork-sidebar-2d-icons-${width}-rail.png`)});
  await page.close();
 }
}finally{await browser.close();}
console.log('Eight transparent raster navigation icons render at 27px on desktop and mobile.');
