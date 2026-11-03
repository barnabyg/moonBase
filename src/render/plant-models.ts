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
import {
  PLINTH_TOP,
  plantVesselMeshes,
  type PlantVessel,
} from "./plant-vessels";

// The Plants, and the other Structures built the same way. Their vessels are
// drawn in plant-vessels.ts.

/** How fast a running Plant's cooling fan turns, in turns per real second. */
const PLANT_FAN_TURNS_PER_SECOND = 1.5;

/** How high above the plinth's top the pipes from the vessels run. */
const PIPE_HEIGHT = 0.2;

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
    group.add(...plantVesselMeshes(vessel, glow));
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
