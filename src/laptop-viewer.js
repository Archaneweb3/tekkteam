import * as THREE from 'three';

function box(parent, material, x, y, z, w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Original TEKKTEAM low-poly workstation. Returns a cleanup function. */
export function mountLaptopViewer(element) {
  if (!(element instanceof HTMLElement)) throw new TypeError('mountLaptopViewer needs an HTMLElement');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171c29);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(5.8, 4.1, 7.8);
  camera.lookAt(0, 1.15, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'TEKKTEAM 3D laptop, screen says NO LIVE FEED; drag to rotate');
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
  element.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xb5deeb, 0x353d5b, 2.1));
  const key = new THREE.DirectionalLight(0xffe9cc, 3.1);
  key.position.set(4, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x58e3d3, 0.9);
  rim.position.set(-5, 3, -3);
  scene.add(rim);

  const navy = new THREE.MeshStandardMaterial({ color: 0x263547, roughness: 0.78, metalness: 0.12 });
  const desk = new THREE.MeshStandardMaterial({ color: 0x3d5463, roughness: 0.92 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x536778, roughness: 0.48, metalness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c1722, roughness: 0.65, metalness: 0.12 });
  const keys = new THREE.MeshStandardMaterial({ color: 0x7995a4, roughness: 0.82 });
  const mint = new THREE.MeshStandardMaterial({ color: 0x58dfc8, emissive: 0x187e76, emissiveIntensity: 0.55 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffbf79, emissive: 0x8b461e, emissiveIntensity: 0.25 });
  const rig = new THREE.Group();
  scene.add(rig);
  box(rig, desk, 0, -0.19, 0, 7.1, 0.28, 5.1);
  box(rig, navy, 0, -0.38, 0, 7.2, 0.12, 5.2);
  for (const x of [-2.9, 2.9]) box(rig, navy, x, -0.77, 1.55, 0.52, 0.72, 0.52);

  // Actual laptop shell: keyboard sits on the desk, lid rises behind it.
  box(rig, metal, 0, 0.06, 0.57, 4.45, 0.13, 2.85);
  box(rig, dark, 0, 0.15, 0.55, 4.2, 0.045, 2.53);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 13; col++) {
      const width = row === 3 && col >= 4 && col <= 8 ? 0.23 : 0.18;
      box(rig, keys, -1.65 + col * 0.275, 0.181, -0.28 + row * 0.36, width, 0.016, 0.17);
    }
  }
  box(rig, metal, 0, 0.181, 1.49, 0.82, 0.014, 0.45);
  const lid = new THREE.Group();
  lid.position.set(0, 0.10, -0.87);
  lid.rotation.x = -0.12;
  rig.add(lid);
  box(lid, metal, 0, 1.35, -0.08, 4.5, 2.70, 0.17);
  box(lid, dark, 0, 1.35, 0.03, 4.18, 2.38, 0.035);
  box(lid, mint, -1.92, 1.35, 0.06, 0.045, 2.18, 0.015);
  box(lid, mint, 0, 2.43, 0.06, 3.87, 0.04, 0.015);
  box(lid, amber, -1.73, 2.16, 0.06, 0.18, 0.11, 0.018);
  box(lid, mint, -1.44, 2.16, 0.06, 0.18, 0.11, 0.018);
  box(lid, amber, -1.15, 2.16, 0.06, 0.18, 0.11, 0.018);

  // Canvas texture is generated locally and contains no made-up market data.
  const display = document.createElement('canvas');
  display.width = 1024;
  display.height = 512;
  const ctx = display.getContext('2d');
  ctx.fillStyle = '#0d1a24';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = 'rgba(105,225,207,.09)';
  ctx.lineWidth = 2;
  for (let x = 0; x < 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
  for (let y = 0; y < 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }
  ctx.fillStyle = '#65dccb';
  ctx.font = 'bold 46px monospace';
  ctx.fillText('TEKKTEAM / TERMINAL', 54, 100);
  ctx.fillStyle = '#e9f1eb';
  ctx.font = 'bold 78px monospace';
  ctx.fillText('NO LIVE FEED', 54, 269);
  ctx.fillStyle = '#a2b9c1';
  ctx.font = '28px monospace';
  ctx.fillText('Live market integration is not connected.', 54, 333);
  ctx.fillStyle = '#63dec8';
  ctx.fillRect(54, 394, 33, 8);
  const texture = new THREE.CanvasTexture(display);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.74, 1.87), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 1.32, 0.054);
  lid.add(screen);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.17 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.15;
  floor.receiveShadow = true;
  scene.add(floor);
  let targetRotation = -0.4;
  rig.rotation.y = targetRotation;
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
    camera.position.set(5.8, 4.1, Math.max(7.8, 8 / Math.max(0.8, camera.aspect)));
    camera.lookAt(0, 1.15, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!visible) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(element);
  const io = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; }, { threshold: 0.01 });
  io.observe(element);
  function down(event) {
    dragging = true;
    lastX = event.clientX;
    renderer.domElement.style.cursor = 'grabbing';
    renderer.domElement.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (!dragging) return;
    targetRotation += (event.clientX - lastX) * 0.011;
    lastX = event.clientX;
  }
  function up() { dragging = false; renderer.domElement.style.cursor = 'grab'; }
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', up);
  renderer.domElement.addEventListener('pointercancel', up);
  resize();
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (!visible || document.hidden) return;
    if (!dragging && !reducedMotion.matches) targetRotation += 0.0012;
    rig.rotation.y += (targetRotation - rig.rotation.y) * 0.12;
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    io.disconnect();
    renderer.domElement.removeEventListener('pointerdown', down);
    renderer.domElement.removeEventListener('pointermove', move);
    renderer.domElement.removeEventListener('pointerup', up);
    renderer.domElement.removeEventListener('pointercancel', up);
    scene.traverse(object => {
      object.geometry?.dispose();
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
    });
    texture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
