import * as THREE from "three";
import type { GroundPosition, Snapshot } from "../simulation";

/**
 * What the renderer draws in a frame: the Campaign's latest state, the state
 * one game-minute earlier, and how far real time has run between them. The
 * renderer draws the in-between, so that movement looks smooth whatever the
 * game speed.
 */
export interface Frame {
  readonly current: Snapshot;
  readonly previous: Snapshot | undefined;
  /** From 0, showing the previous state, to 1, showing the current one. */
  readonly tickProgress: number;
}

/** Maps a simulation ground position (x east, y north) onto the Three.js scene (x east, z south). */
export function toScene(position: GroundPosition, height = 0): THREE.Vector3 {
  return new THREE.Vector3(position.x, height, -position.y);
}

/** The angle for Object3D.rotation.y that turns a model's +z axis to face from one point to another. */
export function facingAngle(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function between(
  previous: GroundPosition | undefined,
  current: GroundPosition,
  progress: number,
): GroundPosition {
  if (previous === undefined) return current;
  return {
    x: THREE.MathUtils.lerp(previous.x, current.x, progress),
    y: THREE.MathUtils.lerp(previous.y, current.y, progress),
  };
}
