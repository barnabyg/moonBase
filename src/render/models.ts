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
  machinePaint: new THREE.MeshStandardMaterial({
    color: 0xd9a520,
    metalness: 0.3,
    roughness: 0.55,
  }),
  track: new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    metalness: 0.4,
    roughness: 0.9,
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
      leftLeg.rotation.x = pose.seated ? -Math.PI / 2 : -pose.legSwing;
      rightLeg.rotation.x = pose.seated ? -Math.PI / 2 : pose.legSwing;
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

/** The parts of a Structure the Construction views animate, whatever its type. */
export interface StructureModel {
  readonly group: THREE.Group;
  /** From 0, nothing assembled, to 1, complete. */
  setAssembled(fraction: number): void;
  /** Turns any sun-tracking part to face the given direction (radians, as for Object3D.rotation.y). */
  setFacing(angle: number): void;
  /** The light on the base: off, amber while Commissioning, green once commissioned and powered. */
  setStatusLight(state: "off" | "testing" | "on"): void;
  /** Shows how full any storage is, from 0 to 1. */
  setCharge(fraction: number): void;
  /** Switches any light on or off. */
  setLit(on: boolean): void;
}

/** The model for a type of Structure from the data catalogue. */
export function createStructureModel(structureTypeId: string): StructureModel {
  if (structureTypeId === "battery-bank") return createBatteryBankModel();
  if (structureTypeId === "light-mast") return createLightMastModel();
  const array = createSolarArrayModel();
  return {
    group: array.group,
    setAssembled: (fraction) => {
      array.setUnfolded(fraction);
    },
    setFacing: (angle) => {
      array.setFacing(angle);
    },
    setStatusLight: (state) => {
      array.setStatusLight(state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}

/** The height of a Light Mast's light above the ground. */
export const LIGHT_MAST_HEIGHT = 6;
/** The share of Assembly spent raising the pole, before the light goes on top. */
const POLE_SHARE = 0.7;

/**
 * A Light Mast: a tall pole on a weighted base, with a bar of lights on top
 * that glow while they are on. During Assembly the pole rises and then the
 * light bar goes on top.
 */
function createLightMastModel(): StructureModel {
  const mast = new THREE.Group();
  mast.name = "Light mast";

  const statusLightMaterial = materials.statusOff.clone();
  mast.add(
    part(
      new THREE.CylinderGeometry(0.55, 0.65, 0.25, 8),
      materials.darkMetal,
      [0, 0.125, 0],
    ),
    part(
      new THREE.SphereGeometry(0.07, 8, 6),
      statusLightMaterial,
      [0.45, 0.3, 0.3],
    ),
  );

  const poleLength = LIGHT_MAST_HEIGHT - 0.25;
  const pole = part(
    new THREE.CylinderGeometry(0.06, 0.09, 1, 8),
    materials.hull,
    [0, 0, 0],
  );
  mast.add(pole);

  // The bar of lights faces every way, so the light falls all round.
  const lightMaterial = materials.statusOff.clone();
  const head = new THREE.Group();
  head.position.y = LIGHT_MAST_HEIGHT;
  head.add(
    part(
      new THREE.BoxGeometry(1.2, 0.12, 0.12),
      materials.darkMetal,
      [0, 0, 0],
    ),
    ...[-0.45, 0.45].map((x) =>
      part(new THREE.BoxGeometry(0.32, 0.22, 0.32), lightMaterial, [
        x,
        -0.1,
        0,
      ]),
    ),
  );
  mast.add(head);

  return {
    group: mast,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / POLE_SHARE, 1), 0.01);
      pole.scale.y = poleLength * raised;
      pole.position.y = 0.25 + (poleLength * raised) / 2;
      head.visible = f > POLE_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
    },
    setCharge: () => undefined,
    setLit(on) {
      lightMaterial.color.set(on ? 0xfff4dc : 0x222222);
      lightMaterial.emissive.set(on ? 0xfff0d0 : 0x000000);
    },
  };
}

const BATTERY_MODULES = 3;
const CHARGE_SEGMENTS = 5;
/** The share of Assembly spent sliding the modules in, before the cabinet closes. */
const MODULES_SHARE = 0.75;

/**
 * A battery bank: an insulated cabinet on a plinth. During Assembly its
 * modules are slid in one by one and then the cabinet closes over them; a row
 * of lights on the front shows how full it is.
 */
function createBatteryBankModel(): StructureModel {
  const bank = new THREE.Group();
  bank.name = "Battery bank";

  const statusLightMaterial = materials.statusOff.clone();
  bank.add(
    part(
      new THREE.BoxGeometry(2.4, 0.2, 1.6),
      materials.darkMetal,
      [0, 0.1, 0],
    ),
    part(
      new THREE.SphereGeometry(0.08, 8, 6),
      statusLightMaterial,
      [1.0, 0.28, 0.7],
    ),
  );

  const modules = Array.from({ length: BATTERY_MODULES }, (_, index) => {
    const module = part(
      new THREE.BoxGeometry(0.6, 1.1, 1.1),
      materials.robotJoint,
      [(index - (BATTERY_MODULES - 1) / 2) * 0.68, 0.75, 0],
    );
    bank.add(module);
    return module;
  });

  // The insulated cabinet, with radiator fins on top, grows up over the modules.
  const cabinet = new THREE.Group();
  cabinet.add(
    part(new THREE.BoxGeometry(2.2, 1.3, 1.3), materials.foil, [0, 0.85, 0]),
    ...[-0.6, -0.2, 0.2, 0.6].map((x) =>
      part(new THREE.BoxGeometry(0.06, 0.3, 1.2), materials.hull, [x, 1.65, 0]),
    ),
  );
  bank.add(cabinet);

  const chargeMaterials = Array.from({ length: CHARGE_SEGMENTS }, () =>
    materials.statusOff.clone(),
  );
  for (const [index, material] of chargeMaterials.entries()) {
    cabinet.add(
      part(new THREE.BoxGeometry(0.22, 0.12, 0.04), material, [
        (index - (CHARGE_SEGMENTS - 1) / 2) * 0.3,
        1.2,
        0.67,
      ]),
    );
  }

  const light = (material: THREE.MeshStandardMaterial, on: boolean) => {
    const source = on ? materials.statusOn : materials.statusOff;
    material.color.copy(source.color);
    material.emissive.copy(source.emissive);
  };

  return {
    group: bank,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const modulesIn = Math.min(f / MODULES_SHARE, 1) * BATTERY_MODULES;
      for (const [index, module] of modules.entries()) {
        const slid = THREE.MathUtils.clamp(modulesIn - index, 0, 1);
        module.visible = slid > 0;
        module.position.z = (1 - slid) * 1.4;
      }
      const closed = (f - MODULES_SHARE) / (1 - MODULES_SHARE);
      cabinet.visible = closed > 0;
      cabinet.scale.y = THREE.MathUtils.clamp(closed, 0.01, 1);
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
    },
    setCharge(fraction) {
      const lit = Math.ceil(
        THREE.MathUtils.clamp(fraction, 0, 1) * CHARGE_SEGMENTS - 1e-9,
      );
      for (const [index, material] of chargeMaterials.entries()) {
        light(material, index < lit);
      }
    },
    setLit: () => undefined,
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

/** The height of the excavator's deck, where a Robot sits to drive it. */
export const EXCAVATOR_SEAT_HEIGHT = 1.15;

/**
 * A small tracked excavator, facing along its local +z axis. Its upper body
 * turns on the tracks, and its boom, stick and bucket reach forward to grade
 * the ground.
 */
export interface ExcavatorModel {
  readonly group: THREE.Group;
  /** Turns the upper body relative to the tracks (radians, as for Object3D.rotation.y). */
  setSlew(angle: number): void;
  /** From 0, the arm tucked in, to 1, reaching out with the bucket on the ground. */
  setReach(fraction: number): void;
  /** The beacon that flashes while the Machine works by itself. */
  setBeacon(on: boolean): void;
}

export function createExcavatorModel(): ExcavatorModel {
  const excavator = new THREE.Group();
  excavator.name = "Excavator";

  for (const side of [-1, 1]) {
    excavator.add(
      part(new THREE.BoxGeometry(0.5, 0.5, 2.8), materials.track, [
        side * 0.95,
        0.25,
        0,
      ]),
    );
  }
  excavator.add(
    part(
      new THREE.CylinderGeometry(0.8, 0.9, 0.3, 12),
      materials.darkMetal,
      [0, 0.6, 0],
    ),
  );

  // Everything above the turntable turns as one.
  const upper = new THREE.Group();
  upper.position.y = 0.75;
  excavator.add(upper);
  const beaconMaterial = materials.statusOff.clone();
  upper.add(
    part(
      new THREE.BoxGeometry(1.7, 0.4, 2.0),
      materials.machinePaint,
      [0, 0.2, -0.1],
    ),
    // The counterweight behind the seat.
    part(
      new THREE.BoxGeometry(1.6, 0.6, 0.45),
      materials.machinePaint,
      [0, 0.7, -0.9],
    ),
    // The seat back.
    part(
      new THREE.BoxGeometry(0.5, 0.5, 0.1),
      materials.darkMetal,
      [0, 0.65, -0.35],
    ),
    part(
      new THREE.SphereGeometry(0.08, 8, 6),
      beaconMaterial,
      [0.6, 1.08, -0.9],
    ),
  );

  // The boom rises from the front of the deck, the stick hangs from its end,
  // and the bucket from the stick's.
  const boom = new THREE.Group();
  boom.position.set(0.55, 0.45, 0.8);
  upper.add(boom);
  const boomLength = 2.2;
  const stickLength = 1.5;
  boom.add(
    part(
      new THREE.BoxGeometry(0.22, 0.22, boomLength),
      materials.machinePaint,
      [0, 0, boomLength / 2],
    ),
  );
  const stick = new THREE.Group();
  stick.position.z = boomLength;
  boom.add(stick);
  stick.add(
    part(
      new THREE.BoxGeometry(0.16, stickLength, 0.16),
      materials.machinePaint,
      [0, -stickLength / 2, 0],
    ),
  );
  const bucket = part(
    new THREE.BoxGeometry(0.7, 0.35, 0.45),
    materials.darkMetal,
    [0, -stickLength - 0.1, 0.15],
  );
  stick.add(bucket);

  return {
    group: excavator,
    setSlew(angle) {
      upper.rotation.y = angle;
    },
    setReach(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      // Tucked: boom raised high and stick folded in. Reaching: boom lowered
      // towards the ground and the stick swung out.
      boom.rotation.x = THREE.MathUtils.lerp(-0.9, -0.15, f);
      stick.rotation.x = THREE.MathUtils.lerp(0.9, -0.35, f);
    },
    setBeacon(on) {
      const source = on ? materials.statusTesting : materials.statusOff;
      beaconMaterial.color.copy(source.color);
      beaconMaterial.emissive.copy(source.emissive);
    },
  };
}
