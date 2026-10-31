import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";

// The storage tanks. A tank for anything else is another shape below.

/** The share of Assembly spent putting up the cradle, before the vessel goes on. */
const CRADLE_SHARE = 0.35;

/** The sizes and parts of a storage tank's model, in metres. */
interface StorageTankShape {
  readonly name: string;
  /** The tank itself: a sphere, or a capsule lying on its side. */
  readonly vessel:
    | { readonly kind: "sphere"; readonly radius: number }
    | {
        readonly kind: "capsule";
        readonly radius: number;
        readonly length: number;
      };
  /** What it is wrapped in. */
  readonly skin: keyof typeof materials;
  /** How far the vessel's middle stands off the ground. */
  readonly vesselHeight: number;
  /** How many lights in the column that shows how full it is. */
  readonly gaugeSegments: number;
  /** A cooler's radiator panels standing on top, or none for a heater's box alone. */
  readonly radiatorPanels: number;
}

/** A long capsule in pale insulation, lying on two saddles. */
export const WATER_TANK: StorageTankShape = {
  name: "Water tank",
  vessel: { kind: "capsule", radius: 1.1, length: 2.8 },
  skin: "waterBladder",
  vesselHeight: 1.4,
  gaugeSegments: 6,
  radiatorPanels: 0,
};

/**
 * The large insulated sphere with a cooler that a lunar base should have: gold
 * foil on a ring of legs, with the cooler's white radiator standing on top.
 */
export const OXYGEN_TANK: StorageTankShape = {
  name: "Oxygen tank",
  vessel: { kind: "sphere", radius: 1.9 },
  skin: "foil",
  vesselHeight: 2.3,
  gaugeSegments: 8,
  radiatorPanels: 3,
};

/**
 * A fat capsule in silver foil, standing high on two saddles, with the cooler's
 * two radiators on top: as cold as the oxygen tank, and not to be taken for either.
 */
export const PROPELLANT_TANK: StorageTankShape = {
  name: "Propellant tank",
  vessel: { kind: "capsule", radius: 1.5, length: 3.2 },
  skin: "silverFoil",
  vesselHeight: 1.9,
  gaugeSegments: 8,
  radiatorPanels: 2,
};

/** The model of each type of storage tank in the data catalogue, by its id. */
export const STORAGE_TANK_SHAPES: Readonly<
  Record<string, StorageTankShape | undefined>
> = {
  "water-tank": WATER_TANK,
  "oxygen-tank": OXYGEN_TANK,
  "propellant-tank": PROPELLANT_TANK,
};

/** From the middle of one of a gauge's lights to the next. */
const GAUGE_PITCH = 0.2;

/**
 * A storage tank: a vessel on a cradle, which goes up during Assembly, with a
 * column of lights on a post that shows how full it is. Each light is lit or not,
 * so that showing it costs no more than a battery bank's charge lights.
 */
export function createStorageTankModel(
  shape: StorageTankShape,
): StructureModel {
  const model = new THREE.Group();
  model.name = shape.name;

  const cradle = new THREE.Group();
  cradle.name = "Cradle";
  cradle.add(...createCradle(shape));

  const vessel = new THREE.Group();
  vessel.name = "Vessel";
  vessel.add(createVessel(shape), ...createCooler(shape));
  vessel.position.y = shape.vesselHeight;

  const statusLightMaterial = materials.statusOff.clone();
  const reach = vesselReach(shape);
  const gaugeHeight = shape.gaugeSegments * GAUGE_PITCH + 0.2;
  const gaugeX = reach * 0.45;
  const gaugeZ = shape.vessel.radius + 0.45;
  cradle.add(
    part(
      new THREE.BoxGeometry(0.1, gaugeHeight + 0.5, 0.1),
      materials.darkMetal,
      [gaugeX, (gaugeHeight + 0.5) / 2, gaugeZ],
    ),
    part(new THREE.SphereGeometry(0.08, 8, 6), statusLightMaterial, [
      gaugeX,
      gaugeHeight + 0.58,
      gaugeZ,
    ]),
  );
  const gaugeMaterials = Array.from({ length: shape.gaugeSegments }, () =>
    materials.statusOff.clone(),
  );
  for (const [index, material] of gaugeMaterials.entries()) {
    cradle.add(
      part(new THREE.BoxGeometry(0.18, 0.13, 0.03), material, [
        gaugeX,
        0.6 + index * GAUGE_PITCH,
        gaugeZ + 0.065,
      ]),
    );
  }

  model.add(cradle, vessel);

  let litBefore = -1;
  return {
    group: model,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.min(f / CRADLE_SHARE, 1);
      cradle.visible = f > 0;
      cradle.scale.y = THREE.MathUtils.clamp(raised, 0.01, 1);
      const lowered = (f - CRADLE_SHARE) / (1 - CRADLE_SHARE);
      vessel.visible = lowered > 0;
      vessel.scale.setScalar(THREE.MathUtils.clamp(lowered, 0.01, 1));
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
        THREE.MathUtils.clamp(fraction, 0, 1) * shape.gaugeSegments - 1e-9,
      );
      // Called every frame, and the stock changes slowly.
      if (lit === litBefore) return;
      litBefore = lit;
      for (const [index, material] of gaugeMaterials.entries()) {
        const source = index < lit ? materials.statusOn : materials.statusOff;
        material.color.copy(source.color);
        material.emissive.copy(source.emissive);
      }
    },
    setLit: () => undefined,
  };
}

/** How far the vessel reaches along the ground from the middle. */
function vesselReach({ vessel }: StorageTankShape): number {
  return vessel.kind === "sphere"
    ? vessel.radius
    : vessel.length / 2 + vessel.radius;
}

function createVessel(shape: StorageTankShape): THREE.Mesh {
  const { vessel } = shape;
  const skin = materials[shape.skin];
  if (vessel.kind === "sphere") {
    return part(
      new THREE.SphereGeometry(vessel.radius, 24, 16),
      skin,
      [0, 0, 0],
    );
  }
  const capsule = part(
    new THREE.CapsuleGeometry(vessel.radius, vessel.length, 8, 20),
    skin,
    [0, 0, 0],
  );
  capsule.rotation.z = Math.PI / 2;
  return capsule;
}

/** What the vessel stands on: a saddle at each end of a capsule, a ring of legs under a sphere. */
function createCradle(shape: StorageTankShape): THREE.Object3D[] {
  const { vessel, vesselHeight } = shape;
  if (vessel.kind === "capsule") {
    return [-1, 1].map((side) =>
      part(
        new THREE.BoxGeometry(0.35, vesselHeight, vessel.radius * 1.5),
        materials.aluminium,
        [(side * vessel.length) / 2.6, vesselHeight / 2, 0],
      ),
    );
  }
  const legs = 6;
  const out = vessel.radius * 0.72;
  const brace = part(
    new THREE.TorusGeometry(out, 0.05, 6, 24),
    materials.darkMetal,
    [0, vesselHeight * 0.45, 0],
  );
  brace.rotation.x = Math.PI / 2;
  return [
    ...Array.from({ length: legs }, (_, index) => {
      const angle = (index / legs) * Math.PI * 2;
      return part(
        new THREE.CylinderGeometry(0.07, 0.09, vesselHeight, 8),
        materials.aluminium,
        [Math.cos(angle) * out, vesselHeight / 2, Math.sin(angle) * out],
      );
    }),
    brace,
  ];
}

/**
 * A cooler on top of a vessel: a box with white radiator panels standing out of
 * it, or, with no panels, the small grey box of a heater on a capsule's flank.
 */
function createCooler(shape: StorageTankShape): THREE.Object3D[] {
  const { radius } = shape.vessel;
  if (shape.radiatorPanels === 0) {
    return [
      part(new THREE.BoxGeometry(0.5, 0.3, 0.3), materials.darkMetal, [
        0,
        radius + 0.1,
        0,
      ]),
    ];
  }
  const top = radius + 0.12;
  return [
    part(new THREE.BoxGeometry(0.8, 0.3, 0.8), materials.robotJoint, [
      0,
      top,
      0,
    ]),
    ...Array.from({ length: shape.radiatorPanels }, (_, index) =>
      part(new THREE.BoxGeometry(1.5, 0.9, 0.04), materials.radiator, [
        0,
        top + 0.55,
        (index - (shape.radiatorPanels - 1) / 2) * 0.3,
      ]),
    ),
  ];
}
