import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {CHARACTER_IDS, OFFICE_CHARACTERS, resolveCharacterId, characterPortraitUrl} from '../public/app/character-registry.js';
import {SKIN_MODELS, createCanonicalCharacter} from '../public/app/skins3d.js';
test('canonical IDs preserve existing model meshes and poses',()=>{
 for(const id of [...CHARACTER_IDS,'diamond']) {
  const model=createCanonicalCharacter(id),original=SKIN_MODELS[id]();
  assert.equal(model.characterId,id);assert.deepEqual(model.parts,original.parts);assert.deepEqual(model.pose,original.pose);
  assert.equal(resolveCharacterId({characterId:id}),id);
  assert.equal(resolveCharacterId({character:id}),id);
  assert.equal(resolveCharacterId({skin:id}),id);
 }
 for(const id of Object.values(OFFICE_CHARACTERS))assert.ok(CHARACTER_IDS.includes(id));
 assert.equal(resolveCharacterId('unknown'),'frank');
 assert.equal(characterPortraitUrl('<script>'),'\/assets/characters/portraits/frank.webp');
});
test('canonical portraits are square transparent WebP, with visible pixels',async()=>{
 for(const id of [...CHARACTER_IDS,'diamond']) {
  const file=await readFile(`public${characterPortraitUrl(id)}`),meta=await sharp(file).metadata();
  assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'webp');assert.equal(meta.hasAlpha,true);
  const data=await sharp(file).ensureAlpha().raw().toBuffer();assert.equal(data[3],0);assert.ok(data.some((v,i)=>i%4===3&&v===255));
  for(let y=0;y<512;y++){assert.equal(data[(y*512)*4+3],0);assert.equal(data[(y*512+511)*4+3],0);}
  assert.ok(file.length<100_000);
 }
});
