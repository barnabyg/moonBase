import * as THREE from "three";
import { catalogue } from "../catalogue";
import {
  obstaclesFor,
  routeBetween,
  type GroundPosition,
  type Grounds,
} from "../simulation";
import { facingAngle, toScene } from "./interpolation";
import { landerLadderFoot } from "./lander-model";
import { BURIED_HABITAT_HATCH_OUT, HABITAT_HATCH_OUT } from "./models";

/** A Habitat, by what the way to its hatch depends on. */
export interface WalkEnd {
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

/** How far out along +x from its centre a type of Habitat's airlock hatch stands. */
function hatchOut(structureTypeId: string): number {
  return catalogue.structureTypes.find((type) => type.id === structureTypeId)
    ?.buried === true
    ? BURIED_HABITAT_HATCH_OUT
    : HABITAT_HATCH_OUT;
}

/** Where someone stands outside a Habitat's airlock hatch, on the ground. */
function outsideHatch({ structureTypeId, position }: WalkEnd): GroundPosition {
  return { x: position.x + hatchOut(structureTypeId) + 0.8, y: position.y };
}

/**
 * The way the Mission Director walks to the airlock hatch of a Habitat, as
 * the points it turns at in the scene: from the foot of the Lander's ladder,
 * or from the hatch of the Habitat they are leaving, round the Lander, both
 * Habitats and everything else a Robot walks round, keeping as far clear of
 * them as a Robot does.
 */
export function routeToHatch(
  grounds: Grounds,
  habitat: WalkEnd,
  leaving?: WalkEnd,
): THREE.Vector3[] {
  const lander = grounds.lander.position;
  // From the scene (z south) back onto the ground (y north).
  const ladderFoot = landerLadderFoot(catalogue.lander.footprintRadiusMetres);
  return routeBetween(
    leaving === undefined
      ? { x: lander.x + ladderFoot.x, y: lander.y - ladderFoot.z }
      : outsideHatch(leaving),
    outsideHatch(habitat),
    obstaclesFor(grounds),
  ).map((point) => toScene(point));
}

/** How far it is along a route from its start to its end. */
export function routeLength(route: readonly THREE.Vector3[]): number {
  return route.reduce(
    (sum, point, index) => sum + (route[index - 1]?.distanceTo(point) ?? 0),
    0,
  );
}

/**
 * Where a walker is once it has walked so far along a route, and the way it
 * faces: along the leg it is on, or the last leg once it has arrived.
 */
export function alongRoute(
  route: readonly THREE.Vector3[],
  walked: number,
): { readonly position: THREE.Vector3; readonly facing: number } {
  let left = walked;
  let facing = 0;
  for (const [index, to] of route.entries()) {
    const from = route[index - 1];
    if (from === undefined) continue;
    const length = from.distanceTo(to);
    facing = facingAngle(from, to);
    if (left < length) {
      return {
        position: new THREE.Vector3().lerpVectors(from, to, left / length),
        facing,
      };
    }
    left -= length;
  }
  return { position: (route.at(-1) ?? new THREE.Vector3()).clone(), facing };
}
