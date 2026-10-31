import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxAt, lathe, materials, part } from "./materials";

// The packing crates, the base's stockpile of them, and its ice store.

/** How thick a crate's edge frame and braces are. */
const CRATE_FRAME = 0.035;
/** How far a crate's frame stands proud of its panels. */
const CRATE_PROUD = 0.006;

/**
 * A diagonal brace across one face of a crate, corner to corner inside the
 * frame, on the face whose outward normal is +z before it is turned.
 */
function crateBrace(
  across: number,
  height: number,
  depth: number,
  turn: number,
): THREE.BufferGeometry {
  const run = across - 2 * CRATE_FRAME;
  const rise = height - 2 * CRATE_FRAME;
  const brace = new THREE.BoxGeometry(
    Math.hypot(run, rise) - CRATE_FRAME,
    CRATE_FRAME * 0.8,
    2 * CRATE_PROUD,
  );
  brace.rotateZ(Math.atan2(rise, run));
  brace.translate(0, height / 2, depth / 2 - CRATE_PROUD);
  return brace.rotateY(turn);
}

/**
 * A crate's panels, its frame and braces, and its stencilled label, merged
 * into one geometry with a group for each of `crateMaterials`.
 */
function createCrateGeometry(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  const t = CRATE_FRAME;
  const panels = [
    boxAt(
      width - 2 * CRATE_PROUD,
      height - 2 * CRATE_PROUD,
      depth - 2 * CRATE_PROUD,
      [0, height / 2, 0],
    ),
  ];
  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // The corner posts.
      frame.push(
        boxAt(t, height, t, [
          sx * (width / 2 - t / 2),
          height / 2,
          sz * (depth / 2 - t / 2),
        ]),
      );
    }
  }
  for (const y of [t / 2, height - t / 2]) {
    for (const s of [-1, 1]) {
      // The rails round the base and the lid.
      frame.push(boxAt(width, t, t, [0, y, s * (depth / 2 - t / 2)]));
      frame.push(boxAt(t, t, depth, [s * (width / 2 - t / 2), y, 0]));
    }
  }
  // Battens across the lid, and a brace on every side.
  for (const s of [-1, 1]) {
    frame.push(
      boxAt(t, 2 * CRATE_PROUD, depth, [
        (s * width) / 6,
        height - CRATE_PROUD,
        0,
      ]),
    );
  }
  frame.push(
    crateBrace(width, height, depth, 0),
    crateBrace(width, height, depth, Math.PI),
    crateBrace(depth, height, width, Math.PI / 2),
    crateBrace(depth, height, width, -Math.PI / 2),
  );
  // A label on each long side, in the corner the brace leaves clear.
  const labels = [0, Math.PI].map((turn) =>
    boxAt(width * 0.3, height * 0.18, 2 * CRATE_PROUD, [
      -width / 4 + t / 2,
      height * 0.72,
      depth / 2 - CRATE_PROUD,
    ]).rotateY(turn),
  );
  const layers = [panels, frame, labels].map((pieces) => {
    const merged = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    return merged;
  });
  const crate = mergeGeometries(layers, true);
  for (const layer of layers) layer.dispose();
  return crate;
}

/** A crate's materials, in the order of its geometry's groups. */
const crateMaterials = [
  materials.crate,
  materials.crateFrame,
  materials.accent,
];

/** Crate geometries by size, shared by every crate of that size. */
const crateGeometries = new Map<string, THREE.BufferGeometry>();

/**
 * A packing crate holding one Component, or the given size of crate: framed
 * and braced, with a label on its long sides. It stands on the ground at its
 * origin.
 */
export function createCrateModel(
  width = 0.6,
  height = 0.4,
  depth = 0.5,
): THREE.Mesh {
  const size = `${width}x${height}x${depth}`;
  let geometry = crateGeometries.get(size);
  if (geometry === undefined) {
    geometry = createCrateGeometry(width, height, depth);
    crateGeometries.set(size, geometry);
  }
  const crate = part(geometry, materials.crate, [0, 0, 0]);
  crate.material = crateMaterials;
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

/** How far from the ice store's middle its outer containers stand. */
const ICE_STORE_RING = 0.8;
/** The radius of an ice container, within the ice store's ground, and its height. */
const ICE_CONTAINER_RADIUS = 0.35;
const ICE_CONTAINER_HEIGHT = 0.58;

const iceContainerMaterial = new THREE.MeshStandardMaterial({
  color: 0xdde3e6,
  metalness: 0.35,
  roughness: 0.5,
});
const iceMaterial = new THREE.MeshStandardMaterial({
  color: 0xbfe4f5,
  metalness: 0,
  roughness: 0.3,
});

/**
 * The base's ice store: insulated, open-topped white containers, each with
 * a pale blue mound of ice in it that rises with its level. Only those
 * holding ice show, so that it looks unlike the Regolith heap or the crates.
 */
export function createIceStoreModel(containers: number): {
  readonly group: THREE.Group;
  /** Shows a container at each of these levels, from 0 to 1, in order. */
  showLevels(levels: readonly number[]): void;
} {
  const group = new THREE.Group();
  group.name = "Ice store";
  const shell = lathe(
    [
      [0, 0],
      [ICE_CONTAINER_RADIUS, 0],
      [ICE_CONTAINER_RADIUS, ICE_CONTAINER_HEIGHT],
      [ICE_CONTAINER_RADIUS - 0.03, ICE_CONTAINER_HEIGHT],
      [ICE_CONTAINER_RADIUS - 0.03, 0.04],
      [0, 0.04],
    ],
    16,
  );
  const mound = lathe(
    [
      [ICE_CONTAINER_RADIUS - 0.03, 0],
      [ICE_CONTAINER_RADIUS - 0.03, 1],
      [0.2, 1.1],
      [0, 1.14],
    ],
    16,
  );
  // The first in the middle, then round it.
  const parts = Array.from({ length: containers }, (_, index) => {
    const angle = ((index - 1) / (containers - 1)) * Math.PI * 2;
    const reach = index === 0 ? 0 : ICE_STORE_RING;
    const container = part(shell, iceContainerMaterial, [
      Math.cos(angle) * reach,
      0,
      Math.sin(angle) * reach,
    ]);
    container.name = "Ice container";
    const ice = part(mound, iceMaterial, [0, 0.04, 0]);
    ice.name = "Ice";
    container.add(ice);
    container.visible = false;
    group.add(container);
    return { container, ice };
  });
  return {
    group,
    showLevels(levels) {
      for (const [index, { container, ice }] of parts.entries()) {
        const level = levels[index] ?? 0;
        container.visible = level > 0;
        ice.scale.y = (ICE_CONTAINER_HEIGHT - 0.06) * level;
      }
    },
  };
}
