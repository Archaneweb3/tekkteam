import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function bounds(selector) {
    const result=await page.locator(selector).evaluate(host=>{
      const canvas=host.querySelector('canvas'),h=host.getBoundingClientRect(),c=canvas.getBoundingClientRect();
      return {inside:c.left>=h.left-1&&c.top>=h.top-1&&c.right<=h.right+1&&c.bottom<=h.bottom+1,width:c.width,height:c.height,hostWidth:h.width,hostHeight:h.height};
    });
    assert.ok(result.inside,JSON.stringify(result));
    assert.ok(Math.abs(result.width-result.hostWidth)<2 && Math.abs(result.height-result.hostHeight)<2);
  }
  for(const width of [1886,1440,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('http://127.0.0.1:5188/#/launch');
    await page.locator('#tw-character-preview canvas').waitFor();
    for(const character of ['frank','cupsey','fomy','alon','satoshi','diamond']) {
      await page.locator(`.tw-character-options label:has(input[value="${character}"])`).click();
      await page.waitForTimeout(80);
      await bounds('#tw-character-preview');
      const canvas=page.locator('#tw-character-preview canvas');await canvas.click();
      const rect=await canvas.boundingBox();
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
      await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.6,{steps:5});await page.mouse.up();
      await bounds('#tw-character-preview');
    }
    await page.locator('#agent-name').fill('Felix test');
    assert.equal(await page.locator('#agent-name').inputValue(),'Felix test');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.goto('http://127.0.0.1:5188/#/skins');await page.locator('.tw-model canvas').first().waitFor();
    for(const id of ['frank','cupsey','fomy','alon','satoshi','diamond']) await bounds(`[data-model="${id}"]`);
  }
  assert.deepEqual(errors,[]);
  console.log('All six characters remain contained after selection, click and drag at five viewport sizes; gallery and form passed.');
} finally {await browser.close();}
