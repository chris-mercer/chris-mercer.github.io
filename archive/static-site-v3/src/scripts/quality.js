// Device capability tiering + runtime FPS auto-degrade.
// Ports whiteb0x-com's matchMedia-based tiering idea, extended with
// hardwareConcurrency, pointer type, and Save-Data as stronger signals
// than viewport width alone.

// Bloom is disabled across all tiers for now: UnrealBloomPass was blowing
// the scene out to solid white on desktop viewports even with ACES tone
// mapping and a raised threshold (dense additive-blended particles/fills
// pushed HDR values high enough that everything read as ~white). The scene
// looks good without it; revisit bloom later as an isolated, carefully
// tuned addition rather than blocking on it now.
export const TIERS = {
  high: {
    particles: 900,
    dprCap: 2,
    bloom: { enabled: false, strength: 0 },
    ditherPixelSizeMultiplier: 2,
    rgbShiftMax: 0.0011,
  },
  medium: {
    particles: 550,
    dprCap: 1.5,
    bloom: { enabled: false, strength: 0 },
    ditherPixelSizeMultiplier: 3,
    rgbShiftMax: 0.0009,
  },
  low: {
    particles: 300,
    dprCap: 1,
    bloom: { enabled: false, strength: 0 },
    ditherPixelSizeMultiplier: 3,
    rgbShiftMax: 0.0007,
  },
};

export function getDeviceTier() {
  if (typeof window === 'undefined') return 'medium';

  const cores = navigator.hardwareConcurrency || 4;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = window.matchMedia('(max-width: 768px)').matches;
  const midViewport = window.matchMedia('(max-width: 1024px)').matches;
  const saveData = navigator.connection?.saveData === true;

  if (saveData) return 'low';
  if (smallViewport || (coarsePointer && cores <= 4)) return 'low';
  if (coarsePointer || cores <= 6 || midViewport) return 'medium';
  return 'high';
}

const TIER_ORDER = ['high', 'medium', 'low'];

export function nextTierDown(tier) {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx === -1 || idx === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export class FpsMonitor {
  constructor({ sampleSize = 60, threshold = 45, onDowngrade }) {
    this.sampleSize = sampleSize;
    this.threshold = threshold;
    this.onDowngrade = onDowngrade;
    this.samples = [];
    this.triggered = false;
  }

  tick(delta) {
    if (this.triggered || delta <= 0) return;
    this.samples.push(1 / delta);
    if (this.samples.length > this.sampleSize) this.samples.shift();
    if (this.samples.length === this.sampleSize) {
      const avg = this.samples.reduce((a, b) => a + b, 0) / this.sampleSize;
      if (avg < this.threshold) {
        this.triggered = true;
        this.onDowngrade();
      }
    }
  }

  reset() {
    this.samples = [];
    this.triggered = false;
  }
}
