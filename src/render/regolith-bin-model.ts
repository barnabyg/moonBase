import * as THREE from "three";
import { materials, part, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The Regolith bin.

/** How far across, and front to back, the bin's walls stand, in metres. */
const BIN_SIDE = 3.6;
/** How high its walls stand above the ground. */
const WALL_HEIGHT = 1.2;
const WALL_THICKNESS = 0.12;
/** How far below the top of the walls the Regolith lies when the bin is full. */
const FULL_GAP = 0.15;
/** The lowest the Regolith is drawn, a thin layer, so that an empty bin still has a floor. */
const EMPTY_DEPTH = 0.02;

/**
 * A Regolith bin: four walls of bolted panels round a square bay, open at the
 * top, with the Regolith in it rising and falling with its share of the stock.
 * During Assembly the walls go up from the ground, and it holds nothing until
 * they stand.
 */
export function createRegolithBinModel(
  groundMaterial?: THREE.Material,
): StructureModel {
  const model = new THREE.Group();
  model.name = "Regolith bin";

  const walls = new THREE.Group();
  walls.name = "Walls";
  const half = BIN_SIDE / 2;
  const wall = (width: number, depth: number, x: number, z: number) =>
    part(
      new THREE.BoxGeometry(width, WALL_HEIGHT, depth),
      materials.aluminium,
      [x, WALL_HEIGHT / 2, z],
    );
  walls.add(
    wall(BIN_SIDE, WALL_THICKNESS, 0, half),
    wall(BIN_SIDE, WALL_THICKNESS, 0, -half),
    wall(WALL_THICKNESS, BIN_SIDE, half, 0),
    wall(WALL_THICKNESS, BIN_SIDE, -half, 0),
  );
  // A post at each corner, where the panels are bolted together.
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      walls.add(
        part(
          new THREE.BoxGeometry(0.22, WALL_HEIGHT + 0.1, 0.22),
          materials.darkMetal,
          [x, (WALL_HEIGHT + 0.1) / 2, z],
        ),
      );
    }
  }

  const fillHeight = WALL_HEIGHT - FULL_GAP;
  const regolith = part(
    new THREE.BoxGeometry(
      BIN_SIDE - WALL_THICKNESS,
      1,
      BIN_SIDE - WALL_THICKNESS,
    ),
    groundMaterial ?? materials.regolith,
    [0, 0, 0],
  );
  regolith.name = "Regolith";
  const showFill = (fraction: number) => {
    const depth = Math.max(
      fillHeight * Math.min(Math.max(fraction, 0), 1),
      EMPTY_DEPTH,
    );
    regolith.scale.y = depth;
    regolith.position.y = depth / 2;
  };
  showFill(0);

  const statusLightMaterial = materials.statusOff.clone();
  const statusLight = part(
    new THREE.SphereGeometry(0.07, 8, 6),
    statusLightMaterial,
    [half - 0.3, WALL_HEIGHT + 0.12, half],
  );

  model.add(walls, regolith, statusLight);

  return {
    group: model,
    setAssembled: (fraction) => {
      const share = Math.min(Math.max(fraction, 0), 1);
      walls.visible = share > 0;
      walls.scale.y = Math.max(share, 0.001);
      regolith.visible = share >= 1;
      statusLight.visible = share >= 1;
    },
    setFacing: () => undefined,
    setStatusLight: (state) => {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: showFill,
    setLit: () => undefined,
  };
}
