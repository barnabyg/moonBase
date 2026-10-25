import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import type { MapSnapshot } from "../simulation";

// The player's view of the base. Dragging with the left mouse button pans,
// dragging with the right button rotates, and the wheel zooms towards the
// cursor. The camera only ever looks at the map: it can't dip below the
// ground, and the point it looks at can't leave the map.

/** Close enough that the 1.8 m Robot fills a good part of the view. */
const CLOSEST_ZOOM_METRES = 4;
/** Far enough to see the whole 1×1 km map. */
const FARTHEST_ZOOM_METRES = 1400;
/** Just short of horizontal, so the camera stays above the ground. */
const LOWEST_VIEW_ANGLE = THREE.MathUtils.degToRad(83);

export interface CameraControls {
  /** The point on the ground the camera looks at. */
  readonly focus: THREE.Vector3;
  /** Applies the player's latest input. Call once a frame, before drawing. */
  update(): void;
}

export function createCameraControls(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  map: MapSnapshot,
  initialFocus: THREE.Vector3,
): CameraControls {
  const controls = new MapControls(camera, canvas);
  controls.target.copy(initialFocus);
  controls.enableDamping = true;
  controls.zoomToCursor = true;
  controls.minDistance = CLOSEST_ZOOM_METRES;
  controls.maxDistance = FARTHEST_ZOOM_METRES;
  controls.maxPolarAngle = LOWEST_VIEW_ANGLE;
  controls.update();

  const halfWidth = map.widthMetres / 2;
  const halfDepth = map.depthMetres / 2;
  const correction = new THREE.Vector3();

  return {
    focus: controls.target,
    update() {
      controls.update();
      // Keep the focus on the map's ground by sliding the whole camera back,
      // so that panning stops at the edge without turning the view.
      const { target } = controls;
      correction.set(
        THREE.MathUtils.clamp(target.x, -halfWidth, halfWidth) - target.x,
        -target.y,
        THREE.MathUtils.clamp(target.z, -halfDepth, halfDepth) - target.z,
      );
      if (correction.lengthSq() > 0) {
        target.add(correction);
        camera.position.add(correction);
      }
    },
  };
}
