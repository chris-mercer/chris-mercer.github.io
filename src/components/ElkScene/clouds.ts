import * as THREE from 'three';

// Mirrors the cloud density formula baked into Sky.tsx's fragment shader
// (kept in sync manually — GLSL and JS can't literally share code) so
// LightSource.tsx can sample "is there cloud cover in this direction
// right now" in plain JS and dim itself accordingly, without needing a
// shader-to-shader coordination mechanism.
export const CLOUD_DRIFT_X = 0.006;
export const CLOUD_DRIFT_Z = 0.0015;
export const CLOUD_SCALE = 4.2;
export const CLOUD_THRESHOLD_LOW = 0.68;
export const CLOUD_THRESHOLD_HIGH = 0.82;

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep01(x - x0);
  const ty = smoothstep01(y - y0);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

// Two octaves, matching Sky.tsx — flatter/sparser than a higher-octave fbm
// would read, which is the point (thin, sparse cloud cover, not a dense
// overcast layer).
function cloudFbm(x: number, y: number): number {
  return valueNoise2D(x, y) * 0.65 + valueNoise2D(x * 2.0, y * 2.0) * 0.35;
}

// dir: a normalized direction from the scene origin (e.g. the light's
// current position, normalized). Returns 0..1 cloud density in that
// direction at the given time.
export function cloudDensityInDirection(dir: THREE.Vector3, elapsedTime: number): number {
  const h = dir.y;
  const u = (dir.x / (h + 0.55)) * CLOUD_SCALE + elapsedTime * CLOUD_DRIFT_X;
  const v = (dir.z / (h + 0.55)) * CLOUD_SCALE + elapsedTime * CLOUD_DRIFT_Z;
  const raw = cloudFbm(u, v);
  const t = (raw - CLOUD_THRESHOLD_LOW) / (CLOUD_THRESHOLD_HIGH - CLOUD_THRESHOLD_LOW);
  return THREE.MathUtils.clamp(smoothstep01(THREE.MathUtils.clamp(t, 0, 1)), 0, 1);
}
