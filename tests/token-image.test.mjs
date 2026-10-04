import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeTokenImage,stageTokenImage,verifyPublishedImage,imageOrigin} from '../server/token-image.js';
test('image normalization, per-agent HTTPS URL and publication verification',async()=>{
 const previous=process.env.DATA_DIR,previousOrigin=process.env.PUBLIC_METADATA_ORIGIN;process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'token-image-'));process.env.PUBLIC_METADATA_ORIGIN='https://tekkteam-fixture.invalid';
 try{const jpeg=await sharp({create:{width:80,height:40,channels:3,background:'#123456'}}).jpeg().toBuffer(),bytes=await normalizeTokenImage('data:image/jpeg;base64,'+jpeg.toString('base64'));
 const meta=await sharp(bytes).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'png');
 const image=await stageTokenImage('one',bytes);assert.match(image,/^https:\/\/.*\/metadata\/agents\/one\/[a-f0-9]{64}\.png$/);
 await verifyPublishedImage({agentId:'one',image},async()=>new Response(bytes,{headers:{'content-type':'image/png'}}));
 await assert.rejects(verifyPublishedImage({agentId:'two',image}),/own published/);
 await assert.rejects(verifyPublishedImage({agentId:'one',image},async()=>new Response('bad',{headers:{'content-type':'image/png'}})),/differs/);
 await assert.rejects(verifyPublishedImage({agentId:'one',image},async()=>new Response('',{status:403})),/publication/);
 for(const data of ['data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA','data:image/png;base64,'+'A'.repeat(4500001)])await assert.rejects(normalizeTokenImage(data));
 }finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;if(previousOrigin===undefined)delete process.env.PUBLIC_METADATA_ORIGIN;else process.env.PUBLIC_METADATA_ORIGIN=previousOrigin;}
});
test('missing metadata origin never selects another project or stages an orphan image',async()=>{
 const previous=process.env.DATA_DIR,origin=process.env.PUBLIC_METADATA_ORIGIN;const directory=mkdtempSync(join(tmpdir(),'token-origin-'));process.env.DATA_DIR=directory;delete process.env.PUBLIC_METADATA_ORIGIN;
 try{assert.throws(imageOrigin,/Explicit public/);await assert.rejects(stageTokenImage('agent',Buffer.from('synthetic')),/Explicit public/);assert.equal(existsSync(join(directory,'pump-metadata-site')),false);for(const invalid of ['http://tekkteam.tech','https://tekkteam.tech/path','https://tekkteam.tech/?x=1','https://tekkteam.tech/#x']){process.env.PUBLIC_METADATA_ORIGIN=invalid;assert.throws(imageOrigin);}}
 finally{if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;if(origin===undefined)delete process.env.PUBLIC_METADATA_ORIGIN;else process.env.PUBLIC_METADATA_ORIGIN=origin;}
});
