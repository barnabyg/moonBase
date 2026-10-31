import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxAt, materials, part, rod } from "./materials";

// The solar arrays, in each of the Structure types that look different.

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

/** What sets one kind of solar array's model apart from another. */
interface SolarArrayShape {
  readonly name: string;
  /**
   * Whether its tracking drive and hinges are sealed against Dust: a black
   * rubber cover over the base, a boot round the foot of the mast and a
   * strip over each hinge.
   */
  readonly sealed: boolean;
  /** Whether a grid of copper electrodes is laid over the cells, both sides. */
  readonly dustScreen: boolean;
  /** How wide the panel is, and how thick each fold of it. */
  readonly panelWidth: number;
  readonly panelThickness: number;
  /** The face of each fold, towards the sun. */
  readonly cells: THREE.Material;
  /** The back of each fold, away from the sun. */
  readonly backing: THREE.Material;
  /** The four thin edges of each fold: its frame, if it has one. */
  readonly edges: THREE.Material;
  /** Whether a thin boom runs up each edge of the panel, holding it taut. */
  readonly edgeBooms: boolean;
  /**
   * Whether it stands on the steel skid it was shipped on, with a lifting
   * eye at each corner.
   */
  readonly skid: boolean;
}

export const SOLAR_ARRAY: SolarArrayShape = {
  name: "Solar array",
  sealed: false,
  dustScreen: false,
  panelWidth: PANEL_WIDTH,
  panelThickness: 0.04,
  cells: materials.solarCell,
  backing: materials.backsheet,
  edges: materials.aluminium,
  edgeBooms: false,
  skid: false,
};
const DUST_SEALED_SOLAR_ARRAY: SolarArrayShape = {
  ...SOLAR_ARRAY,
  name: "Dust-sealed solar array",
  sealed: true,
};
const DUST_SCREENED_SOLAR_ARRAY: SolarArrayShape = {
  ...SOLAR_ARRAY,
  name: "Dust-screened solar array",
  sealed: true,
  dustScreen: true,
};
/**
 * A thin-film solar array: a wider, thinner panel of dull bronze-violet
 * cells on a flexible backing, held taut by a boom up each edge.
 */
const THIN_FILM_SOLAR_ARRAY: SolarArrayShape = {
  ...SOLAR_ARRAY,
  name: "Thin-film solar array",
  panelWidth: 3.4,
  panelThickness: 0.015,
  cells: materials.thinFilmCell,
  backing: materials.filmBacking,
  edges: materials.filmBacking,
  edgeBooms: true,
};
/**
 * A prefabricated solar array: a solar array standing on the yellow steel
 * skid it was shipped and lifted on.
 */
const PREFABRICATED_SOLAR_ARRAY: SolarArrayShape = {
  ...SOLAR_ARRAY,
  name: "Prefabricated solar array",
  skid: true,
};
/** The length and width of a prefabricated solar array's skid. */
const SKID_SIZE = [2.8, 1.8] as const;
/** Across each fold of a dust screen's panel, how far up each electrode runs, as a share of the fold. */
const ELECTRODES_AT = [0.15, 0.38, 0.62, 0.85];

export function createSolarArrayModel(
  shape: SolarArrayShape = SOLAR_ARRAY,
): SolarArrayModel {
  const array = new THREE.Group();
  array.name = shape.name;

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
  if (shape.sealed) {
    array.add(
      part(
        new THREE.CylinderGeometry(0.75, 0.9, 0.08, 8),
        materials.seal,
        [0, 0.34, 0],
      ),
    );
  }
  // The box where the panel's cable comes down the mast and leaves for the base.
  array.add(
    part(
      new THREE.BoxGeometry(0.3, 0.22, 0.18),
      materials.hull,
      [-0.62, 0.41, -0.5],
    ),
  );
  if (shape.skid) {
    array.add(...createSkid());
  } else {
    array.add(createArrayFeet());
  }

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
  if (shape.sealed) {
    // Pleated, so it stretches as the mast rises.
    for (const [index, radius] of [0.22, 0.19, 0.16].entries()) {
      head.add(
        part(
          new THREE.CylinderGeometry(radius - 0.02, radius, 0.1, 8),
          materials.seal,
          [0, 0.09 + index * 0.1, 0],
        ),
      );
    }
  }

  // The panel is a strip of cells folded like a fan. Each fold is hinged to
  // the one below, and the whole strip rides up on top of the mast.
  const panel = new THREE.Group();
  head.add(panel);
  const foldHeight = PANEL_HEIGHT / PANEL_FOLDS;
  panel.add(...createPanelMount(shape, foldHeight));
  // In the order of a box's faces: its four edges, then its front and back.
  const foldMaterials = [
    shape.edges,
    shape.edges,
    shape.edges,
    shape.edges,
    shape.cells,
    shape.backing,
  ];
  const folds: THREE.Group[] = [];
  let parent: THREE.Object3D = panel;
  for (let index = 0; index < PANEL_FOLDS; index++) {
    const hinge = new THREE.Group();
    hinge.position.y = index === 0 ? 0 : foldHeight;
    hinge.add(
      part(
        new THREE.BoxGeometry(
          shape.panelWidth,
          foldHeight,
          shape.panelThickness,
        ),
        foldMaterials,
        [0, foldHeight / 2, 0],
      ),
    );
    if (shape.sealed && index > 0) {
      hinge.add(
        part(
          new THREE.BoxGeometry(shape.panelWidth + 0.04, 0.06, 0.07),
          materials.seal,
          [0, 0, 0],
        ),
      );
    }
    if (shape.edgeBooms) {
      hinge.add(
        ...[-1, 1].map((side) =>
          part(
            new THREE.CylinderGeometry(0.02, 0.02, foldHeight, 5),
            materials.aluminium,
            [(side * shape.panelWidth) / 2, foldHeight / 2, 0],
          ),
        ),
      );
    }
    if (shape.dustScreen) {
      for (const side of [-1, 1]) {
        hinge.add(
          ...ELECTRODES_AT.map((share) =>
            part(
              new THREE.BoxGeometry(shape.panelWidth - 0.1, 0.03, 0.006),
              materials.electrode,
              [0, foldHeight * share, side * 0.023],
            ),
          ),
          // The bus bar down one edge that feeds them.
          part(
            new THREE.BoxGeometry(0.04, foldHeight, 0.006),
            materials.electrode,
            [shape.panelWidth / 2 - 0.06, foldHeight / 2, side * 0.023],
          ),
        );
      }
    }
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

/**
 * What holds a solar array's panel on its mast, riding up with the panel:
 * the drive head that turns it on top of the mast, and a cross beam behind
 * the lowest fold, braced from the drive head to each end. The folds above
 * fold down in front of the lowest, so the back stays clear.
 */
function createPanelMount(
  shape: SolarArrayShape,
  foldHeight: number,
): THREE.Object3D[] {
  const behind = -(shape.panelThickness / 2 + 0.06);
  const beamY = foldHeight * 0.45;
  const beamReach = shape.panelWidth * 0.42;
  const driveHead = new THREE.Vector3(0, -0.05, behind);
  return [
    part(
      new THREE.CylinderGeometry(0.17, 0.17, 0.24, 10),
      materials.darkMetal,
      [0, -0.1, 0],
    ),
    part(new THREE.BoxGeometry(0.22, 0.2, 0.2), materials.hull, [
      0,
      -0.06,
      behind - 0.06,
    ]),
    part(
      new THREE.BoxGeometry(beamReach * 2, 0.08, 0.08),
      materials.aluminium,
      [0, beamY, behind],
    ),
    part(
      new THREE.BoxGeometry(0.08, foldHeight * 0.9, 0.08),
      materials.aluminium,
      [0, foldHeight * 0.45, behind],
    ),
    ...[-1, 1].map((side) =>
      rod(
        driveHead,
        new THREE.Vector3(side * beamReach * 0.85, beamY, behind),
        0.025,
        materials.aluminium,
        6,
      ),
    ),
  ];
}

/**
 * Four splayed feet round a solar array's base, each ending in a round pad
 * that spreads its weight over the Regolith, merged into one mesh.
 */
function createArrayFeet(): THREE.Mesh {
  const pieces = [0, 1, 2, 3].flatMap((index) => {
    const turn = Math.PI / 4 + (index * Math.PI) / 2;
    return [
      boxAt(0.7, 0.12, 0.16, [1.05, 0.08, 0]).rotateY(turn),
      new THREE.CylinderGeometry(0.2, 0.22, 0.06, 10)
        .translate(1.4, 0.03, 0)
        .rotateY(turn),
    ];
  });
  const feet = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return part(feet, materials.darkMetal, [0, 0, 0]);
}

/**
 * The steel skid a prefabricated solar array was shipped and lifted on: two
 * runners joined by cross beams under its base, with a lifting eye at each
 * corner.
 */
function createSkid(): THREE.Object3D[] {
  const [length, width] = SKID_SIZE;
  const runners = [-1, 1].map((side) =>
    part(new THREE.BoxGeometry(length, 0.14, 0.18), materials.machinePaint, [
      0,
      0.07,
      (side * width) / 2,
    ]),
  );
  const beams = [-1, 1].map((side) =>
    part(new THREE.BoxGeometry(0.16, 0.12, width), materials.machinePaint, [
      (side * (length - 0.3)) / 2,
      0.06,
      0,
    ]),
  );
  const eyes = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => {
      const eye = part(
        new THREE.TorusGeometry(0.08, 0.025, 4, 10),
        materials.darkMetal,
        [(x * (length - 0.15)) / 2, 0.22, (z * width) / 2],
      );
      eye.rotation.y = Math.PI / 2;
      return eye;
    }),
  );
  return [...runners, ...beams, ...eyes];
}

/** The solar arrays that look different from a plain one, by Structure type. */
export const SOLAR_ARRAY_SHAPES: Readonly<Record<string, SolarArrayShape>> = {
  "dust-sealed-solar-array": DUST_SEALED_SOLAR_ARRAY,
  "dust-screened-solar-array": DUST_SCREENED_SOLAR_ARRAY,
  "thin-film-solar-array": THIN_FILM_SOLAR_ARRAY,
  "prefabricated-solar-array": PREFABRICATED_SOLAR_ARRAY,
};
