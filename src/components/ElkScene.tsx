import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, AdaptiveDpr } from '@react-three/drei';
import { useDeviceCapability } from '../hooks/useDeviceCapability';
import { TIERS } from './ElkScene/tiers';
import { Elk } from './ElkScene/Elk';
import { InfiniteLandscape } from './ElkScene/InfiniteLandscape';
import { Mountains } from './ElkScene/Mountains';
import { Sky } from './ElkScene/Sky';
import { SunLight } from './ElkScene/SunLight';
import { LightSource } from './ElkScene/LightSource';
import { PostProcessing } from './ElkScene/PostProcessing';

// Night-phase horizon color — used as the clear color fallback for the
// frame(s) before Sky's Suspense boundary resolves, so there's no flash
// of an unrelated color on first paint.
const BACKGROUND = '#1b2340';

export default function ElkScene() {
  const deviceTier = useDeviceCapability();
  const [degraded, setDegraded] = useState(false);
  const handleDecline = useCallback(() => setDegraded(true), []);

  const tierName = degraded && deviceTier === 'high' ? 'medium' : deviceTier;
  const tier = TIERS[tierName];

  const lightRef = useRef<THREE.Mesh>(null);

  // The HUD's "Learn More" overlay dispatches these on `document` (see
  // Hud.astro / InfoPanel.astro) so the hero pauses rendering while the
  // overlay panel is open, matching the prior vanilla-Three.js behavior.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const onOpen = () => setPaused(true);
    const onClose = () => setPaused(false);
    document.addEventListener('learnmore:open', onOpen);
    document.addEventListener('learnmore:close', onClose);
    return () => {
      document.removeEventListener('learnmore:open', onOpen);
      document.removeEventListener('learnmore:close', onClose);
    };
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 9], fov: 50, near: 0.1, far: 50 }}
      dpr={tier.dprCap === 1 ? 1 : [1, tier.dprCap]}
      frameloop={paused ? 'never' : 'always'}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      onCreated={({ gl }) => gl.setClearColor(BACKGROUND, 1)}
    >
      <PerformanceMonitor onDecline={handleDecline} flipflops={3} onFallback={handleDecline}>
        <AdaptiveDpr pixelated />
      </PerformanceMonitor>

      <Suspense fallback={null}>
        <Sky />
        <SunLight enableFog={tier.enableFog} />
        <InfiniteLandscape
          groundSegments={tier.groundSegments}
          treeCount={tier.treeCount}
          treeTierCount={tier.treeTierCount}
        />
        <Mountains />
        <LightSource ref={lightRef} />
        <Elk />
        <PostProcessing
          lightRef={lightRef}
          chromaticAberrationAmount={tier.chromaticAberration}
          enableGodRays={tier.enableGodRays}
        />
      </Suspense>
    </Canvas>
  );
}
