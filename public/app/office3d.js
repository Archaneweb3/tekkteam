// TEKKTEAM office: a live, animated 3D voxel office drawn with plain WebGL2 (no libraries).
// Three workers sit at their desks (LAUNCH, SHILL ON X, TRADE) and the boss walks the floor.
// Speech bubbles above their heads are real buttons; clicking a worker does the same thing.
//
//   const office = createOffice(el, { onAction(role) {} });
//   office.setData({ trades, coins, tokens })   // live snapshot bits for screens + bubbles
//   office.celebrate('launch' | 'trade')          // burst of coins / candles
//   office.destroy()

const V = 0.07;                       // one character voxel (world units)
const ROOM = { w: 10, d: 7.6, h: 3.0 };

// ─────────────── tiny mat4 (column-major) ───────────────
const m4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
const T = (x, y, z) => { const m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const RX = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const RY = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const RZ = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const S = (s) => { const m = m4(); m[0] = m[5] = m[10] = s; return m; };
const chain = (...ms) => ms.reduce((a, b) => mul(a, b));
function xf(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, at, up = [0, 1, 0]) {
  const z = norm([eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
function ortho(l, r, b, t, n, f) {
  const m = m4();
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n);
  return m;
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// ─────────────── geometry ───────────────
class Mesh {
  constructor() { this.v = []; this.i = []; this.n = 0; }
  // axis-aligned box from (x0,y0,z0) to (x1,y1,z1). seam = voxel size of the seam grid (0 = none)
  box(x0, y0, z0, x1, y1, z1, color, seam = 0, emit = 0, skip = '') {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const c = hex(color);
    const F = [
      ['px', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      ['nx', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['py', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      ['ny', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['pz', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['nz', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [k, nrm, q] of F) {
      if (skip.includes(k)) continue;
      const b = this.n;
      for (const p of q) this.v.push(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], c[0], c[1], c[2], seam, emit);
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.n += 4;
    }
    return this;
  }
  // box in voxel units (x V)
  vox(x0, y0, z0, x1, y1, z1, color, emit = 0) { return this.box(x0 * V, y0 * V, z0 * V, x1 * V, y1 * V, z1 * V, color, V, emit); }
  cylinder(cx, y0, cz, radius, y1, color, segments = 12, emit = 0) {
    const c = hex(color);
    const vertex = (x, y, z, nx, ny, nz) => {
      this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], 0, emit);
      return this.n++;
    };
    for (let j = 0; j < segments; j++) {
      const a = j * Math.PI * 2 / segments;
      const b = (j + 1) * Math.PI * 2 / segments;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const p = vertex(cx + ca * radius, y0, cz + sa * radius, ca, 0, sa);
      const q = vertex(cx + cb * radius, y0, cz + sb * radius, cb, 0, sb);
      const r = vertex(cx + cb * radius, y1, cz + sb * radius, cb, 0, sb);
      const s = vertex(cx + ca * radius, y1, cz + sa * radius, ca, 0, sa);
      this.i.push(p, r, q, p, s, r);
      const top = vertex(cx, y1, cz, 0, 1, 0);
      const ta = vertex(cx + ca * radius, y1, cz + sa * radius, 0, 1, 0);
      const tb = vertex(cx + cb * radius, y1, cz + sb * radius, 0, 1, 0);
      this.i.push(top, tb, ta);
      const bottom = vertex(cx, y0, cz, 0, -1, 0);
      const ba = vertex(cx + cb * radius, y0, cz + sb * radius, 0, -1, 0);
      const bb = vertex(cx + ca * radius, y0, cz + sa * radius, 0, -1, 0);
      this.i.push(bottom, bb, ba);
    }
    return this;
  }
  stud(x, y, z, radius, color) { return this.cylinder(x, y, z, radius, y + radius * 0.48, color, 12); }
}

// ─────────────── shaders ───────────────
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in float aSeam; layout(location=4) in float aEmit;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vW, vN, vLP, vMN, vCol; out float vSeam, vEmit; out vec4 vL;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vW = w.xyz; vN = normalize(mat3(uModel) * aNrm); vLP = aPos; vMN = aNrm; vCol = aCol; vSeam = aSeam; vEmit = aEmit;
  vL = uLightVP * w;
  gl_Position = uVP * w;
}`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vLP, vMN, vCol; in float vSeam, vEmit; in vec4 vL;
uniform sampler2DShadow uShadow; uniform vec2 uShadowTexel;
uniform vec3 uSunDir, uSunCol, uSky, uGround; uniform float uNight;
uniform vec3 uLP[4]; uniform vec3 uLC[4];
out vec4 o;
float shadow(){
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++) s += texture(uShadow, vec3(p.xy + vec2(x,y)*uShadowTexel, p.z - 0.0022));
  return s / 9.0;
}
void main(){
  vec3 col = vCol;
  if (vSeam > 0.0) {
    vec3 an = abs(vMN);
    vec2 q = an.x > 0.5 ? vLP.yz : (an.y > 0.5 ? vLP.xz : vLP.xy);
    vec2 f = fract(q / vSeam + 0.0001); vec2 e = min(f, 1.0 - f) * vSeam;
    float d = min(e.x, e.y);
    float aa = max(fwidth(d), 0.0008);
    float line = 1.0 - smoothstep(0.0025, 0.0025 + aa * 1.2, d);
    float hi = (1.0 - smoothstep(0.0, aa * 1.5, f.y * vSeam - 0.004)) * 0.0;
    col *= 1.0 - line * 0.2;
    col += hi;
  }
  if (vEmit > 1.5) { o = vec4(mix(col, vec3(0.1, 0.13, 0.26), uNight * 0.92), 1.0); return; }
  if (vEmit > 0.5) { o = vec4(col * (1.0 + uNight * 0.15), 1.0); return; }
  vec3 N = normalize(vN);
  float sh = shadow();
  float diff = max(dot(N, uSunDir), 0.0) * sh;
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float side = N.x > 0.5 ? 0.97 : (N.z > 0.5 ? 1.0 : (N.y < -0.5 ? 0.75 : 0.92));
  vec3 light = amb * side + uSunCol * diff;
  for (int i=0;i<4;i++){
    vec3 d = uLP[i] - vW; float l = length(d);
    light += uLC[i] * max(dot(N, d / l), 0.0) / (1.0 + l*l*1.4);
  }
  o = vec4(pow(col * light, vec3(0.97)), 1.0);
}`;
const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos,1.0); }`;
const FS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`;
const VS_TEX = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uVP, uModel; out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * uModel * vec4(aPos,1.0); }`;
const FS_TEX = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; uniform float uBright; out vec4 o;
void main(){ o = vec4(texture(uTex, vUV).rgb * uBright, 1.0); }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

function upload(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.v), gl.STATIC_DRAW);
  const st = 11 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 40);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.i), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.i.length, bufs: [vb, ib] };
}

// ─────────────── the characters ───────────────
// Interlocking toy-brick proportions share the existing pose rig and hit targets.
function buildToyCharacterMeshes(sp) {
  const skin = sp.skin, jacket = sp.top, trim = sp.trim || 0xF2C94C;
  const torso = new Mesh();
  torso.vox(-4.5, 0, -2.5, 4.5, 7, 2.5, jacket);
  torso.vox(-4.5, 0, 2.5, 4.5, 0.7, 2.85, darken(jacket, 0.18));
  torso.vox(-3.7, 6.1, 2.51, 3.7, 6.8, 2.83, lighten(jacket, 0.18));
  torso.vox(-2.6, 1.4, 2.52, 2.6, 5.8, 2.87, sp.kind === 'suit' ? 0xF5F7F2 : darken(jacket, 0.13));
  if (sp.kind === 'suit') {
    torso.vox(-0.8, 2, 2.88, 0.8, 5.9, 3.1, sp.tie || trim);
    torso.vox(-3.4, 5.2, 2.88, -1.8, 6.3, 3.06, jacket);
    torso.vox(1.8, 5.2, 2.88, 3.4, 6.3, 3.06, jacket);
  } else {
    torso.vox(-2, 2.5, 2.9, 2, 3.2, 3.06, trim);
    torso.stud(0, 4.4 * V, 2.9 * V, 0.54 * V, trim);
  }
  torso.cylinder(0, 6.8 * V, 0, 1.6 * V, 8.1 * V, skin);
  for (const x of [-3.1, 3.1]) torso.stud(x * V, 7 * V, 0, 0.85 * V, lighten(jacket, 0.12));

  const head = new Mesh();
  head.cylinder(0, 0, 0, 4.9 * V, 8.6 * V, skin, 18);
  head.cylinder(0, 8.6 * V, 0, 2.2 * V, 9.65 * V, skin, 16);
  for (const x of [-2.1, 2.1]) {
    head.vox(x - 0.65, 4.6, 4.25, x + 0.65, 5.8, 5.03, 0x171A24);
    head.vox(x - 0.4, 5.5, 5.04, x - 0.05, 5.8, 5.13, 0xFFFFFF);
  }
  head.vox(-1.5, 2.65, 4.58, 1.5, 3.05, 5.04, 0x7B4533);
  const hair = sp.cap || sp.hair;
  if (sp.cap) {
    head.vox(-5.3, 7.6, -5.3, 5.3, 9.3, 5.3, hair);
    head.vox(-4.1, 7.1, 4.7, 4.1, 7.9, 8.0, darken(hair, 0.13));
  } else {
    head.vox(-5.1, 8.3, -5, 5.1, 10.1, 5.1, hair);
    head.vox(-5.0, 6.9, -4.9, -3.9, 8.7, 4.3, hair);
    head.vox(3.9, 6.9, -4.9, 5.0, 8.7, 4.3, hair);
    if (sp.style === 'messy') for (const x of [-3, 0, 3]) head.stud(x * V, 10.1 * V, 0, 1.15 * V, lighten(hair, 0.08));
    if (sp.style === 'side') head.vox(-4.6, 7.7, 4.1, 1.1, 8.7, 5.2, hair);
  }
  if (sp.glasses) {
    for (const x of [-2.15, 2.15]) head.vox(x - 1.05, 4.25, 5.02, x + 1.05, 6.25, 5.3, 0x1B2B44);
    head.vox(-0.9, 5.35, 5.03, 0.9, 5.7, 5.32, 0x1B2B44);
  }
  if (sp.headphones) {
    head.vox(-5.8, 9.7, -1, 5.8, 10.5, 1, 0x20314C);
    for (const x of [-5.6, 5.6]) head.cylinder(x * V, 3.2 * V, 0, 1.15 * V, 7.8 * V, 0x20314C, 10);
  }

  const arm = (withBag) => {
    const a = new Mesh();
    a.cylinder(0, -5.2 * V, 0, 1.45 * V, 0.4 * V, jacket, 12);
    a.cylinder(0, -6.1 * V, 0, 1.55 * V, -5.2 * V, darken(jacket, 0.16), 12);
    a.cylinder(0, -8.15 * V, 0, 1.55 * V, -6.1 * V, skin, 12);
    a.vox(-1.4, -8.5, 0.6, 1.4, -7.6, 1.9, skin);
    if (withBag) {
      a.vox(-0.45, -9.5, -0.7, 0.45, -8.1, 0.7, 0x4B627F);
      a.vox(-1.7, -14, -3.1, 1.7, -9.4, 3.1, 0xE1A94D);
      a.vox(-1.85, -13.1, -3.25, 1.85, -12.5, 3.25, 0xA66D31);
      a.stud(0, -9.4 * V, 0, 0.9 * V, 0xF3CE72);
    }
    return a;
  };
  const leg = new Mesh();
  leg.vox(-2, -6.1, -2.15, 2, 0, 2.15, sp.pants);
  leg.vox(-2.25, -7, -2.4, 2.25, -6.1, 3.2, darken(sp.pants, 0.28));
  leg.cylinder(0, 0, 0, 1.3 * V, 0.7 * V, sp.pants, 10);
  return { torso, head, armL: arm(false), armR: arm(!!sp.bag), leg };
}
function buildCharacter(gl, sp) {
  return Object.fromEntries(Object.entries(buildToyCharacterMeshes(sp)).map(([key, mesh]) => [key, upload(gl, mesh)]));
}
function darken(h, a) { const c = hex(h).map((x) => Math.round(x * (1 - a) * 255)); return (c[0] << 16) | (c[1] << 8) | c[2]; }
function lighten(h, a) { const c = hex(h).map((x) => Math.round((x + (1 - x) * a) * 255)); return (c[0] << 16) | (c[1] << 8) | c[2]; }

// pose → list of [part, matrix]
function posed(parts, root, pose) {
  const hip = 7 * V;
  const base = mul(root, T(0, hip + (pose.bounce || 0), 0));
  const torso = mul(base, RY(pose.twist || 0));
  const head = chain(torso, T(0, 7.6 * V, 0), RY(pose.headYaw || 0), RX(pose.headPitch || 0));
  const armL = chain(torso, T(-5 * V, 6.5 * V, 0), RZ(pose.armLZ || 0.06), RX(pose.armL || 0));
  const armR = chain(torso, T(5 * V, 6.5 * V, 0), RZ(-(pose.armRZ || 0.06)), RX(pose.armR || 0));
  const legL = chain(base, T(-2 * V, 0, 0), RX(pose.legL || 0));
  const legR = chain(base, T(2 * V, 0, 0), RX(pose.legR || 0));
  return {
    draws: [[parts.torso, torso], [parts.head, head], [parts.armL, armL], [parts.armR, armR], [parts.leg, legL], [parts.leg, legR]],
    headTop: xf(head, [0, 13 * V, 0]),
  };
}

// ─────────────── 5x7 voxel letters for the wall ───────────────
const GLYPHS = {
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
};

// ─────────────── canvas textures ───────────────
function canvasTex(gl, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { c, ctx: c.getContext('2d'), t, push() { gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); } };
}
function pixRows(ctx, rows, x0, y0, s, color) {
  ctx.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') ctx.fillRect(x0 + x * s, y0 + y * s, s, s); }));
}
function drawRocket(tx) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#0B0C0E'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#26282D'; for (let i = 0; i < 18; i++) ctx.fillRect((i * 53) % c.width, (i * 29) % c.height, 3, 3);
  const R = ['....#....', '...###...', '..#####..', '..##.##..', '..##.##..', '..#####..', '..#####..', '.#######.', '##.###.##', '#..###..#', '...#.#...'];
  pixRows(ctx, R, c.width / 2 - 45, 22, 10, '#39C75A');
  pixRows(ctx, ['...#.#...', '....#....'], c.width / 2 - 45, 22 + 110, 10, '#F2B33D');
}
function drawX(tx) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#0B0C0E'; ctx.fillRect(0, 0, c.width, c.height);
  const X = ['##.....##', '.##...##.', '..##.##..', '...###...', '...###...', '..##.##..', '.##...##.', '##.....##'];
  pixRows(ctx, X, c.width / 2 - 54, c.height / 2 - 48, 12, '#F4F4F2');
}

// ─────────────── the office ───────────────
export function createOffice(host, { onAction } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'office-gl';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) { canvas.remove(); throw new Error('no webgl2'); }

  const prog = compile(gl, VS, FS);
  const depthProg = compile(gl, VS_DEPTH, FS_DEPTH);
  const texProg = compile(gl, VS_TEX, FS_TEX);

  // ── shadow map ──
  const SM = 2048;
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFB = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ── static room (casts shadows) + walls (don't) ──
  const room = new Mesh();
  const walls = new Mesh();
  const { w: RW, d: RD, h: RH } = ROOM;
  // Modular blue baseplate; shallow studs make the floor read as a construction toy.
  room.box(-0.25, -0.3, -0.25, RW + 0.25, 0, RD + 0.25, 0xA5C9F5, 0.5);
  for (let x = 0.28; x < RW; x += 0.46) for (let z = 0.28; z < RD; z += 0.46)
    room.stud(x, 0, z, 0.055, 0xB5D5FB);
  walls.box(-0.25, 0, -0.25, RW + 0.25, RH, 0, 0xDCEAFF, 0);                   // back wall
  walls.box(RW, 0, -0.25, RW + 0.25, RH, RD + 0.25, 0xD2E4FD, 0);               // right wall
  walls.box(-0.25, 0, 0, 0, 0.42, RD + 0.25, 0xE9E5DE, 0);                      // low cut-away rims
  walls.box(0, 0, RD, RW, 0.42, RD + 0.25, 0xE9E5DE, 0);
  walls.box(-0.25, 0.42, -0.25, 0, 0.46, RD + 0.25, 0x275CBD, 0);
  walls.box(0, 0.42, RD, RW + 0.25, 0.46, RD + 0.25, 0x275CBD, 0);
  walls.box(0, 0, -0.01, RW, 0.1, 0.02, 0xD9D4CB, 0);                          // skirting
  walls.box(RW - 0.02, 0, 0, RW + 0.01, 0.1, RD, 0xD9D4CB, 0);

  // door (back wall, left)
  walls.box(0.3, 0, 0, 1.25, 2.1, 0.05, 0x2B2B30);
  walls.box(0.37, 0, 0.05, 1.18, 2.03, 0.06, 0xE7E3DC);
  walls.box(1.0, 1.0, 0.06, 1.1, 1.06, 0.13, 0x1B1B1E);

  // TEKKTEAM letters in black voxels
  const L = 0.095, lx0 = 1.45, ly0 = 2.27;
  [...'TEKKTEAM'].forEach((ch, i) => {
    GLYPHS[ch].forEach((row, r) => [...row].forEach((px, c) => {
      if (px !== '#') return;
      const x = lx0 + (i * 6 + c) * L, y = ly0 + (6 - r) * L;
      room.box(x, y, 0, x + L, y + L, 0.16, 0x174C9D, L);
    }));
  });

  // right wall: big windows
  for (let k = 0; k < 4; k++) {
    const z0 = 0.7 + k * 1.62, z1 = z0 + 1.42;
    walls.box(RW - 0.03, 0.35, z0, RW, 2.4, z1, 0xDDE8EE, 0, 2);               // glass (glows)
    walls.box(RW - 0.08, 0.3, z0 - 0.06, RW, 0.36, z1 + 0.06, 0x2B2B30);
    walls.box(RW - 0.08, 2.4, z0 - 0.06, RW, 2.46, z1 + 0.06, 0x2B2B30);
    walls.box(RW - 0.08, 0.3, z0 - 0.06, RW, 2.46, z0, 0x2B2B30);
    walls.box(RW - 0.08, 0.3, z1, RW, 2.46, z1 + 0.06, 0x2B2B30);
    walls.box(RW - 0.06, 1.34, z0, RW, 1.38, z1, 0x2B2B30);
  }
  // framed green chart on the back wall
  walls.box(7.1, 1.35, 0, 8.35, 2.5, 0.05, 0xFAFAF8);
  walls.box(7.2, 1.45, 0.05, 8.25, 2.4, 0.06, 0x121316);
  [0.25, 0.4, 0.55, 0.72].forEach((h, i) => room.box(7.38 + i * 0.22, 1.56, 0.06, 7.38 + i * 0.22 + 0.14, 1.56 + h, 0.1, 0x39C75A, 0.07, 1));

  // bookshelf
  const shelf = (x, z) => {
    room.box(x, 0, z, x + 1.1, 1.3, z + 0.42, 0x2E2E33, 0.13);
    [0.42, 0.85].forEach((y) => room.box(x + 0.05, y, z + 0.02, x + 1.05, y + 0.04, z + 0.44, 0x3A3A40));
    const binders = [0x1F1F23, 0x1F1F23, 0xF1EFEA, 0x1F1F23, 0x39C75A, 0x1F1F23];
    binders.forEach((c, i) => room.box(x + 0.1 + i * 0.13, 0.89, z + 0.1, x + 0.2 + i * 0.13, 1.2, z + 0.4, c, 0.05));
    room.box(x + 0.12, 0.46, z + 0.1, x + 0.45, 0.62, z + 0.4, 0xE3C28F, 0.07);
    room.box(x + 0.6, 0.46, z + 0.1, x + 0.95, 0.58, z + 0.4, 0xF1EFEA, 0.07);
    room.box(x + 0.62, 0.58, z + 0.12, x + 0.93, 0.7, z + 0.38, 0xE3C28F, 0.07);
  };
  shelf(5.95, 0.02);

  // plants
  const plant = (x, z, s = 1, tall = false) => {
    const p = 0.34 * s;
    room.box(x - p / 2, 0, z - p / 2, x + p / 2, p * 1.05, z + p / 2, 0xF7F6F2, 0.07 * s);
    room.box(x - p / 2 + 0.02, p * 1.05, z - p / 2 + 0.02, x + p / 2 - 0.02, p * 1.08, z + p / 2 - 0.02, 0x4A3120);
    const g = [0x3DBE4E, 0x2FA43F, 0x55D060];
    const k = 0.08 * s;
    const levels = tall ? 9 : 5;
    for (let l = 0; l < levels; l++) {
      const r = (tall ? [2, 3, 3, 2, 3, 2, 2, 1, 1] : [2, 3, 2, 1, 1])[l];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.abs(a) + Math.abs(b) > r + (l % 2)) continue;
        if ((a * 7 + b * 13 + l * 5) % 5 === 0 && Math.abs(a) + Math.abs(b) === r) continue;
        const y = p * 1.08 + l * k;
        room.box(x + a * k - k / 2, y, z + b * k - k / 2, x + a * k + k / 2, y + k, z + b * k + k / 2, g[(a + b + l + 9) % 3], k);
      }
    }
  };
  plant(0.4, 0.45, 1.1, true);
  plant(9.55, 0.45, 1.25, true);
  plant(5.55, 0.35, 0.9);
  plant(0.45, 6.9, 1.15);
  plant(9.5, 6.95, 1.0, true);

  // rug
  room.box(1.7, 0, 4.3, 4.5, 0.025, 6.5, 0x3A3B40, 0.1);

  // desks
  const desk = (x, z, w = 1.8, d = 0.86) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    room.box(x0, 0.72, z0, x1, 0.79, z1, 0xF4F8FF, 0.09);                        // snap-on desk top
    for (let sx = x0 + 0.19; sx < x1 - 0.1; sx += 0.28)
      room.stud(sx, 0.79, z0 + 0.12, 0.052, 0xF8FAFF);
    room.box(x0 + 0.04, 0, z0 + 0.05, x0 + 0.1, 0.72, z1 - 0.05, 0x2E2E33);      // side legs
    room.box(x0 + 0.04, 0.02, z0 + 0.05, x0 + 0.1, 0.08, z1 - 0.05, 0x2E2E33);
    room.box(x1 - 0.55, 0, z0 + 0.06, x1 - 0.04, 0.72, z1 - 0.06, 0x275CBD, 0.18); // drawer brick
    room.box(x1 - 0.35, 0.55, z1 - 0.06, x1 - 0.24, 0.58, z1 - 0.03, 0x1B1B1E);
    room.box(x1 - 0.35, 0.33, z1 - 0.06, x1 - 0.24, 0.36, z1 - 0.03, 0x1B1B1E);
    return 0.79;
  };
  const chair = (x, z, face) => {
    const s = face; // +1: back of the chair at lower z
    room.box(x - 0.26, 0.4, z - 0.26, x + 0.26, 0.47, z + 0.26, 0x2462C6, 0.07);
    room.box(x - 0.25, 0.47, z - s * 0.3, x + 0.25, 1.05, z - s * 0.22, 0x2462C6, 0.07);
    room.stud(x, 0.47, z, 0.07, 0x3D82EC);
    room.box(x - 0.03, 0.08, z - 0.03, x + 0.03, 0.4, z + 0.03, 0x4A4A50);
    room.box(x - 0.3, 0.05, z - 0.03, x + 0.3, 0.09, z + 0.03, 0x2A2A2F);
    room.box(x - 0.03, 0.05, z - 0.3, x + 0.03, 0.09, z + 0.3, 0x2A2A2F);
    [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]].forEach(([a, b]) => room.box(x + a - 0.035, 0, z + b - 0.035, x + a + 0.035, 0.05, z + b + 0.035, 0x151517));
  };

  // screens (textured quads) collected here
  const quads = [];
  const quad = (tex, cx, cy, cz, w, h, facing) => quads.push({ tex, cx, cy, cz, w, h, facing });
  const monitor = (x, y, z, face, w = 0.66, h = 0.42) => {
    // face = +1 screen towards +z, -1 towards -z
    const zb = z - face * 0.03, zf = z + face * 0.03;
    room.box(x - w / 2, y + 0.16, zb, x + w / 2, y + 0.16 + h, zf, 0x1D1D21, 0.07);
    room.box(x - 0.04, y, z - face * 0.07, x + 0.04, y + 0.2, z - face * 0.03, 0x2A2A2F);
    room.box(x - 0.16, y, z - 0.12, x + 0.16, y + 0.02, z + 0.08, 0x2A2A2F);
    return { cx: x, cy: y + 0.16 + h / 2, zFront: zf + face * 0.002, zBack: zb - face * 0.002, w: w - 0.06, h: h - 0.06 };
  };

  const tex = {
    chart: canvasTex(gl, 320, 200), list: canvasTex(gl, 320, 200),
    rocket: canvasTex(gl, 256, 160), x: canvasTex(gl, 256, 160), wall: canvasTex(gl, 256, 160),
  };
  drawRocket(tex.rocket); tex.rocket.push();
  drawX(tex.x); tex.x.push();

  // LAUNCH desk (back, under the letters): worker faces the camera, laptop lid shows the rocket
  const LD = { x: 4.1, z: 1.75 };
  let top = desk(LD.x, LD.z);
  chair(LD.x - 0.1, LD.z - 0.85, 1);
  room.box(LD.x - 0.34, top, LD.z - 0.05, LD.x + 0.26, top + 0.025, LD.z + 0.3, 0x2A2A2F);  // laptop base
  room.box(LD.x - 0.34, top, LD.z + 0.3, LD.x + 0.26, top + 0.4, LD.z + 0.33, 0x1D1D21, 0.07); // lid
  quad('rocket', LD.x - 0.04, top + 0.2, LD.z + 0.332, 0.54, 0.34, 1);
  [[0.55, 0.12, 4], [0.66, 0.2, 3], [0.6, 0.28, 2]].forEach(([dx, dz, n]) => { for (let i = 0; i < n; i++) room.box(LD.x + dx - 0.05, top + i * 0.035, LD.z + dz - 0.05, LD.x + dx + 0.05, top + i * 0.035 + 0.03, LD.z + dz + 0.05, i % 2 ? 0xE8B32E : 0xF2C94C, 0.035); });
  room.box(LD.x - 0.72, top, LD.z + 0.05, LD.x - 0.54, top + 0.1, LD.z + 0.2, 0x1B1B1E, 0.05); // mug
  plantSmall(LD.x - 0.7, LD.z - 0.2);

  // SHILL desk (right, middle): worker faces the camera, big monitor with the X on its back
  const SD = { x: 7.35, z: 3.35 };
  top = desk(SD.x, SD.z);
  chair(SD.x, SD.z - 0.85, 1);
  const shM = monitor(SD.x - 0.05, top, SD.z + 0.18, -1, 0.92, 0.56);
  quad('x', shM.cx, shM.cy, shM.zBack + 0.004, shM.w * 0.92, shM.h * 0.9, 1);
  room.box(SD.x + 0.4, top, SD.z - 0.1, SD.x + 0.62, top + 0.14, SD.z + 0.15, 0x2FA84F, 0.035); // books
  room.box(SD.x + 0.4, top + 0.14, SD.z - 0.1, SD.x + 0.62, top + 0.2, SD.z + 0.15, 0xF1EFEA, 0.035);
  room.box(SD.x - 0.35, top, SD.z - 0.3, SD.x + 0.25, top + 0.02, SD.z - 0.1, 0x1B1B1E);          // keyboard

  // TRADE desk (right, front): trader has his back to the camera, two chart screens face us
  const TD = { x: 7.0, z: 5.55 };
  top = desk(TD.x, TD.z, 2.0);
  chair(TD.x - 0.05, TD.z + 0.85, -1);
  const m1 = monitor(TD.x - 0.4, top, TD.z - 0.12, 1, 0.74, 0.46);
  const m2 = monitor(TD.x + 0.42, top, TD.z - 0.16, 1, 0.66, 0.46);
  quad('chart', m1.cx, m1.cy, m1.zFront, m1.w, m1.h, 1);
  quad('list', m2.cx, m2.cy, m2.zFront, m2.w, m2.h, 1);
  room.box(TD.x - 0.38, top, TD.z + 0.12, TD.x + 0.2, top + 0.02, TD.z + 0.3, 0x1B1B1E);
  plantSmall(TD.x - 0.9, TD.z - 0.2);

  function plantSmall(x, z) {
    room.box(x - 0.07, 0.79, z - 0.07, x + 0.07, 0.93, z + 0.07, 0xF7F6F2, 0.035);
    const k = 0.045;
    [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 1, 0], [0, 1, -1], [0, 2, 0], [-1, 1, 1]].forEach(([a, l, b], i) => {
      const y = 0.93 + l * k;
      room.box(x + a * k - k / 2, y, z + b * k - k / 2, x + a * k + k / 2, y + k, z + b * k + k / 2, [0x3DBE4E, 0x2FA43F, 0x55D060][i % 3], k);
    });
  }

  const roomGL = upload(gl, room);
  const wallsGL = upload(gl, walls);

  // quads → one VAO each (few, simple)
  const quadGL = quads.map((q) => {
    const hw = q.w / 2, hh = q.h / 2, f = q.facing;
    const v = f > 0
      ? [q.cx - hw, q.cy - hh, q.cz, 0, 0, q.cx + hw, q.cy - hh, q.cz, 1, 0, q.cx + hw, q.cy + hh, q.cz, 1, 1, q.cx - hw, q.cy + hh, q.cz, 0, 1]
      : [q.cx + hw, q.cy - hh, q.cz, 0, 0, q.cx - hw, q.cy - hh, q.cz, 1, 0, q.cx - hw, q.cy + hh, q.cz, 1, 1, q.cx + hw, q.cy + hh, q.cz, 0, 1];
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, tex: q.tex };
  });

  // particles: coin, post card, candle
  const coinMesh = new Mesh();
  for (let a = -3; a < 3; a++) for (let b = -3; b < 3; b++) {
    if ((a === -3 || a === 2) && (b === -3 || b === 2)) continue;
    coinMesh.vox(a, b, -0.5, a + 1, b + 1, 0.5, (a + b) % 3 === 0 ? 0xF7D35C : 0xE8B32E);
  }
  coinMesh.vox(-1, -2, 0.5, 0, 2, 0.8, 0xFFE89A); coinMesh.vox(-1, -2, -0.8, 0, 2, -0.5, 0xFFE89A);
  const postMesh = new Mesh();
  postMesh.vox(-3, -2, -0.4, 3, 2, 0.4, 0xF7F7F5);
  postMesh.vox(-2.5, 0.5, 0.4, -1, 1.5, 0.6, 0x1B1B1E); postMesh.vox(-0.5, 0.8, 0.4, 2.5, 1.2, 0.6, 0x9A9AA0); postMesh.vox(-2.5, -1.2, 0.4, 2.5, -0.8, 0.6, 0x9A9AA0);
  const upMesh = new Mesh(); upMesh.vox(-0.8, -3, -0.8, 0.8, 3, 0.8, 0x39C75A); upMesh.vox(-0.3, 3, -0.3, 0.3, 4.2, 0.3, 0x39C75A); upMesh.vox(-0.3, -4.2, -0.3, 0.3, -3, 0.3, 0x39C75A);
  const downMesh = new Mesh(); downMesh.vox(-0.8, -3, -0.8, 0.8, 3, 0.8, 0xE4453A); downMesh.vox(-0.3, 3, -0.3, 0.3, 4.2, 0.3, 0xE4453A); downMesh.vox(-0.3, -4.2, -0.3, 0.3, -3, 0.3, 0xE4453A);
  const P = { coin: upload(gl, coinMesh), post: upload(gl, postMesh), up: upload(gl, upMesh), down: upload(gl, downMesh) };
  const particles = [];
  const spawn = (kind, x, y, z) => particles.push({ kind, x, y, z, vx: (Math.random() - 0.5) * 0.25, vy: 0.55 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.25 + 0.15, life: 0, max: 1.9 + Math.random() * 0.6, spin: Math.random() * 6 });

  // ── characters ──
  const crew = {
    launch: { role: 'launch', parts: buildCharacter(gl, { skin: 0xF2BD93, hair: 0x2E221C, style: 'messy', top: 0xF7C957, pants: 0x2255AD, kind: 'tee', cap: 0x2F5FD0, capBack: true }), x: LD.x - 0.1, z: LD.z - 0.72, yaw: 0, seated: true, phase: 0 },
    shill: { role: 'shill', parts: buildCharacter(gl, { skin: 0xEFBE95, hair: 0x1D1916, style: 'messy', top: 0xB9E8ED, pants: 0x31427B, kind: 'sweater', headphones: true }), x: SD.x, z: SD.z - 0.72, yaw: 0, seated: true, phase: 1.7 },
    trade: { role: 'trade', parts: buildCharacter(gl, { skin: 0xDFA777, hair: 0x6E3B1F, style: 'side', top: 0x4AC2AA, pants: 0x233E7B, kind: 'sweater', glasses: true }), x: TD.x - 0.05, z: TD.z + 0.72, yaw: Math.PI, seated: true, phase: 3.1 },
    boss: { role: 'how', parts: buildCharacter(gl, { skin: 0xF3BA86, hair: 0x493424, style: 'side', top: 0x2357BE, pants: 0x163A83, kind: 'suit', tie: 0xF5C451, bag: true }), x: 3.1, z: 5.2, yaw: 0.5, seated: false, phase: 0 },
  };
  const bossPath = [[3.1, 5.2], [2.2, 3.6], [4.4, 3.0], [5.4, 4.6], [4.6, 6.2], [2.6, 6.3]];
  const boss = crew.boss;
  let bossLeg = 0, bossWait = 1.5, bossTarget = 1, bossStep = 0;

  // ── speech bubbles (HTML) ──
  const ICON = {
    launch: ['....#....', '...###...', '..#####..', '..##.##..', '..#####..', '.#######.', '##.###.##', '...#.#...'],
    shill: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'],
    trade: ['......##', '.....###', '....##..', '#..##...', '##.#....', '.###....', '..#.....', '........'],
    how: ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'],
  };
  const svgIcon = (rows) => {
    let r = '';
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${r}</svg>`;
  };
  const layer = document.createElement('div');
  layer.className = 'office-bubbles';
  const BUB = {
    launch: { t: 'Launch a coin', s: 'it gets its own AI trader' },
    shill: { t: 'Shill on X', s: 'ready-made post, one click' },
    trade: { t: 'Trade', s: 'agents trade real SOL 24/7' },
    how: { t: 'How it works', s: 'the boss explains' },
  };
  const bubbles = {};
  for (const role of ['launch', 'shill', 'trade', 'how']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ob ob-' + role;
    b.dataset.role = role;
    b.innerHTML = `<span class="ob-ic">${svgIcon(ICON[role])}</span><span class="ob-t"><b>${BUB[role].t}</b><small>${BUB[role].s}</small></span>`;
    b.addEventListener('click', () => onAction && onAction(role));
    b.addEventListener('pointerenter', () => { hover = role; });
    b.addEventListener('pointerleave', () => { if (hover === role) hover = null; });
    b.addEventListener('focus', () => { hover = role; });
    b.addEventListener('blur', () => { if (hover === role) hover = null; });
    layer.appendChild(b);
    bubbles[role] = b;
  }
  host.appendChild(layer);
  let hover = null;

  // ── camera ──
  let cssW = 1, cssH = 1, dpr = 1;
  let VP = m4(), view = m4(), proj = m4();
  let yaw = -0.62, yawTarget = -0.62, pitch = 0.58;
  const center = [5.0, 0.9, 3.6];
  function fit() {
    const eye = [center[0] + Math.sin(yaw) * Math.cos(pitch) * 30, center[1] + Math.sin(pitch) * 30, center[2] + Math.cos(yaw) * Math.cos(pitch) * 30];
    view = lookAt(eye, center);
    const pts = [];
    for (const x of [-0.25, RW + 0.25]) for (const y of [-0.3, RH]) for (const z of [-0.25, RD + 0.25]) pts.push(xf(view, [x, y, z]));
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
    for (const p of pts) { l = Math.min(l, p[0]); r = Math.max(r, p[0]); b = Math.min(b, p[1]); t = Math.max(t, p[1]); }
    const aspect = cssW / cssH;
    const cw = (r - l), ch = (t - b);
    // On narrow screens the complete room must remain inside the canvas.
    const narrow = cssW < 640;
    let zoom = narrow ? 1.08 : 0.9;
    let hw = cw / 2 * zoom, hh = ch / 2 * zoom;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    const mx = (l + r) / 2 + (narrow ? 0 : 0.1), my = (b + t) / 2 + (narrow ? 0 : 0.05);
    proj = ortho(mx - hw, mx + hw, my - hh, my + hh, 1, 80);
    VP = mul(proj, view);
  }
  // sun through the right-hand windows
  const sunDir = norm([0.75, 1.0, 0.42]);
  const lightView = lookAt([center[0] + sunDir[0] * 20, center[1] + sunDir[1] * 20, center[2] + sunDir[2] * 20], center);
  const lightVP = (() => {
    const pts = [];
    for (const x of [0, RW]) for (const y of [0, RH]) for (const z of [0, RD]) pts.push(xf(lightView, [x, y, z]));
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
    for (const p of pts) { l = Math.min(l, p[0]); r = Math.max(r, p[0]); b = Math.min(b, p[1]); t = Math.max(t, p[1]); n = Math.min(n, -p[2]); f = Math.max(f, -p[2]); }
    return mul(ortho(l - 0.5, r + 0.5, b - 0.5, t + 0.5, n - 5, f + 5), lightView);
  })();

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    fit();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // pointer: gentle parallax + clicking the workers themselves
  let anchors = {};
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    yawTarget = -0.62 + (px - 0.5) * 0.16;
    const hit = pickAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = hit ? 'pointer' : '';
    if (hit !== hoverCanvas) { hoverCanvas = hit; }
  };
  let hoverCanvas = null;
  const onLeave = () => { yawTarget = -0.62; hoverCanvas = null; canvas.style.cursor = ''; };
  const onClick = (e) => {
    const r = host.getBoundingClientRect();
    const hit = pickAt(e.clientX - r.left, e.clientY - r.top);
    if (hit && onAction) onAction(hit);
  };
  function pickAt(x, y) {
    let best = null, bd = Infinity;
    for (const [role, a] of Object.entries(anchors)) {
      // body spans from the head top down ~ 1.2 world units; test a capsule on screen
      const dx = x - a.x, dy = y - (a.y + a.h * 0.45);
      const d = Math.abs(dx) / (a.h * 0.28) + Math.abs(dy) / (a.h * 0.55);
      if (d < 1 && d < bd) { bd = d; best = role; }
    }
    return best;
  }
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  // ── live data for screens + bubbles ──
  const series = [];
  let price = 1;
  for (let i = 0; i < 40; i++) { const o = price; price *= 1 + (Math.random() - 0.46) * 0.05; series.push([o, price]); }
  let chartLabel = '$SOL', chartChg = 0, lastTrades = [];
  function paintChart() {
    const { ctx, c } = tex.chart;
    ctx.fillStyle = '#08120D'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#13261B'; ctx.lineWidth = 1;
    for (let y = 30; y < c.height; y += 34) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(c.width, y + 0.5); ctx.stroke(); }
    const vals = series.flat(); const mn = Math.min(...vals), mx = Math.max(...vals);
    const Y = (v) => 40 + (1 - (v - mn) / (mx - mn || 1)) * (c.height - 56);
    const cw = (c.width - 16) / series.length;
    series.forEach(([o, cl], i) => {
      const up = cl >= o; ctx.fillStyle = up ? '#39D46A' : '#F0564A';
      const x = 8 + i * cw;
      ctx.fillRect(x + cw / 2 - 1, Math.min(Y(o), Y(cl)) - 5, 2, Math.abs(Y(o) - Y(cl)) + 10);
      ctx.fillRect(x + 1, Math.min(Y(o), Y(cl)), cw - 2, Math.max(3, Math.abs(Y(o) - Y(cl))));
    });
    ctx.fillStyle = '#E6F4EA'; ctx.font = 'bold 22px monospace'; ctx.fillText(chartLabel, 10, 26);
    ctx.fillStyle = chartChg >= 0 ? '#39D46A' : '#F0564A'; ctx.textAlign = 'right';
    ctx.fillText((chartChg >= 0 ? '+' : '') + (chartChg * 100).toFixed(1) + '%', c.width - 10, 26); ctx.textAlign = 'left';
    tex.chart.push();
  }
  function paintList() {
    const { ctx, c } = tex.list;
    ctx.fillStyle = '#0A0E12'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#7F8C99'; ctx.font = 'bold 17px monospace'; ctx.fillText('AGENT TRADES', 10, 22);
    const rows = lastTrades.length ? lastTrades.slice(0, 6) : [{ side: 'BUY', symbol: '...', sol: 0 }];
    rows.forEach((t, i) => {
      const y = 50 + i * 26;
      ctx.fillStyle = t.side === 'BUY' ? '#39D46A' : '#F0564A';
      ctx.fillRect(10, y - 15, 44, 19);
      ctx.fillStyle = '#08120D'; ctx.font = 'bold 14px monospace'; ctx.fillText(t.side, 14, y);
      ctx.fillStyle = '#E6EDF3'; ctx.font = 'bold 16px monospace'; ctx.fillText('$' + String(t.symbol || '').slice(0, 8), 64, y);
      ctx.fillStyle = '#9FB0BF'; ctx.textAlign = 'right'; ctx.fillText(t.sol ? t.sol.toFixed(3) : '', c.width - 10, y); ctx.textAlign = 'left';
    });
    tex.list.push();
  }
  paintChart(); paintList();
  let screenTick = 0;
  function tickScreens(dt) {
    screenTick += dt;
    if (screenTick < 0.6) return;
    screenTick = 0;
    const last = series[series.length - 1];
    const nextClose = last[1] * (1 + (Math.random() - 0.47) * 0.035);
    if (Math.random() < 0.35) { series.push([last[1], nextClose]); if (series.length > 40) series.shift(); }
    else last[1] = nextClose;
    paintChart();
  }

  // ── theme (day / night) ──
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  let night = isDark() ? 1 : 0, nightTarget = night;
  const mo = new MutationObserver(() => { nightTarget = isDark() ? 1 : 0; dirty = true; });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── render ──
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dirty = true, running = false, raf = 0, last = performance.now(), t = 0, visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', onVis);

  function drawMesh(p, g, model) {
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.bindVertexArray(g.vao);
    gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduce) t += dt;
    yaw += (yawTarget - yaw) * Math.min(1, dt * 3);
    night += (nightTarget - night) * Math.min(1, dt * 4);
    fit();
    if (!reduce) tickScreens(dt);

    // ── animate the crew ──
    const draws = [];
    anchors = {};
    for (const k of ['launch', 'shill', 'trade']) {
      const c = crew[k];
      const active = hover === k || hoverCanvas === k;
      const ph = t * 13 + c.phase;
      const pose = {
        armL: -1.28 + Math.sin(ph) * 0.07, armR: -1.28 + Math.sin(ph + 1.9) * 0.07,
        legL: -1.45, legR: -1.45,
        headYaw: Math.sin(t * 0.6 + c.phase) * 0.18, headPitch: 0.08 + Math.sin(t * 1.7 + c.phase) * 0.03,
      };
      if (active) { pose.armR = -2.9 + Math.sin(t * 9) * 0.25; pose.armRZ = 0.25; pose.headYaw = c.yaw === 0 ? -0.35 : 0.5; pose.headPitch = -0.05; pose.bounce = Math.abs(Math.sin(t * 6)) * 0.02; }
      const root = chain(T(c.x, 0.47 - 7 * V, c.z), RY(c.yaw));
      const r = posed(c.parts, root, pose);
      draws.push(...r.draws);
      anchors[k] = r.headTop;
    }
    // boss walks between waypoints, stops for a chat, waves when you hover him
    const bActive = hover === 'how' || hoverCanvas === 'how';
    let moving = false;
    if (bActive) { let diff = yaw - boss.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; boss.yaw += diff * Math.min(1, dt * 6); }
    else if (bossWait > 0) { bossWait -= dt; let diff = yaw - boss.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; boss.yaw += diff * Math.min(1, dt * 4); }
    else {
      const [tx, tz] = bossPath[bossTarget];
      const dx = tx - boss.x, dz = tz - boss.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { bossTarget = (bossTarget + 1) % bossPath.length; bossWait = 1.2 + Math.random() * 2.2; }
      else {
        moving = true;
        const sp = Math.min(d, dt * 0.75);
        boss.x += dx / d * sp; boss.z += dz / d * sp;
        let want = Math.atan2(dx, dz), diff = want - boss.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        boss.yaw += diff * Math.min(1, dt * 6);
      }
    }
    bossStep += moving ? dt * 7.5 : 0;
    bossLeg += ((moving ? 1 : 0) - bossLeg) * Math.min(1, dt * 6);
    const sw = Math.sin(bossStep) * 0.55 * bossLeg;
    const bpose = {
      legL: sw, legR: -sw, armL: -sw * 0.8, armR: sw * 0.5,
      bounce: Math.abs(Math.cos(bossStep)) * 0.025 * bossLeg,
      headYaw: moving ? 0 : Math.sin(t * 0.8) * 0.3, headPitch: 0,
    };
    if (bActive) { bpose.armL = -2.9 + Math.sin(t * 9) * 0.25; bpose.armLZ = 0.25; bpose.bounce = Math.abs(Math.sin(t * 6)) * 0.02; }
    const br = posed(boss.parts, chain(T(boss.x, 0, boss.z), RY(boss.yaw)), bpose);
    draws.push(...br.draws);
    anchors.how = br.headTop;

    // particles
    if (!reduce) {
      if (Math.random() < dt * 0.55) spawn('coin', LD.x - 0.04, 1.15, LD.z + 0.2);
      if (Math.random() < dt * 0.45) spawn('post', SD.x - 0.05, 1.45, SD.z + 0.25);
      if (Math.random() < dt * 0.5) spawn(Math.random() < 0.6 ? 'up' : 'down', TD.x + (Math.random() - 0.5) * 1.2, 1.35, TD.z - 0.1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt; if (p.life > p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - dt * 0.6;
      const k = p.life / p.max;
      const s = Math.min(1, p.life * 6) * (1 - Math.max(0, k - 0.7) / 0.3);
      draws.push([P[p.kind], chain(T(p.x, p.y, p.z), RY(p.spin + t * (p.kind === 'coin' ? 5 : 1.5)), S(Math.max(0.001, s) * (p.kind === 'post' ? 1.1 : 1)))]);
    }

    // ── shadow pass ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
    gl.viewport(0, 0, SM, SM);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(depthProg.p);
    gl.uniformMatrix4fv(depthProg.u.uLightVP, false, lightVP);
    const I = m4();
    drawMesh(depthProg, roomGL, I);
    for (const [g, m] of draws) drawMesh(depthProg, g, m);

    // ── main pass ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, VP);
    gl.uniformMatrix4fv(prog.u.uLightVP, false, lightVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(prog.u.uShadow, 0);
    gl.uniform2f(prog.u.uShadowTexel, 1 / SM, 1 / SM);
    gl.uniform3fv(prog.u.uSunDir, sunDir);
    const n = night;
    const lerp3 = (a, b) => a.map((x, i) => x + (b[i] - x) * n);
    gl.uniform3fv(prog.u.uSunCol, lerp3([0.62, 0.56, 0.47], [0.05, 0.07, 0.13]));
    gl.uniform3fv(prog.u.uSky, lerp3([0.66, 0.67, 0.72], [0.2, 0.21, 0.3]));
    gl.uniform3fv(prog.u.uGround, lerp3([0.5, 0.48, 0.47], [0.1, 0.1, 0.14]));
    gl.uniform1f(prog.u.uNight, n);
    const lp = [LD.x, 1.5, LD.z + 0.9, SD.x, 1.5, SD.z + 0.7, TD.x, 1.4, TD.z + 0.6, 3.2, 2.4, 4.8];
    const lc = [0.9, 0.95, 1.1, 0.9, 0.95, 1.1, 0.45, 1.1, 0.6, 1.2, 0.95, 0.7].map((x) => x * n * 0.55);
    gl.uniform3fv(prog.u.uLP, lp); gl.uniform3fv(prog.u.uLC, lc);
    drawMesh(prog, wallsGL, I);
    drawMesh(prog, roomGL, I);
    for (const [g, m] of draws) drawMesh(prog, g, m);

    // screens
    gl.useProgram(texProg.p);
    gl.uniformMatrix4fv(texProg.u.uVP, false, VP);
    gl.uniformMatrix4fv(texProg.u.uModel, false, I);
    gl.uniform1f(texProg.u.uBright, 1.0);
    gl.uniform1i(texProg.u.uTex, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.disable(gl.CULL_FACE);
    for (const q of quadGL) {
      gl.bindTexture(gl.TEXTURE_2D, tex[q.tex].t);
      gl.bindVertexArray(q.vao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // ── bubbles follow the heads ──
    const scale = Math.max(0.72, Math.min(1.12, cssW / 1100));
    for (const [role, p] of Object.entries(anchors)) {
      const c = xf(VP, p);
      const x = (c[0] / c[3] * 0.5 + 0.5) * cssW;
      const y = (1 - (c[1] / c[3] * 0.5 + 0.5)) * cssH;
      const foot = xf(VP, role === 'how' ? [boss.x, 0, boss.z] : [crew[role].x, 0.3, crew[role].z]);
      const fy = (1 - (foot[1] / foot[3] * 0.5 + 0.5)) * cssH;
      anchors[role] = { x, y, h: Math.max(30, fy - y) };
      const bob = reduce ? 0 : Math.sin(t * 2.2 + (role.length * 1.3)) * 3;
      const b = bubbles[role];
      b.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - 8 + bob).toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      b.classList.toggle('hot', hover === role || hoverCanvas === role);
    }
    dirty = false;
    if (running && visible && !document.hidden && !reduce) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function start() {
    if (raf) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  resize();
  start();
  if (reduce) setInterval(() => { if (dirty || Math.abs(night - nightTarget) > 0.01) { night = nightTarget; start(); } }, 500);

  return {
    setData({ trades = [], tokens = [], coins = [] } = {}) {
      lastTrades = trades.slice(0, 6);
      paintList();
      const tr = trades[0];
      const tk = (tr && tokens.find((x) => x.symbol === tr.symbol)) || tokens.slice().sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))[0];
      if (tk) { chartLabel = '$' + String(tk.symbol).slice(0, 9); chartChg = tk.change1h || 0; }
      const small = (el, s) => { const n = el.querySelector('small'); if (n.textContent !== s) n.textContent = s; };
      if (tr) small(bubbles.trade, `${tr.side} $${String(tr.symbol).slice(0, 10)} · ${Number(tr.sol).toFixed(3)} SOL`);
      if (coins[0]) small(bubbles.launch, `latest: $${String(coins[0].ticker).slice(0, 10)}`);
      if (reduce) start();
    },
    celebrate(kind) {
      if (reduce) return;
      const n = 8;
      for (let i = 0; i < n; i++) {
        if (kind === 'launch') spawn('coin', LD.x - 0.04, 1.1, LD.z + 0.2);
        else if (kind === 'shill') spawn('post', SD.x - 0.05, 1.45, SD.z + 0.25);
        else spawn(Math.random() < 0.6 ? 'up' : 'down', TD.x + (Math.random() - 0.5) * 1.2, 1.35, TD.z - 0.1);
      }
    },
    destroy() {
      running = false; if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
      layer.remove(); canvas.remove();
      const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext();
    },
  };
}

// shared with the big rotating boss (boss3d.js)
export { V, Mesh, compile, upload, buildCharacter, buildToyCharacterMeshes, posed, mul, T, RX, RY, S, chain, xf, lookAt, ortho, norm };
