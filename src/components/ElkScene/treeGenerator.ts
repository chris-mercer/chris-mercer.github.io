import * as THREE from 'three';

// Small deterministic PRNG (mulberry32) — no new dependency, and lets a
// forest-level seed reproduce the exact same layout every mount.
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), b + 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// Low-poly conifer: a trunk plus a stack of stacked, narrowing cones —
// the classic pine silhouette, and one every forest scene reads instantly
// (an earlier recursive-branch/leaf-cluster generator read as scrubby
// desert brush, not forest trees). Deliberately taller than the elk by a
// healthy margin — real forest conifers tower over a standing elk, and a
// scene where the subject is taller than the trees around it is exactly
// what made the elk look like an oversized cutout pasted onto the
// backdrop rather than standing inside the scene.
export interface PineTier {
  yOffset: number;
  radius: number;
  height: number;
}

export interface PineTreeData {
  trunkHeight: number;
  trunkRadius: number;
  tiers: PineTier[];
  colorT: number;
}

export interface PineTreeParams {
  minTotalHeight: number;
  maxTotalHeight: number;
  tierCount: number;
}

export const DEFAULT_PINE_PARAMS: PineTreeParams = {
  minTotalHeight: 4.4,
  maxTotalHeight: 7.2,
  tierCount: 4,
};

export function generatePineTree(seed: number, params: PineTreeParams): PineTreeData {
  const rand = mulberry32(seed);
  const totalHeight = params.minTotalHeight + rand() * (params.maxTotalHeight - params.minTotalHeight);
  const trunkHeight = totalHeight * (0.12 + rand() * 0.06);
  const trunkRadius = totalHeight * (0.014 + rand() * 0.006);

  const canopyHeight = totalHeight - trunkHeight;
  const baseRadius = totalHeight * (0.15 + rand() * 0.05);

  const tiers: PineTier[] = [];
  for (let i = 0; i < params.tierCount; i++) {
    const t = i / params.tierCount;
    const tierHeight = (canopyHeight / params.tierCount) * (1.35 - t * 0.3);
    const tierRadius = baseRadius * (1 - t * 0.72);
    const yOffset = trunkHeight + (canopyHeight / params.tierCount) * i * 0.62;
    tiers.push({ yOffset, radius: tierRadius, height: tierHeight });
  }

  return { trunkHeight, trunkRadius, tiers, colorT: rand() };
}

export interface TreePlacement {
  position: THREE.Vector3;
  seed: number;
}

// Rejection-samples tree base positions in an annulus around `center`,
// excluding `clearingRadius` (so the subject has open space) and enforcing
// `minSpacing` between trees. Capped retries with an accept-anyway
// fallback so dense requests can't loop forever.
export function generateForestLayout(
  seed: number,
  count: number,
  center: THREE.Vector3,
  clearingRadius: number,
  outerRadius: number,
  minSpacing: number,
  maxZ: number,
  getHeightAt: (x: number, z: number) => number,
): TreePlacement[] {
  const rand = mulberry32(seed);
  const placements: TreePlacement[] = [];
  const maxAttempts = count * 40;
  let attempts = 0;

  while (placements.length < count && attempts < maxAttempts) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = clearingRadius + rand() * (outerRadius - clearingRadius);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;

    // Reject anything on the camera side of maxZ — a normal-sized tree
    // placed between the camera and the subject renders as a
    // screen-filling pillar purely from perspective proximity.
    if (z > maxZ) continue;

    let tooClose = false;
    for (const p of placements) {
      const dx = p.position.x - x;
      const dz = p.position.z - z;
      if (dx * dx + dz * dz < minSpacing * minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const y = getHeightAt(x, z);
    placements.push({ position: new THREE.Vector3(x, y, z), seed: hashSeed(seed, placements.length) });
  }

  return placements;
}
