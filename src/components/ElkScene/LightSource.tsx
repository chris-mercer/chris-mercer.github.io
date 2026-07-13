import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getCyclePhase, getSkyPalette, createSkyPalette, getLightPosition } from './skyPalette';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cloudDensityInDirection } from './clouds';
import { LIGHT_SWEEP_RADIUS, LIGHT_ARC_HEIGHT, LIGHT_DEPTH } from './constants';
import { RIDGE_PEAK_Y } from './Mountains';

// Matches SunLight.tsx's directional light — both call the same
// getLightPosition() every frame, so this disc IS the visible sun/moon,
// not a decoration independent of the actual lighting: it rises, sweeps
// across, and sets in lockstep with the real light, and its color shifts
// from warm sun-tones to cool moon-tones via the same palette.lightColor
// everything else reads.
const DISC_RADIUS = 0.4;

// GodRays' internal occlusion pass doesn't reliably hide its glow behind
// the mountain ridge (confirmed visually — the halo bled through the
// silhouette even with the disc itself correctly depth-tested), so
// correct sunrise/sunset-behind-the-mountains behavior needs an explicit
// visibility gate here rather than relying on 3D depth testing alone.
// HIDE_MARGIN clears the disc's own radius plus the GodRays glow's visual
// size; FADE_ZONE gives it a short smoothstep fade as it approaches the
// ridge line from above, so it eases out of view instead of popping.
const HIDE_MARGIN = 1.0;
const FADE_ZONE = 2.0;
const HIDE_Y = RIDGE_PEAK_Y + HIDE_MARGIN;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// The GodRays effect's light source — a small emissive disc standing in
// for the sun/moon, positioned and colored every frame from the same
// day/night cycle phase driving Sky.tsx and SunLight.tsx.
export const LightSource = forwardRef<THREE.Mesh>(function LightSource(_props, forwardedRef) {
  const reducedMotion = useReducedMotion();
  const meshRef = useRef<THREE.Mesh>(null);
  useImperativeHandle(forwardedRef, () => meshRef.current as THREE.Mesh);

  const palette = useMemo(() => createSkyPalette(), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthWrite: false }), []);
  const direction = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const phase = getCyclePhase(state.clock.elapsedTime, reducedMotion);
    getSkyPalette(phase, palette);

    getLightPosition(palette, LIGHT_SWEEP_RADIUS, LIGHT_ARC_HEIGHT, LIGHT_DEPTH, mesh.position);
    material.color.copy(palette.lightColor);

    // Hide entirely below the ridge line — sunrise/sunset should read as
    // happening behind the mountains, not sinking below the flat horizon
    // with a visible glow bleeding through the silhouette.
    mesh.visible = mesh.position.y > HIDE_Y;
    const ridgeFade = smoothstep(THREE.MathUtils.clamp((mesh.position.y - HIDE_Y) / FADE_ZONE, 0, 1));

    // Sky.tsx paints the same cloud field on the sky dome behind this
    // disc — sampling it here in this disc's own direction and dimming
    // accordingly is what makes clouds visibly pass in front of the
    // light, without needing real depth-based occlusion between two
    // separate objects at different distances.
    let cloudFactor = 1;
    if (!reducedMotion) {
      direction.copy(mesh.position).normalize();
      const cloudCover = cloudDensityInDirection(direction, state.clock.elapsedTime);
      cloudFactor = 1 - cloudCover * 0.85;
    }
    material.opacity = 0.92 * cloudFactor * ridgeFade;
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[DISC_RADIUS, 16, 16]} />
    </mesh>
  );
});
