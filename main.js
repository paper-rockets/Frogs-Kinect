import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/utils/SkeletonUtils.js';

const canvas = document.querySelector('#scene');

// Quality: starts "high" and is re-checked on every start by watchFrameRate(), so one
// bad start (a loading hiccup, a minimised window) never downgrades a PC for good.
// ?quality=low forces the lightest mode (also without anti-aliasing); ?quality=high
// keeps full quality and skips the check. "low" drops shadows and some sharpness.
const forcedQuality = new URLSearchParams(location.search).get('quality');
let quality = forcedQuality === 'low' ? 'low' : 'high';
// Earlier builds remembered "low" here; clear it so it can't stick.
try { localStorage.removeItem('jungleWall.quality'); } catch { /* storage blocked */ }
const pixelRatioFor = () => (quality === 'low' ? Math.min(window.devicePixelRatio, 1) * 0.85 : Math.min(window.devicePixelRatio, 1.5));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatioFor());
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = quality === 'high';
// Plain PCF is noticeably cheaper than PCFSoft; the difference is a slightly crisper edge.
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.016);

const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 8.35, 30.5);
camera.lookAt(0, 0.15, 0.25);

const clock = new THREE.Clock();
const loader = new GLTFLoader();
const glbBytes = new Map();

// After everything has loaded, time a few seconds of frames. If this PC averages
// under ~45 fps, switch to low quality for this run.
const frameWatch = { startAt: Infinity, endAt: Infinity, frames: 0, done: forcedQuality === 'low' || forcedQuality === 'high' };

const preloadTracker = {
  total: 0,
  completed: 0,
  bar: document.querySelector('#loader-bar'),
  overlay: document.querySelector('#loader'),
  finished: false,
  register() {
    this.total += 1;
    this.update();
  },
  step() {
    this.completed += 1;
    this.update();
    if (this.completed >= this.total && !this.finished) {
      this.finished = true;
      this.finish();
    }
  },
  update() {
    const fraction = this.total > 0 ? Math.min(this.completed / this.total, 1) : 0;
    if (this.bar) {
      this.bar.style.width = `${Math.round(fraction * 100)}%`;
    }
  },
  finish() {
    requestAnimationFrame(() => {
      renderer.render(scene, camera);
      const now = clock.getElapsedTime();
      if (typeof frameWatch !== 'undefined') {
        frameWatch.startAt = now + 1.5;
        frameWatch.endAt = now + 5;
      }
      setTimeout(() => {
        if (this.overlay) {
          this.overlay.classList.add('hidden');
          setTimeout(() => {
            if (this.overlay) this.overlay.remove();
          }, 600);
        }
      }, 150);
    });
  }
};

// Older Sketchfab exports colour their models with the retired spec-gloss material
// extension, which three.js no longer reads, so those parts load plain white.
// Put their diffuse colour and texture back before any model is used.
async function restoreSpecGloss(gltf) {
  const { parser } = gltf;
  const defs = parser.json.materials || [];
  const jobs = [];
  const seen = new Set();
  gltf.scene.traverse((part) => {
    if (!part.isMesh) return;
    (Array.isArray(part.material) ? part.material : [part.material]).forEach((mat) => {
      if (!mat || seen.has(mat)) return;
      seen.add(mat);
      const index = parser.associations.get(mat)?.materials ?? defs.findIndex((def) => def.name === mat.name);
      const ext = defs[index]?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!ext) return;
      if (ext.diffuseFactor) mat.color.fromArray(ext.diffuseFactor);
      if (ext.glossinessFactor !== undefined) mat.roughness = 1 - ext.glossinessFactor;
      if (ext.diffuseTexture && !mat.map) {
        jobs.push(parser.getDependency('texture', ext.diffuseTexture.index).then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          mat.map = texture;
          mat.needsUpdate = true;
        }));
      }
    });
  });
  await Promise.all(jobs);
}

function loadGLB(file, onLoad, onProgress, onError) {
  if (!glbBytes.has(file)) {
    const bytes = fetch(file).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${file}: ${response.status}`);
      return response.arrayBuffer();
    }).catch((error) => {
      glbBytes.delete(file);
      throw error;
    });
    glbBytes.set(file, bytes);
  }
  // Download each GLB once. Parse a separate scene for each placement so its
  // skeleton and animation mixer cannot deform another copy.
  glbBytes.get(file).then((bytes) => {
    loader.parse(bytes.slice(0), '', (gltf) => {
      restoreSpecGloss(gltf).catch(() => {}).then(() => onLoad(gltf));
    }, onError);
  }, onError);
  void onProgress;
}
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactionPoint = new THREE.Vector3(99, 0, 99);
const presence = { active: false, lastInput: -10 };
const mixers = [];
const vegetationUniforms = [];
const butterflies = [];
const frogs = [];
const dioramaMotion = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
const scratchInteraction = new THREE.Vector3();
const scratchAway = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xd9f0cf, 0x254238, 2.2));
const frontFill = new THREE.DirectionalLight(0xa8cdb5, 0.85);
frontFill.position.set(5, 4, 10);
scene.add(frontFill);
const sun = new THREE.DirectionalLight(0xffe2a4, 3.8);
sun.position.set(-7, 11, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -11;
sun.shadow.camera.right = 11;
sun.shadow.camera.top = 11;
sun.shadow.camera.bottom = -11;
sun.shadow.bias = -0.0003;
scene.add(sun);

const habitat = new THREE.Group();
habitat.position.y = -1.52;
scene.add(habitat);

// Everything that stands on the island floor lives in `ground`. Once the hero GLB
// loads, ground is lifted to the top of its floor disc so nothing sinks into it.
const ground = new THREE.Group();
habitat.add(ground);

// Reactive pond: a flat shader surface on the island floor. Rings spread from where a
// visitor reaches over it, where frogs land beside it, and from the occasional drip.
const POND = { x: 0.9, z: 3.85, rx: 1.6, rz: 0.72, ripples: 8 };
const pondMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  fog: true,
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uRadius: { value: new THREE.Vector2(POND.rx, POND.rz) },
      uRipples: { value: Array.from({ length: POND.ripples }, () => new THREE.Vector4(0, 0, 99, 0)) },
      uDeep: { value: new THREE.Color(0x0e3a3c) },
      uShallow: { value: new THREE.Color(0x3f8a7c) },
      uGlint: { value: new THREE.Color(0xd8f4e6) }
    }
  ]),
  vertexShader: `
varying vec2 vP;
#include <fog_pars_vertex>
void main() {
  vP = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
  fragmentShader: `
uniform float uTime;
uniform vec2 uRadius;
uniform vec4 uRipples[${POND.ripples}];
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uGlint;
varying vec2 vP;
#include <fog_pars_fragment>
void main() {
  vec2 n = vP / uRadius;
  float ang = atan(n.y, n.x);
  float rr = length(n) / (1.0 + 0.07 * sin(ang * 3.0 + 1.3) + 0.04 * sin(ang * 7.0 + 0.4));
  if (rr > 1.0) discard;
  vec3 col = mix(uDeep, uShallow, smoothstep(0.1, 0.95, rr));
  float shimmer = sin(vP.x * 5.0 + uTime * 1.1) * sin(vP.y * 6.5 - uTime * 0.8);
  col += uGlint * pow(max(shimmer, 0.0), 6.0) * 0.16;
  float wave = 0.0;
  for (int i = 0; i < ${POND.ripples}; i++) {
    vec4 rp = uRipples[i];
    if (rp.z > 3.0) continue;
    float k = distance(vP, rp.xy) - rp.z * 0.85;
    wave += sin(k * 24.0) * exp(-k * k * 22.0) * (1.0 - rp.z / 3.0) * rp.w;
  }
  col += uGlint * max(wave, 0.0) * 0.6;
  col *= 1.0 - max(-wave, 0.0) * 0.25;
  col = mix(col, uGlint, smoothstep(0.84, 0.98, rr) * (0.22 + 0.1 * sin(uTime * 1.3 + ang * 5.0)));
  gl_FragColor = vec4(col, smoothstep(1.0, 0.9, rr) * 0.93);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`
});
const pond = new THREE.Mesh(new THREE.PlaneGeometry(POND.rx * 2, POND.rz * 2), pondMaterial);
pond.rotation.x = -Math.PI / 2;
pond.position.set(POND.x, 0.015, POND.z);
pond.renderOrder = 1;
ground.add(pond);
const ripples = pondMaterial.uniforms.uRipples.value;
const pondState = { lastRipple: -10, nextDrip: 3 };

function material(color, roughness = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function addRock(x, z, scale, tone = 0x72846d) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), material(tone));
  rock.position.set(x, 0.15, z);
  rock.scale.set(scale * 1.3, scale * 0.68, scale);
  rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.castShadow = true;
  rock.receiveShadow = true;
  ground.add(rock);
}

function addMushroom(x, z, scale) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 12), material(0xf3dec4));
  stem.position.y = 0.26;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xd27a78));
  cap.position.y = 0.51;
  group.add(stem, cap);
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.castShadow = true;
  group.traverse((part) => { part.castShadow = true; });
  ground.add(group);
}

function createFrond(color = 0x2e6343, length = 2.7) {
  const root = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.045, length, 8), material(0x557440));
  stem.position.y = length / 2;
  root.add(stem);
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.22 + (1 - t) * 0.15, 0.72 - t * 0.28), material(color));
    leaf.position.set(i % 2 ? 0.26 : -0.26, 0.44 + t * (length - 0.55), 0);
    leaf.rotation.set(-0.17, i % 2 ? 0.58 : -0.58, i % 2 ? -0.45 : 0.45);
    leaf.castShadow = true;
    root.add(leaf);
  }
  return root;
}

function addPalm(x, z, scale, turn) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.23, 3.2, 12), material(0x765538));
  trunk.position.y = 1.55;
  trunk.rotation.z = turn * 0.16;
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const frond = createFrond(i % 2 ? 0x315f3d : 0x3f7a4b, 2.35 + (i % 3) * 0.2);
    frond.position.y = 3.04;
    frond.rotation.set(-0.3 + i * 0.08, (i / 6) * Math.PI * 2, 0.3);
    palm.add(frond);
  }
  palm.position.set(x, 0, z);
  palm.scale.setScalar(scale);
  palm.traverse((part) => { if (part.isMesh) part.castShadow = true; });
  habitat.add(palm);
  reactivePlants.push({ object: palm, homeY: palm.rotation.y, phase: Math.random() * Math.PI * 2, strength: 0.18 });
}

function createLeaf(color = 0x2f7046) {
  const leaf = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.SphereGeometry(0.82, 16, 8), material(color));
  blade.scale.set(1, 0.08, 1.28);
  blade.rotation.x = 0.2;
  blade.castShadow = true;
  leaf.add(blade);
  const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.036, 1.5, 6), material(0x214f37));
  vein.rotation.z = Math.PI / 2;
  leaf.add(vein);
  return leaf;
}

function addLeafCluster(x, z, scale, count = 7) {
  const cluster = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const leaf = createLeaf(i % 2 ? 0x2f6c45 : 0x3c7c4d);
    const angle = (i / count) * Math.PI * 2 + 0.25;
    leaf.position.set(Math.cos(angle) * 0.34, 0.3 + (i % 3) * 0.22, Math.sin(angle) * 0.28);
    leaf.rotation.set(-0.25, angle, (i % 2 ? 1 : -1) * 0.38);
    leaf.scale.set(0.74 + (i % 3) * 0.12, 1, 0.86 + (i % 3) * 0.08);
    cluster.add(leaf);
  }
  cluster.position.set(x, 0, z);
  cluster.scale.setScalar(scale);
  habitat.add(cluster);
  reactivePlants.push({ object: cluster, homeY: cluster.rotation.y, phase: Math.random() * Math.PI * 2, strength: 0.34 });
}

function addVine(x, z, height) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, height, z),
    new THREE.Vector3(x + 0.3, height * 0.64, z + 0.15),
    new THREE.Vector3(x - 0.22, height * 0.34, z + 0.08),
    new THREE.Vector3(x + 0.08, 0.32, z)
  ]);
  const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.025, 7, false), material(0x315f3f));
  vine.castShadow = true;
  habitat.add(vine);
}

addRock(-3.85, -1.45, 0.75);
addRock(3.95, -1.35, 0.9, 0x637a68);
addRock(0.35, -1.3, 0.65, 0x75866b);
addMushroom(-3.05, -1.6, 1.15);
addMushroom(3.05, -1.55, 1.05);
addMushroom(2.55, -0.85, 0.65);

function normaliseModel(root, targetHeight) {
  // A fresh copy of a rigged model (see loadSharedGLB) still carries stale part
  // positions and a cached outline box; refresh both or the size comes out ~30x off.
  root.updateMatrixWorld(true);
  root.traverse((part) => {
    if (!part.isSkinnedMesh) return;
    part.skeleton.update();
    part.boundingBox = null;
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.001);
  root.scale.multiplyScalar(scale);
  // Preserve the authored contact plane: centre horizontally, then place the lowest
  // vertex on the habitat instead of vertically centring the entire GLB through it.
  root.position.x -= centre.x * scale;
  root.position.y -= box.min.y * scale;
  root.position.z -= centre.z * scale;
  return root;
}

function normaliseFlyingModel(root, targetSpan) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = targetSpan / Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(scale);
  root.position.x -= centre.x * scale;
  root.position.y -= centre.y * scale;
  root.position.z -= centre.z * scale;
  return root;
}

function decorateModel(root) {
  root.traverse((part) => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
      if (part.material) part.material.envMapIntensity = 0.7;
    }
  });
}

function makeVegetationReactive(root) {
  root.traverse((part) => {
    if (!part.isMesh || !part.material) return;
    part.geometry.computeBoundingBox();
    const bounds = part.geometry.boundingBox;
    const localMinY = bounds?.min.y ?? 0;
    const localHeight = Math.max((bounds?.max.y ?? 1) - localMinY, 0.001);
    const sourceMaterials = Array.isArray(part.material) ? part.material : [part.material];
    const reactiveMaterials = sourceMaterials.map((source) => {
      const reactive = source.clone();
      reactive.onBeforeCompile = (shader) => {
        shader.uniforms.uSwayTime = { value: 0 };
        shader.uniforms.uInteractionPoint = { value: interactionPoint };
        shader.uniforms.uInteractionActive = { value: 0 };
        shader.uniforms.uLocalMinY = { value: localMinY };
        shader.uniforms.uLocalHeight = { value: localHeight };
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uSwayTime;
uniform vec3 uInteractionPoint;
uniform float uInteractionActive;
uniform float uLocalMinY;
uniform float uLocalHeight;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
vec4 swayWorldPosition = modelMatrix * vec4(position, 1.0);
vec2 swayAway = swayWorldPosition.xz - uInteractionPoint.xz;
float swayDistance = max(length(swayAway), 0.001);
swayAway /= swayDistance;
float swayHeight = clamp((position.y - uLocalMinY) / uLocalHeight, 0.0, 1.0);
float swayProximity = (1.0 - smoothstep(0.55, 3.6, swayDistance)) * uInteractionActive;
float swayBreeze = sin(uSwayTime * 0.82 + swayWorldPosition.x * 0.62 + swayWorldPosition.z * 0.41);
transformed.x += (swayBreeze * 0.003 + swayAway.x * swayProximity * 0.012) * uLocalHeight * swayHeight;
transformed.z += swayAway.y * swayProximity * 0.012 * uLocalHeight * swayHeight;`
          );
        vegetationUniforms.push(shader.uniforms);
      };
      reactive.customProgramCacheKey = () => 'reactive-vegetation-v2';
      reactive.needsUpdate = true;
      return reactive;
    });
    part.material = Array.isArray(part.material) ? reactiveMaterials : reactiveMaterials[0];
  });
}

function loadProp(file, position, height, rotation = 0, onReady) {
  preloadTracker.register();
  loadGLB(file, (gltf) => {
    ['coco', 'paille', 'sunGlasses1', 'hibiscus'].forEach((name) => {
      const part = gltf.scene.getObjectByName(name);
      if (part) part.removeFromParent();
    });
    const prop = normaliseModel(gltf.scene, height);
    decorateModel(prop);
    prop.position.add(position);
    prop.rotation.y = rotation;
    habitat.add(prop);
    if (onReady) onReady(prop);
    preloadTracker.step();
  }, undefined, () => {
    preloadTracker.step();
  });
}

// The hero's floor is a flat disc raised above the model's lowest vertex (rocks and
// roots hang below it). Lift the ground layer to that disc's top surface.
function settleGroundOnFloor(prop) {
  const floor = findDescendant(prop, /floor/i);
  if (!floor?.geometry) return;
  floor.geometry.computeBoundingBox();
  const top = new THREE.Vector3(0, floor.geometry.boundingBox.max.y, 0);
  habitat.updateMatrixWorld(true);
  floor.localToWorld(top);
  habitat.worldToLocal(top);
  ground.position.y = top.y + 0.005;
  interactionPlane.position.y = habitat.position.y + ground.position.y;
  buildFloorMask(floor);
}

// The floor disc is much bigger than the dirt you see: its texture fades to fully
// transparent in a wavy edge. Keep a copy of that alpha so code can ask "is there
// visible ground here?" instead of guessing with an oval.
let floorMask = null;
const floorRay = new THREE.Raycaster();
const floorRayOrigin = new THREE.Vector3();
const floorRayDown = new THREE.Vector3();

function buildFloorMask(floor) {
  const map = floor.material?.map;
  const image = map?.image;
  if (!image?.width) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const alpha = { mesh: floor, data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height, flipY: map.flipY };
  // Bake a ground-local grid once: is there dirt in each cell, and how far is each
  // dark cell from the nearest dirt. Frog checks then become plain lookups.
  habitat.updateMatrixWorld(true);
  const grid = { minX: -8, minZ: -7, step: 0.08, nx: 200, nz: 200 };
  const cells = grid.nx * grid.nz;
  const dirt = new Uint8Array(cells);
  for (let iz = 0; iz < grid.nz; iz += 1) {
    for (let ix = 0; ix < grid.nx; ix += 1) {
      dirt[iz * grid.nx + ix] = sampleFloorAlpha(alpha, grid.minX + ix * grid.step, grid.minZ + iz * grid.step) ? 1 : 0;
    }
  }
  // Two-pass chamfer distance (in cells) from every cell to the nearest dirt cell.
  const far = 1e6;
  const dist = new Float32Array(cells).map((_, i) => (dirt[i] ? 0 : far));
  const diag = Math.SQRT2;
  const relax = (i, j, cost) => { if (dist[j] + cost < dist[i]) dist[i] = dist[j] + cost; };
  for (let iz = 0; iz < grid.nz; iz += 1) {
    for (let ix = 0; ix < grid.nx; ix += 1) {
      const i = iz * grid.nx + ix;
      if (ix > 0) relax(i, i - 1, 1);
      if (iz > 0) {
        relax(i, i - grid.nx, 1);
        if (ix > 0) relax(i, i - grid.nx - 1, diag);
        if (ix < grid.nx - 1) relax(i, i - grid.nx + 1, diag);
      }
    }
  }
  for (let iz = grid.nz - 1; iz >= 0; iz -= 1) {
    for (let ix = grid.nx - 1; ix >= 0; ix -= 1) {
      const i = iz * grid.nx + ix;
      if (ix < grid.nx - 1) relax(i, i + 1, 1);
      if (iz < grid.nz - 1) {
        relax(i, i + grid.nx, 1);
        if (ix < grid.nx - 1) relax(i, i + grid.nx + 1, diag);
        if (ix > 0) relax(i, i + grid.nx - 1, diag);
      }
    }
  }
  floorMask = { ...grid, dirt, dist };
  frogs.forEach((frog) => { frog.spotChecked = false; });
}

function floorCell(x, z) {
  const ix = Math.round((x - floorMask.minX) / floorMask.step);
  const iz = Math.round((z - floorMask.minZ) / floorMask.step);
  if (ix < 0 || iz < 0 || ix >= floorMask.nx || iz >= floorMask.nz) return -1;
  return iz * floorMask.nx + ix;
}

// x/z are in ground-local space (the space frogs live in).
function groundVisibleAt(x, z) {
  if (!floorMask) return !isOutsideTerrain({ x, z });
  const cell = floorCell(x, z);
  return cell >= 0 && floorMask.dirt[cell] === 1;
}

// How far (ground units) a point is from the nearest visible dirt; 0 on dirt.
function distanceToDirt(x, z) {
  if (!floorMask) return isOutsideTerrain({ x, z }) ? Infinity : 0;
  const cell = floorCell(x, z);
  return cell < 0 ? Infinity : floorMask.dist[cell] * floorMask.step;
}

function sampleFloorAlpha(floorAlpha, x, z) {
  floorRayOrigin.set(x, 3, z);
  ground.localToWorld(floorRayOrigin);
  floorRayDown.set(0, -1, 0).transformDirection(ground.matrixWorld);
  floorRay.set(floorRayOrigin, floorRayDown);
  const hit = floorRay.intersectObject(floorAlpha.mesh, false)[0];
  if (!hit?.uv) return false;
  const { data, width, height, flipY } = floorAlpha;
  const u = THREE.MathUtils.euclideanModulo(hit.uv.x, 1);
  const v = THREE.MathUtils.euclideanModulo(hit.uv.y, 1);
  const px = Math.min(width - 1, Math.floor(u * width));
  const py = Math.min(height - 1, Math.floor((flipY ? 1 - v : v) * height));
  return data[(py * width + px) * 4 + 3] > 128;
}

// A frog may rest with its whole body on visible dirt, or properly out in the dark.
// Never on the edge in between: next to the island's rim it looks like it's hanging
// in mid-air.
function isLandingSpotOk(frog, point) {
  const foot = frog.collisionRadius * 0.5;
  const onDirt = [[0, 0], [foot, 0], [-foot, 0], [0, foot], [0, -foot]]
    .every(([dx, dz]) => groundVisibleAt(point.x + dx, point.z + dz));
  if (onDirt) return true;
  return distanceToDirt(point.x, point.z) >= 0.9 + frog.collisionRadius;
}

function loadPlantSet(file, placements, height) {
  preloadTracker.register();
  loadGLB(file, (gltf) => {
    const base = normaliseModel(gltf.scene, height);
    decorateModel(base);
    placements.forEach(({ x, z, size = 1, turn = 0, sway = 0.18 }) => {
      const plant = base.clone(true);
      plant.position.set(x, 0, z);
      plant.rotation.y = turn;
      plant.scale.multiplyScalar(size);
      ground.add(plant);
      makeVegetationReactive(plant);
    });
    preloadTracker.step();
  }, undefined, () => {
    preloadTracker.step();
  });
}

// Coconut Fall is the hero habitat asset. The supporting models only deepen its silhouette.
loadProp('./coconut_fall.webp.glb', new THREE.Vector3(0, 0.02, 0.82), 5.65, 0, settleGroundOnFloor);
loadPlantSet('./tropical_plant_monstera_deliciosa.webp.glb', [
  { x: -3.42, z: 1.1, size: 1.08, turn: 0.42, sway: 0.28 },
  { x: 3.38, z: 1.1, size: 1.12, turn: -0.48, sway: 0.28 }
], 3.25);
loadPlantSet('./tropical_plant.webp.glb', [
  { x: -2.45, z: -0.75, size: 0.98, turn: 0.7, sway: 0.22 },
  { x: 2.52, z: -0.75, size: 0.96, turn: -0.8, sway: 0.22 }
], 1.85);

function createFrogFallback() {
  const group = new THREE.Group();
  const green = material(0x8caf48);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.56, 18, 12), green);
  body.scale.set(1.2, 0.65, 0.82);
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 18, 12), green);
  head.position.set(0, 0.63, 0.38);
  group.add(body, head);
  [-0.23, 0.23].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 8), material(0xf2cf4a));
    eye.position.set(x, 0.86, 0.58);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), material(0x172421));
    pupil.position.set(x, 0.86, 0.67);
    group.add(eye, pupil);
  });
  group.traverse((part) => { if (part.isMesh) part.castShadow = true; });
  return group;
}

const frogHomes = [
  new THREE.Vector3(-1.9, 0, 3.5),
  new THREE.Vector3(0.15, 0, 2.75),
  new THREE.Vector3(3.05, 0, 3.65),
  new THREE.Vector3(1.5, 0, 5.0)
];

// Rest the feet on the floor in the pose the frog actually sits in: its idle clip,
// or its plain rest pose when it has none. Hop frames are left out on purpose; they
// happen in the air, and counting their crouch lifted resting frogs off the ground.
function liftAboveAnimatedPoses(model, mixer, clips) {
  const box = new THREE.Box3();
  let lowest = Infinity;
  const restClips = [...new Set(clips.filter((item) => item?.duration > 0.1))];
  if (!restClips.length) {
    model.updateMatrixWorld(true);
    box.setFromObject(model, true);
    lowest = box.min.y;
  }
  for (const clip of restClips) {
    const action = mixer.clipAction(clip).reset().play();
    for (let i = 0; i <= 24; i += 1) {
      mixer.setTime((clip.duration * i) / 24);
      model.updateMatrixWorld(true);
      model.traverse((part) => { if (part.isSkinnedMesh) part.skeleton.update(); });
      box.setFromObject(model, true);
      lowest = Math.min(lowest, box.min.y);
    }
    action.stop();
  }
  mixer.setTime(0);
  if (Number.isFinite(lowest)) model.position.y += 0.004 - lowest;
}

function installFrog(model, clips = [], index = 0, options = {}) {
  const holder = new THREE.Group();
  holder.position.copy(options.home || frogHomes[index % frogHomes.length]);
  holder.rotation.y = options.turn ?? (index - 1.5) * 0.28;
  // `pose` carries the code-driven squash, stretch and breathing, so it never fights
  // the holder's position or the GLB's own animation.
  const pose = new THREE.Group();
  pose.add(model);
  holder.add(pose);
  const frog = {
    holder,
    pose,
    home: holder.position.clone(),
    anchor: holder.position.clone(),
    start: holder.position.clone(),
    target: holder.position.clone(),
    hop: 0,
    cooldown: THREE.MathUtils.randFloat(3, 11), // first move comes at a random moment
    phase: frogs.length * 1.77,
    breathes: true,
    wander: Boolean(options.wander),
    background: Boolean(options.background),
    routeIndex: 0,
    offTerrain: false,
    nextOffTerrain: false,
    collisionRadius: options.height ? options.height * 0.68 : 0.45,
    hopRate: 1.65,
    hopHeight: 0.64,
    hopClipDuration: 0,
    // "Hop Cycle" holds several hops back to back; only one of them should play per jump.
    hopsInClip: options.hopsInClip || 1,
    startYaw: holder.rotation.y,
    targetYaw: holder.rotation.y,
    // The frog models face local +Z; heading is the travel direction, not a
    // world-position-derived offset (which made some hops face sideways).
    headingOffset: 0,
    hasAuthoredHop: false,
    reactive: options.reactive !== false,
    keepGloss: Boolean(options.keepGloss),
    onSurface: null,
    idleAction: null,
    hopAction: null
  };
  frogs.push(frog);
  // Background frogs are composed as still inhabitants. Only the foreground
  // frog gets a GLB action, so the scene does not turn into competing loops.
  if (clips.length && !frog.background) {
    const mixer = new THREE.AnimationMixer(model);
    // When a model declares an idle pattern, do not fall back to a jump clip.
    // That keeps jump-only models grounded until the visitor makes them flee.
    // Every clip matching the idle pattern is used: each frog switches between them at
    // random (see varyFrogIdle) and starts part-way in, so no two frogs move in step.
    const idleClips = options.idlePattern
      ? clips.filter((clip) => options.idlePattern.test(clip.name) && clip.duration > 0.1)
      : [clips.find((clip) => /idle|animation/i.test(clip.name) && clip.duration > 0.1) || clips[0]];
    const idleClip = idleClips[Math.floor(Math.random() * idleClips.length)];
    const hopClip = options.hopPattern && clips.find((clip) => options.hopPattern.test(clip.name));
    liftAboveAnimatedPoses(model, mixer, idleClips);
    frog.idleActions = idleClips.map((clip) => mixer.clipAction(clip));
    if (idleClip) {
      frog.idleAction = mixer.clipAction(idleClip).play();
      frog.idleAction.time = Math.random() * idleClip.duration;
    }
    frog.idleSwapIn = THREE.MathUtils.randFloat(3, 9);
    if (hopClip) {
      frog.hopAction = mixer.clipAction(hopClip);
      frog.hopAction.setLoop(THREE.LoopOnce, 1);
      frog.hopAction.clampWhenFinished = true;
      frog.hasAuthoredHop = true;
      frog.hopClipDuration = hopClip.duration;
    }
    // A real idle clip already breathes; a jump-only frog rests with the code-driven breath.
    frog.breathes = !idleClip || idleClip.duration <= 0.1;
    mixers.push(mixer);
  }
  ground.add(holder);
}

function findDescendant(root, pattern) {
  let match = null;
  root.traverse((part) => {
    if (!match && pattern.test(part.name)) match = part;
  });
  return match;
}

// Lift one part out of a bigger GLB, keeping the rotation and scale its parents gave it.
function detachPart(root, part) {
  root.updateMatrixWorld(true);
  const copy = cloneSkinned(part);
  part.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
  const wrapper = new THREE.Group();
  wrapper.add(copy);
  return wrapper;
}

// Frogs read as solid creatures on the projector. The red-eyed frog ships with
// half-transparent skin and inner "Bones_and_Veins" meshes meant to show through it,
// which looks hollow and glitchy here: hide the insides and make the skin solid,
// while fully clear texels (eye shells) are still cut away by alphaTest.
function makeFrogSolid(model) {
  model.traverse((part) => {
    if (!part.isMesh) return;
    const mats = Array.isArray(part.material) ? part.material : [part.material];
    if (mats.some((mat) => /bones|veins/i.test(mat.name))) {
      part.visible = false;
      return;
    }
    mats.forEach((mat) => {
      if (!mat.transparent) return;
      mat.transparent = false;
      mat.depthWrite = true;
      mat.alphaTest = 0.5;
      mat.needsUpdate = true;
    });
  });
}

// Small animals don't show clear-coat or specular extras at wall distance, but the
// physical shader that carries them is the costliest one. Swap to the standard shader,
// keeping every texture and colour.
function useStandardMaterials(root) {
  root.traverse((part) => {
    if (!part.isMesh) return;
    const swap = (mat) => {
      if (!mat?.isMeshPhysicalMaterial) return mat;
      const plain = new THREE.MeshStandardMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(plain, mat);
      plain.name = mat.name;
      return plain;
    };
    part.material = Array.isArray(part.material) ? part.material.map(swap) : swap(part.material);
  });
}

const sharedFrogFiles = new Map();

function loadSharedGLB(file, onLoad, onError) {
  if (!sharedFrogFiles.has(file)) {
    sharedFrogFiles.set(file, new Promise((resolve, reject) => loadGLB(file, resolve, undefined, reject)));
  }
  sharedFrogFiles.get(file).then(
    (gltf) => onLoad({ ...gltf, scene: cloneSkinned(gltf.scene) }),
    onError
  );
}

function loadFrog(options) {
  preloadTracker.register();
  const { file, index, height, select } = options;
  loadSharedGLB(file, (gltf) => {
    const selected = select ? select(gltf.scene) : gltf.scene;
    if (!selected) {
      installFrog(createFrogFallback(), [], index, options);
      preloadTracker.step();
      return;
    }
    const model = selected === gltf.scene ? selected : detachPart(gltf.scene, selected);
    makeFrogSolid(model);
    // The red-eyed frogs are the foreground stars and keep their wet clear-coat look.
    if (!options.keepGloss) useStandardMaterials(model);
    normaliseModel(model, height);
    // normaliseModel uses the loose outline box; frogs are small enough that the gap
    // it leaves shows, so seat the real lowest vertex on the floor.
    model.updateMatrixWorld(true);
    model.position.y -= new THREE.Box3().setFromObject(model, true).min.y;
    decorateModel(model);
    // A part lifted out of a bigger scene can't reuse that scene's clips.
    const clips = selected === gltf.scene ? gltf.animations : [];
    installFrog(model, clips, index, options);
    preloadTracker.step();
  }, undefined, () => {
    installFrog(createFrogFallback(), [], index, options);
    preloadTracker.step();
  });
}

// Every moving actor below is frog-only. The combined frogs_pack.glb diorama is
// deliberately excluded so its flowers, logs and ground can never hop with an animal.
loadFrog({
  file: './red_eyed_tree_frog.webp.glb',
  index: 0,
  height: 0.78,
  turn: 0.35,
  wander: true,
  // Three idle loops: calm (1, 2) and a face-wiping groom (3).
  idlePattern: /^Idle [123]$/i,
  hopPattern: /^Hop Cycle$/i,
  keepGloss: true,
  hopsInClip: 4 // 2.67 s clip = four hops, one every 0.67 s
});
loadFrog({
  file: './red_eyed_tree_frog.webp.glb',
  index: 0,
  height: 0.78,
  home: new THREE.Vector3(1.3, 0, -2.6),
  turn: Math.PI + 0.28,
  wander: true,
  idlePattern: /^Idle [123]$/i,
  hopPattern: /^Hop Cycle$/i,
  keepGloss: true,
  hopsInClip: 4 // 2.67 s clip = four hops, one every 0.67 s
});
// Young frogs, about two thirds the size of the big ones: scaled-down red-eyed frogs
// from a lighter copy of the model (fewer
// triangles, 512 px textures), so they match the stars and share its idle and hop.
// Each keeps its own outer-bank territory.
const SMALL_FROG = {
  file: './red_eyed_tree_frog_small.webp.glb',
  wander: true,
  idlePattern: /^Idle [123]$/i,
  hopPattern: /^Hop Cycle$/i,
  hopsInClip: 4
};
loadFrog({ ...SMALL_FROG, index: 0, height: 0.52, turn: 0.52, home: new THREE.Vector3(-2.2, 0, -2.55) });
loadFrog({ ...SMALL_FROG, index: 1, height: 0.56, turn: -0.78, home: new THREE.Vector3(2.45, 0, -2.65) });
loadFrog({ ...SMALL_FROG, index: 2, height: 0.48, turn: 0.18, home: new THREE.Vector3(-0.9, 0, -2.4) });
loadFrog({ ...SMALL_FROG, index: 3, height: 0.5, turn: -0.42, home: new THREE.Vector3(-3.55, 0, 3.15) });
loadFrog({ ...SMALL_FROG, index: 0, height: 0.54, turn: 0.58, home: new THREE.Vector3(3.85, 0, 3.15) });
loadFrog({ ...SMALL_FROG, index: 1, height: 0.47, turn: -0.16, home: new THREE.Vector3(-0.35, 0, 4.85) });
loadFrog({ ...SMALL_FROG, index: 2, height: 0.55, turn: -0.48, home: new THREE.Vector3(2.65, 0, 3.1) });

function createButterflyFallback() {
  const group = new THREE.Group();
  const wingMaterial = material(0x55cdbd);
  const left = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), wingMaterial);
  const right = left.clone();
  left.position.x = -0.14;
  right.position.x = 0.14;
  left.rotation.y = 0.35;
  right.rotation.y = -0.35;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.32, 8), material(0x25483e));
  body.rotation.x = Math.PI / 2;
  group.add(left, right, body);
  return group;
}

function makeButterfly(object, clips, index) {
  const homes = [
    [-2.72, 3.12, 1.25], [-1.35, 4.02, 1.42], [0.08, 3.42, 1.18],
    [1.4, 4.25, 1.36], [2.76, 3.52, 1.14], [0.6, 4.78, 1.02],
    // A second band behind the canopy keeps a rotated view inhabited too.
    [-2.28, 3.35, -1.18], [-0.72, 4.48, -1.42], [1.08, 3.62, -1.24],
    [2.48, 4.32, -1.05], [-3.08, 4.04, -0.92], [0.42, 5.02, -1.3]
  ];
  const home = homes[index % homes.length];
  const holder = new THREE.Group();
  holder.add(object);
  holder.position.set(...home);
  holder.scale.setScalar(0.79 + (index % 3) * 0.05);
  habitat.add(holder);
  const butterfly = {
    holder,
    home: holder.position.clone(),
    target: holder.position.clone(),
    velocity: new THREE.Vector3(),
    nextWaypoint: 0,
    seed: index * 4.19,
    fleeing: 0,
    desired: new THREE.Vector3(),
    yaw: holder.rotation.y,
    bank: 0,
    pitch: 0,
    flap: null
  };
  holder.rotation.order = 'YXZ';
  butterflies.push(butterfly);
  if (clips.length) {
    const mixer = new THREE.AnimationMixer(object);
    const flying = clips.find((clip) => /fly/i.test(clip.name)) || clips[0];
    butterfly.flap = mixer.clipAction(flying).play();
    butterfly.flap.time = (index * 0.37) % flying.duration;
    mixers.push(mixer);
  }
}

// Source files disagree on which way the head points (some +Z, some -Z). Read it
// from the antennae (or, failing that, away from the tails) so every species can
// be steered with "+Z is forward".
function butterflyHeadYaw(root) {
  root.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  const heads = [];
  const tails = [];
  root.traverse((part) => {
    if (/anten|antina/i.test(part.name)) heads.push(part.getWorldPosition(new THREE.Vector3()));
    else if (/tail/i.test(part.name)) tails.push(part.getWorldPosition(new THREE.Vector3()));
  });
  const average = (points) => points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  const head = heads.length ? average(heads).sub(centre) : tails.length ? centre.clone().sub(average(tails)) : null;
  return head && Math.hypot(head.x, head.z) > 1e-4 ? Math.atan2(head.x, head.z) : 0;
}

function loadButterflies(file, count, offset) {
  preloadTracker.register();
  loadGLB(file, (gltf) => {
    const base = normaliseFlyingModel(gltf.scene, 1.0);
    decorateModel(base);
    // Too small and high to cast a readable shadow; skipping them saves a second draw each.
    base.traverse((part) => { part.castShadow = false; });
    useStandardMaterials(base);
    const headYaw = butterflyHeadYaw(base);
    for (let i = 0; i < count; i += 1) {
      const oriented = new THREE.Group();
      oriented.add(cloneSkinned(base));
      oriented.rotation.y = -headYaw;
      makeButterfly(oriented, gltf.animations, offset + i);
    }
    preloadTracker.step();
  }, undefined, () => {
    for (let i = 0; i < count; i += 1) makeButterfly(createButterflyFallback(), [], offset + i);
    preloadTracker.step();
  });
}

// Six different authored species, one lightweight instance of each.
loadButterflies('./animated_butterfly.webp.glb', 1, 0);
loadButterflies('./danaid_butterfly.webp.glb', 1, 2);
loadButterflies('./cairns_birdwing.webp.glb', 1, 3);
loadButterflies('./red_lacewing.webp.glb', 1, 4);
loadButterflies('./orchard_swallowtail.webp.glb', 1, 5);
loadButterflies('./animated_butterfly.webp.glb', 1, 6);
loadButterflies('./danaid_butterfly.webp.glb', 1, 8);
loadButterflies('./cairns_birdwing.webp.glb', 1, 9);
loadButterflies('./red_lacewing.webp.glb', 1, 10);
loadButterflies('./orchard_swallowtail.webp.glb', 1, 11);

const interactionPlane = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshBasicMaterial({ visible: false }));
interactionPlane.rotation.x = -Math.PI / 2;
interactionPlane.position.y = -1.28;
scene.add(interactionPlane);

function setNormalisedInteraction(x, y, source = 'pointer') {
  const clampedX = THREE.MathUtils.clamp(x, 0, 1);
  const clampedY = THREE.MathUtils.clamp(y, 0, 1);
  pointer.set(clampedX * 2 - 1, -(clampedY * 2 - 1));
  raycaster.setFromCamera(pointer, camera);
  const pondHit = raycaster.intersectObject(pond, false)[0];
  const hit = pondHit || raycaster.intersectObject(interactionPlane, false)[0];
  if (hit) interactionPoint.copy(hit.point);
  dioramaMotion.targetYaw = (clampedX - 0.5) * 0.09;
  dioramaMotion.targetPitch = (0.5 - clampedY) * 0.034;
  presence.active = true;
  presence.lastInput = clock.getElapsedTime();
  if (pondHit && presence.lastInput - pondState.lastRipple > 0.22) {
    pondState.lastRipple = presence.lastInput;
    addRipple(pondHit.point, 1);
  }
  // Kinect bridge: call window.jungleWall.setInput({ x: 0..1, y: 0..1, source: 'kinect' }).
  void source;
}

// Starts a ring at a world-space point if it lies on (or near) the pond. `reach` is how
// far outside the rim still counts, in pond radii squared.
function addRipple(worldPoint, strength = 1, reach = 1.35) {
  const local = pond.worldToLocal(worldPoint.clone());
  if ((local.x / POND.rx) ** 2 + (local.y / POND.rz) ** 2 > reach) return;
  const next = ripples.reduce((oldest, item) => item.z > oldest.z ? item : oldest, ripples[0]);
  next.set(local.x, local.y, 0, strength);
}

window.jungleWall = {
  setInput({ x, y, source = 'kinect' }) {
    if (Number.isFinite(x) && Number.isFinite(y)) setNormalisedInteraction(THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(y, 0, 1), source);
  },
  clearInput() {
    presence.active = false;
    dioramaMotion.targetYaw = 0;
    dioramaMotion.targetPitch = 0;
  },
  resetView,
  // Trigger the frog act on demand: 'glass' (belly toward us) or 'wall' (back toward us).
  // Starts as soon as a red-eyed frog is resting (at most a hop away).
  frogLeap(kind = 'glass') {
    if (surfaceAct.frog) return false;
    surfaceAct.requested = kind === 'wall' ? 'wall' : 'glass';
    return true;
  }
};

// Visitor view controls: drag sideways to turn the island, drag up/down to look from
// higher or lower, wheel or two-finger pinch to zoom, double-click to reset.
const cameraTarget = new THREE.Vector3(0, 0.15, 0.25);
const baseOffset = camera.position.clone().sub(cameraTarget);
const baseDistance = baseOffset.length();
const baseElevation = Math.asin(baseOffset.y / baseDistance);
const view = { spin: 0, targetSpin: 0, elevation: baseElevation, targetElevation: baseElevation, zoom: 1, targetZoom: 1 };
const activePointers = new Map();
let pinchDistance = 0;

function resetView() {
  view.targetSpin = Math.round(view.spin / (Math.PI * 2)) * Math.PI * 2;
  view.targetElevation = baseElevation;
  view.targetZoom = 1;
}

function pinchSpan() {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onPointer(event) {
  const rect = canvas.getBoundingClientRect();
  setNormalisedInteraction((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) pinchDistance = pinchSpan();
  onPointer(event);
});

canvas.addEventListener('pointermove', (event) => {
  const last = activePointers.get(event.pointerId);
  if (last) {
    if (activePointers.size === 1) {
      view.targetSpin += (event.clientX - last.x) * 0.0085;
      view.targetElevation = THREE.MathUtils.clamp(view.targetElevation + (event.clientY - last.y) * 0.004, 0.04, 1.25);
    }
    last.x = event.clientX;
    last.y = event.clientY;
    if (activePointers.size === 2) {
      const span = pinchSpan();
      if (pinchDistance > 0) view.targetZoom = THREE.MathUtils.clamp(view.targetZoom * (pinchDistance / span), 0.35, 1.8);
      pinchDistance = span;
    }
  }
  onPointer(event);
}, { passive: true });

function releasePointer(event) {
  activePointers.delete(event.pointerId);
  pinchDistance = activePointers.size === 2 ? pinchSpan() : 0;
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  view.targetZoom = THREE.MathUtils.clamp(view.targetZoom * Math.exp(event.deltaY * 0.0012), 0.35, 1.8);
}, { passive: false });
canvas.addEventListener('dblclick', resetView);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(pixelRatioFor());
});

function updateView(delta) {
  const blend = 1 - Math.exp(-delta * 7);
  view.spin = THREE.MathUtils.lerp(view.spin, view.targetSpin, blend);
  view.elevation = THREE.MathUtils.lerp(view.elevation, view.targetElevation, blend);
  view.zoom = THREE.MathUtils.lerp(view.zoom, view.targetZoom, blend);
  const distance = baseDistance * view.zoom;
  camera.position.set(0, Math.sin(view.elevation) * distance, Math.cos(view.elevation) * distance).add(cameraTarget);
  camera.lookAt(cameraTarget);
}

function updatePlants(time, delta, active) {
  vegetationUniforms.forEach((uniforms) => {
    uniforms.uSwayTime.value = time;
    uniforms.uInteractionActive.value = active ? 1 : 0;
  });
  void delta;
}

function updateButterflies(time, delta, active) {
  scratchInteraction.copy(interactionPoint);
  habitat.worldToLocal(scratchInteraction);
  butterflies.forEach((butterfly, index) => {
    const pos = butterfly.holder.position;
    // Butterflies fly well above the hand, so judge closeness across the ground only.
    const distance = Math.hypot(pos.x - scratchInteraction.x, pos.z - scratchInteraction.z);
    const threatened = active && distance < 2.3 && butterfly.fleeing <= 0;
    if (threatened) {
      const away = pos.clone().sub(scratchInteraction).setY(0).normalize();
      if (away.lengthSq() < 0.01) away.set(index % 2 ? 1 : -1, 0, 0.4);
      butterfly.target.copy(pos).addScaledVector(away, 3.4);
      butterfly.target.x = THREE.MathUtils.clamp(butterfly.target.x, -WIDE_ROAM.halfWidth, WIDE_ROAM.halfWidth);
      butterfly.target.y = THREE.MathUtils.clamp(pos.y + 0.9, 2.7, 6.2);
      butterfly.target.z = THREE.MathUtils.clamp(butterfly.target.z, -3.2, 3.2);
      butterfly.fleeing = 2.4;
      butterfly.nextWaypoint = time + 2.4;
    } else if (butterfly.fleeing <= 0 && (time >= butterfly.nextWaypoint || pos.distanceTo(butterfly.target) < 0.18)) {
      const flight = time * 0.76 + butterfly.seed;
      if (!butterfly.outing && Math.random() < 0.22) {
        // Now and then a long trip out across the wide screen, then back home.
        butterfly.outing = true;
        butterfly.target.set(
          (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.35
            ? WIDE_ROAM.visibleHalfWidth + 2.5 // right out of the picture, back later
            : THREE.MathUtils.randFloat(WIDE_ROAM.halfWidth * 0.5, WIDE_ROAM.halfWidth - 0.3)),
          THREE.MathUtils.randFloat(3.2, 6),
          THREE.MathUtils.randFloat(-2.8, 2.8)
        );
        // Long trips fly a little faster; allow time to get there (and out of sight).
        butterfly.nextWaypoint = time + Math.max(12, butterfly.target.distanceTo(pos) / 1.0 + 4);
      } else {
        butterfly.outing = false;
        butterfly.target.set(
          THREE.MathUtils.clamp(butterfly.home.x + Math.sin(flight * 1.31) * 2.2, -WIDE_ROAM.halfWidth, WIDE_ROAM.halfWidth),
          THREE.MathUtils.clamp(butterfly.home.y + Math.cos(flight * 1.17) * 0.68, 3.35, 5.65),
          THREE.MathUtils.clamp(butterfly.home.z + Math.sin(flight * 0.87 + butterfly.seed) * 1.02, -2.2, 2.2)
        );
        butterfly.nextWaypoint = time + 2.2 + (index % 4) * 0.37;
      }
    }
    butterfly.fleeing = Math.max(0, butterfly.fleeing - delta);
    // Steer like a small boat: turn the head toward the waypoint at a limited rate
    // and always fly the way the head points, so body and path never disagree.
    const cruise = butterfly.fleeing ? 1.3 : butterfly.outing ? 1.0 : 0.56 + (index % 3) * 0.06;
    const maxTurn = butterfly.fleeing ? 4.2 : 1.9; // rad/s
    butterfly.desired.copy(butterfly.target).sub(pos);
    const flat = Math.hypot(butterfly.desired.x, butterfly.desired.z);
    const turn = THREE.MathUtils.euclideanModulo(Math.atan2(butterfly.desired.x, butterfly.desired.z) - butterfly.yaw + Math.PI, Math.PI * 2) - Math.PI;
    const step = THREE.MathUtils.clamp(turn, -maxTurn * delta, maxTurn * delta);
    butterfly.yaw += step;
    const turnRate = step / Math.max(delta, 1e-3);
    // Slow down near the waypoint and while facing away from it, so turns stay tight.
    const speed = Math.min(cruise, flat * 1.4 + 0.12) * (0.45 + 0.55 * Math.max(0, Math.cos(turn)));
    const v = butterfly.velocity;
    v.x = Math.sin(butterfly.yaw) * speed;
    v.z = Math.cos(butterfly.yaw) * speed;
    v.y = THREE.MathUtils.lerp(v.y, THREE.MathUtils.clamp(butterfly.desired.y * 1.2, -0.7, 0.9), 1 - Math.exp(-delta * 2.5));
    pos.addScaledVector(v, delta);
    const groundSpeed = speed;
    const bankTarget = THREE.MathUtils.clamp(-turnRate * 0.28, -0.55, 0.55);
    const pitchTarget = THREE.MathUtils.clamp(-Math.atan2(v.y, Math.max(groundSpeed, 0.25)) * 0.7, -0.45, 0.45);
    butterfly.bank = THREE.MathUtils.lerp(butterfly.bank, bankTarget, 1 - Math.exp(-delta * 4));
    butterfly.pitch = THREE.MathUtils.lerp(butterfly.pitch, pitchTarget, 1 - Math.exp(-delta * 4));
    butterfly.holder.rotation.set(butterfly.pitch, butterfly.yaw, butterfly.bank);
    // A small lift on every wing beat reads as flapping flight, not gliding on rails.
    butterfly.holder.children[0].position.y = Math.sin(time * (butterfly.fleeing ? 15 : 9) + butterfly.seed) * 0.035;
    if (butterfly.flap) butterfly.flap.timeScale = butterfly.fleeing ? 1.8 : 1;
  });
}

// Broad clearances around solid rocks, mushrooms, and the dense plant bases.
// The frog's own footprint and a small margin are added by isFrogPathClear.
const FROG_OBSTACLES = [
  { x: -3.85, z: -1.45, radius: 0.76 },
  { x: 3.95, z: -1.35, radius: 0.82 },
  { x: 0.35, z: -1.3, radius: 0.58 },
  { x: -3.05, z: -1.6, radius: 0.45 },
  { x: 3.05, z: -1.55, radius: 0.45 },
  { x: 2.55, z: -0.85, radius: 0.32 },
  { x: -3.42, z: 1.1, radius: 0.95 },
  { x: 3.38, z: 1.1, radius: 0.95 },
  { x: -2.45, z: -0.75, radius: 0.65 },
  { x: 2.52, z: -0.75, radius: 0.65 },
  { x: 0, z: 0.82, radius: 1.1 }
];

function isOutsideTerrain(point) {
  return (point.x / 4.7) ** 2 + ((point.z - 0.75) / 4.6) ** 2 > 1;
}

function distanceToSegment2D(x, z, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const t = THREE.MathUtils.clamp(((x - start.x) * dx + (z - start.z) * dz) / Math.max(dx * dx + dz * dz, 0.001), 0, 1);
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
}

// Check the whole swept footprint, not only the destination. This prevents a
// midair path through a mushroom, rock, pond, plant base, or another frog.
function isFrogPathClear(frog, destination) {
  const start = frog.holder.position;
  const distance = start.distanceTo(destination);
  const samples = Math.max(8, Math.ceil(distance / 0.14));
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = THREE.MathUtils.lerp(start.x, destination.x, t);
    const z = THREE.MathUtils.lerp(start.z, destination.z, t);
    const pondX = (x - POND.x) / (POND.rx + frog.collisionRadius + 0.08);
    const pondZ = (z - POND.z) / (POND.rz + frog.collisionRadius + 0.08);
    if (pondX * pondX + pondZ * pondZ < 1) return false;
    if (FROG_OBSTACLES.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + frog.collisionRadius + 0.08)) return false;
    for (const other of frogs) {
      if (other === frog || other.onSurface) continue;
      const clearance = frog.collisionRadius + other.collisionRadius + 0.1;
      const separation = other.hop > 0
        ? distanceToSegment2D(x, z, other.holder.position, other.target)
        : Math.hypot(x - other.holder.position.x, z - other.holder.position.z);
      if (separation < clearance) return false;
    }
  }
  return true;
}

function startFrogHop(frog, index, destination) {
  // Every hop, whatever planned it, must land inside the picture for this screen shape;
  // only a frog on an exit trip may jump out past its edge.
  const reach = frog.leaving ? WIDE_ROAM.exitHalfWidth : WIDE_ROAM.halfWidth;
  if (Math.abs(destination.x) > reach || destination.z < WIDE_ROAM.frogMinZ || destination.z > WIDE_ROAM.frogMaxZ) return false;
  if (!isLandingSpotOk(frog, destination)) return false;
  if (!isFrogPathClear(frog, destination)) return false;
  frog.start.copy(frog.holder.position);
  frog.start.y = frog.home.y;
  frog.target.copy(destination);
  frog.target.y = frog.home.y;
  const distance = frog.start.distanceTo(frog.target);
  const direction = Math.atan2(frog.target.x - frog.start.x, frog.target.z - frog.start.z) + frog.headingOffset;
  frog.startYaw = frog.holder.rotation.y;
  frog.targetYaw = frog.startYaw + THREE.MathUtils.euclideanModulo(direction - frog.startYaw + Math.PI, Math.PI * 2) - Math.PI;
  frog.nextOffTerrain = !groundVisibleAt(frog.target.x, frog.target.z);
  frog.home.copy(frog.target);
  frog.hop = 0.001;
  frog.bursting = false; // a real hop replaces an on-the-spot one
  const hopDuration = THREE.MathUtils.clamp(0.68 + distance * 0.22, 0.76, 1.22);
  frog.hopRate = 1 / hopDuration;
  frog.hopHeight = frog.hasAuthoredHop
    ? 0.28 + Math.min(distance * 0.08, 0.13)
    : 0.38 + Math.min(distance * 0.15, 0.45) + (index % 2) * 0.04;
  if (frog.hopAction) {
    frog.hopAction.reset().setEffectiveTimeScale((frog.hopClipDuration / frog.hopsInClip) * frog.hopRate).play();
    if (frog.idleAction) frog.idleAction.crossFadeTo(frog.hopAction, 0.12, false);
  }
  return true;
}

// Search outward from the frog along the line to the island centre (inward first)
// for the nearest spot it may rest on. Used when its planned hops are all refused,
// or when it is sitting somewhere it shouldn't.
function hopToNearestRestSpot(frog, index) {
  const pos = frog.holder.position;
  const inward = new THREE.Vector3(-pos.x, 0, 0.75 - pos.z);
  if (inward.lengthSq() < 1e-4) inward.set(0, 0, 1);
  inward.normalize();
  for (const distance of [0.45, 0.75, 1.05, 1.35, 1.7, 2.1]) {
    for (const sign of [1, -1]) {
      for (const angle of [0, 0.45, -0.45]) {
        const candidate = inward.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).multiplyScalar(distance * sign).add(pos);
        if (startFrogHop(frog, index, candidate)) return true;
      }
    }
  }
  return false;
}

// Animals may roam out into the dark either side of the island, as far as the screen
// shows. On the widescreen projector that's far (the picture spans about ±15 units at
// the island's depth, the island only ±4); on a tablet, especially upright, much less.
const WIDE_ROAM = {
  frogMinZ: -3.5,
  frogMaxZ: 6.5,
  // Half the picture's width at the island's depth.
  get visibleHalfWidth() {
    return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * baseDistance * camera.aspect;
  },
  // Everyday roaming stays well inside the picture.
  get halfWidth() {
    return THREE.MathUtils.clamp(this.visibleHalfWidth * 0.7, 4.5, 10);
  },
  // Exit trips may leave the picture entirely, to just past its edge.
  get exitHalfWidth() {
    return this.visibleHalfWidth + 3.5;
  }
};

// Out in the dark a frog takes a few hops away (mostly sideways, to suit the wide
// screen), then hops back toward its home spot step by step. On an exit trip it
// makes big jumps right out of the picture, waits out of sight, then comes back.
function roamOutInTheDark(frog, index) {
  const pos = frog.holder.position;
  const candidates = [];
  if (frog.excursionHops > 0) {
    const spread = frog.leaving ? 0.25 : 0.5;
    for (const angle of [0, spread, -spread]) {
      const dir = frog.excursionDir.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
      candidates.push(dir.multiplyScalar(frog.leaving ? THREE.MathUtils.randFloat(2.2, 2.8) : THREE.MathUtils.randFloat(1.4, 2)).add(pos));
    }
  } else {
    const home = frog.anchor.clone().sub(pos).setY(0);
    if (home.length() < 1.3) return false; // home already
    const stride = Math.min(home.length(), 2);
    home.normalize();
    for (const angle of [0, 0.4, -0.4]) candidates.push(home.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).multiplyScalar(stride).add(pos));
  }
  for (const candidate of candidates) {
    if (!startFrogHop(frog, index, candidate)) continue;
    const outbound = frog.excursionHops > 0;
    if (outbound) frog.excursionHops -= 1;
    // Last jump of an exit trip: stay away, out of sight, for a while.
    frog.cooldown = frog.leaving && outbound && frog.excursionHops === 0
      ? THREE.MathUtils.randFloat(5, 10)
      : THREE.MathUtils.randFloat(2.5, 5);
    return true;
  }
  // Blocked or at the edge of the picture: head home instead.
  frog.excursionHops = 0;
  return false;
}

function roamFrog(frog, index) {
  if (frog.mustMove) {
    frog.mustMove = false;
    if (hopToNearestRestSpot(frog, index)) {
      frog.cooldown = 1.2;
      return;
    }
  }
  const outward = new THREE.Vector3(frog.anchor.x, 0, frog.anchor.z - 0.75).normalize();
  const tangent = new THREE.Vector3(-outward.z, 0, outward.x);
  const side = frog.routeIndex % 2 ? -1 : 1;
  if (frog.offTerrain) {
    // Near enough counts as home: some home spots sit on the island's edge, where a
    // frog may not rest, so it can only ever get close.
    const atHome = frog.holder.position.distanceTo(frog.anchor) < 1.3;
    // Trip finished: back at its home spot (some homes are themselves out in the dark).
    if (frog.excursionHops === 0 && atHome) {
      frog.excursionHops = undefined;
      frog.leaving = false;
    }
    if (frog.excursionHops === undefined && (!atHome || Math.random() < 0.5)) {
      if (Math.random() < 0.4) {
        // Exit trip: big sideways jumps until it is past the edge of the picture.
        const sideways = Math.sign(frog.holder.position.x || outward.x || 1);
        frog.leaving = true;
        frog.excursionDir = new THREE.Vector3(sideways, 0, THREE.MathUtils.randFloatSpread(0.3)).normalize();
        const toEdge = WIDE_ROAM.visibleHalfWidth + 1.5 - Math.abs(frog.holder.position.x);
        frog.excursionHops = Math.max(1, Math.ceil(toEdge / 2.5));
      } else {
        // Plan a trip of 1-3 more hops out into the dark, leaning sideways.
        frog.excursionDir = new THREE.Vector3(outward.x * 1.8, 0, outward.z * 0.6).normalize();
        frog.excursionHops = THREE.MathUtils.randInt(1, 3);
      }
    }
    if (frog.excursionHops !== undefined) {
      if (roamOutInTheDark(frog, index)) return;
      if (roamOutInTheDark(frog, index)) return; // second try heads home
    }
  } else {
    frog.excursionDir = undefined;
    frog.excursionHops = undefined;
    frog.leaving = false;
  }
  const candidates = frog.offTerrain
    ? [frog.anchor.clone().addScaledVector(tangent, side * 0.32), frog.anchor.clone()]
    : [
        frog.anchor.clone().addScaledVector(outward, 1.65 + (index % 3) * 0.18).addScaledVector(tangent, side * 0.24),
        frog.anchor.clone().addScaledVector(tangent, side * 0.38),
        frog.anchor.clone().addScaledVector(outward, 0.65)
      ];
  for (const candidate of candidates) {
    if (frog.holder.position.distanceTo(candidate) < 0.18) continue;
    if (!startFrogHop(frog, index, candidate)) continue;
    frog.routeIndex += 1;
    // Frogs mostly sit: a long rest on the island, a shorter pause out in the dark.
    frog.cooldown = frog.nextOffTerrain ? THREE.MathUtils.randFloat(2.5, 5) : THREE.MathUtils.randFloat(8, 18);
    return;
  }
  if (hopToNearestRestSpot(frog, index)) {
    frog.cooldown = THREE.MathUtils.randFloat(4, 9);
    return;
  }
  frog.cooldown = 2;
}

// While resting, rotate through the model's own animations so frogs are never frozen
// and never in step: three idle loops, plus now and then a single hop on the spot.
function varyFrogIdle(frog, delta) {
  if (!frog.idleAction || frog.hop > 0 || frog.onSurface) return;
  frog.idleSwapIn -= delta;
  if (frog.idleSwapIn > 0) return;
  const idles = frog.idleActions || [frog.idleAction];
  const others = idles.length > 1 ? idles.filter((action) => action !== frog.idleAction) : idles;
  const next = others[Math.floor(Math.random() * others.length)];
  if (frog.bursting) {
    // End of an on-the-spot hop: settle back into an idle.
    frog.bursting = false;
    next.reset().play();
    frog.hopAction.crossFadeTo(next, 0.3, false);
    frog.idleAction = next;
    frog.idleSwapIn = THREE.MathUtils.randFloat(4, 9);
    return;
  }
  if (frog.hopAction && Math.random() < 0.1) {
    // One hop from the hop cycle, played in place at its natural speed.
    frog.bursting = true;
    frog.hopAction.setLoop(THREE.LoopOnce, 1);
    frog.hopAction.reset().setEffectiveTimeScale(1).play();
    frog.idleAction.crossFadeTo(frog.hopAction, 0.15, false);
    frog.idleSwapIn = frog.hopClipDuration / frog.hopsInClip;
    return;
  }
  next.reset().play();
  frog.idleAction.crossFadeTo(next, 0.6, false);
  frog.idleAction = next;
  // The groom (short clip) plays once through; calmer idles run longer.
  frog.idleSwapIn = next.getClip().duration < 3 ? next.getClip().duration : THREE.MathUtils.randFloat(4, 10);
}

function updateFrogs(time, delta, active) {
  scratchInteraction.copy(interactionPoint);
  habitat.worldToLocal(scratchInteraction);
  frogs.forEach((frog, index) => {
    if (frog.onSurface) return; // away on the glass or the wall; see updateSurfaceFrog()
    varyFrogIdle(frog, delta);
    frog.cooldown = Math.max(0, frog.cooldown - delta);
    const pos = frog.holder.position;
    // Once the floor is known, a frog placed on the edge moves off it straight away.
    if (floorMask && !frog.spotChecked && frog.hop === 0) {
      frog.spotChecked = true;
      if (!isLandingSpotOk(frog, pos)) {
        frog.mustMove = true;
        frog.cooldown = 0;
      }
    }
    const dx = pos.x - scratchInteraction.x;
    const dz = pos.z - scratchInteraction.z;
    const distance = Math.hypot(dx, dz);
    if (frog.reactive && active && distance < 2.4 && frog.cooldown === 0 && frog.hop === 0) {
      scratchAway.set(dx, 0, dz).normalize();
      if (scratchAway.lengthSq() < 0.01) scratchAway.set(index % 2 ? 1 : -1, 0, 0.25).normalize();
      for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
        const candidate = scratchAway.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle)
          .multiplyScalar(1.6).add(pos);
        if (!startFrogHop(frog, index, candidate)) continue;
        frog.cooldown = 2.8 + (index % 3) * 0.5;
        break;
      }
    }
    if (frog.wander && frog.cooldown === 0 && frog.hop === 0) {
      roamFrog(frog, index);
    }
    if (frog.hop > 0) {
      frog.hop += delta * frog.hopRate;
      const p = Math.min(frog.hop, 1);
      const eased = p * p * (3 - 2 * p);
      pos.lerpVectors(frog.start, frog.target, eased);
      pos.y = frog.target.y + Math.sin(p * Math.PI) * frog.hopHeight;
      frog.holder.rotation.y = THREE.MathUtils.lerp(frog.startYaw, frog.targetYaw, Math.min(p * 3, 1));
      const hopTilt = frog.hasAuthoredHop ? 0.045 : 0.13;
      frog.holder.rotation.x = -Math.sin(p * Math.PI) * hopTilt;
      frog.holder.rotation.z = Math.sin(p * Math.PI) * hopTilt * 0.62 * (index % 2 ? 1 : -1);
      if (!frog.hasAuthoredHop) {
        // Stretch on take-off, squash on landing only for procedural hops.
        const stretch = Math.sin(p * Math.PI) * 0.16 - Math.max(0, 1 - Math.abs(p - 0.95) * 12) * 0.12;
        frog.pose.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
      }
      if (p === 1) {
        frog.pose.scale.set(1, 1, 1);
        if (frog.hopAction) {
          if (frog.idleAction) {
            frog.idleAction.reset().play();
            frog.hopAction.crossFadeTo(frog.idleAction, 0.35, false);
          } else {
            frog.hopAction.stop();
          }
        }
        frog.hop = 0;
        frog.offTerrain = frog.nextOffTerrain;
        if (frog.offTerrain) frog.cooldown = Math.max(frog.cooldown, 0.65);
        pos.copy(frog.home);
        addRipple(frog.holder.getWorldPosition(scratchAway), 0.8, 2.6);
      }
    } else {
      pos.copy(frog.home);
      frog.holder.rotation.x = Math.sin(time * 0.9 + frog.phase) * 0.012;
      frog.holder.rotation.z = Math.sin(time * 1.15 + frog.phase) * 0.018;
      if (frog.breathes) {
        const breath = (0.5 + 0.5 * Math.sin(time * 2.4 + frog.phase)) ** 2 * 0.045;
        frog.pose.scale.set(1 + breath * 0.6, 1 + breath, 1 + breath * 0.35);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Extra act for the big red-eyed frogs: now and then one leaps off the island onto
// an invisible surface fixed to the viewer, creeps around on it, then drops back.
//   glass: just in front of the viewer; the frog sticks belly-first (we see its belly)
//   wall:  a wall behind the island; the frog clings to it (we see its back)
// A hand reaching for a frog on the surface makes it let go early.
// Trigger by hand for testing: window.jungleWall.frogLeap('glass' | 'wall').
const SURFACE = {
  glass: { distance: () => 9, up: new THREE.Vector3(0, 0, -1), reachX: 0.55, minY: -0.35, maxY: 0.45, walkSpeed: 0.34, arc: 1.1 },
  wall: { distance: () => baseDistance * view.zoom + 5, up: new THREE.Vector3(0, 0, 1), reachX: 0.6, minY: 0.05, maxY: 0.62, walkSpeed: 0.9, arc: 2.2 }
};
const surfaceAct = { nextAt: 40, frog: null, lastKind: 'wall' };
const surfaceScratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4(), x: new THREE.Vector3(), z: new THREE.Vector3(), ndc: new THREE.Vector3() };

// Camera-space point on a surface (fx, fy are fractions of the visible half-size).
function surfacePointWorld(kind, fx, fy, out) {
  const distance = SURFACE[kind].distance();
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
  out.set(fx * halfH * camera.aspect, fy * halfH, -distance);
  return camera.localToWorld(out);
}

// World orientation for a frog on the surface: feet on it, head along `heading`
// (radians, 0 = up the screen). The frog models face +Z with +Y up.
function surfaceQuaternion(kind, heading, out) {
  const up = SURFACE[kind].up;
  const { x, z, m } = surfaceScratch;
  z.set(-Math.sin(heading), Math.cos(heading), 0);
  x.crossVectors(up, z);
  m.makeBasis(x, up, z);
  out.setFromRotationMatrix(m);
  return out.premultiply(camera.quaternion);
}

function playHopClip(frog, seconds) {
  if (!frog.hopAction) return;
  frog.hopAction.setLoop(THREE.LoopOnce, 1);
  frog.hopAction.reset().setEffectiveTimeScale((frog.hopClipDuration / frog.hopsInClip) / seconds).play();
  if (frog.idleAction) frog.idleAction.crossFadeTo(frog.hopAction, 0.12, false);
}

function settleToIdle(frog) {
  if (!frog.hopAction || !frog.idleAction) return;
  frog.idleAction.reset().play();
  frog.hopAction.crossFadeTo(frog.idleAction, 0.3, false);
}

function pickSurfaceGoal(act) {
  const cfg = SURFACE[act.kind];
  act.goal.set(THREE.MathUtils.randFloatSpread(cfg.reachX * 2), THREE.MathUtils.randFloat(cfg.minY, cfg.maxY));
}

function startSurfaceAct(frog, kind) {
  if (!frog || frog.onSurface || frog.hop > 0) return false;
  const cfg = SURFACE[kind];
  scene.updateMatrixWorld(true);
  // Which way is the viewer, seen from the frog (in the frog's own ground space)?
  const toViewer = ground.worldToLocal(camera.position.clone()).sub(frog.holder.position).setY(0);
  const faceYaw = Math.atan2(toViewer.x, toViewer.z) + (kind === 'wall' ? Math.PI : 0);
  const startYaw = frog.holder.rotation.y;
  const act = {
    kind,
    phase: 'turn',
    t: 0,
    turnFrom: startYaw,
    turnTo: startYaw + THREE.MathUtils.euclideanModulo(faceYaw - startYaw + Math.PI, Math.PI * 2) - Math.PI,
    spot: new THREE.Vector2(),
    heading: THREE.MathUtils.randFloatSpread(0.3),
    goal: new THREE.Vector2(),
    walkLeft: 7 + Math.random() * 3,
    homeYaw: startYaw
  };
  pickSurfaceGoal(act);
  frog.onSurface = act;
  return true;
}

// End of the turn: lift off. The landing spot on the surface is straight in line with
// where the frog sits on screen (a little higher), so it flies straight out, not sideways.
function beginSurfaceLeap(frog, act) {
  const cfg = SURFACE[act.kind];
  scene.updateMatrixWorld(true);
  act.fromPos = frog.holder.getWorldPosition(new THREE.Vector3());
  act.fromQuat = frog.holder.getWorldQuaternion(new THREE.Quaternion());
  const onScreen = act.fromPos.clone().project(camera);
  act.spot.set(
    THREE.MathUtils.clamp(onScreen.x, -cfg.reachX, cfg.reachX),
    THREE.MathUtils.clamp(onScreen.y + 0.2, cfg.minY, cfg.maxY)
  );
  act.phase = 'leap';
  act.t = 0;
  frog.holder.traverse((part) => { if (part.isMesh) part.castShadow = false; });
  scene.attach(frog.holder);
  playHopClip(frog, 0.95);
}

// Where to land back on the island: its old home if still free, else any rest spot.
function surfaceLandingSpot(frog) {
  const free = (point) => isLandingSpotOk(frog, point) && frogs.every((other) => other === frog || other.onSurface
    || Math.hypot(point.x - other.holder.position.x, point.z - other.holder.position.z) > frog.collisionRadius + other.collisionRadius + 0.1);
  if (free(frog.home)) return frog.home.clone();
  for (let tries = 0; tries < 60; tries += 1) {
    const candidate = new THREE.Vector3(THREE.MathUtils.randFloat(-2.5, 3), 0, THREE.MathUtils.randFloat(2, 4.6));
    if (groundVisibleAt(candidate.x, candidate.z) && free(candidate)) return candidate;
  }
  return frog.home.clone();
}

function updateSurfaceFrog(time, delta, active) {
  // Every 35-60 s a red-eyed frog performs, alternating glass and wall. If both are
  // mid-hop right then, keep trying each frame until one has landed.
  if (!surfaceAct.frog && (time > surfaceAct.nextAt || surfaceAct.requested)) {
    const star = frogs.find((frog) => frog.keepGloss && frog.hop === 0 && !frog.onSurface);
    const kind = surfaceAct.requested || (surfaceAct.lastKind === 'glass' ? 'wall' : 'glass');
    if (startSurfaceAct(star, kind)) {
      surfaceAct.frog = star;
      surfaceAct.lastKind = kind;
      surfaceAct.requested = null;
      surfaceAct.nextAt = time + 35 + Math.random() * 25;
    }
  }
  const frog = surfaceAct.frog;
  const act = frog?.onSurface;
  if (!act) return;
  const holder = frog.holder;
  const cfg = SURFACE[act.kind];
  const { a, b, q, ndc } = surfaceScratch;
  act.t += delta;

  if (act.phase === 'turn') {
    // Turn on the spot to face the viewer (or the wall) before jumping.
    const k = Math.min(act.t / 0.5, 1);
    holder.rotation.y = THREE.MathUtils.lerp(act.turnFrom, act.turnTo, k * k * (3 - 2 * k));
    if (k === 1) beginSurfaceLeap(frog, act);
    return;
  }

  if (act.phase === 'leap') {
    const p = Math.min(act.t / 0.95, 1);
    surfacePointWorld(act.kind, act.spot.x, act.spot.y, b);
    holder.position.lerpVectors(act.fromPos, b, p * p * (3 - 2 * p));
    holder.position.y += Math.sin(p * Math.PI) * cfg.arc;
    // Fly head first toward the landing spot, then tip up over the last stretch to
    // meet the surface feet-first (belly to the viewer on the glass).
    surfaceScratch.m.lookAt(b, holder.position, THREE.Object3D.DEFAULT_UP);
    const flight = surfaceScratch.flight || (surfaceScratch.flight = new THREE.Quaternion());
    flight.setFromRotationMatrix(surfaceScratch.m);
    surfaceQuaternion(act.kind, act.heading, q);
    if (p < 0.6) holder.quaternion.slerpQuaternions(act.fromQuat, flight, THREE.MathUtils.smoothstep(p, 0, 0.25));
    else holder.quaternion.slerpQuaternions(flight, q, THREE.MathUtils.smoothstep(p, 0.6, 0.95));
    if (p === 1) {
      act.phase = 'stick';
      act.t = 0;
      settleToIdle(frog);
    }
    return;
  }

  if (act.phase === 'stick' || act.phase === 'walk') {
    if (act.phase === 'stick') {
      // Splat: flatten against the surface, then relax.
      const k = Math.min(act.t / 0.45, 1);
      const splat = Math.sin(k * Math.PI) * 0.22;
      frog.pose.scale.set(1 + splat * 0.5, 1 - splat, 1 + splat * 0.3);
      if (k === 1) {
        frog.pose.scale.set(1, 1, 1);
        act.phase = 'walk';
        act.t = 0;
      }
    } else {
      // Creep toward a goal head first, in slow pulses. The hop clip slowed right
      // down reads as legs pulling the body along.
      const toGoal = a.set(act.goal.x - act.spot.x, act.goal.y - act.spot.y, 0);
      if (toGoal.length() < 0.04) pickSurfaceGoal(act);
      const want = Math.atan2(-toGoal.x, toGoal.y);
      const turn = THREE.MathUtils.euclideanModulo(want - act.heading + Math.PI, Math.PI * 2) - Math.PI;
      act.heading += THREE.MathUtils.clamp(turn, -1.6 * delta, 1.6 * delta);
      const pulse = Math.max(0, Math.sin(time * 3.2));
      const step = (cfg.walkSpeed * pulse * delta / cfg.distance()) * Math.max(0, Math.cos(turn));
      act.spot.x = THREE.MathUtils.clamp(act.spot.x - (Math.sin(act.heading) * step) / camera.aspect, -cfg.reachX, cfg.reachX);
      act.spot.y = THREE.MathUtils.clamp(act.spot.y + Math.cos(act.heading) * step, cfg.minY, cfg.maxY);
      if (frog.hopAction) {
        if (!frog.creeping) {
          frog.creeping = true;
          frog.hopAction.reset().setLoop(THREE.LoopRepeat, Infinity).play();
          if (frog.idleAction) frog.idleAction.crossFadeTo(frog.hopAction, 0.25, false);
        }
        frog.hopAction.setEffectiveTimeScale(0.12 + pulse * 0.45);
      }
      act.walkLeft -= delta;
    }
    surfacePointWorld(act.kind, act.spot.x, act.spot.y, holder.position);
    surfaceQuaternion(act.kind, act.heading, holder.quaternion);
    // A hand reaching for it makes it let go.
    ndc.copy(holder.position).project(camera);
    const touched = active && Math.hypot(ndc.x - pointer.x, ndc.y - pointer.y) < 0.22;
    if ((act.phase === 'walk' && act.walkLeft <= 0) || touched) {
      act.phase = 'drop';
      act.t = 0;
      act.fromPos = holder.position.clone();
      act.fromQuat = holder.quaternion.clone();
      act.landing = surfaceLandingSpot(frog);
      frog.pose.scale.set(1, 1, 1);
      frog.creeping = false;
      playHopClip(frog, 1.05);
    }
    return;
  }

  if (act.phase === 'drop') {
    const p = Math.min(act.t / 1.05, 1);
    ground.localToWorld(b.copy(act.landing));
    holder.position.lerpVectors(act.fromPos, b, p * p * (3 - 2 * p));
    holder.position.y += Math.sin(p * Math.PI) * 1.2;
    // Turn back upright on the island, facing the way it was before the act.
    ground.getWorldQuaternion(q);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, act.homeYaw));
    holder.quaternion.slerpQuaternions(act.fromQuat, q, THREE.MathUtils.smoothstep(p, 0.1, 0.8));
    if (p === 1) {
      ground.attach(holder);
      holder.position.copy(act.landing);
      holder.rotation.set(0, act.homeYaw, 0);
      frog.home.copy(act.landing);
      frog.start.copy(act.landing);
      frog.target.copy(act.landing);
      holder.traverse((part) => { if (part.isMesh) part.castShadow = true; });
      frog.onSurface = null;
      frog.cooldown = 3;
      surfaceAct.frog = null;
      settleToIdle(frog);
      addRipple(holder.getWorldPosition(a), 0.8, 2.6);
    }
  }
}

function updateDiorama(delta) {
  const blend = 1 - Math.exp(-delta * 2.35);
  dioramaMotion.yaw = THREE.MathUtils.lerp(dioramaMotion.yaw, dioramaMotion.targetYaw, blend);
  dioramaMotion.pitch = THREE.MathUtils.lerp(dioramaMotion.pitch, dioramaMotion.targetPitch, blend);
  habitat.rotation.y = dioramaMotion.yaw + view.spin;
  habitat.rotation.x = dioramaMotion.pitch;
  habitat.updateWorldMatrix(true, false);
}

function updateWater(time, delta) {
  pondMaterial.uniforms.uTime.value = time;
  ripples.forEach((ripple) => { ripple.z += delta; });
  // A slow ambient drip keeps the pond alive when nobody is near.
  if (time > pondState.nextDrip) {
    pondState.nextDrip = time + 3.5 + Math.random() * 4;
    const angle = Math.random() * Math.PI * 2;
    const reach = Math.sqrt(Math.random()) * 0.7;
    const next = ripples.reduce((oldest, item) => item.z > oldest.z ? item : oldest, ripples[0]);
    next.set(Math.cos(angle) * POND.rx * reach, Math.sin(angle) * POND.rz * reach, 0, 0.45);
  }
}


function watchFrameRate(time) {
  if (frameWatch.done || time < frameWatch.startAt) return;
  // A hidden or minimised window pauses drawing; that says nothing about the PC's
  // speed, so start the measurement over after any pause.
  if (document.hidden || time - (frameWatch.lastTime ?? time) > 0.25) {
    frameWatch.startAt = time;
    frameWatch.endAt = time + 3.5;
    frameWatch.frames = 0;
  }
  frameWatch.lastTime = time;
  if (time < frameWatch.endAt) {
    frameWatch.frames += 1;
    return;
  }
  frameWatch.done = true;
  const fps = frameWatch.frames / (frameWatch.endAt - frameWatch.startAt);
  if (fps >= 45) return;
  quality = 'low';
  renderer.shadowMap.enabled = false;
  scene.traverse((part) => { if (part.material) [].concat(part.material).forEach((mat) => { mat.needsUpdate = true; }); });
  renderer.setPixelRatio(pixelRatioFor());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function render() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();
  watchFrameRate(time);
  const active = presence.active && time - presence.lastInput < 1.6;
  mixers.forEach((mixer) => mixer.update(delta));
  updateView(delta);
  updateDiorama(delta);
  updatePlants(time, delta, active);
  updateButterflies(time, delta, active);
  updateFrogs(time, delta, active);
  updateSurfaceFrog(time, delta, active);
  updateWater(time, delta);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
