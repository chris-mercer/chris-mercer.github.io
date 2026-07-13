import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getCyclePhase, getSkyPalette, createSkyPalette, getLightPosition } from './skyPalette';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { LIGHT_SWEEP_RADIUS, LIGHT_ARC_HEIGHT, LIGHT_DEPTH } from './constants';

interface SunLightProps {
  enableFog: boolean;
}

const hslScratch = { h: 0, s: 0, l: 0 };

// Directional "sun/moon" light, ambient fill, and (optionally) exponential
// fog — all driven by the same cycle phase as Sky.tsx via skyPalette.ts's
// pure functions, so nothing needs cross-component coordination.
//
// Ambient intensity is deliberately INVERSE to palette.lightIntensity (the
// time-of-day brightness the sky/fog use — NOT palette.directIntensity,
// the directional light's own cast intensity, which is zeroed overnight):
// at night the sky is dark and low-intensity, so ambient is boosted to
// keep foreground materials (elk, trees, ground) legible against it; at
// day the directional light already does the work, so ambient eases off
// and lets materials read as naturally darker than the bright sky.
// Without this, dark foreground colors sink into a dark sky and
// everything reads as one flat tone. Keying ambient off lightIntensity
// rather than directIntensity keeps this night-time fill exactly as
// tuned regardless of whether the moon is currently casting real light.
export function SunLight({ enableFog }: SunLightProps) {
  const reducedMotion = useReducedMotion();
  const palette = useMemo(() => createSkyPalette(), []);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const fogRef = useRef<THREE.FogExp2>(null);

  useFrame((state) => {
    const phase = getCyclePhase(state.clock.elapsedTime, reducedMotion);
    getSkyPalette(phase, palette);

    const light = lightRef.current;
    if (light) {
      getLightPosition(palette, LIGHT_SWEEP_RADIUS, LIGHT_ARC_HEIGHT, LIGHT_DEPTH, light.position);
      light.color.copy(palette.lightColor);
      light.intensity = palette.directIntensity;
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.clamp(0.88 - palette.lightIntensity * 0.4, 0.28, 0.85);
    }

    if (fogRef.current) {
      // Desaturate and clamp the raw sky-bottom color before using it as
      // fog — a fully saturated fog color at high density is what was
      // washing every material toward one flat hue.
      palette.fogColor.getHSL(hslScratch);
      fogRef.current.color.setHSL(hslScratch.h, hslScratch.s * 0.45, THREE.MathUtils.clamp(hslScratch.l, 0.16, 0.5));
    }
  });

  return (
    <>
      <directionalLight ref={lightRef} />
      <ambientLight ref={ambientRef} intensity={0.4} />
      {enableFog ? <fogExp2 ref={fogRef} attach="fog" args={['#1b2340', 0.007]} /> : null}
    </>
  );
}
