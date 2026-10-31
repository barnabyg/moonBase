import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";

// The Plants, and the other Structures built the same way.

/** How fast a running Plant's cooling fan turns, in turns per real second. */
const PLANT_FAN_TURNS_PER_SECOND = 1.5;
/** The height of the top of a Plant's plinth, which its vessels stand on. */
const PLINTH_TOP = 0.25;

/**
 * A vessel standing on a Plant's plinth. A reactor is tall and narrow, a
 * tank squat and wide, a chamber a drum lying on its side, an oven a low
 * tunnel with a conveyor running through it, a stack a block of cell
 * plates, a hopper a funnel on legs that Regolith is tipped into, a mill a
 * machine tool, with a spindle hanging from a gantry over its bed, and a
 * conveyor a long sloping belt.
 */
interface PlantVessel {
  readonly kind:
    | "reactor"
    | "tank"
    | "chamber"
    | "oven"
    | "stack"
    | "hopper"
    | "mill"
    | "conveyor";
  /** Where its centre stands on the plinth, across and front to back. */
  readonly at: readonly [number, number];
  /** How much bigger it is than the plain vessel of its kind; 1 if not given. */
  readonly scale?: number;
}

/** The sizes and parts of a Plant's model, in metres. */
interface PlantShape {
  readonly name: string;
  /** The plinth's width across and depth from front to back. */
  readonly plinth: readonly [number, number];
  readonly vessels: readonly PlantVessel[];
  /** Where the box of plant that feeds and empties it stands, across. */
  readonly feederAt: number;
}

const EXTRACTION_PLANT: PlantShape = {
  name: "Extraction plant",
  plinth: [4, 3.2],
  vessels: [{ kind: "reactor", at: [-0.7, 0] }],
  feederAt: 1.1,
};

/**
 * A large extraction plant: a wider plinth with a big molten regolith cell,
 * fed from a hopper of Regolith beside it, and a slimmer oxygen separator
 * column behind.
 */
const LARGE_EXTRACTION_PLANT: PlantShape = {
  name: "Large extraction plant",
  plinth: [6.2, 4.6],
  vessels: [
    { kind: "reactor", at: [-1.4, 0.3], scale: 1.35 },
    { kind: "reactor", at: [0.2, -1.4], scale: 0.6 },
    { kind: "hopper", at: [-1.6, -1.75] },
  ],
  feederAt: 1.9,
};

const WATER_PROCESSING_PLANT: PlantShape = {
  name: "Water plant",
  plinth: [4, 3.2],
  vessels: [{ kind: "tank", at: [-0.7, 0] }],
  feederAt: 1.1,
};

/**
 * An electrolysis plant: a smaller ice melter beside a stack of
 * electrolyser cells, whose gaps glow while it works.
 */
const ELECTROLYSIS_PLANT: PlantShape = {
  name: "Electrolysis plant",
  plinth: [4, 3.2],
  vessels: [
    { kind: "tank", at: [-1, 0.7], scale: 0.7 },
    { kind: "stack", at: [-0.6, -0.85] },
  ],
  feederAt: 1.1,
};

const VACUUM_FABRICATION_PLANT: PlantShape = {
  name: "Vacuum fabrication plant",
  plinth: [4, 3.2],
  vessels: [{ kind: "chamber", at: [-0.7, 0] }],
  feederAt: 1.1,
};

const CIRCUIT_BOARD_PLANT: PlantShape = {
  name: "Circuit board plant",
  plinth: [4, 3.2],
  vessels: [{ kind: "oven", at: [-0.7, 0] }],
  feederAt: 1.1,
};

/**
 * An integrated fabrication plant: a long plinth carrying a crystal
 * furnace's drum and, beside it, the oven of the board assembly line, so
 * that the wafers go straight from one into the other.
 */
const INTEGRATED_FABRICATION_PLANT: PlantShape = {
  name: "Integrated fabrication plant",
  plinth: [5.2, 3.2],
  vessels: [
    { kind: "chamber", at: [-1.7, 0] },
    { kind: "oven", at: [-0.2, 0] },
  ],
  feederAt: 1.5,
};

/**
 * A Workshop: a machine tool's gantry over its bed, the one thing on any Plant
 * you can see through, with a small casting furnace behind it.
 */
const WORKSHOP: PlantShape = {
  name: "Workshop",
  plinth: [4.6, 3.8],
  vessels: [
    { kind: "mill", at: [-0.9, 0.45] },
    { kind: "tank", at: [-1.4, -1.15], scale: 0.42 },
  ],
  feederAt: 1.3,
};

/**
 * A cold-trap ice line: a lagged tank for the ice, and the sloping belt where
 * the line from the crater comes in.
 */
const COLD_TRAP_ICE_LINE: PlantShape = {
  name: "Cold-trap ice line",
  plinth: [5, 3],
  vessels: [
    { kind: "tank", at: [-1.5, 0], scale: 0.7 },
    { kind: "conveyor", at: [0.05, 0], scale: 0.7 },
  ],
  feederAt: 1.6,
};

/**
 * An array works: a long belt the panels come off, with a small casting furnace
 * behind it.
 */
const ARRAY_WORKS: PlantShape = {
  name: "Array works",
  plinth: [5.4, 4],
  vessels: [
    { kind: "conveyor", at: [-0.8, 0.8] },
    { kind: "tank", at: [-1.5, -1.05], scale: 0.42 },
  ],
  feederAt: 1.7,
};

/** The Plants, by Structure type. */
export const PLANT_SHAPES: Readonly<Record<string, PlantShape>> = {
  "extraction-plant": EXTRACTION_PLANT,
  "large-extraction-plant": LARGE_EXTRACTION_PLANT,
  "water-processing-plant": WATER_PROCESSING_PLANT,
  "electrolysis-plant": ELECTROLYSIS_PLANT,
  "vacuum-fabrication-plant": VACUUM_FABRICATION_PLANT,
  "circuit-board-plant": CIRCUIT_BOARD_PLANT,
  "integrated-fabrication-plant": INTEGRATED_FABRICATION_PLANT,
  workshop: WORKSHOP,
  "cold-trap-ice-line": COLD_TRAP_ICE_LINE,
  "array-works": ARRAY_WORKS,
};

/**
 * The parts of one vessel, centred across and front to back on the origin
 * and standing on the plinth, with any band that glows while the Plant
 * works made of the glow material.
 */
function plantVesselParts(
  kind: PlantVessel["kind"],
  glow: THREE.Material,
): THREE.Object3D[] {
  switch (kind) {
    case "chamber": {
      // A drum lying from front to back, held off the plinth by two cradles.
      const radius = 0.75;
      const lying = (mesh: THREE.Mesh) => {
        mesh.rotation.x = Math.PI / 2;
        return mesh;
      };
      return [
        lying(
          part(
            new THREE.CylinderGeometry(radius, radius, 2.8, 16),
            materials.foil,
            [0, 0.45 + radius, 0],
          ),
        ),
        // A band round the vessel that glows while it works.
        lying(
          part(
            new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
            glow,
            [0, 0.45 + radius, 0.5],
          ),
        ),
        ...[-0.9, 0.9].map((z) =>
          part(new THREE.BoxGeometry(1.2, 0.3, 0.3), materials.darkMetal, [
            0,
            0.4,
            z,
          ]),
        ),
      ];
    }
    case "oven":
      // A tunnel from front to back on two legs, with the conveyor that
      // carries the boards through it sticking out at both ends.
      return [
        part(
          new THREE.BoxGeometry(1.3, 0.9, 2.4),
          materials.hull,
          [0, 1.05, 0],
        ),
        // A window along the top that glows while it works.
        part(new THREE.BoxGeometry(0.8, 0.04, 1.8), glow, [0, 1.52, 0]),
        part(
          new THREE.BoxGeometry(0.9, 0.08, 3.1),
          materials.darkMetal,
          [0, 0.64, 0],
        ),
        ...[-0.9, 0.9].map((z) =>
          part(new THREE.BoxGeometry(1.2, 0.35, 0.3), materials.darkMetal, [
            0,
            0.42,
            z,
          ]),
        ),
      ];
    case "stack": {
      // Cell plates stacked side by side between two end plates, with the
      // gaps between them glowing while it works.
      const plates = 7;
      return [
        ...Array.from({ length: plates }, (_, index) =>
          part(
            new THREE.BoxGeometry(0.14, 1.1, 1.2),
            index === 0 || index === plates - 1
              ? materials.darkMetal
              : materials.hull,
            [(index - (plates - 1) / 2) * 0.22, 0.85, 0],
          ),
        ),
        part(new THREE.BoxGeometry(1.3, 0.9, 1), glow, [0, 0.8, 0]),
      ];
    }
    case "hopper":
      // A funnel on four legs, wide end up.
      return [
        part(
          new THREE.CylinderGeometry(0.75, 0.25, 0.9, 8, 1, true),
          materials.machinePaint,
          [0, 1.75, 0],
        ),
        ...[
          [-0.45, -0.45],
          [-0.45, 0.45],
          [0.45, -0.45],
          [0.45, 0.45],
        ].map(([x = 0, z = 0]) =>
          part(new THREE.BoxGeometry(0.08, 1.3, 0.08), materials.darkMetal, [
            x,
            0.9,
            z,
          ]),
        ),
      ];
    case "mill":
      // A bed from side to side, two posts carrying a beam over it, and a
      // spindle hanging from the beam, whose tip glows while it cuts.
      return [
        part(
          new THREE.BoxGeometry(2.3, 0.35, 1.3),
          materials.machinePaint,
          [0, 0.42, 0],
        ),
        part(new THREE.BoxGeometry(1, 0.1, 0.9), materials.hull, [0, 0.65, 0]),
        ...[-1, 1].map((x) =>
          part(new THREE.BoxGeometry(0.22, 1.9, 0.3), materials.darkMetal, [
            x,
            1.3,
            0,
          ]),
        ),
        part(
          new THREE.BoxGeometry(2.3, 0.28, 0.34),
          materials.machinePaint,
          [0, 2.3, 0],
        ),
        part(
          new THREE.BoxGeometry(0.36, 0.55, 0.42),
          materials.hull,
          [0.2, 1.95, 0],
        ),
        part(
          new THREE.CylinderGeometry(0.07, 0.07, 0.65, 8),
          materials.darkMetal,
          [0.2, 1.35, 0],
        ),
        part(
          new THREE.CylinderGeometry(0.11, 0.03, 0.2, 8),
          glow,
          [0.2, 0.95, 0],
        ),
      ];
    case "conveyor": {
      // A long belt on two legs, sloping up from side to side, with a light
      // along it that glows while it runs.
      const belt = part(
        new THREE.BoxGeometry(3, 0.12, 0.9),
        materials.darkMetal,
        [0, 1.05, 0],
      );
      belt.rotation.z = 0.25;
      const light = part(
        new THREE.BoxGeometry(2.6, 0.05, 0.2),
        glow,
        [0, 1.14, 0],
      );
      light.rotation.z = 0.25;
      return [
        belt,
        light,
        part(
          new THREE.BoxGeometry(0.2, 0.6, 0.7),
          materials.machinePaint,
          [-1, 0.55, 0],
        ),
        part(
          new THREE.BoxGeometry(0.2, 1.2, 0.7),
          materials.machinePaint,
          [1, 0.85, 0],
        ),
      ];
    }
    case "reactor":
    case "tank": {
      const [radius, height] = kind === "reactor" ? [0.9, 3.2] : [1.3, 1.6];
      return [
        part(
          new THREE.CylinderGeometry(radius, radius, height, 16),
          kind === "reactor" ? materials.foil : materials.hull,
          [0, 0.25 + height / 2, 0],
        ),
        // A band round the vessel that glows while it works.
        part(
          new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
          glow,
          [0, 0.25 + height * 0.6, 0],
        ),
      ];
    }
  }
}

/**
 * A Plant: vessels on a plinth, with the plant that feeds and empties them
 * beside them, and a cooling fan on top that turns while it runs, when the
 * vessels glow. During Assembly the plinth goes down, then the vessels
 * rise.
 */
export function createPlantModel(shape: PlantShape): StructureModel {
  const plant = new THREE.Group();
  plant.name = shape.name;
  const [width, depth] = shape.plinth;
  const statusLightMaterial = materials.statusOff.clone();
  const glow = materials.statusOff.clone();
  plant.add(
    part(
      new THREE.BoxGeometry(width, 0.25, depth),
      materials.darkMetal,
      [0, 0.12, 0],
    ),
    part(new THREE.SphereGeometry(0.08, 8, 6), statusLightMaterial, [
      width / 2 - 0.2,
      0.3,
      depth / 2 - 0.1,
    ]),
  );
  const upper = new THREE.Group();
  for (const vessel of shape.vessels) {
    const group = new THREE.Group();
    group.add(...plantVesselParts(vessel.kind, glow));
    // Scaled about the plinth's top, so that it still stands on it.
    const scale = vessel.scale ?? 1;
    group.position.set(vessel.at[0], PLINTH_TOP * (1 - scale), vessel.at[1]);
    group.scale.setScalar(scale);
    upper.add(group);
  }
  upper.add(
    part(new THREE.BoxGeometry(1.4, 1.4, 1.8), materials.machinePaint, [
      shape.feederAt,
      0.95,
      0,
    ]),
    part(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), materials.darkMetal, [
      shape.feederAt - 0.8,
      1.2,
      0.6,
    ]),
  );
  const fan = new THREE.Group();
  fan.position.set(shape.feederAt, 1.75, 0);
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
