import type { QualityTier } from '../../hooks/useDeviceCapability';

export interface TierConfig {
  dprCap: number;
  chromaticAberration: number;
  treeCount: number;
  treeTierCount: number;
  groundSegments: number;
  enableFog: boolean;
  enableGodRays: boolean;
}

// Numeric budgets per device tier. Forest generation (trees) is a
// one-time mount cost, not a per-frame one — nothing about the forest
// touches useFrame — so these knobs mainly bound generation time/memory
// and steady-state draw calls, not ongoing frame cost.
export const TIERS: Record<QualityTier, TierConfig> = {
  high: {
    dprCap: 2,
    chromaticAberration: 0.0009,
    treeCount: 70,
    treeTierCount: 4,
    groundSegments: 64,
    enableFog: true,
    enableGodRays: true,
  },
  medium: {
    dprCap: 1.5,
    chromaticAberration: 0.0007,
    treeCount: 40,
    treeTierCount: 3,
    groundSegments: 32,
    enableFog: true,
    enableGodRays: true,
  },
  low: {
    dprCap: 1,
    chromaticAberration: 0.0005,
    treeCount: 18,
    treeTierCount: 3,
    groundSegments: 16,
    enableFog: false,
    enableGodRays: false,
  },
};
