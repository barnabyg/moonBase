import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxAt, materials, part } from "./materials";
import type { StructureModel } from "./models";

// The battery banks, and the thermal store, which is built the same way.

/** The share of Assembly spent sliding the modules in, before the cabinet closes. */
const MODULES_SHARE = 0.75;

/** The sizes and parts of a battery bank's model, in metres. */
interface BatteryBankShape {
  readonly name: string;
  /** How many modules slide into the cabinet, as the data catalogue has it. */
  readonly modules: number;
  /** Width, height and depth of one module. */
  readonly moduleSize: readonly [number, number, number];
  /** From the middle of one module to the next. */
  readonly modulePitch: number;
  readonly plinthSize: readonly [number, number, number];
  readonly cabinetSize: readonly [number, number, number];
  /** How many thin radiator fins stand in a row along the cabinet's roof. */
  readonly fins: number;
  readonly finHeight: number;
  /** How many lights in the row that shows how full it is. */
  readonly chargeSegments: number;
  /** The height of that row above the ground. */
  readonly chargeHeight: number;
  /** Whether a tall radiator panel stands at each end of the cabinet. */
  readonly endRadiators: boolean;
  /**
   * How far a Whipple shield's bumper plates stand clear of the cabinet's
   * back, ends and roof, or undefined if it has none. The front, with its
   * charge lights, is left open.
   */
  readonly bumperGap: number | undefined;
}

export const BATTERY_BANK: BatteryBankShape = {
  name: "Battery bank",
  modules: 3,
  moduleSize: [0.6, 1.1, 1.1],
  modulePitch: 0.68,
  plinthSize: [2.4, 0.2, 1.6],
  cabinetSize: [2.2, 1.3, 1.3],
  fins: 12,
  finHeight: 0.3,
  chargeSegments: 5,
  chargeHeight: 1.2,
  endRadiators: false,
  bumperGap: undefined,
};

/**
 * A Whipple-shielded battery bank: a battery bank with thin bumper plates
 * standing clear of its cabinet on posts.
 */
export const WHIPPLE_SHIELDED_BATTERY_BANK: BatteryBankShape = {
  ...BATTERY_BANK,
  name: "Whipple-shielded battery bank",
  bumperGap: 0.15,
};

/**
 * A large battery bank: longer, taller and deeper, with a fourth module, a
 * longer row of charge lights and tall radiator panels at both ends to shed
 * the heat of its bigger heaters.
 */
export const LARGE_BATTERY_BANK: BatteryBankShape = {
  name: "Large battery bank",
  modules: 4,
  moduleSize: [0.75, 1.6, 1.7],
  modulePitch: 0.85,
  plinthSize: [3.8, 0.25, 2.6],
  cabinetSize: [3.6, 1.9, 2],
  fins: 19,
  finHeight: 0.35,
  chargeSegments: 8,
  chargeHeight: 1.7,
  endRadiators: true,
  bumperGap: undefined,
};

/**
 * A thermal store: a low, wide block of sintered Regolith in three cores, with
 * a long row of charge lights and radiator panels at both ends for its
 * exchanger.
 */
export const THERMAL_STORE: BatteryBankShape = {
  name: "Thermal store",
  modules: 3,
  moduleSize: [1.5, 1.5, 2.6],
  modulePitch: 1.7,
  plinthSize: [6, 0.3, 3.6],
  cabinetSize: [5.6, 1.8, 3],
  fins: 26,
  finHeight: 0.25,
  chargeSegments: 12,
  chargeHeight: 1.6,
  endRadiators: true,
  bumperGap: undefined,
};

/**
 * A battery bank: an insulated cabinet on a plinth. During Assembly its
 * modules are slid in one by one and then the cabinet closes over them; a row
 * of lights on the front shows how full it is.
 */
export function createBatteryBankModel(
  shape: BatteryBankShape,
): StructureModel {
  const bank = new THREE.Group();
  bank.name = shape.name;
  const [plinthWidth, plinthHeight, plinthDepth] = shape.plinthSize;
  const [moduleWidth, moduleHeight, moduleDepth] = shape.moduleSize;
  const [cabinetWidth, cabinetHeight, cabinetDepth] = shape.cabinetSize;

  const statusLightMaterial = materials.statusOff.clone();
  bank.add(
    part(
      new THREE.BoxGeometry(plinthWidth, plinthHeight, plinthDepth),
      materials.darkMetal,
      [0, plinthHeight / 2, 0],
    ),
    part(new THREE.SphereGeometry(0.08, 8, 6), statusLightMaterial, [
      plinthWidth / 2 - 0.2,
      plinthHeight + 0.08,
      plinthDepth / 2 - 0.1,
    ]),
  );

  const handleGeometry = new THREE.BoxGeometry(moduleWidth * 0.5, 0.05, 0.06);
  const modules = Array.from({ length: shape.modules }, (_, index) => {
    const module = part(
      new THREE.BoxGeometry(moduleWidth, moduleHeight, moduleDepth),
      materials.robotJoint,
      [
        (index - (shape.modules - 1) / 2) * shape.modulePitch,
        plinthHeight + moduleHeight / 2,
        0,
      ],
    );
    // The handle it is slid in by.
    module.add(
      part(handleGeometry, materials.accent, [
        0,
        moduleHeight * 0.3,
        moduleDepth / 2 + 0.03,
      ]),
    );
    bank.add(module);
    return module;
  });
  // How far out in front a module starts before it is slid in.
  const slideFrom = cabinetDepth + 0.1;

  // The insulated cabinet, in an aluminium frame with a radiator on top,
  // grows up over the modules.
  const cabinet = new THREE.Group();
  cabinet.add(
    part(
      new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth),
      materials.foil,
      [0, plinthHeight + cabinetHeight / 2, 0],
    ),
    createCabinetFrame(shape),
    createRoofRadiator(shape),
    ...createPowerConnector(shape),
  );
  if (shape.endRadiators) {
    const height = cabinetHeight + shape.finHeight;
    cabinet.add(
      ...[-1, 1].map((side) =>
        part(
          new THREE.BoxGeometry(0.06, height, cabinetDepth - 0.2),
          materials.aluminium,
          [side * (cabinetWidth / 2 + 0.12), plinthHeight + height / 2, 0],
        ),
      ),
    );
  }
  if (shape.bumperGap !== undefined) {
    cabinet.add(...createBumperPlates(shape, shape.bumperGap));
  }
  bank.add(cabinet);

  // The charge lights sit in a dark display shaped like a battery, with a
  // terminal at its right-hand end.
  const front = cabinetDepth / 2;
  const displayWidth = shape.chargeSegments * CHARGE_PITCH + 0.08;
  cabinet.add(
    part(
      new THREE.BoxGeometry(displayWidth, 0.24, 0.03),
      materials.robotJoint,
      [0, shape.chargeHeight, front + 0.015],
    ),
    part(new THREE.BoxGeometry(0.06, 0.11, 0.03), materials.robotJoint, [
      displayWidth / 2 + 0.03,
      shape.chargeHeight,
      front + 0.015,
    ]),
  );
  const chargeMaterials = Array.from({ length: shape.chargeSegments }, () =>
    materials.statusOff.clone(),
  );
  for (const [index, material] of chargeMaterials.entries()) {
    cabinet.add(
      part(new THREE.BoxGeometry(0.22, 0.14, 0.02), material, [
        (index - (shape.chargeSegments - 1) / 2) * CHARGE_PITCH,
        shape.chargeHeight,
        front + 0.035,
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
      const modulesIn = Math.min(f / MODULES_SHARE, 1) * shape.modules;
      for (const [index, module] of modules.entries()) {
        const slid = THREE.MathUtils.clamp(modulesIn - index, 0, 1);
        module.visible = slid > 0;
        module.position.z = (1 - slid) * slideFrom;
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
        THREE.MathUtils.clamp(fraction, 0, 1) * shape.chargeSegments - 1e-9,
      );
      for (const [index, material] of chargeMaterials.entries()) {
        light(material, index < lit);
      }
    },
    setLit: () => undefined,
  };
}

/** From the middle of one of a battery bank's charge lights to the next. */
const CHARGE_PITCH = 0.3;

/**
 * The aluminium frame a battery bank's foil-wrapped panels hang on: a post
 * up each corner and a rail round the roof, merged into one mesh.
 */
function createCabinetFrame(shape: BatteryBankShape): THREE.Mesh {
  const [, plinthHeight] = shape.plinthSize;
  const [width, height, depth] = shape.cabinetSize;
  const roof = plinthHeight + height;
  const bar = 0.07;
  const pieces = [
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((z) =>
        boxAt(bar, height, bar, [
          (x * width) / 2,
          plinthHeight + height / 2,
          (z * depth) / 2,
        ]),
      ),
    ),
    ...[-1, 1].map((z) =>
      boxAt(width, bar, bar, [0, roof - bar / 2, (z * depth) / 2]),
    ),
    ...[-1, 1].map((x) =>
      boxAt(bar, bar, depth, [(x * width) / 2, roof - bar / 2, 0]),
    ),
  ];
  const frame = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return part(frame, materials.aluminium, [0, 0, 0]);
}

/**
 * The white radiator on a battery bank's roof that sheds its heaters' heat:
 * a row of thin fins on a base plate, merged into one mesh.
 */
function createRoofRadiator(shape: BatteryBankShape): THREE.Mesh {
  const [, plinthHeight] = shape.plinthSize;
  const [width, height, depth] = shape.cabinetSize;
  const roof = plinthHeight + height;
  const span = width - 0.4;
  const plate = 0.03;
  const pieces = [
    boxAt(width - 0.2, plate, depth - 0.1, [0, roof + plate / 2, 0]),
    ...Array.from({ length: shape.fins }, (_, index) =>
      boxAt(0.025, shape.finHeight, depth - 0.1, [
        (index / (shape.fins - 1) - 0.5) * span,
        roof + shape.finHeight / 2,
        0,
      ]),
    ),
  ];
  const radiator = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return part(radiator, materials.radiator, [0, 0, 0]);
}

/**
 * Where power goes in and out of a battery bank: a connector box low on the
 * front, marked in orange as high voltage, with two cables leaving its
 * underside.
 */
function createPowerConnector(shape: BatteryBankShape): THREE.Object3D[] {
  const [, plinthHeight] = shape.plinthSize;
  const [width, , depth] = shape.cabinetSize;
  const x = -(width / 2 - 0.35);
  const y = plinthHeight + 0.35;
  const z = depth / 2 + 0.05;
  return [
    part(new THREE.BoxGeometry(0.36, 0.26, 0.1), materials.darkMetal, [
      x,
      y,
      z,
    ]),
    part(new THREE.BoxGeometry(0.26, 0.06, 0.01), materials.accent, [
      x,
      y + 0.06,
      z + 0.055,
    ]),
    ...[-1, 1].map((side) =>
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), materials.seal, [
        x + side * 0.09,
        y - 0.2,
        z,
      ]),
    ),
  ];
}

/**
 * A Whipple shield's bumper plates round a battery bank's cabinet: one
 * behind it and one at each end, and one over its radiator fins held
 * clear of it on posts.
 */
function createBumperPlates(
  shape: BatteryBankShape,
  gap: number,
): THREE.Object3D[] {
  const [, plinthHeight] = shape.plinthSize;
  const [width, height, depth] = shape.cabinetSize;
  const middle = plinthHeight + height / 2;
  const thickness = 0.03;
  const roofY = plinthHeight + height + shape.finHeight + gap;
  const plates: [THREE.BoxGeometry, [number, number, number]][] = [
    [
      new THREE.BoxGeometry(width, height, thickness),
      [0, middle, -(depth / 2 + gap)],
    ],
    ...[-1, 1].map((side): [THREE.BoxGeometry, [number, number, number]] => [
      new THREE.BoxGeometry(thickness, height, depth),
      [side * (width / 2 + gap), middle, 0],
    ]),
    [
      new THREE.BoxGeometry(width + 2 * gap, thickness, depth + gap),
      [0, roofY, -gap / 2],
    ],
  ];
  const posts = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) =>
      part(
        new THREE.CylinderGeometry(
          0.025,
          0.025,
          roofY - plinthHeight - height,
          6,
        ),
        materials.darkMetal,
        [
          x * (width / 2 - 0.1),
          (roofY + plinthHeight + height) / 2,
          z * (depth / 2 - 0.1),
        ],
      ),
    ),
  );
  return [
    ...plates.map(([geometry, at]) => part(geometry, materials.aluminium, at)),
    ...posts,
  ];
}
