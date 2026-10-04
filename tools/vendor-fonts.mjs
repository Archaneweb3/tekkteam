import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

// Vendor the exact existing stylesheet families; no typography redesign.
const html=readFileSync('index.html','utf8');
const urls=[...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2[^" ]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
if(urls.length!==2)throw Error('Expected the two baseline Google font stylesheets');
const root='public/fonts';mkdirSync(root,{recursive:true});
const css=[],manifest=[];
for(const url of urls){
 const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'},redirect:'error'});
 if(!response.ok)throw Error('Font stylesheet unavailable');
 const source=await response.text();
 const faces=[...source.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)].map(m=>m[1]);
 if(!faces.length)throw Error('Latin font faces unavailable: '+source.slice(0,500));
 for(let face of faces){
  const address=face.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if(!address)throw Error('Unexpected font asset source');
  const asset=await fetch(address,{redirect:'error'});if(!asset.ok)throw Error('Font asset unavailable');
  const bytes=Buffer.from(await asset.arrayBuffer()),digest=createHash('sha256').update(bytes).digest('hex');
  const name=digest+'.woff2';writeFileSync(join(root,name),bytes);
  css.push(face.replace(address,'/fonts/'+name));manifest.push({source:address,file:name,sha256:digest});
 }
}
writeFileSync('public/fonts.css',css.join('\n\n')+'\n');
writeFileSync(join(root,'manifest.json'),JSON.stringify({source:'Existing index.html Google Fonts families, Latin subset',assets:manifest},null,2));
for(const family of ['bungee','jetbrainsmono','outfit','spacegrotesk','lilitaone','nunitosans']){
 const license=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/'+family+'/OFL.txt',{redirect:'error'});
 if(!license.ok)throw Error('Font license unavailable: '+family);
 writeFileSync(join(root,family+'-OFL.txt'),await license.text());
}
console.log(JSON.stringify({fontFaces:css.length,uniqueAssets:new Set(manifest.map(m=>m.file)).size}));
