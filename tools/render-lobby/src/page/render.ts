/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-loop-statements, ts-patterns/no-nested-ternary, ts-patterns/no-explicit-any, ts-patterns/no-param-reassign, @typescript-eslint/no-explicit-any -- render tool: three 0.128 ohne Typen, Szenen-Objekte werden eingestellt */
/**
 * Läuft im Browser (Playwright, WebGL über SwiftShader): lädt die Szene aus `scene.bin`, baut daraus three.js-Meshes
 * mit eigenem Textur-Atlas, Licht (Abendsonne oder Nacht mit Laternen), Schatten, Nebel und Himmel und rendert einzelne
 * Aufnahmen. Figuren bekommen ein eigenes Spielermodell mit unseren Skins.
 */
// three 0.128 (aus /home/user/mm-cache) hat keine Typen dabei – hier bewusst lose typisiert.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

type V3 = [number, number, number];

export interface Figure {
  readonly skin: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Minecraft-Blickrichtung in Grad (0 = Süden). */
  readonly yaw: number;
  readonly sit?: boolean;
  readonly scale?: number;
  readonly pose?: Pose;
  /** Blocklicht an der Stelle (0 … 1). */
  readonly light?: number;
}

export interface Pose {
  readonly head?: [number, number];
  readonly armR?: [number, number];
  readonly armL?: [number, number];
  readonly legR?: number;
  readonly legL?: number;
  readonly body?: number;
}

export interface Shot {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Überabtastung (2 = in doppelter Größe rendern und verkleinern). */
  readonly ss?: number;
  readonly mode: 'day' | 'night' | 'studio';
  readonly camera: { readonly pos: V3; readonly target: V3; readonly fov?: number; readonly ortho?: number };
  /** Bereich für die Schattenkarte (Mitte + Radius). */
  readonly focus?: { readonly centre: V3; readonly radius: number; readonly depth?: number };
  readonly fog?: [number, number];
  /** Szene ausblenden (nur Figuren, durchsichtiger Hintergrund). */
  readonly figuresOnly?: boolean;
  readonly figures?: readonly Figure[];
  /** Figuren der Lobby zeigen. */
  readonly villagers?: boolean;
  /** Lobby-Figuren in diesem Umkreis weglassen (x, z, Radius), damit eigene Figuren Platz haben. */
  readonly clearAround?: readonly [number, number, number];
  /** Zusätzliche Punktlichter: x, y, z, Farbe, Stärke, Reichweite. */
  readonly lights?: readonly (readonly [number, number, number, number, number, number])[];
  /** Schatten auf einen unsichtbaren Boden werfen (für freigestellte Bilder). */
  readonly shadowCatcher?: boolean;
  /** Ausgaben: [Breite, Höhe, Format, Qualität, höchstens Bytes] – PNG, WebP, JPEG (verkleinert aus dem Hauptbild). */
  readonly outputs: readonly (readonly [number, number, 'png' | 'webp' | 'jpeg', number?, number?])[];
  readonly exposure?: number;
  readonly sun?: { readonly azimuth: number; readonly elevation: number };
}

interface Manifest {
  readonly atlas: { readonly size: number };
  readonly groups: Record<string, { verts: number; indices: number; offsets: Record<string, number> }>;
  readonly npcs: readonly {
    skin: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    sit: boolean;
    scale: number;
    light: number;
  }[];
  readonly skins: readonly string[];
}

const T: any = THREE;
const PX = 1 / 16;

let renderer: any;
let world: any;
let manifest: Manifest;
let atlasTex: any;
const skinTex = new Map<string, any>();
const groupMeshes: Record<string, any> = {};
const sharedUniforms = {
  uBlockLight: { value: new T.Color(0, 0, 0) },
  uLampEmit: { value: 0 },
  uWindow: { value: new T.Color(0, 0, 0) },
};

function patchGlow(mat: any): void {
  mat.onBeforeCompile = (shader: any) => {
    Object.assign(shader.uniforms, sharedUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vGlow;\nuniform vec3 uBlockLight;\nuniform float uLampEmit;\nuniform vec3 uWindow;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float bl = vGlow.x * vGlow.x * vGlow.x * (0.4 + 0.6 * vGlow.x);
        totalEmissiveRadiance += uBlockLight * bl * diffuseColor.rgb;
        totalEmissiveRadiance += diffuseColor.rgb * vGlow.y * uLampEmit;
        totalEmissiveRadiance += uWindow * vGlow.z;`,
      );
  };
}

async function loadTexture(url: string): Promise<any> {
  return new Promise((resolve, reject) => new T.TextureLoader().load(url, resolve, undefined, reject));
}

function buildGroup(name: string, buf: ArrayBuffer): any {
  const g = manifest.groups[name]!;
  const o = g.offsets;
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(buf, o.pos, g.verts * 3), 3));
  geo.setAttribute('normal', new T.BufferAttribute(new Int8Array(buf, o.nrm, g.verts * 3), 3, true));
  geo.setAttribute('uv', new T.BufferAttribute(new Uint16Array(buf, o.uv, g.verts * 2), 2, true));
  geo.setAttribute('color', new T.BufferAttribute(new Uint8Array(buf, o.col, g.verts * 3), 3, true));
  geo.setAttribute('glow', new T.BufferAttribute(new Uint8Array(buf, o.glow, g.verts * 3), 3, true));
  geo.setIndex(new T.BufferAttribute(new Uint32Array(buf, o.idx, g.indices), 1));
  geo.computeBoundingSphere();
  const common = { map: atlasTex, vertexColors: true, roughness: 0.92, metalness: 0 };
  const mats: Record<string, any> = {
    opaque: new T.MeshStandardMaterial({ ...common }),
    cutout: new T.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: T.DoubleSide }),
    glass: new T.MeshStandardMaterial({
      ...common,
      transparent: true,
      roughness: 0.15,
      depthWrite: false,
      side: T.DoubleSide,
    }),
    water: new T.MeshStandardMaterial({
      ...common,
      transparent: true,
      opacity: 0.82,
      roughness: 0.08,
      depthWrite: false,
    }),
  };
  const mat = mats[name];
  patchGlow(mat);
  const mesh = new T.Mesh(geo, mat);
  mesh.castShadow = name === 'opaque' || name === 'cutout';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  if (name === 'cutout') {
    mesh.customDepthMaterial = new T.MeshDepthMaterial({
      depthPacking: T.RGBADepthPacking,
      map: atlasTex,
      alphaTest: 0.5,
    });
  }
  mesh.renderOrder = name === 'water' ? 1 : name === 'glass' ? 2 : 0;
  return mesh;
}

// ---------------- Spielermodell ----------------

/** Ein Teil des Spielermodells mit der Skin-Aufteilung (64 × 64): u/v = linke obere Ecke des Netzes. */
function skinBox(w: number, h: number, d: number, u: number, v: number, inflate: number): any {
  const W = w / 2 + inflate;
  const H = h / 2 + inflate;
  const D = d / 2 + inflate;
  const faces: [V3[], [number, number, number, number], V3][] = [
    // vorne (+z)
    [
      [
        [-W, H, D],
        [W, H, D],
        [W, -H, D],
        [-W, -H, D],
      ],
      [u + d, v + d, w, h],
      [0, 0, 1],
    ],
    // hinten (-z)
    [
      [
        [W, H, -D],
        [-W, H, -D],
        [-W, -H, -D],
        [W, -H, -D],
      ],
      [u + 2 * d + w, v + d, w, h],
      [0, 0, -1],
    ],
    // rechte Seite der Figur (-x)
    [
      [
        [-W, H, -D],
        [-W, H, D],
        [-W, -H, D],
        [-W, -H, -D],
      ],
      [u, v + d, d, h],
      [-1, 0, 0],
    ],
    // linke Seite (+x)
    [
      [
        [W, H, D],
        [W, H, -D],
        [W, -H, -D],
        [W, -H, D],
      ],
      [u + d + w, v + d, d, h],
      [1, 0, 0],
    ],
    // oben
    [
      [
        [-W, H, -D],
        [W, H, -D],
        [W, H, D],
        [-W, H, D],
      ],
      [u + d, v, w, d],
      [0, 1, 0],
    ],
    // unten
    [
      [
        [-W, -H, D],
        [W, -H, D],
        [W, -H, -D],
        [-W, -H, -D],
      ],
      [u + d + w, v, w, d],
      [0, -1, 0],
    ],
  ];
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  faces.forEach(([c, [tu, tv, tw, th], n], i) => {
    const uvs = [
      [tu, tv],
      [tu + tw, tv],
      [tu + tw, tv + th],
      [tu, tv + th],
    ];
    c.forEach((p, k) => {
      pos.push(p[0] * PX, p[1] * PX, p[2] * PX);
      nrm.push(...n);
      uv.push(uvs[k]![0]! / 64, uvs[k]![1]! / 64);
    });
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function limb(
  mat: any,
  over: any,
  w: number,
  h: number,
  d: number,
  base: [number, number],
  top: [number, number],
  inflate: number,
): any {
  const pivot = new T.Group();
  const inner = new T.Mesh(skinBox(w, h, d, base[0], base[1], 0), mat);
  const outer = new T.Mesh(skinBox(w, h, d, top[0], top[1], inflate), over);
  [inner, outer].forEach((m) => {
    m.position.y = (-h / 2) * PX;
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
  });
  return pivot;
}

function makePlayer(f: Figure): any {
  const tex = skinTex.get(f.skin);
  const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  const over = new T.MeshStandardMaterial({
    map: tex,
    roughness: 0.85,
    metalness: 0,
    alphaTest: 0.5,
    side: T.DoubleSide,
  });
  [mat, over].forEach(patchGlow);
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);
  const pose = f.pose ?? {};
  // Kopf: Drehpunkt am Hals
  const head = new T.Group();
  head.position.set(0, 24 * PX, 0);
  const headIn = new T.Mesh(skinBox(8, 8, 8, 0, 0, 0), mat);
  const headOut = new T.Mesh(skinBox(8, 8, 8, 32, 0, 0.5), over);
  [headIn, headOut].forEach((m) => {
    m.position.y = 4 * PX;
    m.castShadow = true;
    head.add(m);
  });
  head.rotation.y = ((pose.head?.[0] ?? 0) * Math.PI) / 180;
  head.rotation.x = ((pose.head?.[1] ?? 0) * Math.PI) / 180;
  body.add(head);
  const torso = new T.Group();
  torso.position.set(0, 24 * PX, 0);
  const t1 = new T.Mesh(skinBox(8, 12, 4, 16, 16, 0), mat);
  const t2 = new T.Mesh(skinBox(8, 12, 4, 16, 32, 0.25), over);
  [t1, t2].forEach((m) => {
    m.position.y = -6 * PX;
    m.castShadow = true;
    torso.add(m);
  });
  body.add(torso);
  const armR = limb(mat, over, 4, 12, 4, [40, 16], [40, 32], 0.25);
  armR.position.set(-6 * PX, 22 * PX, 0);
  armR.children.forEach((m: any) => (m.position.y = -4 * PX));
  armR.position.y = 22 * PX;
  const armL = limb(mat, over, 4, 12, 4, [32, 48], [48, 48], 0.25);
  armL.position.set(6 * PX, 22 * PX, 0);
  armL.children.forEach((m: any) => (m.position.y = -4 * PX));
  const deg = Math.PI / 180;
  armR.rotation.x = (pose.armR?.[0] ?? 0) * deg;
  armR.rotation.z = -(pose.armR?.[1] ?? 0) * deg;
  armL.rotation.x = (pose.armL?.[0] ?? 0) * deg;
  armL.rotation.z = (pose.armL?.[1] ?? 0) * deg;
  body.add(armR, armL);
  const legR = limb(mat, over, 4, 12, 4, [0, 16], [0, 32], 0.25);
  legR.position.set(-2 * PX, 12 * PX, 0);
  const legL = limb(mat, over, 4, 12, 4, [16, 48], [0, 48], 0.25);
  legL.position.set(2 * PX, 12 * PX, 0);
  legR.rotation.x = (pose.legR ?? 0) * deg;
  legL.rotation.x = (pose.legL ?? 0) * deg;
  if (f.sit) {
    legR.rotation.x = -Math.PI / 2 + 0.08;
    legL.rotation.x = -Math.PI / 2 - 0.05;
    legR.rotation.y = 0.12;
    legL.rotation.y = -0.12;
    armR.rotation.x = -0.65;
    armL.rotation.x = -0.55;
  }
  body.add(legR, legL);
  body.rotation.y = ((pose.body ?? 0) * Math.PI) / 180;
  // Blocklicht der Umgebung auf alle Teile (wie bei den Blöcken über das Attribut `glow`)
  root.traverse((o: any) => {
    if (!o.geometry) return;
    const n = o.geometry.attributes.position.count;
    const glow = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) glow[i * 3] = f.light ?? 0;
    o.geometry.setAttribute('glow', new T.BufferAttribute(glow, 3));
  });
  root.scale.setScalar(f.scale ?? 1);
  root.position.set(f.x, f.y, f.z);
  root.rotation.y = (-f.yaw * Math.PI) / 180;
  return root;
}

// ---------------- Himmel ----------------

function skyMaterial(): any {
  return new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: new T.Color() },
      zenith: { value: new T.Color() },
      below: { value: new T.Color() },
      sunDir: { value: new T.Vector3() },
      sunCol: { value: new T.Color() },
      sunSize: { value: 1 },
      sunPower: { value: 30 },
      stars: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 below; uniform vec3 sunDir; uniform vec3 sunCol;
      uniform float sunSize; uniform float sunPower; uniform float stars; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, below, clamp(-h * 4.0, 0.0, 1.0));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(s, 1800.0 / sunSize) * sunPower + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.18);
        if (stars > 0.0 && h > 0.02) {
          vec3 g = floor(d * 420.0);
          float r = hash(g);
          if (r > 0.9965) col += vec3(0.9, 0.95, 1.0) * stars * (r - 0.9965) * 220.0 * smoothstep(0.02, 0.25, h);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function makeClouds(night: boolean): any {
  // flache Klötzchen-Wolken (eigene Form aus Rauschen)
  const cell = 12;
  const pos: number[] = [];
  const idx: number[] = [];
  const hash = (x: number, z: number): number => {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x: number, z: number, sc: number): number => {
    const fx = x / sc;
    const fz = z / sc;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  const filled = (i: number, j: number): boolean => vn(i, j, 5) * 0.65 + vn(i + 40, j - 20, 2) * 0.35 > 0.66;
  const R = 70;
  for (let i = -R; i < R; i++)
    for (let j = -R; j < R; j++) {
      if (!filled(i, j)) continue;
      const x1 = i * cell;
      const z1 = j * cell;
      const x2 = x1 + cell;
      const z2 = z1 + cell;
      const y1 = 0;
      const y2 = 4;
      const add = (c: number[][]): void => {
        const b = pos.length / 3;
        c.forEach((p) => pos.push(p[0]!, p[1]!, p[2]!));
        idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
      };
      add([
        [x1, y2, z1],
        [x2, y2, z1],
        [x2, y2, z2],
        [x1, y2, z2],
      ]);
      add([
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x1, y1, z1],
      ]);
      if (!filled(i, j + 1))
        add([
          [x1, y2, z2],
          [x2, y2, z2],
          [x2, y1, z2],
          [x1, y1, z2],
        ]);
      if (!filled(i, j - 1))
        add([
          [x2, y2, z1],
          [x1, y2, z1],
          [x1, y1, z1],
          [x2, y1, z1],
        ]);
      if (!filled(i + 1, j))
        add([
          [x2, y2, z2],
          [x2, y2, z1],
          [x2, y1, z1],
          [x2, y1, z2],
        ]);
      if (!filled(i - 1, j))
        add([
          [x1, y2, z1],
          [x1, y2, z2],
          [x1, y1, z2],
          [x1, y1, z1],
        ]);
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new T.MeshLambertMaterial({
    color: night ? 0x2a3550 : 0xffffff,
    emissive: night ? 0x0a0f1c : 0x9a8a80,
    transparent: true,
    opacity: night ? 0.55 : 0.82,
    depthWrite: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.position.y = 236;
  mesh.renderOrder = 3;
  return mesh;
}

// ---------------- Laden ----------------

async function init(): Promise<void> {
  manifest = await (await fetch('scene.json')).json();
  const buf = await (await fetch('scene.bin')).arrayBuffer();
  atlasTex = await loadTexture('atlas.png');
  atlasTex.flipY = false;
  atlasTex.magFilter = T.NearestFilter;
  atlasTex.minFilter = T.LinearMipmapLinearFilter;
  atlasTex.encoding = T.sRGBEncoding;
  atlasTex.needsUpdate = true;
  await Promise.all(
    manifest.skins.map(async (s) => {
      const t = await loadTexture(`skins/${s}.png`);
      t.flipY = false;
      t.magFilter = T.NearestFilter;
      t.minFilter = T.NearestFilter;
      t.generateMipmaps = false;
      t.encoding = T.sRGBEncoding;
      skinTex.set(s, t);
    }),
  );
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  atlasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  world = new T.Group();
  ['opaque', 'cutout', 'water', 'glass'].forEach((g) => {
    groupMeshes[g] = buildGroup(g, buf);
    world.add(groupMeshes[g]);
  });
  (window as any).sceneInfo = {
    maxTexture: renderer.capabilities.maxTextureSize,
    webgl2: renderer.capabilities.isWebGL2,
    npcs: manifest.npcs,
  };
}

// ---------------- Rendern ----------------

const SETTINGS = {
  day: {
    horizon: 0xf6d2a6,
    zenith: 0x3d74c4,
    below: 0x8a8e80,
    fog: 0xcfd6dc,
    sun: 0xffd9a8,
    sunIntensity: 4.2,
    sky: 0x9fbce8,
    ground: 0x5a4a34,
    hemi: 0.62,
    exposure: 0.8,
  },
  night: {
    horizon: 0x24345a,
    zenith: 0x060b1c,
    below: 0x0b1020,
    fog: 0x1a2440,
    sun: 0x8fa8f0,
    sunIntensity: 0.4,
    sky: 0x34487c,
    ground: 0x141820,
    hemi: 0.3,
    exposure: 1.05,
  },
};

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
    vignette: { value: 0.22 },
    saturation: { value: 1 },
    keepAlpha: { value: 0 },
  },
  vertexShader:
    'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure; uniform float vignette; uniform float saturation; uniform float keepAlpha; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14;
      return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = aces(t.rgb * exposure);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      vec2 q = vUv - 0.5;
      c *= 1.0 - vignette * dot(q, q) * 2.2;
      // Szenen ganz deckend (ausgeschnittene Pflanzen schreiben sonst halbe Deckkraft an ihren Rändern)
      gl_FragColor = vec4(toSRGB(c), mix(1.0, t.a, keepAlpha));
    }`,
};

function sunDirection(shot: Shot): any {
  const s = shot.sun ?? { azimuth: 215, elevation: 19 };
  const az = (s.azimuth * Math.PI) / 180;
  const el = (s.elevation * Math.PI) / 180;
  // Azimut wie auf dem Kompass: 0 = Norden (-z), 90 = Osten (+x)
  return new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

async function renderShot(shot: Shot): Promise<Record<string, string>> {
  const t0 = performance.now();
  const ss = shot.ss ?? 2;
  const W = shot.width;
  const H = shot.height;
  renderer.setPixelRatio(1);
  renderer.setSize(W * ss, H * ss, false);
  const scene = new T.Scene();
  const studio = shot.mode === 'studio';
  const night = shot.mode === 'night';
  const S = night ? SETTINGS.night : SETTINGS.day;
  const sunDir = sunDirection(shot);

  // Kamera
  const aspect = W / H;
  const cam = shot.camera.ortho
    ? new T.OrthographicCamera(
        -shot.camera.ortho * aspect,
        shot.camera.ortho * aspect,
        shot.camera.ortho,
        -shot.camera.ortho,
        1,
        3000,
      )
    : new T.PerspectiveCamera(shot.camera.fov ?? 55, aspect, 0.05, 4000);
  cam.position.set(...shot.camera.pos);
  cam.lookAt(new T.Vector3(...shot.camera.target));

  if (!shot.figuresOnly) {
    scene.add(world);
    const sky = new T.Mesh(new T.SphereGeometry(3000, 48, 24), skyMaterial());
    const u = sky.material.uniforms;
    u.horizon.value.set(S.horizon);
    u.zenith.value.set(S.zenith);
    u.below.value.set(S.below);
    u.sunDir.value.copy(night ? new T.Vector3(-0.4, 0.55, -0.7).normalize() : sunDir);
    u.sunCol.value.set(night ? 0x8090b0 : 0xffc890);
    u.sunSize.value = night ? 0.7 : 1;
    u.sunPower.value = night ? 5 : 30;
    u.stars.value = night ? 1 : 0;
    sky.position.copy(cam.position);
    sky.renderOrder = -1;
    scene.add(sky);
    if (!shot.camera.ortho) scene.add(makeClouds(night));
    const [near, far] = shot.fog ?? [90, 760];
    scene.fog = new T.Fog(S.fog, near, far);
  }

  // Licht
  const hemi = new T.HemisphereLight(S.sky, S.ground, studio ? 0.9 : S.hemi);
  scene.add(hemi);
  const sun = new T.DirectionalLight(S.sun, studio ? 2.6 : S.sunIntensity);
  const focus = shot.focus ?? { centre: shot.camera.target, radius: 60 };
  const centre = new T.Vector3(...focus.centre);
  const lightDir = studio
    ? new T.Vector3(0.55, 0.75, 0.9).normalize()
    : night
      ? new T.Vector3(-0.4, 0.75, -0.5).normalize()
      : sunDir;
  sun.position.copy(centre).addScaledVector(lightDir, 500);
  sun.target.position.copy(centre);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  const r = focus.radius;
  const sc = sun.shadow.camera;
  sc.left = -r;
  sc.right = r;
  sc.top = r;
  sc.bottom = -r;
  // nur Dinge nahe am Bildausschnitt werfen Schatten (die Berge ringsum würden das Dorf sonst ganz abdunkeln)
  sc.near = 500 - r * (focus.depth ?? 1.2);
  sc.far = 500 + r * 1.5;
  const mapSize = Math.min(8192, renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02 * (r / 60);
  sun.shadow.radius = 2;
  (shot.lights ?? []).forEach(([x, y, z, colour, intensity, distance]) => {
    const p = new T.PointLight(colour, intensity, distance, 1.2);
    p.position.set(x, y, z);
    scene.add(p);
  });
  if (studio) {
    const rim = new T.DirectionalLight(0xbfd8ff, 1.6);
    rim.position.set(-3, 3, -4);
    const fill = new T.DirectionalLight(0xffe4c8, 0.6);
    fill.position.set(-4, 1, 3);
    scene.add(rim, fill);
  }

  sharedUniforms.uBlockLight.value.setRGB(...((night ? [2.7, 1.5, 0.66] : [0.5, 0.3, 0.12]) as V3));
  sharedUniforms.uLampEmit.value = night ? 2.6 : 0.6;
  sharedUniforms.uWindow.value.setRGB(...((night ? [1.3, 0.78, 0.32] : [0, 0, 0]) as V3));
  groupMeshes.glass.material.opacity = 1;

  // Figuren
  const figs = new T.Group();
  scene.add(figs);
  const list: Figure[] = [...(shot.figures ?? [])];
  if (shot.villagers)
    manifest.npcs
      .filter(
        (n) =>
          !shot.clearAround ||
          Math.hypot(n.x - shot.clearAround[0], n.z - shot.clearAround[1]) > shot.clearAround[2],
      )
      .forEach((n) =>
        list.push({
          skin: n.skin,
          x: n.x,
          y: n.sit ? n.y - 0.8 : n.y,
          z: n.z,
          yaw: n.yaw,
          sit: n.sit,
          scale: n.scale,
          light: n.light,
        }),
      );
  list.forEach((f) => figs.add(makePlayer(f)));
  if (shot.shadowCatcher) {
    const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = (shot.figures?.[0]?.y ?? 0) + 0.001;
    floor.receiveShadow = true;
    figs.add(floor);
  }

  // Rendern
  let out: HTMLCanvasElement;
  if (studio) {
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = shot.exposure ?? 1;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, cam);
    out = renderer.domElement;
  } else {
    renderer.toneMapping = T.NoToneMapping;
    renderer.outputEncoding = T.LinearEncoding;
    renderer.setClearColor(0x000000, shot.figuresOnly ? 0 : 1);
    const target = new T.WebGLRenderTarget(W * ss, H * ss, { type: T.HalfFloatType, format: T.RGBAFormat });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = night
      ? new UnrealBloomPass(new T.Vector2(W * ss, H * ss), 0.85, 0.55, 1.1)
      : new UnrealBloomPass(new T.Vector2(W * ss, H * ss), 0.18, 0.4, 1.6);
    composer.addPass(bloom);
    const grade = new ShaderPass(GRADE);
    grade.uniforms.exposure.value = shot.exposure ?? S.exposure;
    grade.uniforms.vignette.value = shot.figuresOnly ? 0 : 0.22;
    grade.uniforms.saturation.value = night ? 1 : 0.92;
    grade.uniforms.keepAlpha.value = shot.figuresOnly ? 1 : 0;
    composer.addPass(grade);
    composer.render();
    out = renderer.domElement;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    bloom.dispose?.();
  }
  // aufräumen: alles außer der Lobby selbst (Schattenkarte, Himmel, Wolken, Figuren) freigeben
  scene.remove(world);
  sun.shadow.dispose?.();
  scene.traverse((o: any) => {
    o.geometry?.dispose?.();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m?.dispose?.());
  });
  const results: Record<string, string> = {};
  for (const [w, h, fmt, q, maxBytes] of shot.outputs) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // gleiche Seitenverhältnisse: mittig zuschneiden
    const srcAspect = out.width / out.height;
    const dstAspect = w / h;
    let sw = out.width;
    let sh = out.height;
    if (srcAspect > dstAspect) sw = sh * dstAspect;
    else sh = sw / dstAspect;
    // in zwei Schritten verkleinern (sauberer als ein großer Sprung)
    const mid = document.createElement('canvas');
    mid.width = Math.round(Math.max(w, sw / 2));
    mid.height = Math.round(Math.max(h, sh / 2));
    const mctx = mid.getContext('2d')!;
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(out, (out.width - sw) / 2, (out.height - sh) / 2, sw, sh, 0, 0, mid.width, mid.height);
    ctx.drawImage(mid, 0, 0, w, h);
    // mit Größengrenze: Qualität schrittweise senken, bis die Datei passt
    let quality = q ?? 0.85;
    let url = c.toDataURL(`image/${fmt}`, quality);
    while (
      maxBytes &&
      fmt !== 'png' &&
      (url.length - url.indexOf(',') - 1) * 0.75 > maxBytes &&
      quality > 0.42
    ) {
      quality -= 0.04;
      url = c.toDataURL(`image/${fmt}`, quality);
    }
    const tag = maxBytes ? `-${Math.round(maxBytes / 1000)}k` : '';
    results[`${w}x${h}${tag}.${fmt === 'jpeg' ? 'jpg' : fmt}`] = url;
    if (maxBytes) results[`${w}x${h}${tag}.quality`] = quality.toFixed(2);
  }
  results.ms = String(Math.round(performance.now() - t0));
  return results;
}

(window as any).renderShot = renderShot;
init()
  .then(() => ((window as any).ready = true))
  .catch((e) => ((window as any).failed = String(e?.stack ?? e)));
