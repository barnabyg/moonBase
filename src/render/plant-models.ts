import * as THREE from "three";
import {
  boxAt,
  detailParts,
  materials,
  part,
  placed,
  rodGeometry,
  type DetailParts,
} from "./materials";
import type { StructureModel } from "./models";

// The Plants, and the other Structures built the same way.

/** How fast a running Plant's cooling fan turns, in turns per real second. */
const PLANT_FAN_TURNS_PER_SECOND = 1.5;
/** The height of the top of a Plant's plinth, which its vessels stand on. */
const PLINTH_TOP = 0.25;

/** How high above the plinth's top the pipes from the vessels run. */
const PIPE_HEIGHT = 0.2;
/** A reactor's radius and height, standing on the plinth. */
const REACTOR = { radius: 0.9, height: 3.2 } as const;
/** A tank's radius and height, standing on the plinth. */
const TANK = { radius: 1.3, height: 1.6 } as const;
/** A chamber's radius and length, and the height of its axis, held off the plinth by its cradles. */
const CHAMBER = { radius: 0.75, length: 2.6, axis: 1.2 } as const;

/**
 * A vessel standing on a Plant's plinth. A reactor is tall and narrow, a
 * tank squat and wide, a chamber a drum lying on its side, an oven a low
 * tunnel with a conveyor running through it, a stack a block of cell
 * plates, a hopper a funnel on legs that Regolith is tipped into, a mill a
 * machine tool, with a spindle hanging from a gantry over its bed, and a
 * conveyor a long sloping belt. The rest are fixtures beside them: bottles a
 * rack of gas bottles, a radiator a panel shedding heat to space, panels a
 * pallet of finished solar panels, and cassettes a rack of wafer cassettes.
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
    | "conveyor"
    | "bottles"
    | "radiator"
    | "panels"
    | "cassettes";
  /** Where its centre stands on the plinth, across and front to back. */
  readonly at: readonly [number, number];
  /** How much bigger it is than the plain vessel of its kind; 1 if not given. */
  readonly scale?: number;
  /** What a conveyor carries along its belt, if anything. */
  readonly carries?: "panels" | "boards" | "optics" | "ice";
}

/** The kinds of vessel a pipe runs from to the feeder, as they hold what flows. */
const PIPED_KINDS: ReadonlySet<PlantVessel["kind"]> = new Set([
  "reactor",
  "tank",
  "chamber",
  "stack",
]);

/** The sizes and parts of a Plant's model, in metres. */
interface PlantShape {
  readonly name: string;
  /** The plinth's width across and depth from front to back. */
  readonly plinth: readonly [number, number];
  readonly vessels: readonly PlantVessel[];
  /** Where the box of plant that feeds and empties it stands, across. */
  readonly feederAt: number;
}

/**
 * An extraction plant: a tall molten regolith reactor, with a rack of
 * bottles of the oxygen it draws off.
 */
const EXTRACTION_PLANT: PlantShape = {
  name: "Extraction plant",
  plinth: [4, 3.2],
  vessels: [
    { kind: "reactor", at: [-0.7, 0] },
    { kind: "bottles", at: [1.1, -1.22] },
  ],
  feederAt: 1.1,
};

/**
 * A large extraction plant: a wider plinth with a big molten regolith cell,
 * fed from a hopper of Regolith beside it, a slimmer oxygen separator
 * column behind, and a rack of oxygen bottles.
 */
const LARGE_EXTRACTION_PLANT: PlantShape = {
  name: "Large extraction plant",
  plinth: [6.2, 4.6],
  vessels: [
    { kind: "reactor", at: [-1.4, 0.3], scale: 1.35 },
    { kind: "reactor", at: [0.2, -1.4], scale: 0.6 },
    { kind: "hopper", at: [-1.6, -1.7] },
    { kind: "bottles", at: [1.9, -1.55] },
  ],
  feederAt: 1.9,
};

/**
 * A water-processing plant: a heated tank that melts the ice and boils it
 * off, and a small radiator where the steam condenses back into clean water.
 */
const WATER_PROCESSING_PLANT: PlantShape = {
  name: "Water plant",
  plinth: [3.9, 3],
  vessels: [
    { kind: "tank", at: [-0.6, 0] },
    { kind: "radiator", at: [1.1, -1.22], scale: 0.55 },
  ],
  feederAt: 1.1,
};

/**
 * An electrolysis plant: a smaller ice melter beside a stack of
 * electrolyser cells, whose gaps glow while it works, and a rack of bottles
 * of the gas it makes.
 */
const ELECTROLYSIS_PLANT: PlantShape = {
  name: "Electrolysis plant",
  plinth: [3.9, 3],
  vessels: [
    { kind: "tank", at: [-0.95, 0.55], scale: 0.7 },
    { kind: "stack", at: [-0.6, -0.85] },
    { kind: "bottles", at: [1.1, -1.22] },
  ],
  feederAt: 1.1,
};

/**
 * A vacuum fabrication plant: a crystal furnace's drum, with a rack of
 * cassettes of the wafers it cuts.
 */
const VACUUM_FABRICATION_PLANT: PlantShape = {
  name: "Vacuum fabrication plant",
  plinth: [3.9, 3],
  vessels: [
    { kind: "chamber", at: [-0.7, 0] },
    { kind: "cassettes", at: [1.1, -1.25] },
  ],
  feederAt: 1.1,
};

/** A circuit board plant: a reflow oven, with boards coming out of it. */
const CIRCUIT_BOARD_PLANT: PlantShape = {
  name: "Circuit board plant",
  plinth: [3.9, 3],
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
  plinth: [5, 3],
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
    { kind: "conveyor", at: [0.05, 0], scale: 0.7, carries: "ice" },
  ],
  feederAt: 1.6,
};

/**
 * An array works: a small casting furnace for the frames and a deposition
 * chamber for the cells behind a long belt carrying panels, which are
 * stacked on a pallet as they come off it.
 */
const ARRAY_WORKS: PlantShape = {
  name: "Array works",
  plinth: [5.4, 4],
  vessels: [
    { kind: "conveyor", at: [-0.8, 0.8], carries: "panels" },
    { kind: "tank", at: [-1.5, -1.05], scale: 0.42 },
    { kind: "chamber", at: [-0.2, -1.05], scale: 0.45 },
    { kind: "panels", at: [1.7, 1.45] },
  ],
  feederAt: 1.7,
};

/**
 * A propellant plant: two lagged tanks of liquid oxygen, and the liquefier,
 * with the radiator that sheds its heat.
 */
const PROPELLANT_PLANT: PlantShape = {
  name: "Propellant plant",
  plinth: [5.2, 3.2],
  vessels: [
    { kind: "tank", at: [-1.5, 0], scale: 0.62 },
    { kind: "tank", at: [0, 0], scale: 0.62 },
    { kind: "radiator", at: [-0.75, -1.35] },
  ],
  feederAt: 1.7,
};

/**
 * A large propellant plant: a row of three tanks, and the reactor behind
 * them between the liquefier's two radiators.
 */
const LARGE_PROPELLANT_PLANT: PlantShape = {
  name: "Large propellant plant",
  plinth: [6.6, 4],
  vessels: [
    { kind: "tank", at: [-2.1, 0.7], scale: 0.62 },
    { kind: "tank", at: [-0.5, 0.7], scale: 0.62 },
    { kind: "tank", at: [1.1, 0.7], scale: 0.62 },
    { kind: "chamber", at: [-0.5, -1], scale: 0.6 },
    { kind: "radiator", at: [1.2, -1.5] },
    { kind: "radiator", at: [-2.4, -1.5] },
  ],
  feederAt: 2.5,
};

/** An optics works: a grinding mill with a small belt of finished optics. */
const OPTICS_WORKS: PlantShape = {
  name: "Optics works",
  plinth: [4.8, 3],
  vessels: [
    { kind: "mill", at: [-1, 0], scale: 0.8 },
    { kind: "conveyor", at: [0.9, 0], scale: 0.5, carries: "optics" },
  ],
  feederAt: 1.8,
};

/** A grinding line: two mills side by side, feeding one long belt. */
const GRINDING_LINE: PlantShape = {
  name: "Grinding line",
  plinth: [6, 4.2],
  vessels: [
    { kind: "mill", at: [-1.5, 0.9], scale: 0.8 },
    { kind: "mill", at: [0.6, 0.9], scale: 0.8 },
    { kind: "conveyor", at: [-0.4, -1.1], scale: 0.9, carries: "optics" },
  ],
  feederAt: 2.3,
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
  "propellant-plant": PROPELLANT_PLANT,
  "large-propellant-plant": LARGE_PROPELLANT_PLANT,
  "optics-works": OPTICS_WORKS,
  "grinding-line": GRINDING_LINE,
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
      const { radius, length, axis } = CHAMBER;
      const lying = (mesh: THREE.Mesh) => {
        mesh.rotation.x = Math.PI / 2;
        return mesh;
      };
      return [
        lying(
          part(
            new THREE.CylinderGeometry(radius, radius, length, 16),
            materials.foil,
            [0, axis, 0],
          ),
        ),
        // A band round the vessel that glows while it works.
        lying(
          part(
            new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
            glow,
            [0, axis, 0.5],
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
    case "bottles":
    case "radiator":
    case "panels":
    case "cassettes":
      // Made only of detail, which plantVesselDetail adds.
      return [];
    case "reactor":
    case "tank": {
      const { radius, height } = kind === "reactor" ? REACTOR : TANK;
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

/** A ladder up the outside of a vessel, standing off it at the given depth. */
function ladder(
  z: number,
  bottom: number,
  top: number,
): THREE.BufferGeometry[] {
  const rungs = Math.floor((top - bottom) / 0.3);
  return [
    ...[-0.18, 0.18].map((x) =>
      rodGeometry(
        new THREE.Vector3(x, bottom, z),
        new THREE.Vector3(x, top, z),
        0.02,
      ),
    ),
    ...Array.from({ length: rungs }, (_, index) => {
      const y = bottom + 0.2 + index * 0.3;
      return rodGeometry(
        new THREE.Vector3(-0.18, y, z),
        new THREE.Vector3(0.18, y, z),
        0.015,
      );
    }),
  ];
}

/** Where a conveyor's belt runs, sloping up from side to side. */
const CONVEYOR_BELT = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 1.05, 0),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.25),
  new THREE.Vector3(1, 1, 1),
);

/** A geometry placed on a conveyor's belt, along it, above it and across it. */
function onBelt(
  geometry: THREE.BufferGeometry,
  at: readonly [number, number, number],
  rotation?: readonly [number, number, number],
  scale?: readonly [number, number, number],
): THREE.BufferGeometry {
  return placed(geometry, at, rotation, scale).applyMatrix4(CONVEYOR_BELT);
}

/** How far along a conveyor's belt each thing it carries lies. */
const CONVEYOR_LOADS = [-1, 0, 1];
/** The height above the middle of a conveyor's belt that what it carries sits at. */
const CONVEYOR_LOAD_HEIGHT = 0.13;

/** What a conveyor carries along its belt. */
function conveyorLoad(
  carries: NonNullable<PlantVessel["carries"]>,
  detail: DetailParts,
): void {
  const y = CONVEYOR_LOAD_HEIGHT;
  switch (carries) {
    case "panels":
      detail.add(
        materials.solarCell,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.BoxGeometry(0.7, 0.03, 0.62), [x, y, 0]),
        ),
      );
      return;
    case "boards":
      detail.add(
        materials.circuitBoard,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.BoxGeometry(0.45, 0.025, 0.32), [x, y, 0]),
        ),
      );
      return;
    case "optics":
      detail.add(
        materials.darkMetal,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), [x, y, 0]),
        ),
      );
      detail.add(
        materials.precisionOptic,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(
            new THREE.SphereGeometry(0.17, 12, 6),
            [x, y + 0.03, 0],
            [0, 0, 0],
            [1, 0.3, 1],
          ),
        ),
      );
      return;
    case "ice":
      detail.add(
        materials.ice,
        ...CONVEYOR_LOADS.flatMap((x, index) =>
          [-0.18, 0.18].map((z) =>
            onBelt(
              new THREE.IcosahedronGeometry(0.15, 0),
              [x + z * 0.5, y + 0.05, z],
              [index, z * 4, 0],
            ),
          ),
        ),
      );
      return;
  }
}

/**
 * The finer parts of one vessel, as its parts are placed: flanges and bands,
 * domed ends, nozzles, ladders and gauges, so that each kind reads as what
 * it is. A fixture is made only of these.
 */
function plantVesselDetail(vessel: PlantVessel, detail: DetailParts): void {
  switch (vessel.kind) {
    case "reactor": {
      const top = PLINTH_TOP + REACTOR.height;
      detail.add(
        materials.darkMetal,
        placed(new THREE.CylinderGeometry(0.96, 1, 0.3, 16), [0, 0.4, 0]),
        ...[1.25, 3.1].map((y) =>
          placed(new THREE.CylinderGeometry(0.94, 0.94, 0.07, 16), [0, y, 0]),
        ),
        ...ladder(1, 0.3, top + 0.1),
      );
      detail.add(
        materials.aluminium,
        placed(
          new THREE.SphereGeometry(0.9, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          [0, top, 0],
          [0, 0, 0],
          [1, 0.35, 1],
        ),
        placed(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), [
          0.3,
          top + 0.35,
          0,
        ]),
        placed(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), [
          0.3,
          top + 0.6,
          0,
        ]),
      );
      return;
    }
    case "tank": {
      const top = PLINTH_TOP + TANK.height;
      detail.add(
        materials.hull,
        placed(
          new THREE.SphereGeometry(1.3, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2),
          [0, top, 0],
          [0, 0, 0],
          [1, 0.25, 1],
        ),
      );
      detail.add(
        materials.darkMetal,
        placed(new THREE.CylinderGeometry(1.34, 1.37, 0.18, 16), [0, 0.34, 0]),
        placed(new THREE.CylinderGeometry(1.33, 1.33, 0.06, 16), [
          0,
          top - 0.02,
          0,
        ]),
        // A manway on the front, and a nozzle on top.
        placed(
          new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12),
          [0, 0.95, 1.33],
          [Math.PI / 2, 0, 0],
        ),
        placed(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), [
          0.45,
          top + 0.4,
          0,
        ]),
        // The brackets of a sight glass showing how full it is.
        ...[0.5, 1.55].map((y) =>
          rodGeometry(
            new THREE.Vector3(-0.9, y, 0.9),
            new THREE.Vector3(-0.98, y, 0.98),
            0.025,
          ),
        ),
      );
      detail.add(
        materials.visor,
        rodGeometry(
          new THREE.Vector3(-0.98, 0.45, 0.98),
          new THREE.Vector3(-0.98, 1.6, 0.98),
          0.035,
        ),
      );
      detail.add(
        materials.accent,
        placed(
          new THREE.TorusGeometry(0.15, 0.025, 6, 12),
          [0.45, top + 0.62, 0],
          [Math.PI / 2, 0, 0],
        ),
      );
      return;
    }
    case "chamber": {
      const { radius, length, axis: y } = CHAMBER;
      const end = length / 2;
      const dish = (z: number, turn: number) =>
        placed(
          new THREE.SphereGeometry(
            radius,
            16,
            6,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2,
          ),
          [0, y, z],
          [turn, 0, 0],
          [1, 0.25, 1],
        );
      // A dished door on the front and a dished end behind.
      detail.add(materials.hull, dish(end, Math.PI / 2));
      detail.add(
        materials.darkMetal,
        dish(-end, -Math.PI / 2),
        placed(new THREE.TorusGeometry(radius - 0.03, 0.05, 6, 24), [
          0,
          y,
          end,
        ]),
        ...[-1, -0.4, 1.05].map((z) =>
          placed(
            new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.08, 16),
            [0, y, z],
            [Math.PI / 2, 0, 0],
          ),
        ),
        boxAt(0.5, 0.04, 0.6, [0, y + radius, -0.6]),
      );
      detail.add(
        materials.visor,
        placed(
          new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12),
          [0.3, y + 0.15, end + 0.16],
          [Math.PI / 2, 0, 0],
        ),
      );
      // The vacuum pump on top.
      detail.add(
        materials.machinePaint,
        boxAt(0.45, 0.35, 0.55, [0, y + radius + 0.19, -0.6]),
      );
      return;
    }
    case "oven":
      detail.add(
        materials.darkMetal,
        // Exhaust stacks, with caps.
        ...[-0.3, 0.3].flatMap((x) => [
          placed(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), [
            x,
            1.75,
            -0.8,
          ]),
          placed(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8), [
            x,
            2.02,
            -0.8,
          ]),
        ]),
        // Cooling fins down one side, and a control panel on the other.
        ...[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((z) =>
          boxAt(0.06, 0.7, 0.04, [0.68, 1.05, z]),
        ),
        boxAt(0.08, 0.45, 0.5, [-0.69, 1.1, 0.6]),
      );
      detail.add(materials.visor, boxAt(0.02, 0.25, 0.35, [-0.74, 1.15, 0.6]));
      // Boards going in at one end and coming out at the other.
      detail.add(
        materials.circuitBoard,
        ...[-1.38, 1.38].map((z) => boxAt(0.5, 0.025, 0.32, [0, 0.695, z])),
      );
      detail.add(
        materials.seal,
        ...[-1.38, 1.38].flatMap((z) =>
          [-0.1, 0.1].map((x) => boxAt(0.12, 0.02, 0.1, [x, 0.715, z])),
        ),
      );
      return;
    case "stack":
      // Tie rods holding the plates together, and the manifolds that carry
      // the gases off.
      detail.add(
        materials.chrome,
        ...[0.4, 1.3].flatMap((y) =>
          [-0.5, 0.5].map((z) =>
            rodGeometry(
              new THREE.Vector3(-0.8, y, z),
              new THREE.Vector3(0.8, y, z),
              0.03,
            ),
          ),
        ),
      );
      detail.add(
        materials.aluminium,
        ...[-0.3, 0.3].flatMap((z) => [
          rodGeometry(
            new THREE.Vector3(-0.8, 1.55, z),
            new THREE.Vector3(0.8, 1.55, z),
            0.06,
            8,
          ),
          ...[-0.66, 0.66].map((x) =>
            rodGeometry(
              new THREE.Vector3(x, 1.38, z),
              new THREE.Vector3(x, 1.55, z),
              0.04,
            ),
          ),
        ]),
      );
      return;
    case "hopper": {
      const legs = [
        [-0.45, -0.45],
        [0.45, -0.45],
        [0.45, 0.45],
        [-0.45, 0.45],
      ] as const;
      detail.add(
        materials.darkMetal,
        placed(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 8), [0, 2.2, 0]),
        placed(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 8), [0, 1.08, 0]),
        // Braces across each side between the legs.
        ...legs.map(([x, z], index) => {
          const [nextX, nextZ] = legs[(index + 1) % legs.length] ?? legs[0];
          return rodGeometry(
            new THREE.Vector3(x, 0.35, z),
            new THREE.Vector3(nextX, 1.2, nextZ),
            0.02,
          );
        }),
      );
      // The Regolith heaped inside.
      detail.add(
        materials.regolith,
        placed(new THREE.CylinderGeometry(0.5, 0.7, 0.14, 8), [0, 2.12, 0]),
      );
      return;
    }
    case "mill":
      detail.add(
        materials.darkMetal,
        placed(
          new THREE.CylinderGeometry(0.16, 0.16, 0.35, 10),
          [0.2, 2.62, 0],
        ),
      );
      // A control cabinet in front, with its screen and stop button.
      detail.add(materials.hull, boxAt(0.5, 1, 0.3, [0.8, 0.75, 0.85]));
      detail.add(materials.visor, boxAt(0.3, 0.2, 0.02, [0.8, 1.05, 1.01]));
      detail.add(
        materials.accent,
        placed(
          new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10),
          [0.8, 0.8, 1.01],
          [Math.PI / 2, 0, 0],
        ),
      );
      return;
    case "conveyor":
      detail.add(
        materials.aluminium,
        ...[-0.47, 0.47].map((z) =>
          onBelt(new THREE.BoxGeometry(3, 0.14, 0.05), [0, 0.05, z]),
        ),
      );
      detail.add(
        materials.darkMetal,
        ...[-1.5, 1.5].map((x) =>
          onBelt(
            new THREE.CylinderGeometry(0.1, 0.1, 0.96, 10),
            [x, 0, 0],
            [Math.PI / 2, 0, 0],
          ),
        ),
      );
      // The motor driving the belt.
      detail.add(
        materials.machinePaint,
        onBelt(new THREE.BoxGeometry(0.3, 0.3, 0.25), [-1.35, -0.15, 0.6]),
      );
      if (vessel.carries !== undefined) conveyorLoad(vessel.carries, detail);
      return;
    case "bottles": {
      const xs = [-0.48, -0.16, 0.16, 0.48];
      detail.add(
        materials.hull,
        ...xs.flatMap((x) => [
          placed(new THREE.CylinderGeometry(0.13, 0.13, 1, 10), [x, 0.8, 0]),
          placed(
            new THREE.SphereGeometry(
              0.13,
              10,
              5,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ),
            [x, 1.3, 0],
          ),
        ]),
      );
      detail.add(
        materials.accent,
        ...xs.map((x) =>
          placed(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 10), [
            x,
            1.15,
            0,
          ]),
        ),
      );
      detail.add(
        materials.darkMetal,
        ...xs.map((x) =>
          placed(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), [x, 1.48, 0]),
        ),
        boxAt(1.4, 0.06, 0.42, [0, 0.28, 0]),
        ...[-0.68, 0.68].map((x) =>
          rodGeometry(
            new THREE.Vector3(x, 0.25, -0.18),
            new THREE.Vector3(x, 1.1, -0.18),
            0.03,
          ),
        ),
        // Bars in front of and behind the bottles, holding them in the rack.
        ...[-0.18, 0.17].map((z) =>
          rodGeometry(
            new THREE.Vector3(-0.68, 1, z),
            new THREE.Vector3(0.68, 1, z),
            0.02,
          ),
        ),
      );
      return;
    }
    case "radiator":
      detail.add(materials.radiator, boxAt(1.6, 1.2, 0.04, [0, 1.2, 0]));
      detail.add(
        materials.aluminium,
        ...[-0.65, -0.39, -0.13, 0.13, 0.39, 0.65].map((x) =>
          boxAt(0.03, 1.2, 0.07, [x, 1.2, 0]),
        ),
        ...[0.58, 1.82].map((y) =>
          rodGeometry(
            new THREE.Vector3(-0.8, y, 0),
            new THREE.Vector3(0.8, y, 0),
            0.05,
          ),
        ),
      );
      detail.add(
        materials.darkMetal,
        ...[-0.82, 0.82].flatMap((x) => [
          rodGeometry(
            new THREE.Vector3(x, 0.25, 0),
            new THREE.Vector3(x, 1.85, 0),
            0.04,
          ),
          boxAt(0.1, 0.04, 0.4, [x, 0.27, 0]),
        ]),
      );
      return;
    case "panels": {
      const layers = 6;
      detail.add(materials.crateFrame, boxAt(1.2, 0.1, 0.85, [0, 0.3, 0]));
      detail.add(
        materials.aluminium,
        ...Array.from({ length: layers }, (_, index) =>
          boxAt(1.1, 0.035, 0.75, [0, 0.37 + index * 0.06, 0]),
        ),
      );
      detail.add(
        materials.solarCell,
        ...Array.from({ length: layers }, (_, index) =>
          boxAt(1.04, 0.008, 0.69, [0, 0.39 + index * 0.06, 0]),
        ),
      );
      detail.add(
        materials.darkMetal,
        ...[-0.58, 0.58].flatMap((x) =>
          [-0.4, 0.4].map((z) =>
            rodGeometry(
              new THREE.Vector3(x, 0.35, z),
              new THREE.Vector3(x, 0.8, z),
              0.025,
            ),
          ),
        ),
      );
      return;
    }
    case "cassettes": {
      const shelves = [0.65, 1.05];
      const xs = [-0.29, 0, 0.29];
      detail.add(
        materials.aluminium,
        ...shelves.map((y) => boxAt(0.9, 0.03, 0.4, [0, y, 0])),
        ...[-0.44, 0.44].flatMap((x) =>
          [-0.18, 0.18].map((z) =>
            rodGeometry(
              new THREE.Vector3(x, 0.25, z),
              new THREE.Vector3(x, 1.1, z),
              0.02,
            ),
          ),
        ),
      );
      detail.add(
        materials.seal,
        ...shelves.flatMap((y) =>
          xs.map((x) => boxAt(0.24, 0.26, 0.3, [x, y + 0.145, 0])),
        ),
      );
      // A wafer lying on top of each cassette.
      detail.add(
        materials.chrome,
        ...shelves.flatMap((y) =>
          xs.map((x) =>
            placed(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16), [
              x,
              y + 0.285,
              0,
            ]),
          ),
        ),
      );
      return;
    }
  }
}

/**
 * The pipes from the vessels that hold what flows to the feeder, on low
 * supports across the plinth: each runs back from its vessel to a lane of
 * its own, behind the middle, then along it to the feeder, so that they lie
 * side by side.
 */
function plantPipes(shape: PlantShape, detail: DetailParts): void {
  const y = PLINTH_TOP + PIPE_HEIGHT;
  const feederFace = shape.feederAt - 0.7;
  const piped = shape.vessels.filter((vessel) => PIPED_KINDS.has(vessel.kind));
  for (const [lane, vessel] of piped.entries()) {
    const [x, z] = vessel.at;
    const laneZ = -0.45 - lane * 0.16;
    detail.add(
      materials.aluminium,
      rodGeometry(
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x, y, laneZ),
        0.06,
        8,
      ),
      placed(new THREE.SphereGeometry(0.075, 8, 6), [x, y, laneZ]),
      rodGeometry(
        new THREE.Vector3(x, y, laneZ),
        new THREE.Vector3(feederFace, y, laneZ),
        0.06,
        8,
      ),
    );
    detail.add(
      materials.darkMetal,
      placed(
        new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8),
        [feederFace - 0.03, y, laneZ],
        [0, 0, Math.PI / 2],
      ),
      ...Array.from(
        { length: Math.floor((feederFace - x) / 0.8) },
        (_, index) =>
          boxAt(0.1, PIPE_HEIGHT - 0.04, 0.14, [
            feederFace - 0.4 - index * 0.8,
            PLINTH_TOP + (PIPE_HEIGHT - 0.04) / 2,
            laneZ,
          ]),
      ),
    );
  }
}

/**
 * The feeder's detail: louvres along its back, a control panel on its
 * front, and a shroud round the fan on top.
 */
function feederDetail(feederAt: number, detail: DetailParts): void {
  detail.add(
    materials.darkMetal,
    ...[0.5, 0.65, 0.8, 0.95, 1.1].map((y) =>
      boxAt(1, 0.04, 0.05, [feederAt, y, -0.92]),
    ),
    placed(
      new THREE.TorusGeometry(0.63, 0.05, 6, 24),
      [feederAt, 1.72, 0],
      [Math.PI / 2, 0, 0],
    ),
    placed(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), [
      feederAt,
      1.71,
      0,
    ]),
    boxAt(0.5, 0.4, 0.05, [feederAt - 0.25, 1.15, 0.925]),
  );
  detail.add(
    materials.visor,
    boxAt(0.34, 0.2, 0.02, [feederAt - 0.25, 1.18, 0.955]),
  );
}

/**
 * The plinth's deck plate, and the yellow markings along its front and
 * back edges.
 */
function plinthDetail(
  [width, depth]: readonly [number, number],
  detail: DetailParts,
): void {
  detail.add(
    materials.aluminium,
    boxAt(width - 0.16, 0.02, depth - 0.16, [0, PLINTH_TOP + 0.005, 0]),
  );
  detail.add(
    materials.padMarking,
    ...[-1, 1].map((side) =>
      boxAt(width - 0.3, 0.012, 0.05, [
        0,
        PLINTH_TOP + 0.002,
        side * (depth / 2 - 0.04),
      ]),
    ),
  );
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
  const plinth = detailParts();
  plinthDetail(shape.plinth, plinth);
  plant.add(...plinth.meshes());
  const upper = new THREE.Group();
  for (const vessel of shape.vessels) {
    const group = new THREE.Group();
    const detail = detailParts();
    plantVesselDetail(vessel, detail);
    group.add(...plantVesselParts(vessel.kind, glow), ...detail.meshes());
    // Scaled about the plinth's top, so that it still stands on it.
    const scale = vessel.scale ?? 1;
    group.position.set(vessel.at[0], PLINTH_TOP * (1 - scale), vessel.at[1]);
    group.scale.setScalar(scale);
    upper.add(group);
  }
  const pipework = detailParts();
  plantPipes(shape, pipework);
  feederDetail(shape.feederAt, pipework);
  upper.add(...pipework.meshes());
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
