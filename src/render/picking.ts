import type * as THREE from "three";
import type { GroundPosition } from "../simulation";

// Which Structure the player has clicked in the 3D view. Each Structure's
// view group carries its id, so a ray hit on any part of it leads back to
// the Structure. Only the render layer reads it; the simulation never knows.

const STRUCTURE_ID = "structureId";

/** Where a Structure stands, and how far round it its site reaches. */
export interface StructureSite {
  readonly structureId: string;
  readonly position: GroundPosition;
  readonly radiusMetres: number;
}

/** Marks the group a Structure is drawn in as standing for it, so that clicking any part of it picks it. */
export function markStructure(
  group: THREE.Object3D,
  structureId: string,
): void {
  group.userData[STRUCTURE_ID] = structureId;
}

/**
 * The Structure a part of the scene is drawn for, or undefined if it isn't
 * part of one, or isn't drawn: a ray hits hidden parts too, such as the
 * model of a Structure not yet assembled.
 */
function structureIdOf(object: THREE.Object3D): string | undefined {
  for (
    let current: THREE.Object3D | null = object;
    current !== null;
    current = current.parent
  ) {
    if (!current.visible) return undefined;
    const id: unknown = current.userData[STRUCTURE_ID];
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * The Structure under the pointer: the nearest one drawn there, given the
 * ray's hits nearest first, or else the one whose site takes in the point
 * on the ground there, as when only its footprint is marked out. Undefined
 * over empty ground or the sky.
 */
export function pickStructure(
  hits: readonly THREE.Intersection[],
  ground: GroundPosition | undefined,
  sites: Iterable<StructureSite>,
): string | undefined {
  for (const hit of hits) {
    const id = structureIdOf(hit.object);
    if (id !== undefined) return id;
  }
  if (ground === undefined) return undefined;
  let nearest: { id: string; distance: number } | undefined;
  for (const site of sites) {
    const distance = Math.hypot(
      ground.x - site.position.x,
      ground.y - site.position.y,
    );
    if (
      distance <= site.radiusMetres &&
      (nearest === undefined || distance < nearest.distance)
    ) {
      nearest = { id: site.structureId, distance };
    }
  }
  return nearest?.id;
}
