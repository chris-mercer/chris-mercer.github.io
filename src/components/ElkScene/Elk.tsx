import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ELK_POSITION, ELK_TARGET_HEIGHT } from './constants';

// The bundled Gallop clip is a full sprint — scaling its timeScale down to
// "jog" pace reads as an uncanny slow-motion sprint (limbs arc through
// implausibly slow paths for a gait that fast). Walk is a genuinely
// different, naturally-paced gait, then nudged up slightly for a livelier
// pace than a plodding literal walk.
const WALK_CLIP_NAME = 'Walk';
const WALK_TIME_SCALE = 1.35;

export function Elk() {
  const { scene, animations } = useGLTF('/models/stag.glb');
  const reducedMotion = useReducedMotion();

  // useGLTF caches and shares the parsed scene across mounts — clone
  // before mutating materials or adding to the tree. SkeletonUtils.clone
  // (not a plain Object3D clone) is required for skinned meshes: it
  // rebuilds the bone hierarchy and re-binds skin bindings correctly.
  const model = useMemo(() => cloneSkeleton(scene) as THREE.Group, [scene]);

  const scale = useMemo(() => {
    // The clone hasn't been added to a live scene yet, so child
    // matrixWorld values are still stale/identity — without this,
    // Box3.setFromObject falls back to raw bind-pose local geometry
    // (a handful of hundredths of a unit) instead of the actual
    // hierarchy-scaled size, producing a wildly wrong height.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1;
    return ELK_TARGET_HEIGHT / height;
  }, [model]);

  useEffect(() => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        standard.flatShading = true;
        standard.needsUpdate = true;
      }
    });
  }, [model]);

  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);

  useEffect(() => {
    const clip =
      THREE.AnimationClip.findByName(animations, WALK_CLIP_NAME) ?? animations[0] ?? null;
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.timeScale = WALK_TIME_SCALE;
    action.play();

    if (reducedMotion) {
      // Freeze on a representative frame rather than animating at all.
      mixer.update(0);
      action.paused = true;
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, animations, reducedMotion]);

  useFrame((_state, delta) => {
    if (reducedMotion) return;
    mixer.update(delta);
  });

  return (
    <group position={ELK_POSITION} scale={scale} rotation={[0, Math.PI / 2, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload('/models/stag.glb');
