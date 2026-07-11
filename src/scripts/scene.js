import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { DitherShader, ParticleShader } from './shaders.js';
import { TIERS, getDeviceTier, nextTierDown, FpsMonitor } from './quality.js';

const PHI_INV = 0.6180339887;

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

function damp(current, target, lambda, delta) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

function createParticleGeometry(count) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const BOUNDS = 12;

  for (let i = 0; i < count; i++) {
    positions.set(
      [
        THREE.MathUtils.randFloatSpread(BOUNDS * 2),
        THREE.MathUtils.randFloatSpread(BOUNDS * 2),
        THREE.MathUtils.randFloatSpread(BOUNDS),
      ],
      i * 3
    );

    const isStreak = Math.random() < 0.15;
    const speed = isStreak
      ? THREE.MathUtils.randFloat(1.2, 2.4)
      : THREE.MathUtils.randFloat(0.05, 0.25);
    const dir = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(1),
      THREE.MathUtils.randFloatSpread(1) - 0.15,
      THREE.MathUtils.randFloatSpread(0.3)
    )
      .normalize()
      .multiplyScalar(speed);
    velocities.set([dir.x, dir.y, dir.z], i * 3);

    // Monochrome, low-saturation: kept quiet and neutral so the wireframe
    // blocks' vivid palette reads as the foreground, not the particle field.
    const color = new THREE.Color().setHSL(0.62, 0.06, THREE.MathUtils.randFloat(0.35, 0.6));
    colors.set([color.r, color.g, color.b], i * 3);

    sizes[i] = isStreak
      ? THREE.MathUtils.randFloat(1.5, 3.0)
      : THREE.MathUtils.randFloat(2.5, 6.0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, count);
  return geometry;
}

// Blocks no longer take a static palette color -- their materials are
// driven every frame by updateBlockColors() so the cluster reads as a
// slow, continuous RGB gradient rather than fixed per-block hues.
function createBlock(size) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const lines = new THREE.LineSegments(geo, lineMat);

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fill = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), fillMat);

  const group = new THREE.Group();
  group.add(fill, lines);
  return { group, lineMat, fillMat };
}

export function initScene(canvas, fallbackEl) {
  if (!hasWebGL2()) {
    canvas.hidden = true;
    if (fallbackEl) fallbackEl.hidden = false;
    return { pause() {}, resume() {}, destroy() {} };
  }

  let renderer;
  let composer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    canvas.hidden = true;
    if (fallbackEl) fallbackEl.hidden = false;
    return { pause() {}, resume() {}, destroy() {} };
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#08050c');
  scene.fog = new THREE.FogExp2('#08050c', 0.035);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  let tier = getDeviceTier();
  let tierConfig = TIERS[tier];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, tierConfig.dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // -- Block cluster --
  const blockGroup = new THREE.Group();
  blockGroup.position.x = -1.3;
  scene.add(blockGroup);

  const hero = createBlock(2.2);
  const heroInner = createBlock(2.2 * 0.55);
  heroInner.group.rotation.set(THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(20), 0);
  hero.group.add(heroInner.group);
  blockGroup.add(hero.group);

  // Every block's line/fill materials, each with a distinct hue-cycle phase
  // offset, so the RGB gradient sweeps across the cluster rather than every
  // block flashing the same color at once.
  const animatedMaterials = [
    { lineMat: hero.lineMat, fillMat: hero.fillMat, hueOffset: 0 },
    { lineMat: heroInner.lineMat, fillMat: heroInner.fillMat, hueOffset: 0.12 },
  ];

  const chainBlocks = Array.from({ length: 6 }, (_, i) => {
    const size = THREE.MathUtils.randFloat(0.3, 0.65);
    const block = createBlock(size);
    blockGroup.add(block.group);
    animatedMaterials.push({
      lineMat: block.lineMat,
      fillMat: block.fillMat,
      hueOffset: (i + 1) / 6,
    });
    const speedSeed = (PHI_INV * (i + 1)) % 1;

    // Solar-system read: radii staggered per index (like planetary orbits,
    // not randomly overlapping), speed inversely related to radius
    // (Kepler-ish -- inner "planets" revolve faster than outer ones), and
    // a per-block inclination so the orbits aren't all flat in one plane.
    const radius = 2.4 + i * 0.6 + THREE.MathUtils.randFloat(-0.15, 0.15);
    const orbitSpeed = 0.6 / Math.sqrt(radius);
    const inclination = THREE.MathUtils.randFloat(-0.6, 0.6);

    return {
      mesh: block.group,
      rotSpeed: {
        x: 0.15 * (0.4 + speedSeed),
        y: 0.15 * (0.4 + ((speedSeed * 1.618) % 1)),
        z: 0.15 * (0.4 + ((speedSeed * 2.618) % 1)),
      },
      orbit: {
        radius,
        speed: orbitSpeed,
        phase: i * ((Math.PI * 2) / 6),
        inclination,
      },
    };
  });

  // -- Particles --
  let particleCount = tierConfig.particles;
  const particleGeometry = createParticleGeometry(TIERS.high.particles);
  particleGeometry.setDrawRange(0, particleCount);
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(ParticleShader.uniforms),
    vertexShader: ParticleShader.vertexShader,
    fragmentShader: ParticleShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // -- Post-processing --
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bloomPass = null;
  function setupBloom() {
    if (bloomPass) {
      composer.removePass(bloomPass);
      bloomPass = null;
    }
    if (tierConfig.bloom.enabled) {
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        tierConfig.bloom.strength,
        0.4,
        0.55
      );
      composer.insertPass(bloomPass, 1);
    }
  }

  const rgbShiftPass = new ShaderPass(RGBShiftShader);
  rgbShiftPass.uniforms.amount.value = 0.0012;
  composer.addPass(rgbShiftPass);

  composer.addPass(new OutputPass());

  const ditherPass = new ShaderPass(DitherShader);
  ditherPass.uniforms.uPixelSize.value = tierConfig.ditherPixelSizeMultiplier * renderer.getPixelRatio();
  composer.addPass(ditherPass);

  setupBloom();

  // -- Pointer reactivity --
  const pointer = { x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  const pointerTiltState = { x: 0, y: 0 };
  let lastPointerMove = performance.now();
  let lastPointerX = 0;
  let lastPointerY = 0;
  let pointerSpeed = 0;

  function onPointerMove(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    pointerSpeed = Math.hypot(nx - lastPointerX, ny - lastPointerY);
    lastPointerX = nx;
    lastPointerY = ny;
    pointer.x = nx;
    pointer.y = ny;
    lastPointerMove = performance.now();
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // -- Reduced motion / pause-resume --
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = false;
  let manuallyPaused = false;
  const clock = new THREE.Clock();

  const fpsMonitor = new FpsMonitor({
    onDowngrade: () => {
      const next = nextTierDown(tier);
      if (!next) return;
      tier = next;
      tierConfig = TIERS[tier];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, tierConfig.dprCap));
      particleCount = tierConfig.particles;
      particleGeometry.setDrawRange(0, particleCount);
      particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      ditherPass.uniforms.uPixelSize.value = tierConfig.ditherPixelSizeMultiplier * renderer.getPixelRatio();
      setupBloom();
      fpsMonitor.reset();
    },
  });

  function animateBlocks(t, delta) {
    hero.group.rotation.x += delta * 0.09 * PHI_INV;
    hero.group.rotation.y += delta * 0.09;
    hero.group.rotation.z += delta * 0.09 * (PHI_INV * PHI_INV);
    heroInner.group.rotation.x -= delta * 0.06;
    heroInner.group.rotation.y -= delta * 0.06 * PHI_INV;
    hero.group.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);
    hero.group.position.y = Math.sin(t * 0.35) * 0.15;

    for (const b of chainBlocks) {
      b.mesh.rotation.x += delta * b.rotSpeed.x;
      b.mesh.rotation.y += delta * b.rotSpeed.y;
      b.mesh.rotation.z += delta * b.rotSpeed.z;
      const { radius, speed, phase, inclination } = b.orbit;
      const angle = t * speed + phase;
      const ox = Math.cos(angle) * radius;
      const oz = Math.sin(angle) * radius;
      b.mesh.position.set(ox, oz * Math.sin(inclination), oz * Math.cos(inclination));
    }
  }

  const colorScratch = new THREE.Color();
  const HUE_CYCLE_SPEED = 0.05; // one full spectrum sweep every ~20s

  function updateBlockColors(t) {
    for (const m of animatedMaterials) {
      const hue = (t * HUE_CYCLE_SPEED + m.hueOffset) % 1;
      colorScratch.setHSL(hue, 0.75, 0.65);
      m.lineMat.color.copy(colorScratch);
      m.fillMat.color.copy(colorScratch);
    }
  }

  function updateReactivity(t, delta) {
    const idle = performance.now() - lastPointerMove > 4000;
    const px = idle ? Math.sin(t * 0.07) * 0.4 : pointer.x;
    const py = idle ? Math.cos(t * 0.05) * 0.4 : pointer.y;

    pointerTarget.x = damp(pointerTarget.x, px, 3, delta);
    pointerTarget.y = damp(pointerTarget.y, py, 3, delta);

    camera.position.x = damp(camera.position.x, pointerTarget.x * 0.6, 4, delta);
    camera.position.y = damp(camera.position.y, pointerTarget.y * 0.4, 4, delta);
    camera.lookAt(blockGroup.position);

    pointerTiltState.x = damp(pointerTiltState.x, pointerTarget.y * 0.25, 6, delta);
    pointerTiltState.y = damp(pointerTiltState.y, pointerTarget.x * 0.25, 6, delta);
    blockGroup.rotation.x = pointerTiltState.x;
    blockGroup.rotation.y = pointerTiltState.y;

    particles.position.x = damp(particles.position.x, pointerTarget.x * 0.15, 2.5, delta);
    particles.position.y = damp(particles.position.y, pointerTarget.y * 0.15, 2.5, delta);

    const breathe = 0.001 + Math.sin(t * 0.4) * 0.0003;
    const kick = Math.min(pointerSpeed * 0.015, tierConfig.rgbShiftMax);
    rgbShiftPass.uniforms.amount.value = Math.min(breathe + kick, tierConfig.rgbShiftMax);
    pointerSpeed *= 0.9;
  }

  function renderStaticFrame() {
    particleMaterial.uniforms.uTime.value = 0;
    rgbShiftPass.uniforms.amount.value = 0.002;
    camera.lookAt(blockGroup.position);
    updateBlockColors(0);
    composer.render();
  }

  function renderLoop() {
    const delta = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.getElapsedTime();

    animateBlocks(t, delta);
    updateReactivity(t, delta);
    updateBlockColors(t);
    particleMaterial.uniforms.uTime.value = t;

    composer.render();
    fpsMonitor.tick(delta);
  }

  function start() {
    if (running) return;
    running = true;
    clock.start();
    renderer.setAnimationLoop(renderLoop);
  }

  function stop() {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  }

  function applyMotionPreference() {
    if (reducedMotionQuery.matches) {
      stop();
      renderStaticFrame();
    } else if (!manuallyPaused) {
      start();
    }
  }

  reducedMotionQuery.addEventListener('change', applyMotionPreference);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
    } else if (!manuallyPaused && !reducedMotionQuery.matches) {
      start();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    ditherPass.uniforms.uPixelSize.value = tierConfig.ditherPixelSizeMultiplier * renderer.getPixelRatio();
    particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  });

  applyMotionPreference();

  return {
    pause() {
      manuallyPaused = true;
      stop();
    },
    resume() {
      manuallyPaused = false;
      if (!reducedMotionQuery.matches) start();
    },
    destroy() {
      stop();
      window.removeEventListener('pointermove', onPointerMove);
      renderer.dispose();
    },
  };
}
