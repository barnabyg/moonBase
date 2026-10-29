import * as THREE from "three";
import type { Frame } from "./interpolation";
import { materials, part, roundedBox } from "./materials";
import { alongRoute, routeLength, routeToHatch } from "./mission-director-walk";
import { joint, limb } from "./robot-model";

/** How fast the Mission Director walks across to their new Habitat, in metres per real second. */
const WALK_METRES_PER_SECOND = 2.5;
/** The shortest and longest the walk takes, in real seconds, however far the Habitat is. */
const SHORTEST_WALK_SECONDS = 3;
const LONGEST_WALK_SECONDS = 10;
/** How far one stride carries the Mission Director, in metres. */
const STRIDE_METRES = 1.3;

interface Walk {
  readonly habitatId: string;
  /** The points the walk turns at, from the foot of the Lander's ladder to the hatch. */
  readonly route: readonly THREE.Vector3[];
  readonly length: number;
  readonly startedAt: number;
  readonly seconds: number;
}

/**
 * Shows the Mission Director moving into a Habitat: when the move is seen
 * to happen, a suited figure climbs down from the Lander and walks across
 * to the Habitat's airlock, round everything a Robot would walk round. The
 * move itself happens at once; this is only how it looks.
 */
export function createMissionDirectorView(scene: THREE.Scene) {
  const figure = createAstronautModel();
  figure.group.visible = false;
  scene.add(figure.group);
  let lastResidence: string | undefined;
  let walk: Walk | undefined;

  return {
    /** The Habitat the Mission Director is still on their way to, if any. */
    get walkingTo(): string | undefined {
      return walk?.habitatId;
    },
    /** Forgets any walk, for a Campaign loaded in place of the last. */
    clear(): void {
      lastResidence = undefined;
      walk = undefined;
      figure.group.visible = false;
    },
    update(frame: Frame, realSeconds: number): void {
      const { missionDirector, structures } = frame.current;
      const residence =
        missionDirector.residence === "habitat"
          ? missionDirector.habitatId
          : "lander";
      // Only a move seen happening, not one already made in a loaded Campaign.
      if (
        lastResidence === "lander" &&
        missionDirector.residence === "habitat"
      ) {
        const habitat = structures.find(
          (structure) => structure.id === missionDirector.habitatId,
        );
        if (habitat !== undefined) {
          const route = routeToHatch(frame.current, habitat.position);
          const length = routeLength(route);
          walk = {
            habitatId: habitat.id,
            route,
            length,
            startedAt: realSeconds,
            seconds: THREE.MathUtils.clamp(
              length / WALK_METRES_PER_SECOND,
              SHORTEST_WALK_SECONDS,
              LONGEST_WALK_SECONDS,
            ),
          };
        }
      }
      lastResidence = residence;

      const progress =
        walk === undefined ? 1 : (realSeconds - walk.startedAt) / walk.seconds;
      if (walk === undefined || progress >= 1) {
        walk = undefined;
        figure.group.visible = false;
        return;
      }
      figure.group.visible = true;
      const walked = walk.length * progress;
      const { position, facing } = alongRoute(walk.route, walked);
      figure.group.position.copy(position);
      figure.group.rotation.y = facing;
      figure.walk(Math.sin((walked / STRIDE_METRES) * Math.PI * 2) * 0.4);
    },
  };
}

export interface AstronautModel {
  readonly group: THREE.Group;
  /** Swings the legs and arms through a walking stride; 0 stands still. */
  walk(swing: number): void;
}

/**
 * The Mission Director in a white pressure suit, facing along its local +z
 * axis: a helmet with a gold sun visor, a life-support backpack, and an
 * orange stripe on each arm so they can be told from the Robot.
 */
export function createAstronautModel(): AstronautModel {
  const astronaut = new THREE.Group();
  astronaut.name = "Mission Director";
  const suit = new THREE.MeshStandardMaterial({
    color: 0xf4f2ec,
    roughness: 0.8,
    metalness: 0,
  });
  const boot = new THREE.MeshStandardMaterial({
    color: 0x6f7378,
    roughness: 0.7,
    metalness: 0.2,
  });
  const hipHeight = 0.88;
  const legs = [-1, 1].map((side) => {
    const hip = joint([side * 0.12, hipHeight, 0]);
    hip.add(
      limb(0.1, hipHeight - 0.08, suit),
      part(roundedBox(0.15, 0.1, 0.28, 0.04), boot, [
        0,
        -hipHeight + 0.05,
        0.04,
      ]),
    );
    return hip;
  });
  const arms = [-1, 1].map((side) => {
    const shoulder = joint([side * 0.3, 1.42, 0]);
    shoulder.add(
      limb(0.085, 0.6, suit),
      part(
        new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12),
        materials.accent,
        [0, -0.18, 0],
      ),
      part(new THREE.SphereGeometry(0.07, 10, 8), boot, [0, -0.62, 0]),
    );
    return shoulder;
  });
  astronaut.add(
    ...legs,
    ...arms,
    part(roundedBox(0.4, 0.22, 0.28, 0.08), suit, [0, 0.95, 0]),
    part(roundedBox(0.52, 0.5, 0.34, 0.12), suit, [0, 1.28, 0]),
    // The display and control unit on the chest.
    part(roundedBox(0.22, 0.12, 0.08, 0.02), materials.hull, [0, 1.2, 0.2]),
    // The life-support backpack.
    part(roundedBox(0.46, 0.6, 0.24, 0.06), suit, [0, 1.3, -0.28]),
    part(new THREE.SphereGeometry(0.17, 18, 14), suit, [0, 1.66, 0]),
  );
  const visor = part(
    new THREE.SphereGeometry(
      0.172,
      20,
      12,
      Math.PI * 0.15,
      Math.PI * 0.7,
      Math.PI * 0.25,
      Math.PI * 0.4,
    ),
    materials.goldVisor,
    [0, 1.66, 0],
  );
  astronaut.add(visor);
  return {
    group: astronaut,
    walk(swing) {
      const [left, right] = legs;
      const [leftArm, rightArm] = arms;
      if (left !== undefined) left.rotation.x = -swing;
      if (right !== undefined) right.rotation.x = swing;
      if (leftArm !== undefined) leftArm.rotation.x = swing * 0.7;
      if (rightArm !== undefined) rightArm.rotation.x = -swing * 0.7;
    },
  };
}
