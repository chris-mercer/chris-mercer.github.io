import type { RefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer, ChromaticAberration, GodRays } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

interface PostProcessingProps {
  lightRef: RefObject<THREE.Mesh | null>;
  chromaticAberrationAmount: number;
  enableGodRays: boolean;
}

// GodRays (volumetric light-scatter, anchored to the antlers via
// lightRef) and a subtle chromatic aberration. Bloom/grain are deliberately
// not here — see the plan's risk notes on scope containment. GodRays is
// disabled on low tier (see tiers.ts).
export function PostProcessing({ lightRef, chromaticAberrationAmount, enableGodRays }: PostProcessingProps) {
  return (
    <EffectComposer>
      {enableGodRays ? (
        <GodRays
          sun={lightRef as RefObject<THREE.Mesh>}
          samples={45}
          density={0.85}
          decay={0.82}
          weight={0.18}
          exposure={0.14}
          clampMax={0.4}
          blendFunction={BlendFunction.SCREEN}
        />
      ) : (
        <></>
      )}
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={new THREE.Vector2(chromaticAberrationAmount, chromaticAberrationAmount)}
        radialModulation
        modulationOffset={0.4}
      />
    </EffectComposer>
  );
}
