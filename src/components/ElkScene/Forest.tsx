import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { generatePineTree, generateForestLayout, DEFAULT_PINE_PARAMS, type PineTreeData } from './treeGenerator';
import { getHeightAt } from './noise';
import {
  ELK_POSITION,
  FOREST_CLEARING_RADIUS,
  FOREST_OUTER_RADIUS,
  MIN_TREE_SPACING,
  FOREST_MAX_Z,
  GROUND_BASE_Y,
} from './constants';

const FOREST_SEED = 1337;
const TRUNK_RADIAL_SEGMENTS = 6;
const CONE_RADIAL_SEGMENTS = 7;

const TRUNK_COLOR = new THREE.Color('#3c2a1c');
const CANOPY_COLORS = [
  new THREE.Color('#1d3820'),
  new THREE.Color('#254a28'),
  new THREE.Color('#16301c'),
  new THREE.Color('#2c4a24'),
];

interface ForestProps {
  treeCount: number;
  tierCount: number;
  // Overrides for a scrolling background tile: a different seed avoids an
  // obviously-repeating tree pattern, originX offsets height noise
  // sampling (not rendered position) for a genuinely different terrain
  // slice, and clearingRadius=0 fills the tile with trees since there's
  // no elk standing in it.
  seed?: number;
  originX?: number;
  clearingRadius?: number;
}

interface PlacedTree {
  tree: PineTreeData;
  base: THREE.Vector3;
  colorIndex: number;
}

export function Forest({
  treeCount,
  tierCount,
  seed = FOREST_SEED,
  originX = 0,
  clearingRadius = FOREST_CLEARING_RADIUS,
}: ForestProps) {
  const trees = useMemo<PlacedTree[]>(() => {
    const pineParams = { ...DEFAULT_PINE_PARAMS, tierCount };
    const placements = generateForestLayout(
      seed,
      treeCount,
      ELK_POSITION,
      clearingRadius,
      FOREST_OUTER_RADIUS,
      MIN_TREE_SPACING,
      FOREST_MAX_Z,
      (x, z) => GROUND_BASE_Y + getHeightAt(x + originX, z),
    );

    return placements.map((placement) => ({
      tree: generatePineTree(placement.seed, pineParams),
      base: placement.position,
      colorIndex: placement.seed % CANOPY_COLORS.length,
    }));
  }, [treeCount, tierCount, seed, originX, clearingRadius]);

  return (
    <group>
      <TrunkLayer trees={trees} />
      {Array.from({ length: tierCount }, (_, tierIndex) => (
        <CanopyTierLayer key={tierIndex} trees={trees} tierIndex={tierIndex} />
      ))}
    </group>
  );
}

// One InstancedMesh for every trunk, plus one per canopy tier index (all
// trees share the same tier count, so tier 0 across the whole forest is
// one draw call, tier 1 another, etc.) — a handful of draw calls total
// regardless of tree count, same pattern as the ground/branch instancing
// elsewhere in this scene.
function TrunkLayer({ trees }: { trees: PlacedTree[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.7, 1, 1, TRUNK_RADIAL_SEGMENTS, 1), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const identity = new THREE.Quaternion();

    trees.forEach(({ tree, base }, i) => {
      position.set(base.x, base.y + tree.trunkHeight / 2, base.z);
      scale.set(tree.trunkRadius, tree.trunkHeight, tree.trunkRadius);
      matrix.compose(position, identity, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [trees]);

  if (trees.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, trees.length]} frustumCulled={false}>
      <meshStandardMaterial color={TRUNK_COLOR} flatShading roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

function CanopyTierLayer({ trees, tierIndex }: { trees: PlacedTree[]; tierIndex: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.ConeGeometry(1, 1, CONE_RADIAL_SEGMENTS, 1), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    const color = new THREE.Color();

    trees.forEach(({ tree, base, colorIndex }, i) => {
      const tier = tree.tiers[tierIndex];
      position.set(base.x, base.y + tier.yOffset + tier.height / 2, base.z);
      scale.set(tier.radius, tier.height, tier.radius);
      matrix.compose(position, identity, scale);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.copy(CANOPY_COLORS[colorIndex]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [trees, tierIndex]);

  if (trees.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, trees.length]} frustumCulled={false}>
      <meshStandardMaterial vertexColors flatShading roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}
