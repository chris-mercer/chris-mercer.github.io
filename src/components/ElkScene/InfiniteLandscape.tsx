import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Ground } from './Ground';
import { Forest } from './Forest';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { GROUND_SIZE, FOREST_CLEARING_RADIUS } from './constants';

// Units per second — the elk gait-cycles in place (no actual translation),
// so without a scrolling ground/forest it doesn't read as running at all.
// Classic two-tile treadmill: both tiles scroll left together, and
// whichever one drifts fully offscreen jumps back by 2*GROUND_SIZE to
// reappear on the right — since they move in lockstep the spacing between
// them never changes, so the jump itself is invisible (it only ever
// happens well outside the camera's view).
const SCROLL_SPEED = 0.6;

interface InfiniteLandscapeProps {
  groundSegments: number;
  treeCount: number;
  treeTierCount: number;
}

export function InfiniteLandscape({ groundSegments, treeCount, treeTierCount }: InfiniteLandscapeProps) {
  const reducedMotion = useReducedMotion();
  const tileRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];

  // A tile's Ground/Forest geometry is baked once from `originX` (which
  // noise-sampling slice of the continuous terrain it represents) — but
  // its on-screen position scrolls every frame via group.position.x.
  // Those two have to stay in sync, or the pattern baked into a tile no
  // longer corresponds to where it's currently rendered, and the two
  // tiles' touching edges sample completely different noise values —
  // exactly the visible seam this was producing. originX only needs to
  // update at the (rare, ~once per wrap) moment a tile jumps back around,
  // not every frame, so this stays a cheap one-time regeneration rather
  // than a per-frame cost.
  const [origins, setOrigins] = useState<[number, number]>([0, GROUND_SIZE]);

  useFrame((_state, delta) => {
    if (!reducedMotion) {
      let changedIndex = -1;
      let changedValue = 0;

      tileRefs.forEach((ref, i) => {
        const group = ref.current;
        if (!group) return;
        group.position.x -= SCROLL_SPEED * delta;
        if (group.position.x < -GROUND_SIZE) {
          group.position.x += GROUND_SIZE * 2;
          changedIndex = i;
          changedValue = origins[i] + GROUND_SIZE * 2;
        }
      });

      if (changedIndex !== -1) {
        setOrigins((prev) => {
          const next: [number, number] = [...prev];
          next[changedIndex] = changedValue;
          return next;
        });
      }
    }
  });

  return (
    <>
      <group ref={tileRefs[0]} position={[0, 0, 0]}>
        <Ground segments={groundSegments} originX={origins[0]} />
        <Forest
          treeCount={treeCount}
          tierCount={treeTierCount}
          seed={1337}
          originX={origins[0]}
          clearingRadius={FOREST_CLEARING_RADIUS}
        />
      </group>
      <group ref={tileRefs[1]} position={[GROUND_SIZE, 0, 0]}>
        <Ground segments={groundSegments} originX={origins[1]} />
        <Forest
          treeCount={treeCount}
          tierCount={treeTierCount}
          seed={7331}
          originX={origins[1]}
          clearingRadius={0}
        />
      </group>
    </>
  );
}
