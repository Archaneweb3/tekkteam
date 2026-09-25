import * as THREE from 'three';

// An original, deliberately low-poly TEKKTEAM collectible. Coordinates are in
// voxel units; this is geometry, not a billboard or an image of a 3D model.
const PALETTES = {
  circuit: {
    skin: 0xd9a875, hair: 0x272539, coat: 0x244e62, trim: 0x62e4cd,
    trousers: 0x233449, shoes: 0x152333, badge: 0xffc87e,
  },
  ember: {
    skin: 0xb97956, hair: 0x392634, coat: 0x713b4f, trim: 0xffa464,
    trousers: 0x3f3148, shoes: 0x211f32, badge: 0xf5d789,
  },
  field: {
    skin: 0xd9a17f, hair: 0x3e302d, coat: 0x537ea3, trim: 0x8bc0ff,
    trousers: 0x283f5d, shoes: 0x182a40, badge: 0xc7e2ff,
  },
};

function makeBox(parent, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeCharacter(palette) {
  const character = new THREE.Group();
  const mat = Object.fromEntries(Object.entries(palette).map(([key, color]) => [
    key, new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }),
  ]));
  const dark = new THREE.MeshStandardMaterial({ color: 0x171a27, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf9ead5, roughness: 1 });
  const sole = new THREE.MeshStandardMaterial({ color: 0x0b1723, roughness: 1 });

  // All pieces share a real depth buffer, lighting and cast shadows.
  makeBox(character, mat.trousers, -0.26, 0.72, 0, 0.43, 0.9, 0.48);
  makeBox(character, mat.trousers, 0.26, 0.72, 0, 0.43, 0.9, 0.48);
  makeBox(character, mat.shoes, -0.26, 0.20, 0.12, 0.51, 0.24, 0.70);
  makeBox(character, mat.shoes, 0.26, 0.20, 0.12, 0.51, 0.24, 0.70);
  makeBox(character, sole, -0.26, 0.10, 0.13, 0.53, 0.08, 0.73);
  makeBox(character, sole, 0.26, 0.10, 0.13, 0.53, 0.08, 0.73);
  makeBox(character, mat.coat, 0, 1.73, 0, 1.36, 1.25, 0.68);
  makeBox(character, mat.trim, 0, 1.74, 0.354, 0.13, 1.12, 0.035);
  makeBox(character, mat.trim, 0, 2.31, 0.08, 0.67, 0.08, 0.58);
  makeBox(character, mat.badge, 0.41, 1.89, 0.36, 0.24, 0.24, 0.04);
  makeBox(character, dark, 0.41, 1.89, 0.39, 0.12, 0.12, 0.02);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.86, 2.16, 0);
  makeBox(leftArm, mat.coat, 0, -0.36, 0, 0.42, 0.83, 0.61);
  makeBox(leftArm, mat.skin, 0, -0.88, 0, 0.34, 0.25, 0.52);
  character.add(leftArm);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.86, 2.16, 0);
  makeBox(rightArm, mat.coat, 0, -0.36, 0, 0.42, 0.83, 0.61);
  makeBox(rightArm, mat.skin, 0, -0.88, 0, 0.34, 0.25, 0.52);
  character.add(rightArm);

  const head = new THREE.Group();
  head.position.set(0, 2.87, 0);
  makeBox(head, mat.skin, 0, 0, 0, 1.13, 1.04, 0.94);
  makeBox(head, mat.hair, 0, 0.52, -0.01, 1.22, 0.37, 1.05);
  makeBox(head, mat.hair, -0.47, 0.29, 0.42, 0.24, 0.28, 0.12);
  makeBox(head, mat.hair, 0.40, 0.34, 0.44, 0.38, 0.22, 0.12);
  makeBox(head, white, -0.25, 0.07, 0.49, 0.20, 0.18, 0.03);
  makeBox(head, white, 0.25, 0.07, 0.49, 0.20, 0.18, 0.03);
  makeBox(head, dark, -0.24, 0.06, 0.52, 0.10, 0.13, 0.02);
  makeBox(head, dark, 0.26, 0.06, 0.52, 0.10, 0.13, 0.02);
  makeBox(head, dark, 0, -0.29, 0.48, 0.23, 0.035, 0.025);
  character.add(head);
  return { character, head, leftArm, rightArm };
}

/** Mount a self-contained voxel skin viewer. Returns a full cleanup function. */
export function mountSkinViewer(element, { variant = 'circuit', palette = null } = {}) {
  if (!(element instanceof HTMLElement)) throw new TypeError('mountSkinViewer needs an HTMLElement');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171c29);
  scene.fog = new THREE.Fog(0x171c29, 10, 18);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(5.4, 4.0, 7.4);
  camera.lookAt(0, 1.75, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', `TEKKTEAM ${variant} voxel character; drag to rotate`);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
  element.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xd4e9ff, 0x313a50, 2.3));
  const key = new THREE.DirectionalLight(0xfff1d9, 3);
  key.position.set(4, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0006;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x68e6db, 0.8);
  fill.position.set(-4, 3, -3);
  scene.add(fill);

  const platform = new THREE.Group();
  scene.add(platform);
  const platformMat = new THREE.MeshStandardMaterial({ color: 0x25364b, roughness: 0.78 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x365768, roughness: 0.65, metalness: 0.13 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x62e4cd, emissive: 0x1d6561, emissiveIntensity: 0.4 });
  makeBox(platform, platformMat, 0, -0.24, 0, 3.55, 0.28, 3.55);
  makeBox(platform, topMat, 0, -0.07, 0, 3.45, 0.08, 3.45);
  for (const x of [-1.67, 1.67]) makeBox(platform, trimMat, x, -0.11, 0, 0.04, 0.045, 3.32);
  for (const z of [-1.67, 1.67]) makeBox(platform, trimMat, 0, -0.11, z, 3.32, 0.045, 0.04);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.24 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.42;
  ground.receiveShadow = true;
  scene.add(ground);

  const rig = makeCharacter({ ...(PALETTES[variant] || PALETTES.circuit), ...palette });
  scene.add(rig.character);
  rig.character.rotation.y = -0.35;
  let targetRotation = rig.character.rotation.y;
  let dragging = false;
  let lastX = 0;
  let visible = true;
  let disposed = false;
  let frame = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const width = Math.max(1, element.clientWidth);
    const height = Math.max(1, element.clientHeight);
    camera.aspect = width / height;
    camera.position.set(5.4, 4.0, Math.max(7.4, 8 / Math.max(0.72, camera.aspect)));
    camera.lookAt(0, 1.75, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!visible) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(element);
  const io = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
  io.observe(element);
  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    renderer.domElement.style.cursor = 'grabbing';
    renderer.domElement.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragging) return;
    targetRotation += (event.clientX - lastX) * 0.012;
    lastX = event.clientX;
  }
  function pointerUp() {
    dragging = false;
    renderer.domElement.style.cursor = 'grab';
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', pointerUp);
  resize();
  const start = performance.now();
  function animate(now) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (!visible || document.hidden) return;
    const t = (now - start) / 1000;
    if (!dragging && !reducedMotion.matches) targetRotation += 0.002;
    rig.character.rotation.y += (targetRotation - rig.character.rotation.y) * 0.13;
    if (!reducedMotion.matches) {
      rig.head.rotation.z = Math.sin(t * 1.4) * 0.025;
      rig.leftArm.rotation.x = Math.sin(t * 1.3) * 0.05;
      rig.rightArm.rotation.x = -rig.leftArm.rotation.x;
      rig.character.position.y = Math.sin(t * 1.6) * 0.022;
    }
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    io.disconnect();
    renderer.domElement.removeEventListener('pointerdown', pointerDown);
    renderer.domElement.removeEventListener('pointermove', pointerMove);
    renderer.domElement.removeEventListener('pointerup', pointerUp);
    renderer.domElement.removeEventListener('pointercancel', pointerUp);
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
