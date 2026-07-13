import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getHeightAt, getHeightRange, DEFAULT_TERRAIN_PARAMS } from './noise';
import { GROUND_SIZE, GROUND_BASE_Y, ELK_POSITION } from './constants';

interface GroundProps {
  segments: number;
  // Offsets noise sampling (not the rendered position) — lets a second
  // scrolling tile bake in a genuinely different slice of the continuous
  // terrain function rather than an identical repeating copy.
  originX?: number;
}

// The elk stands at a fixed world position and never translates, but the
// ground scrolls beneath it (InfiniteLandscape.tsx) — so the raw noise
// height at the elk's world X/Z keeps changing frame to frame as new
// terrain flows underneath, occasionally rising enough to swallow its
// feet. Flattening a patch toward GROUND_BASE_Y around the elk's WORLD
// position (recomputed every frame from this mesh's live parent offset,
// not baked once) keeps its footing flat regardless of scroll/wrap state.
// Kept inside FOREST_CLEARING_RADIUS (3.2) so the blend never crosses
// into tree-occupied ground, where a visible seam would be more obvious.
const FLATTEN_INNER_RADIUS = 1.0;
const FLATTEN_OUTER_RADIUS = 3.1;

// Smootherstep (Perlin's 6t^5-15t^4+10t^3, C2-continuous) rather than the
// classic cubic smoothstep — flat shading derives its normals from the
// surface's local slope, so it visibly amplifies any place the slope
// changes abruptly. A wider band plus a gentler easing curve both reduce
// the peak slope at the transition ring, which is what was reading as a
// faint seam radiating from the elk's fixed position.
function flattenFalloff(dist: number): number {
  if (dist <= FLATTEN_INNER_RADIUS) return 1;
  if (dist >= FLATTEN_OUTER_RADIUS) return 0;
  const t = (dist - FLATTEN_INNER_RADIUS) / (FLATTEN_OUTER_RADIUS - FLATTEN_INNER_RADIUS);
  return 1 - (t * t * t * (t * (t * 6 - 15) + 10));
}

// Deliberately deep/saturated relative to the sky palette — with fog
// blending toward the horizon, pale ground colors read as indistinguishable
// from the sky at any distance.
const LOW_COLOR = new THREE.Color('#241a0d');
const HIGH_COLOR = new THREE.Color('#2f4a1c');
const PATCH_COLOR = new THREE.Color('#3d3016');

// A separate, higher-frequency noise sample (different seed, tighter
// wavelength) drives a patchiness blend independent of the actual height
// displacement — dirt/clearing patches breaking up the ground plane's
// single smooth gradient rather than a single flat vertex-color lerp.
const PATCH_PARAMS = { ...DEFAULT_TERRAIN_PARAMS, seed: 91, frequency: 0.22, octaves: 2 };

export function Ground({ segments, originX = 0 }: GroundProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const bakedHeightsRef = useRef<Float32Array>(new Float32Array(0));

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const position = geo.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const bakedHeights = new Float32Array(position.count);
    const color = new THREE.Color();
    const base = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const y = getHeightAt(position.getX(i) + originX, position.getZ(i));
      const finalY = GROUND_BASE_Y + y;
      position.setY(i, finalY);
      bakedHeights[i] = finalY;
    }
    bakedHeightsRef.current = bakedHeights;

    // A fixed range (not each tile's own empirical min/max — see
    // getHeightRange's comment) so the same raw height always maps to the
    // same color on every tile, keeping the color gradient continuous
    // across the scrolling seam between them.
    const maxAmplitude = getHeightRange();
    const range = maxAmplitude * 2;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + originX;
      const z = position.getZ(i);
      const t = THREE.MathUtils.clamp((position.getY(i) - GROUND_BASE_Y + maxAmplitude) / range, 0, 1);
      base.copy(LOW_COLOR).lerp(HIGH_COLOR, t);

      const patch = THREE.MathUtils.clamp(getHeightAt(x, z, PATCH_PARAMS) * 0.5 + 0.5, 0, 1);
      const patchWeight = Math.max(0, patch - 0.62) * 2.4;
      color.copy(base).lerp(PATCH_COLOR, THREE.MathUtils.clamp(patchWeight, 0, 0.55));

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // flatShading in three.js is fragment-derivative based (dFdx/dFdy),
    // not a geometry requirement — the default smooth normals from
    // PlaneGeometry are simply unused, so recomputing them is skipped.
    position.needsUpdate = true;
    return geo;
  }, [segments, originX]);

  useFrame(() => {
    const mesh = meshRef.current;
    const parent = mesh?.parent;
    if (!mesh || !parent) return;

    const bakedHeights = bakedHeightsRef.current;
    const position = geometry.getAttribute('position');
    const parentWorldX = parent.position.x;

    for (let i = 0; i < position.count; i++) {
      const worldX = parentWorldX + position.getX(i);
      const localZ = position.getZ(i);
      const dist = Math.hypot(worldX - ELK_POSITION.x, localZ - ELK_POSITION.z);
      const factor = flattenFalloff(dist);
      position.setY(i, THREE.MathUtils.lerp(bakedHeights[i], GROUND_BASE_Y, factor));
    }

    position.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow={false}>
      <meshStandardMaterial vertexColors flatShading roughness={1} metalness={0} />
    </mesh>
  );
}
