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
  // The Habitat's inflatable envelope: a woven, coated fabric.
  envelope: new THREE.MeshStandardMaterial({
    color: 0xe8e4da,
    metalness: 0,
    roughness: 0.85,
    flatShading: true,
  }),
  // Printed Regolith: grey-brown, rough and matte.
  regolith: new THREE.MeshStandardMaterial({
    color: 0x8a857c,
    metalness: 0,
    roughness: 1,
    flatShading: true,
  }),
  // Sintered Regolith panels, darker and smoother than the ground round them.
  padPanel: new THREE.MeshStandardMaterial({
    color: 0x5d5a55,
    metalness: 0.05,
    roughness: 0.75,
  }),
  padMarking: new THREE.MeshStandardMaterial({
    color: 0xe8c33a,
    metalness: 0,
    roughness: 0.6,
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

export interface PlumeModel {
  readonly group: THREE.Group;
  /**
   * Shows the dust blasted out over the ground: its strength from 0 (none)
   * to 1 (the engine firing right over the ground), how far it has spread,
   * from 0 to 1, out to the given radius, and how high above the ground the
   * engine's exhaust starts.
   */
  show(
    strength: number,
    spread: number,
    exhaustHeight: number,
    realSeconds: number,
  ): void;
}

const plumeMaterials = {
  dust: new THREE.MeshStandardMaterial({
    color: 0xbdb7ac,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
  }),
  haze: new THREE.MeshBasicMaterial({
    color: 0x9d978c,
    transparent: true,
    depthWrite: false,
  }),
  exhaust: new THREE.MeshBasicMaterial({
    color: 0xffe2b0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
};

/** How many billows of dust roll out round the Lander. */
const PLUME_BILLOWS = 28;

/**
 * The Plume Ejecta of a Lander taking off or landing: billows of dust
 * rolling out over the ground from under it, a low haze, and the engine's
 * glow. It stands on the ground at its origin.
 */
export function createPlumeModel(radius: number): PlumeModel {
  const group = new THREE.Group();
  group.name = "Plume";
  const billowGeometry = new THREE.IcosahedronGeometry(1, 1);
  const billows = Array.from({ length: PLUME_BILLOWS }, (_, index) => {
    const billow = new THREE.Mesh(billowGeometry, plumeMaterials.dust);
    group.add(billow);
    // Each a little different, but the same on every load.
    return {
      billow,
      angle: (index / PLUME_BILLOWS) * Math.PI * 2,
      size: 0.8 + ((index * 7) % 5) * 0.15,
      lag: ((index * 11) % 6) / 12,
    };
  });
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    plumeMaterials.haze,
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 0.05;
  const exhaustLength = 6;
  const exhaust = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, exhaustLength, 12, 1, true),
    plumeMaterials.exhaust,
  );
  // Pointing down from the engine bell.
  exhaust.rotation.x = Math.PI;
  group.add(haze, exhaust);
  group.visible = false;
  return {
    group,
    show(strength, spread, exhaustHeight, realSeconds) {
      group.visible = strength > 0;
      if (!group.visible) return;
      for (const { billow, angle, size, lag } of billows) {
        const reach = Math.max(spread - lag * spread, 0.08) * radius;
        const turn = angle + realSeconds * 0.15;
        const puff = size * (0.5 + reach * 0.04) * (0.5 + strength * 0.5);
        billow.position.set(
          Math.cos(turn) * reach,
          puff * 0.6,
          Math.sin(turn) * reach,
        );
        billow.scale.set(puff, puff * 0.7, puff);
      }
      haze.scale.setScalar(Math.max(spread, 0.08) * radius);
      exhaust.position.y = exhaustHeight - exhaustLength / 2;
      plumeMaterials.dust.opacity = 0.4 * strength;
      plumeMaterials.haze.opacity = 0.35 * strength;
      plumeMaterials.exhaust.opacity = 0.35 + 0.25 * Math.sin(realSeconds * 40);
    },
  };
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
  /** Shows a Plant at work, or standing still; nothing for anything else. */
  setRunning?(running: boolean, realSeconds: number): void;
}

/** The model for a type of Structure from the data catalogue. */
export function createStructureModel(structureTypeId: string): StructureModel {
  if (structureTypeId === "battery-bank") return createBatteryBankModel();
  if (structureTypeId === "light-mast") return createLightMastModel();
  if (structureTypeId === "habitat") return createHabitatModel();
  if (structureTypeId === "regolith-shielding") {
    return createRegolithShieldingModel();
  }
  if (structureTypeId === "landing-pad") return createLandingPadModel();
  if (structureTypeId === "water-processing-plant") {
    return createPlantModel("tank");
  }
  if (structureTypeId === "extraction-plant")
    return createPlantModel("reactor");
  if (structureTypeId === "vacuum-fabrication-plant") {
    return createPlantModel("chamber");
  }
  if (structureTypeId === "circuit-board-plant") {
    return createPlantModel("oven");
  }
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

/** The share of Assembly spent standing up the rigid core, before the envelope inflates. */
const CORE_SHARE = 0.25;
/** The share of Assembly by which the envelope is fully inflated; the airlock goes on after. */
const INFLATED_SHARE = 0.85;

/**
 * The inflatable Habitat: a squat fabric dome, held down by straps, round a
 * rigid core on a plinth, with an airlock on one side. During Assembly the
 * core goes up, the envelope inflates round it, and then the airlock is
 * fitted.
 */
function createHabitatModel(): StructureModel {
  const habitat = new THREE.Group();
  habitat.name = "Inflatable Habitat";

  const statusLightMaterial = materials.statusOff.clone();
  habitat.add(
    part(
      new THREE.CylinderGeometry(3.7, 3.8, 0.3, 8),
      materials.darkMetal,
      [0, 0.15, 0],
    ),
    part(
      new THREE.SphereGeometry(0.09, 8, 6),
      statusLightMaterial,
      [2.2, 0.36, 2.2],
    ),
  );

  const core = part(
    new THREE.CylinderGeometry(0.9, 0.9, 1, 8),
    materials.hull,
    [0, 0, 0],
  );
  habitat.add(core);
  const coreHeight = 2.6;

  // The envelope, with its restraint straps, inflates from the plinth up.
  const envelope = new THREE.Group();
  envelope.position.y = 0.3;
  const domeHeight = 0.75;
  const dome = part(
    new THREE.SphereGeometry(3.4, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.envelope,
    [0, 0, 0],
  );
  dome.scale.y = domeHeight;
  envelope.add(dome);
  for (const [index, height] of [0.35, 0.75].entries()) {
    const angle = Math.asin(height);
    const strap = part(
      new THREE.TorusGeometry(3.4 * Math.cos(angle) + 0.02, 0.05, 4, 14),
      materials.foil,
      [0, 3.4 * height * domeHeight, 0],
    );
    strap.rotation.x = Math.PI / 2;
    strap.name = `Strap ${index + 1}`;
    envelope.add(strap);
  }
  habitat.add(envelope);

  // The airlock: a short rigid tube lying against the envelope, with a hatch.
  const airlock = new THREE.Group();
  airlock.position.set(3.3, 1.05, 0);
  const tube = part(
    new THREE.CylinderGeometry(0.75, 0.75, 1.6, 8),
    materials.hull,
    [0, 0, 0],
  );
  tube.rotation.z = Math.PI / 2;
  const hatch = part(
    new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8),
    materials.darkMetal,
    [0.82, 0, 0],
  );
  hatch.rotation.z = Math.PI / 2;
  airlock.add(tube, hatch);
  habitat.add(airlock);

  return {
    group: habitat,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / CORE_SHARE, 1), 0.01);
      core.scale.y = coreHeight * raised;
      core.position.y = 0.3 + (coreHeight * raised) / 2;
      const inflated = THREE.MathUtils.clamp(
        (f - CORE_SHARE) / (INFLATED_SHARE - CORE_SHARE),
        0,
        1,
      );
      envelope.visible = inflated > 0;
      // A slack envelope lies wide and flat, and rounds out as it fills.
      envelope.scale.set(
        0.6 + inflated * 0.4,
        Math.max(inflated, 0.02),
        0.6 + inflated * 0.4,
      );
      airlock.visible = f >= INFLATED_SHARE;
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
    setLit: () => undefined,
  };
}

/** How high Regolith shielding rises over the Habitat's dome. */
export const SHIELDING_HEIGHT = 3.4;
/** The radius of the shielding where it meets the ground, just inside its footprint. */
const SHIELDING_BASE_RADIUS = 3.95;
/** How many layers the regolith printer lays the shielding down in. */
const SHIELDING_LAYERS = 12;

/**
 * The radius of Regolith shielding's outer surface at a height above the
 * ground: a rounded dome over the Habitat.
 */
export function shieldingRadiusAt(height: number): number {
  const h = THREE.MathUtils.clamp(height / SHIELDING_HEIGHT, 0, 1);
  return SHIELDING_BASE_RADIUS * Math.sqrt(1 - h * h);
}

/**
 * Regolith shielding: a thick dome of printed Regolith over the Habitat,
 * with the airlock's hatch left showing. During Assembly it builds up layer
 * by layer from the ground, the layer being printed growing as it goes.
 */
function createRegolithShieldingModel(): StructureModel {
  const shielding = new THREE.Group();
  shielding.name = "Regolith shielding";
  const layerHeight = SHIELDING_HEIGHT / SHIELDING_LAYERS;
  const layers = Array.from({ length: SHIELDING_LAYERS }, (_, index) => {
    const bottom = index * layerHeight;
    const geometry = new THREE.CylinderGeometry(
      shieldingRadiusAt(bottom + layerHeight),
      shieldingRadiusAt(bottom),
      layerHeight,
      20,
    );
    // Grows upwards from its base as it is printed.
    geometry.translate(0, layerHeight / 2, 0);
    const layer = part(geometry, materials.regolith, [0, bottom, 0]);
    layer.name = `Layer ${index + 1}`;
    shielding.add(layer);
    return layer;
  });

  return {
    group: shielding,
    setAssembled(fraction) {
      const printed = THREE.MathUtils.clamp(fraction, 0, 1) * SHIELDING_LAYERS;
      for (const [index, layer] of layers.entries()) {
        const done = THREE.MathUtils.clamp(printed - index, 0, 1);
        layer.visible = done > 0;
        layer.scale.y = Math.max(done, 0.01);
      }
    },
    setFacing: () => undefined,
    // A mound of Regolith has no status light: the Habitat's shows through.
    setStatusLight: () => undefined,
    setCharge: () => undefined,
    setLit: () => undefined,
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

/** How many panels a landing pad is laid from, as the data catalogue has it. */
const PAD_PANELS = 8;
/** The share of Assembly spent laying the panels, before the beacon goes up. */
const PAD_PANELS_SHARE = 0.85;

/**
 * A landing pad: a disc of interlocking panels laid flat on the graded
 * ground, with a painted ring for the Lander to aim at and a beacon at its
 * edge. During Assembly the panels go down one by one, then the beacon goes
 * up. Its radius is the data catalogue's footprint.
 */
function createLandingPadModel(): StructureModel {
  const pad = new THREE.Group();
  pad.name = "Landing pad";
  const radius = 6.9;
  const thickness = 0.12;
  const panels = Array.from({ length: PAD_PANELS }, (_, index) => {
    const panel = part(
      new THREE.CylinderGeometry(
        radius,
        radius,
        thickness,
        6,
        1,
        false,
        (index / PAD_PANELS) * Math.PI * 2,
        (Math.PI * 2) / PAD_PANELS - 0.02,
      ),
      materials.padPanel,
      [0, thickness / 2, 0],
    );
    pad.add(panel);
    return panel;
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 3.9, 48),
    materials.padMarking,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = thickness + 0.01;
  pad.add(ring);

  const statusLightMaterial = materials.statusOff.clone();
  const beacon = new THREE.Group();
  beacon.position.set(radius - 0.5, thickness, 0);
  beacon.add(
    part(
      new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6),
      materials.darkMetal,
      [0, 0.7, 0],
    ),
    part(
      new THREE.SphereGeometry(0.16, 10, 8),
      statusLightMaterial,
      [0, 1.5, 0],
    ),
  );
  pad.add(beacon);

  return {
    group: pad,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const laid = Math.min(f / PAD_PANELS_SHARE, 1) * PAD_PANELS;
      for (const [index, panel] of panels.entries()) {
        panel.visible = laid - index > 0;
      }
      ring.visible = laid >= PAD_PANELS;
      beacon.visible = f > PAD_PANELS_SHARE;
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

/** The crates in one layer of the stockpile, across by deep. */
const STOCKPILE_LAYER = { across: 3, deep: 4 } as const;
const STOCKPILE_LAYERS = 3;

/**
 * The base's stockpile: a ground mat within its footprint radius, with a
 * packing crate stacked on it for each Component in stock, up to as many as
 * fit, so that the player sees it fill and empty.
 */
export function createStockpileModel(footprintRadius: number): {
  readonly group: THREE.Group;
  /** Shows a crate for each of this many Components, or a full stack if there are more. */
  showStock(components: number): void;
} {
  const group = new THREE.Group();
  group.name = "Stockpile";
  const mat = part(
    new THREE.CylinderGeometry(footprintRadius, footprintRadius, 0.04, 24),
    materials.darkMetal,
    [0, 0.02, 0],
  );
  const { across, deep } = STOCKPILE_LAYER;
  const crates = Array.from(
    { length: across * deep * STOCKPILE_LAYERS },
    (_, index) => {
      const layer = Math.floor(index / (across * deep));
      const inLayer = index % (across * deep);
      const crate = createCrateModel();
      crate.position.set(
        ((inLayer % across) - (across - 1) / 2) * 0.62,
        0.04 + layer * 0.41,
        (Math.floor(inLayer / across) - (deep - 1) / 2) * 0.52,
      );
      crate.visible = false;
      return crate;
    },
  );
  group.add(mat, ...crates);
  return {
    group,
    showStock(components) {
      for (const [index, crate] of crates.entries()) {
        crate.visible = index < components;
      }
    },
  };
}

/** The height of every Machine's deck, where a Robot sits to drive it. */
export const MACHINE_SEAT_HEIGHT = 1.15;

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

/**
 * A regolith printer on tracks, facing along its local +z axis. Its upper
 * body turns on the tracks; a carriage runs up and down a mast at the front,
 * carrying a boom that reaches out with the print head hanging from its end,
 * fed from a hopper of Regolith scooped from the ground.
 */
export interface RegolithPrinterModel {
  readonly group: THREE.Group;
  /** Turns the upper body relative to the tracks (radians, as for Object3D.rotation.y). */
  setSlew(angle: number): void;
  /** How far out the print head is from the turntable's centre, in metres. */
  setReach(metres: number): void;
  /** How high the print head's nozzle is above the ground, in metres. */
  setNozzleHeight(metres: number): void;
  /** The beacon that flashes while the Machine works by itself. */
  setBeacon(on: boolean): void;
}

/** How far from the turntable's centre the printer's mast stands. */
const PRINTER_MAST_REACH = 0.7;
/** How far below the boom the print head's nozzle hangs. */
const PRINT_HEAD_DROP = 0.55;
/** How high the turntable's top is above the ground. */
const PRINTER_TURNTABLE_HEIGHT = 0.75;
const PRINTER_MAST_HEIGHT = 4.2;

export function createRegolithPrinterModel(): RegolithPrinterModel {
  const printer = new THREE.Group();
  printer.name = "Regolith printer";

  for (const side of [-1, 1]) {
    printer.add(
      part(new THREE.BoxGeometry(0.5, 0.5, 3), materials.track, [
        side * 1.05,
        0.25,
        0,
      ]),
    );
  }
  printer.add(
    part(
      new THREE.CylinderGeometry(0.9, 1, 0.3, 12),
      materials.darkMetal,
      [0, 0.6, 0],
    ),
  );

  // Everything above the turntable turns as one.
  const upper = new THREE.Group();
  upper.position.y = PRINTER_TURNTABLE_HEIGHT;
  printer.add(upper);
  const deckHeight = MACHINE_SEAT_HEIGHT - PRINTER_TURNTABLE_HEIGHT;
  const beaconMaterial = materials.statusOff.clone();
  upper.add(
    // The deck, level with every Machine's seat.
    part(new THREE.BoxGeometry(1.9, deckHeight, 2.2), materials.hull, [
      0,
      deckHeight / 2,
      0,
    ]),
    // The hopper of Regolith behind the seat, wider at the top.
    part(
      new THREE.CylinderGeometry(0.75, 0.45, 0.9, 6),
      materials.machinePaint,
      [0, deckHeight + 0.45, -0.6],
    ),
    part(new THREE.SphereGeometry(0.08, 8, 6), beaconMaterial, [
      0.75,
      deckHeight + 1,
      -0.6,
    ]),
    part(
      new THREE.BoxGeometry(0.2, PRINTER_MAST_HEIGHT, 0.2),
      materials.darkMetal,
      [0, PRINTER_MAST_HEIGHT / 2, PRINTER_MAST_REACH],
    ),
  );

  // The carriage on the mast, and the boom it carries out to the print head.
  const carriage = new THREE.Group();
  carriage.position.z = PRINTER_MAST_REACH;
  upper.add(carriage);
  carriage.add(
    part(
      new THREE.BoxGeometry(0.4, 0.35, 0.4),
      materials.machinePaint,
      [0, 0, 0],
    ),
  );
  const boom = part(
    new THREE.BoxGeometry(0.16, 0.16, 1),
    materials.machinePaint,
    [0, 0, 0],
  );
  carriage.add(boom);
  const head = new THREE.Group();
  carriage.add(head);
  head.add(
    part(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      materials.darkMetal,
      [0, -0.2, 0],
    ),
    part(new THREE.ConeGeometry(0.1, 0.25, 6), materials.darkMetal, [
      0,
      -PRINT_HEAD_DROP + 0.125,
      0,
    ]),
  );
  // The carriage runs between the deck and the top of the mast.
  const lowest = MACHINE_SEAT_HEIGHT + 0.2 - PRINT_HEAD_DROP;
  const highest =
    PRINTER_TURNTABLE_HEIGHT + PRINTER_MAST_HEIGHT - 0.2 - PRINT_HEAD_DROP;

  const model: RegolithPrinterModel = {
    group: printer,
    setSlew(angle) {
      upper.rotation.y = angle;
    },
    setReach(metres) {
      const out = Math.max(metres - PRINTER_MAST_REACH, 0.3);
      boom.scale.z = out;
      boom.position.z = out / 2;
      head.position.z = out;
    },
    setNozzleHeight(metres) {
      const height = THREE.MathUtils.clamp(metres, lowest, highest);
      carriage.position.y = height + PRINT_HEAD_DROP - PRINTER_TURNTABLE_HEIGHT;
    },
    setBeacon(on) {
      const source = on ? materials.statusTesting : materials.statusOff;
      beaconMaterial.color.copy(source.color);
      beaconMaterial.emissive.copy(source.emissive);
    },
  };
  // Parked with the boom drawn in and the head held low.
  model.setReach(PRINTER_MAST_REACH + 1);
  model.setNozzleHeight(lowest);
  return model;
}

/** A Rover's model, facing along its local +z axis. */
export interface RoverModel {
  readonly group: THREE.Group;
}

/**
 * The Rover: an open, four-wheeled chassis with a seat for the Robot at the
 * same height as a Machine's, a cargo bed behind it and a radio mast.
 */
export function createRoverModel(): RoverModel {
  const rover = new THREE.Group();
  rover.name = "Rover";
  const wheelRadius = 0.42;
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.95, 0.95]) {
      const wheel = part(
        new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.3, 14),
        materials.track,
        [x, wheelRadius, z],
      );
      wheel.rotation.z = Math.PI / 2;
      rover.add(wheel);
    }
  }
  rover.add(
    // The chassis.
    part(new THREE.BoxGeometry(1.5, 0.25, 2.5), materials.hull, [0, 0.75, 0]),
    // The seat, facing forward.
    part(new THREE.BoxGeometry(0.55, 0.2, 0.5), materials.darkMetal, [
      0,
      MACHINE_SEAT_HEIGHT - 0.1,
      0.35,
    ]),
    part(new THREE.BoxGeometry(0.55, 0.55, 0.1), materials.darkMetal, [
      0,
      MACHINE_SEAT_HEIGHT + 0.2,
      0.05,
    ]),
    // The cargo bed behind the seat.
    part(
      new THREE.BoxGeometry(1.3, 0.35, 0.9),
      materials.foil,
      [0, 1.05, -0.7],
    ),
    // The radio mast and its dish.
    part(
      new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6),
      materials.darkMetal,
      [0.55, 1.45, -0.95],
    ),
    part(
      new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.hull,
      [0.55, 2.05, -0.95],
    ),
  );
  return { group: rover };
}

/** How fast a running Plant's cooling fan turns, in turns per real second. */
const PLANT_FAN_TURNS_PER_SECOND = 1.5;

/**
 * A Plant: a vessel on a plinth, with the plant that feeds and empties it
 * beside it, and a cooling fan on top that turns while it runs, when the
 * vessel glows. A reactor is tall and narrow, a tank squat and wide, a
 * chamber lies on its side, and an oven is a low tunnel with a conveyor
 * running through it. During Assembly the plinth goes down, then the vessel
 * rises.
 */
function createPlantModel(
  vessel: "reactor" | "tank" | "chamber" | "oven",
): StructureModel {
  const plant = new THREE.Group();
  plant.name = {
    reactor: "Extraction plant",
    tank: "Water plant",
    chamber: "Vacuum fabrication plant",
    oven: "Circuit board plant",
  }[vessel];
  const statusLightMaterial = materials.statusOff.clone();
  const glow = materials.statusOff.clone();
  plant.add(
    part(
      new THREE.BoxGeometry(4, 0.25, 3.2),
      materials.darkMetal,
      [0, 0.12, 0],
    ),
    part(
      new THREE.SphereGeometry(0.08, 8, 6),
      statusLightMaterial,
      [1.8, 0.3, 1.5],
    ),
  );
  const upper = new THREE.Group();
  if (vessel === "chamber") {
    // A drum lying from front to back, held off the plinth by two cradles.
    const radius = 0.75;
    const lying = (mesh: THREE.Mesh) => {
      mesh.rotation.x = Math.PI / 2;
      return mesh;
    };
    upper.add(
      lying(
        part(
          new THREE.CylinderGeometry(radius, radius, 2.8, 16),
          materials.foil,
          [-0.7, 0.45 + radius, 0],
        ),
      ),
      // A band round the vessel that glows while it works.
      lying(
        part(
          new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
          glow,
          [-0.7, 0.45 + radius, 0.5],
        ),
      ),
      part(
        new THREE.BoxGeometry(1.2, 0.3, 0.3),
        materials.darkMetal,
        [-0.7, 0.4, -0.9],
      ),
      part(
        new THREE.BoxGeometry(1.2, 0.3, 0.3),
        materials.darkMetal,
        [-0.7, 0.4, 0.9],
      ),
    );
  } else if (vessel === "oven") {
    // A tunnel from front to back on two legs, with the conveyor that
    // carries the boards through it sticking out at both ends.
    upper.add(
      part(
        new THREE.BoxGeometry(1.3, 0.9, 2.4),
        materials.hull,
        [-0.7, 1.05, 0],
      ),
      // A window along the top that glows while it works.
      part(new THREE.BoxGeometry(0.8, 0.04, 1.8), glow, [-0.7, 1.52, 0]),
      part(
        new THREE.BoxGeometry(0.9, 0.08, 3.1),
        materials.darkMetal,
        [-0.7, 0.64, 0],
      ),
      part(
        new THREE.BoxGeometry(1.2, 0.35, 0.3),
        materials.darkMetal,
        [-0.7, 0.42, -0.9],
      ),
      part(
        new THREE.BoxGeometry(1.2, 0.35, 0.3),
        materials.darkMetal,
        [-0.7, 0.42, 0.9],
      ),
    );
  } else {
    const [radius, height] = vessel === "reactor" ? [0.9, 3.2] : [1.3, 1.6];
    upper.add(
      part(
        new THREE.CylinderGeometry(radius, radius, height, 16),
        vessel === "reactor" ? materials.foil : materials.hull,
        [-0.7, 0.25 + height / 2, 0],
      ),
      // A band round the vessel that glows while it works.
      part(
        new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
        glow,
        [-0.7, 0.25 + height * 0.6, 0],
      ),
    );
  }
  upper.add(
    part(
      new THREE.BoxGeometry(1.4, 1.4, 1.8),
      materials.machinePaint,
      [1.1, 0.95, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8),
      materials.darkMetal,
      [0.3, 1.2, 0.6],
    ),
  );
  const fan = new THREE.Group();
  fan.position.set(1.1, 1.75, 0);
  for (const angle of [0, Math.PI / 2]) {
    const blade = part(
      new THREE.BoxGeometry(1.1, 0.04, 0.16),
      materials.hull,
      [0, 0, 0],
    );
    blade.rotation.y = angle;
    fan.add(blade);
  }
  upper.add(fan);
  plant.add(upper);
  return {
    group: plant,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      upper.visible = f > 0;
      upper.scale.y = Math.max(f, 0.01);
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
    setLit: () => undefined,
    setRunning(running, realSeconds) {
      if (running) {
        fan.rotation.y = realSeconds * PLANT_FAN_TURNS_PER_SECOND * Math.PI * 2;
      }
      const source = running ? materials.statusTesting : materials.statusOff;
      glow.color.copy(source.color);
      glow.emissive.copy(source.emissive);
    },
  };
}
