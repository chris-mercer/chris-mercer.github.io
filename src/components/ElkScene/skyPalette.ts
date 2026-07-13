import * as THREE from 'three';
import { CYCLE_DURATION_SECONDS, REDUCED_MOTION_CYCLE_PHASE } from './constants';

// Single source of truth for "what time it is" — every consumer (sky,
// light, fog) derives from the same elapsed clock time via this pure
// function, so they can never drift out of sync with each other, and
// reduced-motion freezing is consistent for free (no per-component local
// state that could capture a subtly different phase).
export function getCyclePhase(elapsedTime: number, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_CYCLE_PHASE;
  const wrapped = elapsedTime % CYCLE_DURATION_SECONDS;
  return wrapped / CYCLE_DURATION_SECONDS;
}

interface PaletteStop {
  phase: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  lightColor: THREE.Color;
  lightIntensity: number;
  elevationDeg: number;
}

function stop(
  phase: number,
  skyTop: string,
  skyBottom: string,
  lightColor: string,
  lightIntensity: number,
  elevationDeg: number,
): PaletteStop {
  return {
    phase,
    skyTop: new THREE.Color(skyTop),
    skyBottom: new THREE.Color(skyBottom),
    lightColor: new THREE.Color(lightColor),
    lightIntensity,
    elevationDeg,
  };
}

// Authored dawn -> day -> dusk -> night keyframes (wraps: the last stop's
// values equal the first's). Hand-authored rather than physically
// simulated, so ACES tone mapping's compression was tuned against these
// exact hex values in-engine.
const STOPS: PaletteStop[] = [
  stop(0.0, '#0b1026', '#1b2340', '#425a8c', 0.18, -8),
  stop(0.18, '#2b3a6b', '#e69a6b', '#ffb473', 0.65, 6),
  stop(0.35, '#4a78c2', '#a8c9e8', '#fff3d6', 1.0, 55),
  stop(0.62, '#3a66b0', '#b8d4ec', '#fff6e0', 1.05, 42),
  stop(0.8, '#3a3564', '#e8794f', '#ff9d5c', 0.55, 8),
  stop(1.0, '#0b1026', '#1b2340', '#425a8c', 0.18, -8),
];

export interface SkyPalette {
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  lightColor: THREE.Color;
  lightIntensity: number;
  lightElevationDeg: number;
  lightAzimuthDeg: number;
  fogColor: THREE.Color;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// The sun/moon share one continuous great-circle path across the sky, the
// same way real day/night motion works — so azimuth sweeps a full 360°
// over one full cycle rather than following the same dawn/day/dusk/night
// keyframe table as color and elevation. AZIMUTH_PHASE_OFFSET picks which
// phase reads as "azimuth 0" (centered in front of the camera): the 0.35
// stop is elevationDeg's peak (55°, solar noon), so the sun is highest
// AND most centered on screen at the same moment, then visibly arcs off
// to one side through the afternoon/dusk before the moon completes the
// same sweep overnight.
const AZIMUTH_PHASE_OFFSET = 0.35;

function azimuthForPhase(phase: number): number {
  return (phase - AZIMUTH_PHASE_OFFSET) * 360;
}

// Finds the two stops bracketing `phase` and smoothsteps between them.
export function getSkyPalette(phase: number, out: SkyPalette): SkyPalette {
  const p = THREE.MathUtils.clamp(phase, 0, 1);

  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].phase < p) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const span = b.phase - a.phase || 1;
  const t = smoothstep(THREE.MathUtils.clamp((p - a.phase) / span, 0, 1));

  out.skyTop.copy(a.skyTop).lerp(b.skyTop, t);
  out.skyBottom.copy(a.skyBottom).lerp(b.skyBottom, t);
  out.lightColor.copy(a.lightColor).lerp(b.lightColor, t);
  out.lightIntensity = THREE.MathUtils.lerp(a.lightIntensity, b.lightIntensity, t);
  out.lightElevationDeg = THREE.MathUtils.lerp(a.elevationDeg, b.elevationDeg, t);
  out.lightAzimuthDeg = azimuthForPhase(p);
  out.fogColor.copy(out.skyBottom);

  return out;
}

export function createSkyPalette(): SkyPalette {
  return {
    skyTop: new THREE.Color(),
    skyBottom: new THREE.Color(),
    lightColor: new THREE.Color(),
    lightIntensity: 1,
    lightElevationDeg: 0,
    lightAzimuthDeg: 0,
    fogColor: new THREE.Color(),
  };
}

// Shared by LightSource.tsx (the visible sun/moon disc) and SunLight.tsx
// (the actual directional light) so both move in lockstep. Depth is
// DELIBERATELY decoupled from elevation/azimuth rather than using a
// textbook spherical-to-Cartesian conversion (x/y/z all sharing the same
// trig): tying depth to azimuth let the disc's Z drift shallow enough at
// some sweep angles to render in front of the mountain ridge/trees
// instead of behind them — a real regression caught visually (the "sun
// through the mountains" bug). A fixed depth, comfortably behind the
// ridge's far edge (world Z -28, see Mountains.tsx's RIDGE_NEAR_Z=28 +
// RIDGE_DEPTH=9), guarantees correct occlusion at every phase — the
// horizontal "scrolling across the horizon" motion comes entirely from X
// (azimuth), and the rise/fall comes entirely from Y (elevation).
export function getLightPosition(
  palette: SkyPalette,
  sweepRadius: number,
  arcHeight: number,
  depth: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const elevationRad = THREE.MathUtils.degToRad(palette.lightElevationDeg);
  const azimuthRad = THREE.MathUtils.degToRad(palette.lightAzimuthDeg);
  out.set(Math.sin(azimuthRad) * sweepRadius, Math.sin(elevationRad) * arcHeight, -depth);
  return out;
}
