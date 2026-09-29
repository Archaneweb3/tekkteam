import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// A static-camera real GLB prop: render on load/resize only, not an animation loop.
export function mountWorkspacePhone(host){
 let dead=false,model=null,wrapper=null,visible=true,yaw=0;
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 renderer.domElement.setAttribute('aria-hidden','true');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
 scene.add(new THREE.HemisphereLight(0xc7dcff,0x263449,2.2));
 const key=new THREE.DirectionalLight(0xdfeaff,3.3);key.position.set(-3,4,5);scene.add(key);
 const rim=new THREE.DirectionalLight(0x739cff,2);rim.position.set(3,1,-2);scene.add(rim);
 function render(){if(dead||!visible||document.hidden||!model)return;const width=host.clientWidth,height=host.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);const aspect=width/height,h=1.08;camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;camera.updateProjectionMatrix();renderer.render(scene,camera);}
 const resize=new ResizeObserver(render);resize.observe(host);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)render();});observer.observe(host);
 document.addEventListener('visibilitychange',render);
 const dispose=object=>object?.traverse(node=>{node.geometry?.dispose();for(const material of[node.material].flat().filter(Boolean)){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}});
 new GLTFLoader().load('/assets/models/tekkwork-smartphone.glb',gltf=>{
  if(dead){dispose(gltf.scene);return;}model=gltf.scene;
  model.traverse(node=>{if(!node.isMesh)return;for(const material of[node.material].flat()){material.metalness=.18;material.roughness=.65;material.roughnessMap?.dispose();material.roughnessMap=null;material.normalScale?.set(.3,.3);material.emissive?.set(0x061433);material.emissiveIntensity=.18;material.needsUpdate=true;}});
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);wrapper=new THREE.Group();wrapper.add(model);wrapper.scale.setScalar(2/size.y);wrapper.rotation.y=yaw;scene.add(wrapper);
  camera.position.set(0,0,4);camera.lookAt(0,0,0);host.closest('.workforce-device')?.classList.add('phone-model-ready');render();
 },undefined,()=>{host.closest('.workforce-device')?.classList.add('phone-model-unavailable');});
 return{rotate(degrees){yaw=degrees*Math.PI/180;if(wrapper)wrapper.rotation.y=yaw;render();},destroy(){dead=true;resize.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',render);dispose(model);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
