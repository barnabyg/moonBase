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
import { HABITAT_HATCH_OUT } from "./models";

/** Where the Mission Director stands at the end of the walk, out from the Habitat's centre along +x by its airlock's hatch. */
const HATCH_STAND_OUT = HABITAT_HATCH_OUT + 0.8;

/**
 * The way the Mission Director walks from the foot of the Lander's ladder to
 * the airlock hatch of the Habitat at the given position, as the points it
 * turns at in the scene: round the Lander, the Habitat and everything else
 * a Robot walks round, keeping as far clear of them as a Robot does.
 */
export function routeToHatch(
  grounds: Grounds,
  habitat: GroundPosition,
): THREE.Vector3[] {
  const lander = grounds.lander.position;
  // From the scene (z south) back onto the ground (y north).
  const ladderFoot = landerLadderFoot(catalogue.lander.footprintRadiusMetres);
  return routeBetween(
    { x: lander.x + ladderFoot.x, y: lander.y - ladderFoot.z },
    { x: habitat.x + HATCH_STAND_OUT, y: habitat.y },
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
