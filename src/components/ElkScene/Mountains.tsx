import { useMemo } from 'react';
import * as THREE from 'three';
import { ELK_POSITION, GROUND_BASE_Y } from './constants';

// Deliberately near-black — mountains need to read as a silhouette against
// ANY sky phase, not a color tuned to match one specific time of day.
const MOUNTAIN_COLOR = new THREE.Color('#12101d');

const RIDGE_POINTS = 22;
const RIDGE_HALF_WIDTH = 48;
const RIDGE_NEAR_Z = 28;
const RIDGE_DEPTH = 9;
const BASE_HEIGHT = 3;
const PEAK_VARIATION = 6.5;

// The random-walk height profile below is clamped to [1, PEAK_VARIATION],
// so this is the true maximum world Y the jagged ridge line can ever
// reach — LightSource.tsx uses it to hide the sun/moon disc (and its
// GodRays glow) whenever it's below the silhouette, since sunrise/sunset
// should read as happening behind the mountains, not the flat horizon.
export const RIDGE_PEAK_Y = GROUND_BASE_Y + BASE_HEIGHT * 0.4 + PEAK_VARIATION;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A single continuous extruded ridge, not a scatter of separate peaks —
// eleven independent floating shapes (the previous approach) had gaps
// between them and read as disconnected fragments rather than one
// mountain range. A random-walk height profile (each point a small step
// from the last, not independently random) keeps the silhouette jagged
// but still coherent, then ExtrudeGeometry turns that 2D profile into one
// solid low-poly wall.
export function Mountains() {
  const geometry = useMemo(() => {
    const rand = mulberry32(4242);
    const baseY = GROUND_BASE_Y - 3;

    const shape = new THREE.Shape();
    shape.moveTo(-RIDGE_HALF_WIDTH, baseY);

    let h = BASE_HEIGHT + rand() * PEAK_VARIATION * 0.4;
    for (let i = 0; i < RIDGE_POINTS; i++) {
      const t = i / (RIDGE_POINTS - 1);
      const x = THREE.MathUtils.lerp(-RIDGE_HALF_WIDTH, RIDGE_HALF_WIDTH, t);
      h = THREE.MathUtils.clamp(h + (rand() - 0.5) * PEAK_VARIATION * 0.6, 1, PEAK_VARIATION);
      shape.lineTo(x, GROUND_BASE_Y + BASE_HEIGHT * 0.4 + h);
    }
    shape.lineTo(RIDGE_HALF_WIDTH, baseY);
    shape.lineTo(-RIDGE_HALF_WIDTH, baseY);

    const geo = new THREE.ExtrudeGeometry(shape, { depth: RIDGE_DEPTH, bevelEnabled: false, curveSegments: 1 });
    return geo;
  }, []);

  return (
    <mesh
      geometry={geometry}
      position={[ELK_POSITION.x, 0, ELK_POSITION.z - RIDGE_NEAR_Z]}
      frustumCulled={false}
    >
      <meshStandardMaterial color={MOUNTAIN_COLOR} flatShading roughness={1} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}
