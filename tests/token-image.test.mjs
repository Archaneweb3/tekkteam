import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeTokenImage,stageTokenImage,verifyPublishedImage} from '../server/token-image.js';
test('image normalization, per-agent HTTPS URL and publication verification',async()=>{
 const previous=process.env.DATA_DIR;process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'token-image-'));
 try{const jpeg=await sharp({create:{width:80,height:40,channels:3,background:'#123456'}}).jpeg().toBuffer(),bytes=await normalizeTokenImage('data:image/jpeg;base64,'+jpeg.toString('base64'));
 const meta=await sharp(bytes).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'png');
 const image=await stageTokenImage('one',bytes);assert.match(image,/^https:\/\/.*\/metadata\/agents\/one\/[a-f0-9]{64}\.png$/);
 await verifyPublishedImage({agentId:'one',image},async()=>new Response(bytes,{headers:{'content-type':'image/png'}}));
 await assert.rejects(verifyPublishedImage({agentId:'two',image}),/own published/);
 await assert.rejects(verifyPublishedImage({agentId:'one',image},async()=>new Response('bad',{headers:{'content-type':'image/png'}})),/differs/);
 await assert.rejects(verifyPublishedImage({agentId:'one',image},async()=>new Response('',{status:403})),/publication/);
 for(const data of ['data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA','data:image/png;base64,'+'A'.repeat(4500001)])await assert.rejects(normalizeTokenImage(data));
 }finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;}
});
