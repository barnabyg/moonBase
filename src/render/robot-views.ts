import * as THREE from "three";
import type {
  GroundPosition,
  RobotActivity,
  RobotSnapshot,
} from "../simulation";
import { between, facingAngle, toScene, type Frame } from "./interpolation";
import { MACHINE_SEAT_HEIGHT } from "./models";
import {
  createRobotModel,
  type RobotModel,
  type RobotPose,
} from "./robot-model";

/** The distance the Robot covers in one full walking stride, in metres. */
const STRIDE_METRES = 1.4;
/** How fast working movements repeat, in cycles per real second. */
const WORK_CYCLES_PER_SECOND = 1.2;
/** The height of the Robot's hips above its feet, where it bends to sit. */
const HIP_HEIGHT = 0.86;

interface RobotView {
  readonly model: RobotModel;
  heading: number;
  strideAngle: number;
  lastPosition: THREE.Vector3 | undefined;
}

/**
 * Draws each Robot where the simulation says it is, interpolated between
 * ticks, and animated for what it is doing.
 */
export function createRobotViews(scene: THREE.Scene) {
  const views = new Map<string, RobotView>();

  return {
    /** Forgets every Robot drawn, for a Campaign loaded in place of the last. */
    clear(): void {
      for (const view of views.values()) scene.remove(view.model.group);
      views.clear();
    },
    update(frame: Frame, realSeconds: number): void {
      for (const robot of frame.current.robots) {
        let view = views.get(robot.id);
        if (view === undefined) {
          const model = createRobotModel();
          scene.add(model.group);
          view = { model, heading: 0, strideAngle: 0, lastPosition: undefined };
          views.set(robot.id, view);
        }
        const before = frame.previous?.robots.find(
          (other) => other.id === robot.id,
        );
        const position = toScene(
          between(before?.position, robot.position, frame.tickProgress),
        );
        const moved =
          view.lastPosition === undefined
            ? 0
            : position.distanceTo(view.lastPosition);
        if (moved > 1e-6) {
          view.heading = facingAngle(view.lastPosition ?? position, position);
          if (onFoot(robot)) {
            view.strideAngle += (moved / STRIDE_METRES) * Math.PI * 2;
          }
        } else {
          const target = workTarget(frame, robot);
          if (target !== undefined)
            view.heading = facingAngle(position, target);
        }
        view.lastPosition = position.clone();
        // Away on an Expedition, it is off the map and out of sight.
        view.model.group.visible = isOnMap(frame, robot.position);
        view.model.group.position.copy(position);
        // Aboard a Machine, the Robot sits on its deck.
        if (aboardMachine(robot)) {
          view.model.group.position.y = MACHINE_SEAT_HEIGHT - HIP_HEIGHT;
        }
        view.model.group.rotation.y = view.heading;
        view.model.pose(
          poseFor(
            robot,
            view.strideAngle,
            realSeconds * WORK_CYCLES_PER_SECOND,
          ),
        );
      }
    },
  };
}

/** Whether a position is on the base map, rather than off it on an Expedition. */
export function isOnMap(frame: Frame, position: GroundPosition): boolean {
  const { map } = frame.current;
  return (
    Math.abs(position.x) <= map.widthMetres / 2 &&
    Math.abs(position.y) <= map.depthMetres / 2
  );
}

function onFoot(robot: RobotSnapshot): boolean {
  return (
    robot.activity.kind === "walking" ||
    robot.activity.kind === "walking-to-repair" ||
    robot.activity.kind === "walking-to-stockpile" ||
    robot.activity.kind === "laying-cable"
  );
}

function aboardMachine(robot: RobotSnapshot): boolean {
  return (
    robot.activity.kind === "driving-machine" ||
    robot.activity.kind === "driving-rover"
  );
}

/**
 * What the Robot faces while it works: the stockpile when loading or
 * unloading there, the Lander when loading or unloading it or climbing
 * down from it, otherwise the site.
 */
function workTarget(
  frame: Frame,
  robot: RobotSnapshot,
): THREE.Vector3 | undefined {
  const { activity } = robot;
  // Aboard a Machine, it faces the way the Machine does.
  if (
    activity.kind === "idle" ||
    activity.kind === "walking" ||
    aboardMachine(robot)
  ) {
    return undefined;
  }
  if (
    activity.kind === "loading-components" ||
    activity.kind === "loading-spare-components" ||
    activity.kind === "returning-components" ||
    activity.kind === "unloading-cargo" ||
    activity.kind === "loading-exports"
  ) {
    return toScene(frame.current.stockpile.position);
  }
  if (
    activity.kind === "putting-exports-aboard" ||
    activity.kind === "climbing-down"
  ) {
    return toScene(frame.current.lander.position);
  }
  if ("machineId" in activity) {
    const machine = frame.current.machines.find(
      (candidate) => candidate.id === activity.machineId,
    );
    return machine === undefined ? undefined : toScene(machine.position);
  }
  if ("roverId" in activity) {
    const rover = frame.current.rovers.find(
      (candidate) => candidate.id === activity.roverId,
    );
    return rover === undefined ? undefined : toScene(rover.position);
  }
  // Repairing itself, it looks down at its own work.
  if (activity.kind === "walking-to-repair" || !("structureId" in activity)) {
    return undefined;
  }
  if (activity.kind === "loading-cargo") {
    return toScene(frame.current.lander.position);
  }
  const site =
    frame.current.constructions.find(
      (construction) => construction.id === activity.structureId,
    ) ??
    frame.current.structures.find(
      (structure) => structure.id === activity.structureId,
    ) ??
    frame.current.dismantlings.find(
      (dismantling) => dismantling.id === activity.structureId,
    );
  return site === undefined ? undefined : toScene(site.position);
}

function poseFor(
  robot: RobotSnapshot,
  strideAngle: number,
  workCycles: number,
): RobotPose {
  const carrying =
    robot.carrying.length > 0 || robot.carryingExports.length > 0;
  const work = Math.sin(workCycles * Math.PI * 2);
  const poses: Record<RobotActivity["kind"], () => RobotPose> = {
    idle: () => still(carrying),
    walking: () => {
      const swing = Math.sin(strideAngle) * 0.45;
      return {
        legSwing: swing,
        leftArm: carrying ? 1.2 : swing * 0.8,
        rightArm: carrying ? 1.2 : -swing * 0.8,
        lean: 0.05,
        seated: false,
        carrying,
      };
    },
    // Walking slowly, paying the cable out from the drum in its hands.
    "laying-cable": () => {
      const swing = Math.sin(strideAngle) * 0.3;
      return {
        legSwing: swing,
        seated: false,
        leftArm: 0.7 + work * 0.1,
        rightArm: 0.7 - work * 0.1,
        lean: 0.2,
        carrying: true,
      };
    },
    // Sitting at the controls, steering.
    "driving-machine": () => ({
      legSwing: 0,
      seated: true,
      leftArm: 0.9 + work * 0.1,
      rightArm: 0.9 - work * 0.1,
      lean: 0.1,
      carrying,
    }),
    // Sitting at the Rover's controls, steering.
    "driving-rover": () => ({
      legSwing: 0,
      seated: true,
      leftArm: 0.9 + work * 0.1,
      rightArm: 0.9 - work * 0.1,
      lean: 0.1,
      carrying,
    }),
    // Reaching up to the Machine's controls to programme it and set it going.
    "activating-machine": () => ({
      legSwing: 0,
      seated: false,
      leftArm: 0.3,
      rightArm: 1.6 + work * 0.15,
      lean: 0.1,
      carrying,
    }),
    // Lifting crates off the stockpile, and down at the site.
    "loading-components": () => lifting(work, carrying),
    "unloading-components": () => lifting(work, carrying),
    // Reaching up to open out the panel.
    assembling: () => ({
      legSwing: 0,
      leftArm: 2.2 + work * 0.4,
      rightArm: 2.2 - work * 0.4,
      lean: -0.05,
      seated: false,
      carrying,
    }),
    // Reaching up to unbolt and fold it away.
    dismantling: () => ({
      legSwing: 0,
      leftArm: 2.0 + work * 0.3,
      rightArm: 2.0 - work * 0.3,
      lean: 0,
      seated: false,
      carrying,
    }),
    // Walking, at whatever pace its Condition allows, to repair itself.
    "walking-to-repair": () => {
      const swing = Math.sin(strideAngle) * 0.35;
      return {
        legSwing: swing,
        leftArm: carrying ? 1.2 : swing * 0.6,
        rightArm: carrying ? 1.2 : -swing * 0.6,
        lean: 0.12,
        seated: false,
        carrying,
      };
    },
    // Lifting the spare Components for its own repair off the stockpile.
    "loading-spare-components": () => lifting(work, carrying),
    // Kneeling to work on its own leg with both hands.
    "repairing-itself": () => ({
      legSwing: 0.4,
      leftArm: 0.9 + work * 0.2,
      rightArm: 0.9 - work * 0.2,
      lean: 0.45,
      seated: false,
      carrying,
    }),
    // Lifting the recovered crates back onto the stockpile.
    "returning-components": () => lifting(work, carrying),
    // Away beyond the base, out of sight.
    "on-expedition": () => still(carrying),
    // Lifting what an Expedition brought back off the Rover.
    "unloading-expedition": () => lifting(work, carrying),
    // Lifting the Lander's cargo down, and onto the stockpile.
    "loading-cargo": () => lifting(work, carrying),
    "unloading-cargo": () => lifting(work, carrying),
    // Facing the Lander's ladder, reaching up a rung with one hand, then
    // the other, as it climbs down.
    "climbing-down": () => ({
      legSwing: work * 0.3,
      leftArm: 2.4 + work * 0.3,
      rightArm: 2.4 - work * 0.3,
      lean: -0.05,
      seated: false,
      carrying,
    }),
    // Walking from the Lander to the stockpile, as it arrives from Earth.
    "walking-to-stockpile": () => {
      const swing = Math.sin(strideAngle) * 0.45;
      return {
        legSwing: swing,
        leftArm: swing * 0.8,
        rightArm: -swing * 0.8,
        lean: 0.05,
        seated: false,
        carrying,
      };
    },
    // Lifting the Exports off the stockpile, and up into the Lander.
    "loading-exports": () => lifting(work, carrying),
    "putting-exports-aboard": () => lifting(work, carrying),
    // Bent over the Structure, working at it with both hands.
    maintaining: () => ({
      legSwing: 0,
      leftArm: 1.4 + work * 0.25,
      rightArm: 1.4 - work * 0.25,
      lean: 0.3,
      seated: false,
      carrying,
    }),
    // Sweeping the Dust off the panel with a brush, side to side.
    cleaning: () => ({
      legSwing: 0,
      leftArm: 0.4,
      rightArm: 1.5 + work * 0.6,
      lean: 0.15,
      seated: false,
      carrying,
    }),
    // Holding a test lead to the array and watching it.
    commissioning: () => ({
      legSwing: 0,
      leftArm: 0.1,
      rightArm: 1.3 + work * 0.08,
      lean: 0.1,
      seated: false,
      carrying,
    }),
  };
  return poses[robot.activity.kind]();
}

function still(carrying: boolean): RobotPose {
  return {
    legSwing: 0,
    leftArm: carrying ? 1.2 : 0,
    rightArm: carrying ? 1.2 : 0,
    lean: 0,
    seated: false,
    carrying,
  };
}

function lifting(work: number, carrying: boolean): RobotPose {
  return {
    legSwing: 0.05,
    leftArm: 1.1 + work * 0.5,
    rightArm: 1.1 + work * 0.5,
    lean: 0.25 + work * 0.15,
    seated: false,
    carrying,
  };
}
