import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { DitherShader, ParticleShader } from './shaders.js';
import { TIERS, getDeviceTier, nextTierDown, FpsMonitor } from './quality.js';

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

    // Monochrome, low-saturation: kept quiet and neutral so the hero globe's
    // vivid palette reads as the foreground, not the particle field.
    const color = new THREE.Color().setHSL(0.62, 0.06, THREE.MathUtils.randFloat(0.35, 0.6));
    colors.set([color.r, color.g, color.b], i * 3);

    sizes[i] = isStreak
      ? THREE.MathUtils.randFloat(1.2, 2.2)
      : THREE.MathUtils.randFloat(1.6, 3.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, count);
  return geometry;
}

// Evenly distributes `count` points across a sphere surface using the
// Fibonacci/golden-angle spiral method -- no clustering at the poles like a
// naive lat/long grid would produce.
function fibonacciSpherePoints(count, radius) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  return points;
}

// The hero shape: a globe made of individual points. Each point's resting
// position is on the sphere surface; updateGlobe() displaces points near
// the cursor outward along their own radial direction, easing back to rest
// when the cursor moves away.
function createGlobe(radius, count) {
  const basePoints = fibonacciSpherePoints(count, radius);
  const positions = new Float32Array(count * 3);
  const displacement = new Float32Array(count);

  basePoints.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
  });

  const points = new THREE.Points(geometry, material);
  return { points, basePoints, displacement, material };
}

// A flat triangular wedge (a flattened low-poly cone), used as the two
// shapes flanking the hero globe, angled inward toward it.
function createWedge(radius, height) {
  const coneGeo = new THREE.ConeGeometry(radius, height, 3, 1);
  const edgesGeo = new THREE.EdgesGeometry(coneGeo);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
  const lines = new THREE.LineSegments(edgesGeo, lineMat);
  lines.scale.z = 0.15;

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fill = new THREE.Mesh(coneGeo, fillMat);
  fill.scale.z = 0.15;

  const group = new THREE.Group();
  group.add(fill, lines);
  return { group, lineMat, fillMat };
}

// A faint decorative circular outline -- an "orbital plot" ring around the
// hero globe. Purely cosmetic, no orbiting object travels along it.
function createOrbitRing(radius, segments = 48) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x9a8fc2, transparent: true, opacity: 0.16 });
  return new THREE.LineLoop(geometry, material);
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

  // -- Hero composition: one anchored globe, two flanking wedges, orbital
  // rings -- a single structured object rather than a scattered cluster.
  const heroGroup = new THREE.Group();
  heroGroup.position.x = -0.3;
  scene.add(heroGroup);

  const GLOBE_RADIUS = 1.7;
  const globe = createGlobe(GLOBE_RADIUS, 480);
  heroGroup.add(globe.points);

  const wedgeLeft = createWedge(0.85, 1.7);
  wedgeLeft.group.position.set(-2.6, 0, -0.6);
  wedgeLeft.group.rotation.z = Math.PI / 2;
  wedgeLeft.group.rotation.y = THREE.MathUtils.degToRad(25);
  heroGroup.add(wedgeLeft.group);

  const wedgeRight = createWedge(0.85, 1.7);
  wedgeRight.group.position.set(2.6, 0, -0.6);
  wedgeRight.group.rotation.z = -Math.PI / 2;
  wedgeRight.group.rotation.y = THREE.MathUtils.degToRad(-25);
  heroGroup.add(wedgeRight.group);

  const rings = [
    createOrbitRing(GLOBE_RADIUS * 1.35),
    createOrbitRing(GLOBE_RADIUS * 1.65),
    createOrbitRing(GLOBE_RADIUS * 1.95),
  ];
  rings[1].rotation.x = THREE.MathUtils.degToRad(70);
  rings[2].rotation.x = THREE.MathUtils.degToRad(-60);
  rings.forEach((ring) => heroGroup.add(ring));

  // Every animated shape's material, each with a distinct hue-cycle phase
  // offset so the RGB gradient sweeps across the composition rather than
  // every shape flashing the same color at once.
  const animatedMaterials = [
    { hueOffset: 0, apply: (c) => globe.material.color.copy(c) },
    {
      hueOffset: 0.3,
      apply: (c) => {
        wedgeLeft.lineMat.color.copy(c);
        wedgeLeft.fillMat.color.copy(c);
      },
    },
    {
      hueOffset: 0.6,
      apply: (c) => {
        wedgeRight.lineMat.color.copy(c);
        wedgeRight.fillMat.color.copy(c);
      },
    },
  ];

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
  rgbShiftPass.uniforms.amount.value = 0.0007;
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
  let hasPointerMoved = false;
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
    hasPointerMoved = true;
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

  function animateScene(t, delta) {
    globe.points.rotation.y += delta * 0.07;
    globe.points.rotation.x = Math.sin(t * 0.15) * 0.08;

    wedgeLeft.group.rotation.x += delta * 0.05;
    wedgeRight.group.rotation.x -= delta * 0.05;

    rings.forEach((ring, i) => {
      ring.rotation.z += delta * (0.025 + i * 0.012) * (i % 2 === 0 ? 1 : -1);
    });

    heroGroup.position.y = Math.sin(t * 0.35) * 0.12;
  }

  const colorScratch = new THREE.Color();
  const HUE_CYCLE_SPEED = 0.05; // one full spectrum sweep every ~20s

  function updateColors(t) {
    for (const m of animatedMaterials) {
      const hue = (t * HUE_CYCLE_SPEED + m.hueOffset) % 1;
      colorScratch.setHSL(hue, 0.75, 0.65);
      m.apply(colorScratch);
    }
  }

  // Displaces globe points outward, radially, when they land near the
  // cursor in screen space; eases back to the resting sphere position
  // otherwise. Skipped entirely until the user has actually moved the
  // pointer once, so points don't sit permanently displaced near a
  // default (0,0) coordinate before any real interaction.
  const GLOBE_INFLUENCE = 0.16;
  const GLOBE_PUSH = 0.5;
  const globeWorldPos = new THREE.Vector3();
  const globeDir = new THREE.Vector3();
  const globeFinal = new THREE.Vector3();

  function updateGlobe(delta) {
    heroGroup.updateMatrixWorld(true);
    const posAttr = globe.points.geometry.attributes.position;
    const idle = !hasPointerMoved || performance.now() - lastPointerMove > 4000;

    for (let i = 0; i < globe.basePoints.length; i++) {
      const base = globe.basePoints[i];
      let target = 0;

      if (!idle) {
        globeWorldPos.copy(base).applyMatrix4(globe.points.matrixWorld);
        globeWorldPos.project(camera);
        const dx = globeWorldPos.x - pointer.x;
        const dy = globeWorldPos.y - pointer.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < GLOBE_INFLUENCE * GLOBE_INFLUENCE) {
          const dist = Math.sqrt(distSq);
          target = (1 - dist / GLOBE_INFLUENCE) * GLOBE_PUSH;
        }
      }

      const lambda = target > globe.displacement[i] ? 14 : 3.5;
      globe.displacement[i] = damp(globe.displacement[i], target, lambda, delta);

      globeDir.copy(base).normalize();
      globeFinal.copy(base).addScaledVector(globeDir, globe.displacement[i]);
      posAttr.array[i * 3] = globeFinal.x;
      posAttr.array[i * 3 + 1] = globeFinal.y;
      posAttr.array[i * 3 + 2] = globeFinal.z;
    }
    posAttr.needsUpdate = true;
  }

  function updateReactivity(t, delta) {
    const idle = performance.now() - lastPointerMove > 4000;
    const px = idle ? Math.sin(t * 0.07) * 0.4 : pointer.x;
    const py = idle ? Math.cos(t * 0.05) * 0.4 : pointer.y;

    pointerTarget.x = damp(pointerTarget.x, px, 3, delta);
    pointerTarget.y = damp(pointerTarget.y, py, 3, delta);

    camera.position.x = damp(camera.position.x, pointerTarget.x * 0.6, 4, delta);
    camera.position.y = damp(camera.position.y, pointerTarget.y * 0.4, 4, delta);
    camera.lookAt(heroGroup.position);

    pointerTiltState.x = damp(pointerTiltState.x, pointerTarget.y * 0.2, 6, delta);
    pointerTiltState.y = damp(pointerTiltState.y, pointerTarget.x * 0.2, 6, delta);
    heroGroup.rotation.x = pointerTiltState.x;
    heroGroup.rotation.y = pointerTiltState.y;

    particles.position.x = damp(particles.position.x, pointerTarget.x * 0.15, 2.5, delta);
    particles.position.y = damp(particles.position.y, pointerTarget.y * 0.15, 2.5, delta);

    const breathe = 0.0006 + Math.sin(t * 0.4) * 0.00015;
    const kick = Math.min(pointerSpeed * 0.008, tierConfig.rgbShiftMax);
    rgbShiftPass.uniforms.amount.value = Math.min(breathe + kick, tierConfig.rgbShiftMax);
    pointerSpeed *= 0.9;
  }

  function renderStaticFrame() {
    particleMaterial.uniforms.uTime.value = 0;
    rgbShiftPass.uniforms.amount.value = 0.0007;
    camera.lookAt(heroGroup.position);
    updateColors(0);
    composer.render();
  }

  function renderLoop() {
    const delta = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.getElapsedTime();

    animateScene(t, delta);
    updateReactivity(t, delta);
    updateGlobe(delta);
    updateColors(t);
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
