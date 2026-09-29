import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
mkdirSync('artifacts/liquid-material',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{if(r.request().method()!=='GET'){writes.push(r.request().url());return r.abort();}return r.continue();});
 await page.goto('http://127.0.0.1:5188/#/overview');
 const button=page.locator('.glass-hero-actions .primary');await button.waitFor();await page.waitForTimeout(1800);
 assert.equal(await page.locator('.liquid-control').count(),12);
 const box=await button.boundingBox(),xs=[];
 for(const [name,f]of [['left',.08],['center',.5],['right',.92]]){await page.mouse.move(box.x+box.width*f,box.y+box.height/2);await page.waitForFunction(f=>Math.abs(parseFloat(document.querySelector('.glass-hero-actions .primary').style.getPropertyValue('--pointer-x'))-f*100)<3,f);xs.push(await button.evaluate(el=>parseFloat(el.style.getPropertyValue('--pointer-x'))));await page.screenshot({path:`artifacts/liquid-material/${name}.png`});}
 assert.ok(xs[0]<15&&xs[1]>45&&xs[1]<55&&xs[2]>85);
 await page.mouse.down();await page.waitForFunction(()=>+document.querySelector('.glass-hero-actions .primary').style.getPropertyValue('--material-press')>.7);await page.screenshot({path:'artifacts/liquid-material/pressed.png'});await page.mouse.move(0,0);await page.mouse.up();
 const plate=page.locator('.liquid-active-plate'),before=await plate.evaluate(el=>el.style.transform);
 await page.locator('.tw-header nav a[data-nav="agents"]').click();await page.waitForTimeout(100);await page.screenshot({path:'artifacts/liquid-material/nav-transition.png'});await page.waitForTimeout(650);assert.notEqual(await plate.evaluate(el=>el.style.transform),before);
 await page.locator('.tw-header nav a[data-nav="overview"]').click();await button.waitFor();assert.equal(await page.locator('.liquid-active-plate').count(),1);
 await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(400,340);await page.waitForTimeout(250);assert.equal(await button.evaluate(el=>getComputedStyle(el).transform),'none');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: 1440 pointer tracking, press, shared navigation plate, remount, reduced motion, no API writes/errors.');
}finally{await browser.close();}
