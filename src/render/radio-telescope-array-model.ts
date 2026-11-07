import * as THREE from "three";
import { materials, part, roundedBox, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The radio telescope array.

/** How many antenna tiles a side its field has. */
const TILES_A_SIDE = 4;
/** From one tile's centre to the next. */
const TILE_SPACING = 3.2;
/** A tile's ground mat, square. */
const TILE_SIZE = 2.2;
const MAT_HEIGHT = 0.05;
/** The crossed dipoles' height above the mat. */
const DIPOLE_HEIGHT = 0.9;
/** Where the correlator's cabinet stands, beside the field. */
const CORRELATOR_Z = 6.9;

/**
 * One antenna tile: a wire-mesh ground mat with a short mast, on top of which
 * two dipoles cross at right angles, as in a low-frequency radio array.
 */
function createTile(): THREE.Group {
  const tile = new THREE.Group();
  tile.add(
    part(
      new THREE.BoxGeometry(TILE_SIZE, MAT_HEIGHT, TILE_SIZE),
      materials.darkMetal,
      [0, MAT_HEIGHT / 2, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.05, 0.07, DIPOLE_HEIGHT, 8),
      materials.aluminium,
      [0, MAT_HEIGHT + DIPOLE_HEIGHT / 2, 0],
    ),
    ...[Math.PI / 4, -Math.PI / 4].map((turn) => {
      const dipole = part(
        new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.04, 0.04),
        materials.aluminium,
        [0, MAT_HEIGHT + DIPOLE_HEIGHT, 0],
      );
      dipole.rotation.y = turn;
      return dipole;
    }),
  );
  return tile;
}

/**
 * A radio telescope array: one antenna field of sixteen tiles in a square, each
 * a ground mat with two crossed dipoles on a short mast, and beside them the
 * correlator's cabinet, with its radiator and status light. It has no moving
 * parts. During Assembly the cabinet goes down first, then the tiles a row at a
 * time.
 */
export function createRadioTelescopeArrayModel(): StructureModel {
  const group = new THREE.Group();
  group.name = "Radio telescope array";
  const statusLightMaterial = materials.statusOff.clone();

  const correlator = new THREE.Group();
  correlator.position.set(0, 0, CORRELATOR_Z);
  correlator.add(
    part(roundedBox(1.6, 1.1, 0.9, 0.05), materials.foil, [0, 0.55, 0]),
    part(
      new THREE.BoxGeometry(1.4, 0.04, 0.5),
      materials.radiator,
      [0, 1.12, 0],
    ),
    part(
      new THREE.SphereGeometry(0.07, 8, 6),
      statusLightMaterial,
      [0.6, 0.9, -0.47],
    ),
  );
  group.add(correlator);

  const offset = ((TILES_A_SIDE - 1) * TILE_SPACING) / 2;
  const tiles: THREE.Group[] = [];
  for (let row = 0; row < TILES_A_SIDE; row++) {
    for (let column = 0; column < TILES_A_SIDE; column++) {
      const tile = createTile();
      tile.position.set(
        column * TILE_SPACING - offset,
        0,
        row * TILE_SPACING - offset,
      );
      tiles.push(tile);
      group.add(tile);
    }
  }

  return {
    group,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      correlator.visible = f > 0;
      for (const [index, tile] of tiles.entries()) {
        tile.visible = f >= (index + 1) / tiles.length;
      }
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}
