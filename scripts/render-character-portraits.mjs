// Reproducible canonical WebGL render. Run with the development server available.
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import assert from 'node:assert/strict';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:600,height:600},deviceScaleFactor:1});
 await page.goto(process.env.PORTRAIT_ORIGIN || 'http://127.0.0.1:5188');
 await page.evaluate(()=>{document.body.replaceChildren();document.querySelectorAll('link[rel=stylesheet],style').forEach(el=>el.remove());document.body.style.cssText='margin:0;background:transparent';document.documentElement.style.cssText='background:transparent;color-scheme:light';document.documentElement.setAttribute('data-theme','light');});
 const ids=['frank','cupsey','fomy','alon','satoshi','diamond'];
 await mkdir('public/assets/characters/portraits',{recursive:true});
 for(const id of ids){
  await page.evaluate(async id=>{
   const {createBoss}=await import('/app/boss3d.js');
   const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:512px;height:512px';document.body.append(host);
   return new Promise((resolve,reject)=>{
    let scene;
    try{scene=createBoss(host,{skin:id,still:true,onReady:canvas=>{canvas.style.cssText='display:block;width:512px;height:512px';window.portraitCleanup=()=>{scene.destroy();host.remove();};resolve();}});}catch(e){reject(String(e));}
   });
  },id);
  const png=await page.locator('canvas').screenshot({omitBackground:true});
  await page.evaluate(()=>window.portraitCleanup());
  const webp=await sharp(png).webp({lossless:true}).toBuffer();
  const meta=await sharp(webp).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.hasAlpha,true);
  const {data:rgba}=await sharp(webp).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(rgba[3],0,'Transparent corner');assert.ok(rgba.some((v,i)=>i%4===3&&v>0),'Visible model');
  await writeFile(`public/assets/characters/portraits/${id}.webp`,webp);
  console.log(`${id}: 512x512 transparent WebP ${webp.length} bytes`);
 }
}finally{await browser.close();}
