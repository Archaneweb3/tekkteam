import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { renderPage } from './pages.js';
import { renderAgentDetail } from './agent-detail.js';
import { mountSkinViewer } from './skin-viewer.js';
import { mountLaptopViewer } from './laptop-viewer.js';
import './style.css';
import './blue-theme.css';

const AGENTS = [
  { name: 'Luca', role: 'LAUNCHER', color: '#f1665e', hair: '#70432f', skin: '#dba276', accent: '#4576d5', icon: 'L', description: 'Launch-planning AI agent concept: structures briefs, milestones, and handoffs.', home: [-3.5, .55], stops: [[-4.5, 1.1], [-1.5, .8], [-3.8, -2.6]] },
  { name: 'Felix', role: 'WEBSITE', color: '#5b9be0', hair: '#222b3d', skin: '#a96b4b', accent: '#51b7d2', icon: 'F', description: 'Web-building AI agent concept: plans interfaces and checks interaction details.', home: [1.4, .55], stops: [[1.1, .5], [3.0, -.5], [.2, 2.2]] },
  { name: 'Elodie', role: 'DESIGNER', color: '#a384e9', hair: '#4d2d50', skin: '#e0ac88', accent: '#d47dc9', icon: 'E', description: 'Visual-design AI agent concept: explores identity systems and creative directions.', home: [4.6, .6], stops: [[4.3, 1.1], [2.4, 2.6], [4.4, -2.5]] },
  { name: 'Hugo', role: 'SOCIAL', color: '#e6a95c', hair: '#a25938', skin: '#c88765', accent: '#e85c80', icon: 'H', description: 'Social-content AI agent concept: develops story angles, drafts, and brand voice.', home: [-2.7, 1.6], stops: [[-3.2, .4], [-.8, 2.7], [-5.1, 2.5]] },
  { name: 'Otto', role: 'BUYBACK', color: '#77bf88', hair: '#3c4836', skin: '#e3b28c', accent: '#6bd6a1', icon: 'O', description: 'Buyback-strategy AI agent concept: monitors signals and prepares actions for human review.', home: [4.8, 2.3], stops: [[4.6, 3.1], [1.3, 3.5], [5.1, .4]] },
  { name: 'Sofia', role: 'ANALYTICS', color: '#dbb46f', hair: '#4b3728', skin: '#b57d59', accent: '#f4ca69', icon: 'S', description: 'Analytics AI agent concept: finds patterns and turns data into clearer decisions.', home: [0, 1.35], stops: [[-1.1, 3.8], [1.2, 1.9], [-1.6, -.3]] },
];

const sceneHost = document.getElementById('scene');
const hoverTip = document.getElementById('hover-tip');
const loading = document.getElementById('scene-loading');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
sceneHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
scene.add(new THREE.AmbientLight(0xb9c3e6, 2.1));
const key = new THREE.DirectionalLight(0xffe4bd, 3.0);
key.position.set(-4, 12, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12; key.shadow.camera.right = 12;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
key.shadow.normalBias = .022;
scene.add(key);
const fill = new THREE.DirectionalLight(0x74a8ff, 1.5);
fill.position.set(7, 8, -7);
scene.add(fill);

const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, .1, 100);
camera.position.set(17, 16, 20);
camera.lookAt(0, .3, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.enablePan = false;
controls.minZoom = .85;
controls.maxZoom = 1.65;
controls.maxPolarAngle = Math.PI / 2.35;
controls.minPolarAngle = .52;
controls.target.set(0, .25, 0);
controls.update();

const matCache = new Map();
function mat(color, extra = '') {
  const key = `${color}-${extra}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0, flatShading: true, ...(extra === 'glow' ? { emissive: color, emissiveIntensity: .55 } : {}) }));
  return matCache.get(key);
}
function box(parent, w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.glow ? 'glow' : ''));
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = opts.receive !== false;
  parent.add(mesh);
  return mesh;
}
function plane(parent, w, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function canvasSign(label, width = 512, height = 128, color = '#eff8ff') {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.font = '900 78px Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, height / 2 + 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Every visible surface is a real mesh. The floor is not a flat illustration.
box(world, 14.2, .55, 11.2, '#252b3c', 0, -.34, 0);
box(world, 14.5, .12, 11.5, '#39445e', 0, -.62, 0);
for (let x = -6.5; x <= 6.5; x++) for (let z = -5; z <= 5; z++) {
  const alternate = (Math.round(x + 6.5) + Math.round(z + 5)) % 2 === 0;
  box(world, .985, .04, .985, alternate ? '#5b6380' : '#616986', x, -.04, z, { cast: false });
}
box(world, 14.2, 3.2, .24, '#373d58', 0, 1.57, -5.59);
box(world, .24, 3.2, 11.2, '#3c425e', -7.1, 1.57, 0);
box(world, 14.3, .13, .32, '#54607d', 0, 3.18, -5.59);
box(world, .32, .13, 11.2, '#54607d', -7.1, 3.18, 0);
box(world, 14.25, .16, .3, '#202638', 0, -.15, 5.56);
box(world, .3, .16, 11.1, '#202638', 7.09, -.15, 0);

const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1), new THREE.MeshBasicMaterial({ map: canvasSign('TEKKTEAM'), transparent: true, side: THREE.DoubleSide }));
sign.position.set(-3.7, 2.45, -5.44);
world.add(sign);
box(world, 4.65, .07, .08, '#1b2131', -3.7, 1.88, -5.48);

// Tall windows on the back wall give the isometric room its own identity.
for (const x of [1.2, 3.4, 5.6]) {
  box(world, 1.72, 2.45, .08, '#111b30', x, 1.72, -5.42);
  box(world, 1.48, 2.19, .05, '#294063', x, 1.72, -5.36, { cast: false });
  box(world, .055, 2.3, .08, '#68799c', x, 1.72, -5.30);
  box(world, 1.6, .055, .08, '#68799c', x, 1.72, -5.30);
  box(world, 1.6, .065, .24, '#7c8eae', x, .47, -5.28);
}
box(world, 1.15, 2.35, .08, '#171c2b', -6.0, 1.17, -5.41);
box(world, .98, 2.17, .05, '#4b5876', -6.0, 1.17, -5.36);
box(world, .12, .12, .12, '#d6bb8c', -5.64, 1.13, -5.28);
box(world, 1.22, .93, .08, '#111a28', -.05, 2.2, -5.4);
for (let i = 0; i < 5; i++) box(world, .14, (.22 + i * .13), .06, i > 2 ? '#6de69e' : '#58cfa6', -.48 + i * .21, 1.93 + (.22 + i * .13) / 2, -5.32, { glow: true });

// Decorative strips and the recessed conversation area are physical geometry.
box(world, 4.8, .035, 2.65, '#353b50', -1.1, .015, 2.45, { cast: false });
box(world, 4.2, .045, 2.05, '#2a3044', -1.1, .045, 2.45, { cast: false });
box(world, 2.7, .04, 2.0, '#35343f', -.6, .07, 2.52, { cast: false });
for (const z of [-3.65, .25, 3.55]) box(world, 13.9, .018, .028, '#8190ac', 0, -.005, z, { cast: false });

function desk(x, z, rotation = 0, color = '#715d59') {
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  box(group, 2.0, .15, 1.02, color, 0, .77, 0);
  for (const px of [-.79, .79]) for (const pz of [-.36, .36]) box(group, .12, .72, .12, '#282c3b', px, .36, pz);
  box(group, .78, .55, .09, '#111926', 0, 1.19, -.30);
  box(group, .66, .41, .017, '#328693', 0, 1.19, -.24, { glow: true });
  box(group, .36, .06, .25, '#171d2b', 0, .89, -.30);
  box(group, .54, .025, .23, '#242d3a', 0, .875, .18);
  box(group, .14, .06, .14, '#e2bd8d', .72, .89, .22);
  return group;
}
function chair(x, z, rotation = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotation; world.add(g);
  box(g, .62, .12, .59, '#303a51', 0, .48, 0);
  box(g, .64, .68, .13, '#303a51', 0, .86, .27);
  box(g, .08, .39, .08, '#202838', 0, .27, 0);
  box(g, .7, .06, .08, '#202838', 0, .09, 0);
  box(g, .08, .06, .65, '#202838', 0, .09, 0);
}
desk(-3.6, -1.2, -.14, '#7e6a61');
chair(-3.6, -.12, .08);
desk(1.35, -1.3, .10, '#78625b');
chair(1.35, -.13, -.10);
desk(4.55, -1.18, .24, '#6c6669');
chair(4.5, -.1, -.12);
box(world, 2.35, .56, .8, '#38495b', -3.8, .34, 3.4);
box(world, 2.35, .6, .25, '#547084', -3.8, .77, 3.78);
box(world, .74, .5, .8, '#455e72', -5.0, .48, 3.39);
box(world, .74, .5, .8, '#455e72', -2.6, .48, 3.39);
box(world, 1.12, .34, .64, '#6d625e', -1.15, .27, 3.23);
box(world, 1.8, .68, .72, '#484a59', 3.48, .43, 3.6);
box(world, 1.8, .11, .78, '#737081', 3.48, .82, 3.6);
box(world, .33, .4, .33, '#b7d8e7', 3.85, 1.08, 3.57, { glow: true });

function plant(x, z, scale = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); world.add(g);
  box(g, .5, .43, .5, '#776c67', 0, .22, 0);
  box(g, .36, .08, .36, '#293a33', 0, .47, 0);
  box(g, .12, .5, .12, '#3d6d57', 0, .72, 0);
  for (const [px,pz,py] of [[-.16,0,.91],[.18,.05,.99],[.02,-.19,1.1],[-.08,.2,1.17]]) box(g, .36, .39, .35, '#3d8f69', px, py, pz);
}
plant(-6.2, 3.9, .9);plant(-6.0, -3.5, .8);plant(6.1, -3.6, .85);plant(5.8, 3.8, 1);plant(-.8, -4.3, .7);

// Nav cells are derived from the same furniture bounds used to build the room.
// This prevents the visual and collision scene from drifting apart.
const navObstacles = [
  { x1: -4.8, x2: -2.4, z1: -1.9, z2: -.46 },
  { x1: .1, x2: 2.58, z1: -1.96, z2: -.43 },
  { x1: 3.3, x2: 5.9, z1: -1.87, z2: -.32 },
  ...[[-3.6,-.12],[1.35,-.13],[4.5,-.1]].map(([x,z]) => ({x1:x-.38,x2:x+.38,z1:z-.37,z2:z+.37})),
  { x1: -5.25, x2: -2.35, z1: 2.87, z2: 4.15 },
  { x1: -1.95, x2: -.37, z1: 2.62, z2: 3.76 },
  { x1: 2.35, x2: 4.55, z1: 3.0, z2: 4.2 },
  ...[[-6.2,3.9],[-6,-3.5],[6.1,-3.6],[5.8,3.8],[-.8,-4.3]].map(([x,z]) => ({ x1:x-.31,x2:x+.31,z1:z-.31,z2:z+.31 })),
];
const CELL = .4, NX = 33, NZ = 26, MIN_X = -6.4, MIN_Z = -4.9;
const inBounds = (x,z) => x >= 0 && x < NX && z >= 0 && z < NZ;
const cellWorld = (x,z) => [MIN_X + x * CELL, MIN_Z + z * CELL];
const worldCell = (x,z) => [Math.round((x - MIN_X) / CELL), Math.round((z - MIN_Z) / CELL)];
function walkable(x,z) {
  if (!inBounds(x,z)) return false;
  const [wx,wz] = cellWorld(x,z);
  return navObstacles.every(o => wx < o.x1-.24 || wx > o.x2+.24 || wz < o.z1-.24 || wz > o.z2+.24);
}
function nearestCell(wx,wz) {
  const [x,z] = worldCell(wx,wz);
  if (walkable(x,z)) return [x,z];
  for (let ring=1;ring<8;ring++) for(let dx=-ring;dx<=ring;dx++) for(let dz=-ring;dz<=ring;dz++) {
    if (Math.max(Math.abs(dx),Math.abs(dz))===ring && walkable(x+dx,z+dz)) return [x+dx,z+dz];
  }
  return null;
}
function route(fromX,fromZ,toX,toZ) {
  const start=nearestCell(fromX,fromZ), end=nearestCell(toX,toZ);
  if (!start || !end) return [];
  const key = (x,z) => `${x},${z}`, queue=[start], seen=new Map([[key(...start),null]]);
  for(let i=0;i<queue.length;i++) {
    const [x,z]=queue[i];
    if(x===end[0]&&z===end[1]) break;
    for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const nx=x+dx,nz=z+dz,k=key(nx,nz);
      if(!walkable(nx,nz)||seen.has(k))continue;
      seen.set(k,[x,z]);queue.push([nx,nz]);
    }
  }
  if(!seen.has(key(...end)))return [];
  const result=[];let at=end;
  while(at && key(...at)!==key(...start)){result.push(cellWorld(...at));at=seen.get(key(...at))}
  result.reverse();
  return result;
}

function voxelAgent(data, index) {
  const root = new THREE.Group();
  root.position.set(...[data.home[0],0,data.home[1]]);
  root.userData.agentIndex=index;
  world.add(root);
  const animated = new THREE.Group();root.add(animated);
  const skin=mat(data.skin), hair=mat(data.hair), outfit=mat(data.color);
  box(animated, .73, .74, .44, data.color, 0, 1.03, 0);
  box(animated, .79, .16, .5, data.accent, 0, 1.36, 0);
  box(animated, .63, .10, .5, '#232637', 0, .63, 0);
  box(animated, .82, .72, .72, data.skin, 0, 1.87, 0);
  box(animated, .86, .18, .76, data.hair, 0, 2.3, -.02);
  box(animated, .16, .15, .14, '#f3f0df', -.20, 1.88, .37);
  box(animated, .16, .15, .14, '#f3f0df', .20, 1.88, .37);
  box(animated, .085, .11, .06, '#222330', -.20, 1.87, .455);
  box(animated, .085, .11, .06, '#222330', .20, 1.87, .455);
  box(animated, .19, .05, .04, '#8e584c', 0, 1.64, .385);
  if(index===0){box(animated,.94,.14,.89,data.accent,0,2.44,-.04);box(animated,.62,.08,.23,data.accent,0,2.41,.5)}
  if(index===1){box(animated,.24,.055,.08,'#b9dce9',-.20,1.94,.44);box(animated,.24,.055,.08,'#b9dce9',.20,1.94,.44);box(animated,.14,.045,.07,'#b9dce9',0,1.94,.44)}
  if(index===2){box(animated,1.0,.11,.91,data.accent,0,2.45,0);box(animated,.2,.18,.2,data.accent,-.28,2.55,0)}
  if(index===3){box(animated,.23,.27,.73,data.hair,-.33,2.12,0);box(animated,.23,.27,.73,data.hair,.33,2.12,0)}
  if(index===4){box(animated,.93,.29,.82,data.color,0,2.33,-.08);box(animated,.75,.08,.18,data.accent,0,2.45,.4)}
  if(index===5){box(animated,.67,.15,.12,data.accent,0,1.94,.44,{glow:true});box(animated,.9,.07,.78,data.accent,0,2.43,0)}
  const leftArm=new THREE.Group();leftArm.position.set(-.49,1.35,0);animated.add(leftArm);
  box(leftArm,.26,.62,.29,data.color,0,-.33,0);box(leftArm,.26,.16,.29,data.skin,0,-.70,0);
  const rightArm=new THREE.Group();rightArm.position.set(.49,1.35,0);animated.add(rightArm);
  box(rightArm,.26,.62,.29,data.color,0,-.33,0);box(rightArm,.26,.16,.29,data.skin,0,-.70,0);
  const leftLeg=new THREE.Group();leftLeg.position.set(-.20,.72,0);animated.add(leftLeg);
  box(leftLeg,.27,.58,.33,'#252b3b',0,-.29,0);box(leftLeg,.31,.15,.42,'#1b202c',0,-.62,.055);
  const rightLeg=new THREE.Group();rightLeg.position.set(.20,.72,0);animated.add(rightLeg);
  box(rightLeg,.27,.58,.33,'#252b3b',0,-.29,0);box(rightLeg,.31,.15,.42,'#1b202c',0,-.62,.055);
  root.traverse(node => { if(node.isMesh) node.userData.agentIndex=index });
  return {root,animated,leftArm,rightArm,leftLeg,rightLeg,data,index,path:[],pause:1+index*.35,nextStop:0,walkPhase:index*1.8,moving:false};
}
const actors=AGENTS.map(voxelAgent);

const list=document.getElementById('agent-list');
const teamGrid=document.getElementById('team-grid');
for (let i=0;i<AGENTS.length;i++) {
  const agent=AGENTS[i];
  const row=document.createElement('button');row.className='agent-row';row.type='button';row.dataset.agent=i;
  row.innerHTML=`<span class="agent-face" style="--face-bg:${agent.color}33;--face-color:${agent.color}">${agent.icon}</span><span class="agent-copy"><strong>${agent.name}</strong><small>${agent.role}</small></span><span class="agent-dot"></span>`;
  row.addEventListener('click',()=>selectAgent(i));list.appendChild(row);
  const card=document.createElement('button');card.className='team-card';card.type='button';
  card.innerHTML=`<span class="team-card-top"><span class="agent-face" style="--face-bg:${agent.color}33;--face-color:${agent.color}">${agent.icon}</span><span><strong>${agent.name}</strong><small>${agent.role}</small></span></span><p>${agent.description}</p><span class="card-cta">FIND IN THE STUDIO ↗</span>`;
  card.addEventListener('click',()=>{selectAgent(i);document.querySelector('.hero').scrollIntoView({behavior:'smooth',block:'start'})});teamGrid.appendChild(card);
}

const panel=document.getElementById('agent-panel');
let selected=-1,focusTarget=null;
function selectAgent(i) {
  selected=i;
  const a=AGENTS[i], actor=actors[i];
  document.getElementById('panel-name').textContent=a.name;
  document.getElementById('panel-role').textContent=a.role;
  document.getElementById('panel-description').textContent=a.description;
  const avatar=document.getElementById('panel-avatar');avatar.textContent=a.icon;avatar.style.background=`${a.color}33`;avatar.style.color=a.color;
  panel.hidden=false;
  document.querySelectorAll('.agent-row').forEach((el,n)=>el.classList.toggle('active',n===i));
  focusTarget=new THREE.Vector3(actor.root.position.x, .65, actor.root.position.z);
}
function clearSelection(){panel.hidden=true;selected=-1;focusTarget=null;document.querySelectorAll('.agent-row').forEach(el=>el.classList.remove('active'))}
document.getElementById('panel-close').addEventListener('click',clearSelection);
document.getElementById('reset-view').addEventListener('click',()=>{
  clearSelection();camera.position.set(17,16,20);camera.zoom=1;camera.updateProjectionMatrix();controls.target.set(0,.25,0);controls.update();
  document.querySelector('.hero').scrollIntoView({behavior:'smooth',block:'start'});
});

const homePage=document.getElementById('home-page');
const routeRoot=document.getElementById('route-root');
let skinCleanup=[];
function renderRoute(){
  for(const clean of skinCleanup)clean();skinCleanup=[];
  const route=(location.hash.slice(1)||'/').split('?')[0];
  const isHome=route==='/'||route==='';
  homePage.hidden=!isHome;routeRoot.hidden=isHome;
  clearSelection();
  if(isHome)routeRoot.replaceChildren();
  else {
    const detail=route.match(/^\/agent\/(\d+)$/);
    let view=detail?renderAgentDetail(AGENTS[Number(detail[1])-1]):renderPage(route,{
      agents:AGENTS,
      onSelectAgent:agent=>{const i=AGENTS.indexOf(agent);if(i>=0)location.hash=`/agent/${i+1}`},
    });
    if(!view){
      view=document.createElement('section');view.className='route-not-found';
      view.innerHTML='<span class="eyebrow">404 / STUDIO</span><h1>Room not found.</h1><p>This part of the studio does not exist yet.</p><a class="button-primary" href="#/">BACK HOME ↗</a>';
    }
    routeRoot.replaceChildren(view);
    if(route==='/tokens'){
      const terminal=document.createElement('div');terminal.className='token-laptop-viewer';
      terminal.setAttribute('aria-label','Interactive 3D TEKKTEAM laptop; no live data');
      const target=view.querySelector('.tt-data-empty');
      if(target)target.before(terminal);else view.append(terminal);
      skinCleanup=[mountLaptopViewer(terminal)];
    }
    if(route==='/skins'){
      skinCleanup=[...view.querySelectorAll('.tt-skin-card')].map(card=>
        mountSkinViewer(card.querySelector('.tt-skin-card-viewer'),{variant:card.dataset.variant})
      );
    }
    if(detail){
      const agent=AGENTS[Number(detail[1])-1];
      const frame=view.querySelector('.tk-agent-portrait-frame');
      if(agent&&frame){
        const viewer=document.createElement('div');viewer.className='agent-detail-viewer';
        frame.replaceChildren(viewer);
        frame.style.cssText='width:100%;height:350px;transform:none;filter:none;display:block';
        view.querySelector('.tk-agent-portrait-caption').textContent='DRAG TO TURN · ORIGINAL 3D VOXEL CHARACTER';
        skinCleanup=[mountSkinViewer(viewer,{palette:{coat:agent.color,trim:agent.accent,skin:agent.skin,hair:agent.hair}})];
      }
    }
  }
  document.querySelectorAll('.nav-link').forEach(link=>{
    const href=link.getAttribute('href').slice(1);
    link.classList.toggle('active',isHome?href==='/':href===route||route.startsWith('/agent/')&&href==='/agents');
  });
  window.scrollTo({top:0,behavior:'instant'});
  resize();
}
window.addEventListener('hashchange',renderRoute);
renderRoute();

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
let hovered=-1,dragging=false,pointerDown=null;
function pick(event) {
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  for(const hit of raycaster.intersectObjects(actors.map(a=>a.root),true)) {
    if(Number.isInteger(hit.object.userData.agentIndex)) return hit.object.userData.agentIndex;
  }
  return -1;
}
renderer.domElement.addEventListener('pointerdown',e=>{dragging=false;pointerDown=[e.clientX,e.clientY]});
renderer.domElement.addEventListener('pointermove',e=>{
  if(pointerDown && Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])>6)dragging=true;
  hovered=pick(e);
  renderer.domElement.style.cursor=hovered>=0?'pointer':dragging?'grabbing':'grab';
  if(hovered<0||dragging){hoverTip.hidden=true;return}
  hoverTip.textContent=`${AGENTS[hovered].name} · ${AGENTS[hovered].role}`;
  hoverTip.hidden=false;
  const r=sceneHost.getBoundingClientRect();
  hoverTip.style.left=`${Math.min(r.width-145,Math.max(8,e.clientX-r.left+13))}px`;
  hoverTip.style.top=`${Math.max(48,e.clientY-r.top-34)}px`;
});
renderer.domElement.addEventListener('pointerup',e=>{if(!dragging){const i=pick(e);if(i>=0)selectAgent(i)}pointerDown=null;dragging=false});
renderer.domElement.addEventListener('pointerleave',()=>{hoverTip.hidden=true;hovered=-1;pointerDown=null;dragging=false});

const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const clock=new THREE.Clock();
function updateAgents(dt,elapsed) {
  if(reducedMotion.matches)return;
  for(const actor of actors) {
    if(actor.pause>0){actor.pause-=dt;actor.moving=false}
    else {
      if(!actor.path.length){
        const target=actor.data.stops[actor.nextStop++%actor.data.stops.length];
        actor.path=route(actor.root.position.x,actor.root.position.z,...target);
        if(!actor.path.length)actor.pause=1.2;
      }
      if(actor.path.length){
        const [tx,tz]=actor.path[0], dx=tx-actor.root.position.x,dz=tz-actor.root.position.z;
        const distance=Math.hypot(dx,dz),step=Math.min(distance,dt*(1.05+actor.index*.045));
        if(distance>0){actor.root.position.x+=dx/distance*step;actor.root.position.z+=dz/distance*step;actor.root.rotation.y=Math.atan2(dx,dz)}
        actor.moving=true;actor.walkPhase+=dt*10;
        if(distance<.045){actor.root.position.x=tx;actor.root.position.z=tz;actor.path.shift()}
        if(!actor.path.length)actor.pause=1.6+(actor.index%3)*.5;
      }
    }
    const swing=actor.moving?Math.sin(actor.walkPhase)*.48:0;
    actor.leftLeg.rotation.x=swing;actor.rightLeg.rotation.x=-swing;
    actor.leftArm.rotation.x=-swing*.8;actor.rightArm.rotation.x=swing*.8;
    actor.animated.position.y=actor.moving?Math.abs(Math.sin(actor.walkPhase))*.07:Math.sin(elapsed*2+actor.index)*.018;
  }
}
function resize() {
  const w=sceneHost.clientWidth,h=sceneHost.clientHeight;
  if(!w||!h)return;
  const aspect=w/h,frustum=14.5;
  camera.left=-frustum*aspect/2;camera.right=frustum*aspect/2;
  camera.top=frustum/2;camera.bottom=-frustum/2;
  camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
new ResizeObserver(resize).observe(sceneHost);resize();
let previous=0;
function frame(time) {
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(time-previous)/1000||.016);previous=time;
  const elapsed=clock.getElapsedTime();
  updateAgents(dt,elapsed);
  if(focusTarget){
    const old=controls.target.clone();controls.target.lerp(focusTarget,Math.min(1,dt*2.4));
    camera.position.add(controls.target.clone().sub(old));
  }
  controls.update();
  if(!homePage.hidden)renderer.render(scene,camera);
}
requestAnimationFrame(frame);
requestAnimationFrame(()=>loading.classList.add('hidden'));
const clockElement=document.getElementById('scene-clock');
function updateClock(){clockElement.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
updateClock();setInterval(updateClock,30_000);
