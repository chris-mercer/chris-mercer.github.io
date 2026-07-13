import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getCyclePhase, getSkyPalette, createSkyPalette } from './skyPalette';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SKY_RADIUS } from './constants';

const VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform float uTime;
  varying vec3 vWorldPosition;

  // Hand-rolled 2D value noise (same lattice-hash technique as noise.ts,
  // reimplemented in GLSL since shaders can't import JS) driving a soft,
  // slowly-drifting cloud layer.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Two octaves only — flatter and simpler than a higher-octave fbm,
  // which is the point: thin, sparse, flat cloud cover, not a dense
  // detailed overcast layer.
  float cloudFbm(vec2 p) {
    return noise(p) * 0.65 + noise(p * 2.0) * 0.35;
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = dir.y;
    float t = smoothstep(-0.15, 0.6, h);
    vec3 skyColor = mix(uBottomColor, uTopColor, t);

    // Project the upper hemisphere onto a plane for cloud sampling —
    // conical enough to avoid obvious distortion near the top, and
    // clouds fade out well before the horizon so the projection's
    // behavior down there never shows.
    vec2 cloudUv = dir.xz / (h + 0.55) * 4.2 + vec2(uTime * 0.006, uTime * 0.0015);
    float density = cloudFbm(cloudUv);
    // Narrow, high threshold band = sparse discrete puffs rather than one
    // large connected region — a low-frequency noise field's high ground
    // is broad and slowly-varying, so sparseness has to come from both a
    // tight threshold AND a higher spatial frequency (cloudUv's scale
    // above), not the threshold alone.
    density = smoothstep(0.68, 0.82, density);
    float upperSkyMask = smoothstep(0.05, 0.4, h);
    vec3 cloudColor = mix(uBottomColor, vec3(0.96, 0.96, 0.99), 0.55);

    // Subtle: caps how much any single cloud can lighten the sky, so
    // they read as thin/translucent rather than an opaque overcast deck.
    vec3 finalColor = mix(skyColor, cloudColor, density * upperSkyMask * 0.16);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Hand-rolled gradient sky on a large inverted sphere, not
// three/examples/jsm/objects/Sky.js — that addon's physical atmospheric
// scattering model is built around daytime and doesn't model night well,
// and resists art-directing toward specific authored dawn/day/dusk/night
// stops the way this small custom shader does.
export function Sky() {
  const reducedMotion = useReducedMotion();
  const palette = useMemo(() => createSkyPalette(), []);

  const uniforms = useMemo(
    () => ({
      uTopColor: { value: new THREE.Color() },
      uBottomColor: { value: new THREE.Color() },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    const phase = getCyclePhase(state.clock.elapsedTime, reducedMotion);
    getSkyPalette(phase, palette);
    uniforms.uTopColor.value.copy(palette.skyTop);
    uniforms.uBottomColor.value.copy(palette.skyBottom);
    if (!reducedMotion) uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh scale={SKY_RADIUS}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
