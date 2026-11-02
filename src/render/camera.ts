import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import type { MapSnapshot } from "../simulation";

// The player's view of the base. Dragging with the left mouse button pans,
// dragging with the right button rotates, and the wheel zooms towards the
// cursor. The camera stays over the map: it can't dip below the ground or
// pass the map's edge, and neither can the point it looks at.

/** Close enough that the 1.8 m Robot fills a good part of the view. */
const CLOSEST_ZOOM_METRES = 4;
/** Far enough to see the whole 1×1 km map. */
const FARTHEST_ZOOM_METRES = 1400;
/** Just short of horizontal, so the camera stays above the ground. */
const LOWEST_VIEW_ANGLE = THREE.MathUtils.degToRad(83);
/** From the bottom of the view to the top. */
export const FIELD_OF_VIEW_DEGREES = 50;
/** Beyond the hills and Earth, so that the camera sees all the scenery. */
export const FAR_PLANE_METRES = 20000;
/**
 * How high above the horizon the top of the view reaches, tilted as low as
 * the camera goes: the sky never shows any higher.
 */
export const HIGHEST_IN_VIEW =
  THREE.MathUtils.degToRad(FIELD_OF_VIEW_DEGREES / 2) -
  (Math.PI / 2 - LOWEST_VIEW_ANGLE);

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
      // Pull the camera itself back over the map; zoomed far out near an
      // edge, this tips the view to look down more steeply.
      const { position } = camera;
      const overX =
        THREE.MathUtils.clamp(position.x, -halfWidth, halfWidth) - position.x;
      const overZ =
        THREE.MathUtils.clamp(position.z, -halfDepth, halfDepth) - position.z;
      if (overX !== 0 || overZ !== 0) {
        position.x += overX;
        position.z += overZ;
        camera.lookAt(target);
      }
    },
  };
}
