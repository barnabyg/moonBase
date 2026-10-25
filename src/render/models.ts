import * as THREE from "three";

// Low-poly models built in code, with physically based materials (ADR-0004).
// Sizes are in metres, and each model stands on the ground at its origin.

const materials = {
  foil: new THREE.MeshStandardMaterial({
    color: 0xc8a13a,
    metalness: 0.7,
    roughness: 0.35,
  }),
  hull: new THREE.MeshStandardMaterial({
    color: 0xd9dbde,
    metalness: 0.2,
    roughness: 0.6,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x3a3d42,
    metalness: 0.8,
    roughness: 0.4,
  }),
  robotShell: new THREE.MeshStandardMaterial({
    color: 0xeef0f2,
    metalness: 0.1,
    roughness: 0.5,
  }),
  robotJoint: new THREE.MeshStandardMaterial({
    color: 0x2b2e33,
    metalness: 0.5,
    roughness: 0.6,
  }),
  visor: new THREE.MeshStandardMaterial({
    color: 0x1b2a3a,
    metalness: 0.9,
    roughness: 0.15,
  }),
  solarCell: new THREE.MeshStandardMaterial({
    color: 0x1d2b4f,
    metalness: 0.6,
    roughness: 0.25,
    side: THREE.DoubleSide,
  }),
  crate: new THREE.MeshStandardMaterial({
    color: 0xb9b2a2,
    metalness: 0.1,
    roughness: 0.8,
  }),
  statusOff: new THREE.MeshStandardMaterial({ color: 0x222222 }),
  statusTesting: new THREE.MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xffa000,
  }),
  statusOn: new THREE.MeshStandardMaterial({
    color: 0x40ff70,
    emissive: 0x20d050,
  }),
};

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The Lander, with its four legs reaching out to its footprint radius. */
export function createLanderModel(footprintRadius: number): THREE.Group {
  const lander = new THREE.Group();
  lander.name = "Lander";

  const descentStageHeight = 1.8;
  const descentStageBase = 1.6;
  lander.add(
    part(
      new THREE.CylinderGeometry(2.2, 2.2, descentStageHeight, 8),
      materials.foil,
      [0, descentStageBase + descentStageHeight / 2, 0],
    ),
    part(new THREE.CylinderGeometry(1.5, 1.9, 2.4, 6), materials.hull, [
      0,
      descentStageBase + descentStageHeight + 1.2,
      0,
    ]),
    part(new THREE.ConeGeometry(0.9, 1.3, 12, 1, true), materials.darkMetal, [
      0,
      descentStageBase - 0.4,
      0,
    ]),
    part(
      new THREE.BoxGeometry(0.8, 0.5, 0.6),
      materials.darkMetal,
      [0, 5.4, 1.45],
    ),
  );

  const legTop = new THREE.Vector3(1.9, descentStageBase + 0.6, 0);
  const foot = new THREE.Vector3(footprintRadius - 0.35, 0.12, 0);
  const legLength = legTop.distanceTo(foot);
  for (let index = 0; index < 4; index++) {
    const leg = new THREE.Group();
    leg.rotation.y = (index * Math.PI) / 2 + Math.PI / 4;
    const strut = part(
      new THREE.CylinderGeometry(0.09, 0.09, legLength, 6),
      materials.darkMetal,
      [(legTop.x + foot.x) / 2, (legTop.y + foot.y) / 2, 0],
    );
    strut.rotation.z = Math.atan2(legTop.x - foot.x, legTop.y - foot.y);
    leg.add(
      strut,
      part(
        new THREE.CylinderGeometry(0.35, 0.4, 0.12, 8),
        materials.darkMetal,
        [foot.x, 0.06, 0],
      ),
    );
    lander.add(leg);
  }
  return lander;
}

/** How the Robot holds itself, in radians: positive leans and lifts forward. */
export interface RobotPose {
  /** Each leg's swing from the hip; the other leg mirrors it. */
  readonly legSwing: number;
  readonly leftArm: number;
  readonly rightArm: number;
  readonly lean: number;
  readonly carrying: boolean;
}

export interface RobotModel {
  readonly group: THREE.Group;
  pose(pose: RobotPose): void;
}

/** A humanoid Robot about 1.8 m tall, facing along its local +z axis. */
export function createRobotModel(): RobotModel {
  const robot = new THREE.Group();
  robot.name = "Robot";

  const limb = (width: number, length: number) =>
    new THREE.BoxGeometry(width, length, width);
  /** A limb hanging from a joint, so that turning the joint swings it. */
  const jointed = (
    geometry: THREE.BufferGeometry,
    joint: [number, number, number],
    length: number,
  ): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(...joint);
    pivot.add(part(geometry, materials.robotShell, [0, -length / 2, 0]));
    return pivot;
  };

  const hipHeight = 0.86;
  const leftLeg = jointed(limb(0.16, 0.85), [-0.12, hipHeight, 0], 0.85);
  const rightLeg = jointed(limb(0.16, 0.85), [0.12, hipHeight, 0], 0.85);

  // Everything above the hips leans forward as one.
  const upperBody = new THREE.Group();
  upperBody.position.y = hipHeight;
  const leftArm = jointed(limb(0.12, 0.65), [-0.31, 0.65, 0], 0.65);
  const rightArm = jointed(limb(0.12, 0.65), [0.31, 0.65, 0], 0.65);
  const crate = part(
    new THREE.BoxGeometry(0.5, 0.35, 0.4),
    materials.crate,
    [0, 0.45, 0.45],
  );
  upperBody.add(
    part(
      new THREE.BoxGeometry(0.4, 0.14, 0.22),
      materials.robotJoint,
      [0, 0.04, 0],
    ),
    part(
      new THREE.BoxGeometry(0.46, 0.55, 0.26),
      materials.robotShell,
      [0, 0.39, 0],
    ),
    leftArm,
    rightArm,
    part(
      new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6),
      materials.robotJoint,
      [0, 0.7, 0],
    ),
    part(
      new THREE.BoxGeometry(0.24, 0.22, 0.24),
      materials.robotShell,
      [0, 0.84, 0],
    ),
    part(
      new THREE.BoxGeometry(0.2, 0.08, 0.02),
      materials.visor,
      [0, 0.86, 0.125],
    ),
    crate,
  );
  robot.add(leftLeg, rightLeg, upperBody);

  return {
    group: robot,
    pose(pose) {
      // Three.js turns a positive x rotation backwards, so negate to lift forwards.
      leftLeg.rotation.x = -pose.legSwing;
      rightLeg.rotation.x = pose.legSwing;
      leftArm.rotation.x = -pose.leftArm;
      rightArm.rotation.x = -pose.rightArm;
      upperBody.rotation.x = pose.lean;
      crate.visible = pose.carrying;
    },
  };
}

/**
 * A solar array for the lunar south pole: the sun stays near the horizon, so
 * the panel stands upright on a mast and turns to face it. During Assembly
 * the mast rises and the folded panel opens out up it.
 */
export interface SolarArrayModel {
  readonly group: THREE.Group;
  /** From 0, packed on its base, to 1, fully unfolded. */
  setUnfolded(fraction: number): void;
  /** Turns the panel to face the given direction on the ground (radians, as for Object3D.rotation.y). */
  setFacing(angle: number): void;
  /** The light on the base: off, amber while Commissioning, green once commissioned. */
  setStatusLight(state: "off" | "testing" | "on"): void;
}

const PANEL_WIDTH = 2.6;
const PANEL_HEIGHT = 4.2;
const PANEL_FOLDS = 6;
const MAST_HEIGHT = 1.2;

export function createSolarArrayModel(): SolarArrayModel {
  const array = new THREE.Group();
  array.name = "Solar array";

  const statusLightMaterial = materials.statusOff.clone();
  const statusLight = part(
    new THREE.SphereGeometry(0.09, 8, 6),
    statusLightMaterial,
    [0.55, 0.42, 0.55],
  );
  array.add(
    part(
      new THREE.CylinderGeometry(0.9, 1.1, 0.3, 8),
      materials.darkMetal,
      [0, 0.15, 0],
    ),
    statusLight,
  );

  // The part that turns to face the sun.
  const head = new THREE.Group();
  head.position.y = 0.3;
  array.add(head);
  const mast = part(
    new THREE.CylinderGeometry(0.08, 0.1, 1, 8),
    materials.darkMetal,
    [0, 0.5, 0],
  );
  head.add(mast);

  // The panel is a strip of cells folded like a fan. Each fold is hinged to
  // the one below, and the whole strip rides up on top of the mast.
  const panel = new THREE.Group();
  head.add(panel);
  const foldHeight = PANEL_HEIGHT / PANEL_FOLDS;
  const folds: THREE.Group[] = [];
  let parent: THREE.Object3D = panel;
  for (let index = 0; index < PANEL_FOLDS; index++) {
    const hinge = new THREE.Group();
    hinge.position.y = index === 0 ? 0 : foldHeight;
    hinge.add(
      part(
        new THREE.BoxGeometry(PANEL_WIDTH, foldHeight, 0.04),
        materials.solarCell,
        [0, foldHeight / 2, 0],
      ),
    );
    parent.add(hinge);
    folds.push(hinge);
    parent = hinge;
  }

  return {
    group: array,
    setUnfolded(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      // First the mast rises, then the panel unfolds up it.
      const mastF = THREE.MathUtils.smoothstep(f, 0, 0.35);
      const panelF = THREE.MathUtils.smoothstep(f, 0.3, 1);
      const mastHeight = 0.2 + mastF * MAST_HEIGHT;
      mast.scale.y = mastHeight;
      mast.position.y = mastHeight / 2;
      panel.position.y = mastHeight;
      for (const [index, fold] of folds.entries()) {
        if (index === 0) {
          fold.rotation.x = 0;
          continue;
        }
        // Alternate folds bend opposite ways, like a concertina.
        const folded = index % 2 === 1 ? Math.PI * 0.97 : -Math.PI * 0.97;
        fold.rotation.x = folded * (1 - panelF);
      }
    },
    setFacing(angle) {
      head.rotation.y = angle;
    },
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
    },
  };
}

/** A packing crate holding one Component, standing on the ground. */
export function createCrateModel(): THREE.Mesh {
  const crate = part(
    new THREE.BoxGeometry(0.6, 0.4, 0.5),
    materials.crate,
    [0, 0.2, 0],
  );
  crate.name = "Component crate";
  return crate;
}
