import * as THREE from "three";
import {
  obstaclesFor,
  routeBetween,
  type GroundPosition,
  type Grounds,
} from "../simulation";
import { facingAngle, toScene } from "./interpolation";

/**
 * The way the Mission Director walks from the foot of the Lander's ladder to
 * a Habitat's airlock hatch, as the points it turns at in the scene: round
 * the Lander, the Habitat and everything else a Robot walks round, keeping
 * as far clear of them as a Robot does.
 */
export function routeToHatch(
  grounds: Grounds,
  ladderFoot: GroundPosition,
  hatch: GroundPosition,
): THREE.Vector3[] {
  return routeBetween(ladderFoot, hatch, obstaclesFor(grounds)).map((point) =>
    toScene(point),
  );
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
