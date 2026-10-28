import * as THREE from "three";
import { materials, part, roundedBox } from "./materials";
import { createCrateModel } from "./models";

/** How the Robot holds itself, in radians: positive leans and lifts forward. */
export interface RobotPose {
  /** Each leg's swing from the hip; the other leg mirrors it. */
  readonly legSwing: number;
  /** Sitting, with both legs forward from the hip, as when driving a Machine. */
  readonly seated: boolean;
  readonly leftArm: number;
  readonly rightArm: number;
  readonly lean: number;
  readonly carrying: boolean;
}

export interface RobotModel {
  readonly group: THREE.Group;
  pose(pose: RobotPose): void;
}

/** The height of the Robot's hips above its feet. */
const HIP_HEIGHT = 0.86;
const THIGH_LENGTH = 0.42;
const UPPER_ARM_LENGTH = 0.3;

/** A rounded limb segment hanging down from its joint, of the given length. */
export function limb(
  radius: number,
  length: number,
  material: THREE.Material,
): THREE.Mesh {
  return part(
    new THREE.CapsuleGeometry(
      radius,
      Math.max(length - 2 * radius, 0.01),
      4,
      10,
    ),
    material,
    [0, -length / 2, 0],
  );
}

/** A joint that a limb hangs from: turning it swings everything below. */
export function joint(position: [number, number, number]): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(...position);
  return pivot;
}

/**
 * A leg from the hip down: a thigh, a knee that bends, a shin with an
 * armoured plate, and a foot. Returns the hip and knee joints.
 */
function createLeg(side: number) {
  const hip = joint([side * 0.12, HIP_HEIGHT, 0]);
  const knee = joint([0, -THIGH_LENGTH, 0]);
  hip.add(
    part(
      new THREE.SphereGeometry(0.075, 12, 8),
      materials.robotJoint,
      [0, 0, 0],
    ),
    limb(0.078, THIGH_LENGTH - 0.04, materials.robotShell),
    part(
      new THREE.CylinderGeometry(0.083, 0.083, 0.05, 14),
      materials.accent,
      [0, -0.12, 0],
    ),
    knee,
  );
  knee.add(
    part(
      new THREE.SphereGeometry(0.066, 12, 8),
      materials.robotJoint,
      [0, 0, 0],
    ),
    part(
      roundedBox(0.1, 0.09, 0.05, 0.02),
      materials.robotShell,
      [0, 0, 0.055],
    ),
    limb(0.064, 0.36, materials.robotShell),
    part(
      roundedBox(0.1, 0.24, 0.05, 0.02),
      materials.robotShell,
      [0, -0.17, 0.05],
    ),
    part(
      new THREE.SphereGeometry(0.045, 10, 6),
      materials.robotJoint,
      [0, -0.38, 0],
    ),
    // The foot, its sole on the ground when the leg is straight.
    part(roundedBox(0.13, 0.06, 0.25, 0.025), materials.robotJoint, [
      0,
      -(HIP_HEIGHT - THIGH_LENGTH) + 0.03,
      0.04,
    ]),
  );
  return { hip, knee };
}

/**
 * An arm from the shoulder down: an orange shoulder cap, an upper arm, an
 * elbow that bends, a forearm and a three-fingered gripper. Returns the
 * shoulder and elbow joints.
 */
function createArm(side: number) {
  const shoulder = joint([side * 0.31, 0.65, 0]);
  const elbow = joint([0, -UPPER_ARM_LENGTH, 0]);
  const cap = part(
    new THREE.SphereGeometry(0.095, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.accent,
    [side * 0.01, 0.0, 0],
  );
  cap.scale.set(1, 0.8, 1.05);
  shoulder.add(
    part(
      new THREE.SphereGeometry(0.072, 12, 8),
      materials.robotJoint,
      [0, 0, 0],
    ),
    cap,
    limb(0.056, UPPER_ARM_LENGTH - 0.02, materials.robotShell),
    elbow,
  );
  const hand = new THREE.Group();
  hand.position.y = -0.27;
  hand.add(
    part(
      roundedBox(0.075, 0.07, 0.06, 0.018),
      materials.robotJoint,
      [0, -0.02, 0],
    ),
  );
  for (const [x, z] of [
    [-0.022, 0.012],
    [0.022, 0.012],
    [0, -0.024],
  ] as const) {
    hand.add(
      part(roundedBox(0.02, 0.07, 0.022, 0.008), materials.robotJoint, [
        x,
        -0.085,
        z,
      ]),
    );
  }
  elbow.add(
    part(
      new THREE.SphereGeometry(0.052, 10, 8),
      materials.robotJoint,
      [0, 0, 0],
    ),
    limb(0.05, 0.25, materials.robotShell),
    part(
      roundedBox(0.08, 0.15, 0.04, 0.015),
      materials.robotShell,
      [0, -0.13, 0.04],
    ),
    hand,
  );
  return { shoulder, elbow };
}

/**
 * A humanoid Robot about 1.8 m tall, facing along its local +z axis: white
 * armour over dark joints, with orange on its shoulders and thighs so it
 * stands out, a helmet-like head with a visor and a glowing sensor strip,
 * and a power pack on its back with radiator fins and an antenna.
 */
export function createRobotModel(): RobotModel {
  const robot = new THREE.Group();
  robot.name = "Robot";

  const leftLeg = createLeg(-1);
  const rightLeg = createLeg(1);

  // Everything above the hips leans forward as one.
  const upperBody = new THREE.Group();
  upperBody.position.y = HIP_HEIGHT;
  const leftArm = createArm(-1);
  const rightArm = createArm(1);
  const crate = createCrateModel(0.5, 0.35, 0.4);
  crate.position.set(0, 0.275, 0.45);
  upperBody.add(
    // The pelvis, and the flexible waist above it.
    part(
      roundedBox(0.36, 0.15, 0.22, 0.05),
      materials.robotJoint,
      [0, 0.02, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.11, 0.13, 0.16, 16),
      materials.robotJoint,
      [0, 0.15, 0],
    ),
    ...[0.12, 0.18].map((y) =>
      part(
        new THREE.TorusGeometry(0.12, 0.012, 4, 20).rotateX(Math.PI / 2),
        materials.darkMetal,
        [0, y, 0],
      ),
    ),
    // The chest, narrowing to the waist, with a dark panel and a status light.
    part(
      roundedBox(0.36, 0.16, 0.22, 0.05),
      materials.robotShell,
      [0, 0.26, 0],
    ),
    part(
      roundedBox(0.46, 0.36, 0.27, 0.08),
      materials.robotShell,
      [0, 0.47, 0],
    ),
    part(
      roundedBox(0.24, 0.14, 0.02, 0.01),
      materials.robotJoint,
      [0, 0.47, 0.136],
    ),
    part(
      new THREE.SphereGeometry(0.018, 8, 6),
      materials.sensorGlow,
      [0.08, 0.5, 0.148],
    ),
    part(
      new THREE.BoxGeometry(0.47, 0.035, 0.28),
      materials.accent,
      [0, 0.33, 0],
    ),
    // The power pack on its back, with radiator fins and an antenna.
    part(
      roundedBox(0.34, 0.4, 0.14, 0.04),
      materials.robotShell,
      [0, 0.45, -0.19],
    ),
    ...[-0.1, -0.035, 0.035, 0.1].map((x) =>
      part(new THREE.BoxGeometry(0.02, 0.3, 0.05), materials.radiator, [
        x,
        0.45,
        -0.28,
      ]),
    ),
    part(
      new THREE.CylinderGeometry(0.008, 0.008, 0.32, 4),
      materials.darkMetal,
      [-0.13, 0.78, -0.22],
    ),
    part(
      new THREE.SphereGeometry(0.018, 8, 6),
      materials.accent,
      [-0.13, 0.94, -0.22],
    ),
    leftArm.shoulder,
    rightArm.shoulder,
    // The neck and head.
    part(
      new THREE.CylinderGeometry(0.045, 0.055, 0.1, 10),
      materials.robotJoint,
      [0, 0.7, 0],
    ),
    createHead(),
    crate,
  );
  robot.add(leftLeg.hip, rightLeg.hip, upperBody);

  return {
    group: robot,
    pose(pose) {
      // Three.js turns a positive x rotation backwards, so negate to lift forwards.
      leftLeg.hip.rotation.x = pose.seated ? -Math.PI / 2 : -pose.legSwing;
      rightLeg.hip.rotation.x = pose.seated ? -Math.PI / 2 : pose.legSwing;
      // A leg bends at the knee as it trails behind, lifting its foot.
      leftLeg.knee.rotation.x = pose.seated ? 0.25 : kneeBend(pose.legSwing);
      rightLeg.knee.rotation.x = pose.seated ? 0.25 : kneeBend(-pose.legSwing);
      leftArm.shoulder.rotation.x = -pose.leftArm;
      rightArm.shoulder.rotation.x = -pose.rightArm;
      // Elbows bend more to hold a crate, and as the arm swings forward.
      leftArm.elbow.rotation.x = -elbowBend(pose.leftArm, pose.carrying);
      rightArm.elbow.rotation.x = -elbowBend(pose.rightArm, pose.carrying);
      upperBody.rotation.x = pose.lean;
      crate.visible = pose.carrying;
    },
  };
}

function kneeBend(forwardSwing: number): number {
  return 0.08 + Math.max(-forwardSwing, 0) * 1.3;
}

function elbowBend(armLift: number, carrying: boolean): number {
  if (carrying) return 0.45;
  return 0.2 + Math.max(armLift, 0) * 0.5;
}

/** A rounded head like a helmet, with a wraparound visor, a sensor strip and two lamps. */
function createHead(): THREE.Group {
  const head = new THREE.Group();
  head.position.y = 0.86;
  const shell = part(
    new THREE.SphereGeometry(0.13, 20, 14),
    materials.robotShell,
    [0, 0, 0],
  );
  shell.scale.set(0.95, 0.92, 1.05);
  const visor = part(
    new THREE.SphereGeometry(
      0.133,
      24,
      10,
      Math.PI * 0.18,
      Math.PI * 0.64,
      Math.PI * 0.36,
      Math.PI * 0.26,
    ),
    materials.visor,
    [0, 0, 0],
  );
  visor.scale.set(0.97, 0.94, 1.07);
  head.add(
    shell,
    visor,
    part(
      new THREE.BoxGeometry(0.12, 0.012, 0.012),
      materials.sensorGlow,
      [0, 0.005, 0.138],
    ),
    // A crest along the top, in the accent colour.
    part(
      roundedBox(0.035, 0.03, 0.2, 0.012),
      materials.accent,
      [0, 0.12, -0.01],
    ),
  );
  for (const side of [-1, 1]) {
    head.add(
      part(
        new THREE.CylinderGeometry(0.04, 0.04, 0.04, 12).rotateZ(Math.PI / 2),
        materials.robotJoint,
        [side * 0.125, -0.005, -0.01],
      ),
      part(new THREE.SphereGeometry(0.014, 8, 6), materials.lamp, [
        side * 0.08,
        0.075,
        0.1,
      ]),
    );
  }
  return head;
}
