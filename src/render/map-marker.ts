import * as THREE from "three";

// The mark the base map puts round something the player asks to find from
// the panels: a ring on the ground round it. Only the render layer draws
// it; the simulation never knows.

/** Something on the base map that the player can ask to be shown: a Structure, Robot, Machine or Rover, by its id. */
export interface MapSubject {
  readonly kind: "structure" | "robot" | "machine" | "rover";
  readonly id: string;
}

/** Where something marked stands in the scene, and how far round it its mark reaches. */
export interface Marked {
  readonly position: THREE.Vector3;
  readonly radiusMetres: number;
}

/** How long something the player asked to be shown stays marked, in real seconds. */
export const MARKED_SECONDS = 6;

/** How far outside what it marks the ring goes, in metres. */
const CLEAR_METRES = 0.5;
/**
 * The least the ring's radius is, as a share of how far the camera is from
 * it, so that it can still be seen from across the map.
 */
const LEAST_SHARE_OF_DISTANCE = 0.03;
/** How often the ring pulses, in pulses per real second. */
const PULSES_PER_SECOND = 1.2;

export interface MapMarker {
  /** The ring, as drawn: its place, its size as its scale, and whether it shows. */
  readonly ring: THREE.Object3D;
  /** Marks something for {@link MARKED_SECONDS} from now, in real seconds. */
  show(subject: MapSubject, realSeconds: number): void;
  /** Marks something for as long as it is pointed out, ahead of anything shown, or stops. */
  pointOut(subject: MapSubject | undefined): void;
  /**
   * Draws the ring round what is marked now, wherever it has got to, and
   * returns it, or undefined if nothing is, or it isn't on the map. Call
   * once a frame, after everything on the map has been placed.
   */
  update(
    realSeconds: number,
    where: (subject: MapSubject) => Marked | undefined,
    cameraPosition: THREE.Vector3,
  ): MapSubject | undefined;
  /** Forgets what is marked, for a Campaign loaded in place of the last. */
  clear(): void;
}

export function createMapMarker(scene: THREE.Scene): MapMarker {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf2c14e,
    transparent: true,
    // Over the graded ground and through whatever stands on it.
    depthTest: false,
    side: THREE.DoubleSide,
  });
  // A ring of radius 1 lying on the ground, sized by its scale.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64), material);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  ring.visible = false;
  scene.add(ring);

  let shown: { subject: MapSubject; untilSeconds: number } | undefined;
  let pointedOut: MapSubject | undefined;

  return {
    ring,
    show(subject, realSeconds) {
      shown = { subject, untilSeconds: realSeconds + MARKED_SECONDS };
    },
    pointOut(subject) {
      pointedOut = subject;
    },
    update(realSeconds, where, cameraPosition) {
      if (shown !== undefined && realSeconds > shown.untilSeconds) {
        shown = undefined;
      }
      const subject = pointedOut ?? shown?.subject;
      const marked = subject === undefined ? undefined : where(subject);
      ring.visible = marked !== undefined;
      if (marked === undefined) return undefined;
      ring.position.set(marked.position.x, 0.05, marked.position.z);
      const radius = Math.max(
        marked.radiusMetres * 1.2 + CLEAR_METRES,
        cameraPosition.distanceTo(marked.position) * LEAST_SHARE_OF_DISTANCE,
      );
      ring.scale.setScalar(radius);
      material.opacity =
        0.6 + 0.3 * Math.sin(realSeconds * PULSES_PER_SECOND * Math.PI * 2);
      return subject;
    },
    clear() {
      shown = undefined;
      pointedOut = undefined;
    },
  };
}
