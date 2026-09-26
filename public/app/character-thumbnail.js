import {createBoss} from './boss3d.js';
const cache=new Map();let queue=Promise.resolve();
// One temporary WebGL context, captured from the exact Detail model/config.
function thumbnail(skin){
 if(!cache.has(skin)){
  const result=queue.then(()=>new Promise((resolve,reject)=>{
   const host=document.createElement('div');host.style.cssText='position:fixed;left:-1000px;top:0;width:360px;height:300px;pointer-events:none';document.body.append(host);
   let scene,timer;
   const cleanup=()=>{clearTimeout(timer);scene?.destroy();host.remove();};
   try{scene=createBoss(host,{skin,still:true,onReady:canvas=>{try{resolve(canvas.toDataURL('image/png'));}catch(e){reject(e);}finally{queueMicrotask(cleanup);}}});timer=setTimeout(()=>{cleanup();reject(Error('Thumbnail unavailable'));},8000);}catch(e){cleanup();reject(e);}
  }));cache.set(skin,result);queue=result.catch(()=>{});
 }
 return cache.get(skin);
}
export function hydrateCharacters(root){
 root.querySelectorAll('img[data-character]').forEach(img=>thumbnail(img.dataset.character).then(src=>{if(img.isConnected){img.src=src;img.dataset.ready='true';}}).catch(()=>{if(img.isConnected)img.alt='Character preview unavailable';}));
}
export async function characterTokenImage(skin){
 const source=new Image();source.src=await thumbnail(skin);await source.decode();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#102e55';ctx.fillRect(0,0,512,512);
 const scale=Math.min(472/source.width,472/source.height);const w=source.width*scale,h=source.height*scale;ctx.drawImage(source,(512-w)/2,(512-h)/2,w,h);return canvas.toDataURL('image/png');
}
