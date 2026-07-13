// Hand-rolled value noise (lattice hash + smoothstep-eased bilinear
// interpolation), not a third-party noise library — keeps this project's
// dependency surface minimal. Deterministic from an integer seed so the
// ground and tree placement (which both call getHeightAt) always agree.

function hash2D(x: number, z: number, seed: number): number {
  // Classic "multiply by large primes, take the fractional part" lattice
  // hash — a generic technique, not sourced from any specific codebase.
  const n = x * 127.1 + z * 311.7 + seed * 74.7;
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;

  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const v00 = hash2D(x0, z0, seed);
  const v10 = hash2D(x1, z0, seed);
  const v01 = hash2D(x0, z1, seed);
  const v11 = hash2D(x1, z1, seed);

  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * tz;
}

interface FbmParams {
  seed: number;
  octaves: number;
  frequency: number;
  amplitude: number;
  persistence: number;
}

function fbm2D(x: number, z: number, { seed, octaves, frequency, amplitude, persistence }: FbmParams): number {
  let value = 0;
  let freq = frequency;
  let amp = amplitude;
  for (let i = 0; i < octaves; i++) {
    value += (valueNoise2D(x * freq, z * freq, seed + i * 101) * 2 - 1) * amp;
    freq *= 2;
    amp *= persistence;
  }
  return value;
}

export interface TerrainParams {
  seed: number;
  octaves: number;
  frequency: number;
  amplitude: number;
  persistence: number;
}

export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  seed: 7,
  octaves: 3,
  frequency: 0.06,
  amplitude: 0.55,
  persistence: 0.5,
};

// Ground height at world (x, z) — the single source of truth shared by the
// ground mesh's vertex displacement and tree placement, so trees always
// sit flush on the terrain they're planted into.
export function getHeightAt(x: number, z: number, params: TerrainParams = DEFAULT_TERRAIN_PARAMS): number {
  return fbm2D(x, z, params);
}

// Theoretical max |height| the fbm sum in fbm2D can ever produce: each
// octave contributes at most its own amplitude (amp *= persistence per
// octave), so the sum of all octaves' amplitudes bounds the whole
// function everywhere, for any (x, z). Used instead of scanning a tile's
// actual vertices for their empirical min/max — two adjacent scrolling
// ground tiles sample different slices of this same infinite field, so
// their empirical extents almost never match, and normalizing each
// tile's height-to-color gradient against its own scan makes the same
// raw height map to a different color on each side of the seam between
// them. A fixed, params-only bound is identical for every tile.
export function getHeightRange(params: TerrainParams = DEFAULT_TERRAIN_PARAMS): number {
  let amp = params.amplitude;
  let total = 0;
  for (let i = 0; i < params.octaves; i++) {
    total += amp;
    amp *= params.persistence;
  }
  return total;
}
