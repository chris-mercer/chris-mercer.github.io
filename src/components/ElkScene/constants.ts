import * as THREE from 'three';
import { getHeightAt } from './noise';

// Authored screen position, not derived — this is the actual composition
// control ("bring the elk down, more foreground"). The ground system is
// anchored to this same baseline (see GROUND_BASE_Y below) so the two
// stay consistent by construction instead of one chasing the other.
const ELK_X = -0.3;
const ELK_Z = 0;
export const GROUND_BASE_Y = -1.7;

// Where the elk stands and how tall it's scaled to (the solid mesh's own
// export scale isn't something to guess at — Elk.tsx measures the loaded
// model's actual bounding box at mount and derives a scale factor from
// this target height, the same defensive pattern used for the previous
// point-cloud version). Y = the authored ground baseline plus this exact
// spot's small terrain-noise variation, so the elk sits flush on the
// ground here without overriding the chosen screen position.
//
// Sized against the pine trees' height (see treeGenerator.ts's
// DEFAULT_PINE_PARAMS, ~4.4-7.2 units): a real forest's trees tower over
// a standing elk, and the elk previously being taller than the trees
// around it is what made it read as an oversized cutout pasted onto the
// backdrop rather than a normally-scaled subject standing inside the
// scene.
export const ELK_POSITION = new THREE.Vector3(ELK_X, GROUND_BASE_Y + getHeightAt(ELK_X, ELK_Z), ELK_Z);
export const ELK_TARGET_HEIGHT = 3.1;

// Ground plane extent (full width/depth) — comfortably exceeds the old
// dust field's ±12 bounds and stays inside the camera's far=50.
export const GROUND_SIZE = 40;

// Sky dome radius — inside camera.far=50, comfortably beyond the ground.
export const SKY_RADIUS = 40;

// Forest placement: trees are excluded within CLEARING_RADIUS of
// ELK_POSITION (so it has open space around it) and placed out to
// OUTER_RADIUS, each at least MIN_TREE_SPACING apart.
export const FOREST_CLEARING_RADIUS = 3.2;
export const FOREST_OUTER_RADIUS = 17;
export const MIN_TREE_SPACING = 1.9;

// The camera sits at z=9 looking toward the origin — a tree placed
// between the camera and the elk (or too close to the lens) renders as a
// screen-filling pillar purely from perspective, even at a normal size,
// and any tree with z greater than the elk's own front-to-back extent
// visually reads as standing in front of it. The elk's Z-depth scales
// with ELK_TARGET_HEIGHT, so this needs real negative margin (not just
// "not exactly at z=0") now that the elk is much larger — trees are
// rejected past this Z so the whole forest stays clearly behind the
// subject relative to the camera, never overlapping it.
export const FOREST_MAX_Z = -1.1;

// Day/night cycle: a full cycle takes several minutes — slow and ambient,
// not the fast demo pace of the reference. prefers-reduced-motion freezes
// on a fixed, pleasant daytime phase rather than animating at all.
export const CYCLE_DURATION_SECONDS = 600;
export const REDUCED_MOTION_CYCLE_PHASE = 0.38;

// Sun/moon position (shared by LightSource.tsx and SunLight.tsx via
// skyPalette.ts's getLightPosition): X sweeps left-right with azimuth, Y
// rises/falls with elevation, and depth stays fixed — see getLightPosition's
// comment for why depth can't be tied to azimuth without breaking
// occlusion behind Mountains.tsx's ridge (world Z -28 to -19).
//
// LIGHT_ARC_HEIGHT is deliberately much smaller than LIGHT_DEPTH: at
// LIGHT_DEPTH's distance from the camera, the visible frustum's vertical
// half-height is only ~20 world units (camera fov=50 at ~43 units away) —
// a taller arc put the sun's peak (elevationDeg's 55° stop) above the top
// of the frame entirely, so the "visible above the mountains" window
// (see LightSource.tsx's HIDE_Y gate) was landing off-screen rather than
// actually appearing to an on-screen viewer. This height keeps the whole
// daytime arc between Mountains.tsx's ridge line and the top of frame.
export const LIGHT_SWEEP_RADIUS = 30;
export const LIGHT_ARC_HEIGHT = 16;
export const LIGHT_DEPTH = 34;
