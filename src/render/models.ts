import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  lathe,
  lightWindow,
  materials,
  part,
  rod,
  rods,
  roundedBox,
  windowGlass,
} from "./materials";

// Low-poly models built in code, with physically based materials (ADR-0004).
// Sizes are in metres, and each model stands on the ground at its origin.

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

const SOLAR_ARRAY: SolarArrayShape = {
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
  /** Shows that the Mission Director lives in a Habitat; nothing for anything else. */
  setOccupied?(occupied: boolean): void;
  /** How high above the ground any light it has shines from. */
  readonly lightHeight?: number;
}

/** The solar arrays that look different from a plain one, by Structure type. */
const SOLAR_ARRAY_SHAPES: Readonly<Record<string, SolarArrayShape>> = {
  "dust-sealed-solar-array": DUST_SEALED_SOLAR_ARRAY,
  "dust-screened-solar-array": DUST_SCREENED_SOLAR_ARRAY,
  "thin-film-solar-array": THIN_FILM_SOLAR_ARRAY,
  "prefabricated-solar-array": PREFABRICATED_SOLAR_ARRAY,
};

/** The model for a type of Structure from the data catalogue. */
export function createStructureModel(structureTypeId: string): StructureModel {
  if (structureTypeId === "battery-bank") {
    return createBatteryBankModel(BATTERY_BANK);
  }
  if (structureTypeId === "large-battery-bank") {
    return createBatteryBankModel(LARGE_BATTERY_BANK);
  }
  if (structureTypeId === "light-mast") return createLightMastModel(LIGHT_MAST);
  if (structureTypeId === "tall-light-mast") {
    return createLightMastModel(TALL_LIGHT_MAST);
  }
  if (structureTypeId === "whipple-shielded-battery-bank") {
    return createBatteryBankModel(WHIPPLE_SHIELDED_BATTERY_BANK);
  }
  if (structureTypeId === "habitat") return createHabitatModel(HABITAT);
  if (structureTypeId === "hardened-habitat") {
    return createHabitatModel(HARDENED_HABITAT);
  }
  if (structureTypeId === "regolith-shielding") {
    return createRegolithShieldingModel(REGOLITH_SHIELDING);
  }
  if (structureTypeId === "sintered-regolith-shielding") {
    return createRegolithShieldingModel(SINTERED_REGOLITH_SHIELDING);
  }
  if (structureTypeId === "water-wall") return createWaterWallModel();
  if (structureTypeId === "landing-pad") {
    return createLandingPadModel(LANDING_PAD);
  }
  if (structureTypeId === "lit-landing-pad") {
    return createLandingPadModel(LIT_LANDING_PAD);
  }
  if (structureTypeId === "sintered-landing-pad") {
    return createSinteredLandingPadModel();
  }
  const plant = PLANT_SHAPES[structureTypeId];
  if (plant !== undefined) return createPlantModel(plant);
  const array = createSolarArrayModel(
    SOLAR_ARRAY_SHAPES[structureTypeId] ?? SOLAR_ARRAY,
  );
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

/** The share of Assembly spent raising the pole, before the light goes on top. */
const POLE_SHARE = 0.7;

/** The sizes and parts of a Light Mast's model, in metres. */
interface LightMastShape {
  readonly name: string;
  /** The height of its light above the ground. */
  readonly height: number;
  /** The radius of its weighted base at the ground. */
  readonly baseRadius: number;
  readonly poleRadius: number;
  /** How many bars of lights cross on top, each with a light at both ends. */
  readonly lightBars: number;
  /** Whether guy wires hold the pole up, from three anchors round the base. */
  readonly guyed: boolean;
}

const LIGHT_MAST: LightMastShape = {
  name: "Light mast",
  height: 6,
  baseRadius: 0.65,
  poleRadius: 0.09,
  lightBars: 1,
  guyed: false,
};

/**
 * A tall Light Mast: a pole nearly twice as tall and stouter, held by three
 * guy wires, with two bars of lights crossed on top, one for each light
 * head.
 */
const TALL_LIGHT_MAST: LightMastShape = {
  name: "Tall Light Mast",
  height: 11,
  baseRadius: 1,
  poleRadius: 0.14,
  lightBars: 2,
  guyed: true,
};

/**
 * A Light Mast: a tall pole on a weighted base, with a bar of lights on top
 * that glow while they are on. During Assembly the pole rises and then the
 * light bar goes on top.
 */
function createLightMastModel(shape: LightMastShape): StructureModel {
  const mast = new THREE.Group();
  mast.name = shape.name;
  const baseHeight = 0.25 * (shape.baseRadius / LIGHT_MAST.baseRadius);
  const scale = shape.baseRadius / LIGHT_MAST.baseRadius;

  const statusLightMaterial = materials.statusOff.clone();
  mast.add(
    part(
      new THREE.CylinderGeometry(
        shape.baseRadius - 0.1 * scale,
        shape.baseRadius,
        baseHeight,
        8,
      ),
      materials.darkMetal,
      [0, baseHeight / 2, 0],
    ),
    part(new THREE.SphereGeometry(0.07, 8, 6), statusLightMaterial, [
      0.45 * scale,
      baseHeight + 0.05,
      0.3 * scale,
    ]),
  );

  const poleLength = shape.height - baseHeight;
  const pole = part(
    new THREE.CylinderGeometry(shape.poleRadius * 0.67, shape.poleRadius, 1, 8),
    materials.hull,
    [0, 0, 0],
  );
  mast.add(pole);

  // The bars of lights face every way, so the light falls all round.
  const lightMaterial = materials.statusOff.clone();
  const head = new THREE.Group();
  head.position.y = shape.height;
  for (let bar = 0; bar < shape.lightBars; bar++) {
    const lights = new THREE.Group();
    lights.rotation.y = (bar * Math.PI) / shape.lightBars;
    lights.position.y = bar * 0.14;
    lights.add(
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
    head.add(lights);
  }
  mast.add(head);

  // Guy wires from three quarters of the way up to anchors round the base,
  // fitted once the pole is up.
  const guys = new THREE.Group();
  if (shape.guyed) {
    const top = new THREE.Vector3(0, shape.height * 0.75, 0);
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2 + Math.PI / 6;
      const anchor = new THREE.Vector3(
        Math.cos(angle) * (shape.baseRadius + 0.05),
        0.05,
        Math.sin(angle) * (shape.baseRadius + 0.05),
      );
      const wire = part(
        new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(anchor), 4),
        materials.aluminium,
        [0, 0, 0],
      );
      wire.position.copy(top.clone().add(anchor).multiplyScalar(0.5));
      wire.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        top.clone().sub(anchor).normalize(),
      );
      guys.add(
        wire,
        part(
          new THREE.CylinderGeometry(0.06, 0.08, 0.1, 6),
          materials.darkMetal,
          [anchor.x, 0.05, anchor.z],
        ),
      );
    }
  }
  mast.add(guys);

  return {
    group: mast,
    lightHeight: shape.height,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / POLE_SHARE, 1), 0.01);
      pole.scale.y = poleLength * raised;
      pole.position.y = baseHeight + (poleLength * raised) / 2;
      head.visible = f > POLE_SHARE;
      guys.visible = f > POLE_SHARE;
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

/** The height of the Habitat's deck, which the envelope and airlock stand on. */
const HABITAT_DECK_HEIGHT = 0.3;
/** The radius of the Habitat's envelope where it meets the deck. */
const HABITAT_DOME_RADIUS = 3.4;
/** How tall the envelope stands, as a share of its radius. */
const HABITAT_DOME_SQUASH = 0.75;
/** How far the airlock's hatch stands out from the Habitat's centre, along +x. */
export const HABITAT_HATCH_OUT = 4.44;
/** How far round from the airlock, either way, no meridian strap runs, in degrees. */
const AIRLOCK_STRAP_CLEARANCE = 25;

/** What sets one kind of Habitat's model apart from another. */
interface HabitatShape {
  readonly name: string;
  readonly envelopeMaterial: THREE.Material;
  /** How high up the dome each hoop strap runs, as a share of its radius. */
  readonly strapsAt: readonly number[];
  /**
   * How many meridian straps would run evenly round the dome from its crown
   * to the deck; those that would cross the airlock are left out.
   */
  readonly meridians: number;
}

const HABITAT: HabitatShape = {
  name: "Inflatable Habitat",
  envelopeMaterial: materials.envelope,
  strapsAt: [0.35, 0.75],
  meridians: 8,
};

/**
 * A hardened Habitat: the same dome, so that Regolith shielding fits over
 * it, in a duller, darker armoured envelope, held down by twice as many
 * straps each way.
 */
const HARDENED_HABITAT: HabitatShape = {
  name: "Hardened Habitat",
  envelopeMaterial: materials.armouredEnvelope,
  strapsAt: [0.18, 0.62, 0.8, 0.94],
  meridians: 16,
};

/**
 * The inflatable Habitat: a squat fabric dome, held down by a web of hoop
 * and meridian straps anchored to a deck on levelling feet, round a rigid
 * core, with a rigid airlock standing out on one side through which the
 * Mission Director walks upright. During Assembly the core goes up, the
 * envelope inflates round it, and then the airlock is fitted.
 */
function createHabitatModel(shape: HabitatShape): StructureModel {
  const habitat = new THREE.Group();
  habitat.name = shape.name;

  // The deck, raised on levelling feet, with a rim round its edge.
  const deckRadius = HABITAT_DOME_RADIUS + 0.2;
  const rim = part(
    new THREE.TorusGeometry(deckRadius - 0.02, 0.05, 6, 40),
    materials.aluminium,
    [0, HABITAT_DECK_HEIGHT - 0.03, 0],
  );
  rim.rotation.x = Math.PI / 2;
  habitat.add(
    part(
      new THREE.CylinderGeometry(deckRadius - 0.05, deckRadius, 0.2, 40),
      materials.darkMetal,
      [0, HABITAT_DECK_HEIGHT - 0.1, 0],
    ),
    rim,
    ...Array.from({ length: 10 }, (_, index) => {
      const angle = (index / 10) * Math.PI * 2;
      const foot = new THREE.Group();
      foot.position.set(Math.cos(angle) * 3.2, 0, Math.sin(angle) * 3.2);
      foot.add(
        part(
          new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8),
          materials.aluminium,
          [0, 0.07, 0],
        ),
        part(
          new THREE.CylinderGeometry(0.18, 0.21, 0.04, 12),
          materials.darkMetal,
          [0, 0.02, 0],
        ),
      );
      return foot;
    }),
  );

  const core = part(
    new THREE.CylinderGeometry(0.9, 0.9, 1, 24),
    materials.hull,
    [0, 0, 0],
  );
  const coreHeight = 2.6;
  // The hub where the envelope's crown fastens to the top of the core.
  const hub = part(
    new THREE.CylinderGeometry(1.0, 1.05, 0.14, 24),
    materials.darkMetal,
    [0, HABITAT_DECK_HEIGHT + coreHeight, 0],
  );
  habitat.add(core, hub);

  // The meridian straps go round the dome, leaving the airlock clear, and
  // fasten to anchors on the deck.
  const meridianAngles = Array.from(
    { length: shape.meridians },
    (_, index) => (index / shape.meridians) * 360,
  )
    .filter(
      (degrees) => Math.min(degrees, 360 - degrees) >= AIRLOCK_STRAP_CLEARANCE,
    )
    .map((degrees) => THREE.MathUtils.degToRad(degrees));
  habitat.add(
    ...meridianAngles.map((angle) => {
      const anchor = part(
        roundedBox(0.14, 0.12, 0.22, 0.03),
        materials.darkMetal,
        [
          Math.cos(angle) * (HABITAT_DOME_RADIUS + 0.06),
          HABITAT_DECK_HEIGHT + 0.06,
          -Math.sin(angle) * (HABITAT_DOME_RADIUS + 0.06),
        ],
      );
      anchor.rotation.y = angle;
      return anchor;
    }),
  );

  // The envelope, with its restraint straps, inflates from the deck up.
  const envelope = new THREE.Group();
  envelope.position.y = HABITAT_DECK_HEIGHT;
  const dome = part(
    new THREE.SphereGeometry(
      HABITAT_DOME_RADIUS,
      40,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    ),
    shape.envelopeMaterial,
    [0, 0, 0],
  );
  dome.scale.y = HABITAT_DOME_SQUASH;
  envelope.add(dome);
  for (const [index, height] of shape.strapsAt.entries()) {
    const angle = Math.asin(height);
    const strap = part(
      new THREE.TorusGeometry(
        HABITAT_DOME_RADIUS * Math.cos(angle) + 0.02,
        0.05,
        4,
        40,
      ),
      materials.foil,
      [0, HABITAT_DOME_RADIUS * height * HABITAT_DOME_SQUASH, 0],
    );
    strap.rotation.x = Math.PI / 2;
    strap.name = `Strap ${index + 1}`;
    envelope.add(strap);
  }
  for (const [index, angle] of meridianAngles.entries()) {
    // A quarter circle up from the deck to the crown, squashed with the dome.
    const meridian = new THREE.Group();
    meridian.rotation.y = angle;
    meridian.scale.y = HABITAT_DOME_SQUASH;
    meridian.add(
      part(
        new THREE.TorusGeometry(
          HABITAT_DOME_RADIUS + 0.02,
          0.04,
          4,
          24,
          Math.PI / 2,
        ),
        materials.foil,
        [0, 0, 0],
      ),
    );
    meridian.name = `Meridian strap ${index + 1}`;
    envelope.add(meridian);
  }
  habitat.add(envelope);

  // The airlock: a rigid vestibule standing on the deck and running into
  // the envelope, with an upright hatch in a collar at its outer end, a
  // step up to it and a handrail either side. Regolith shielding heaped
  // over the Habitat leaves the collar and everything on it showing.
  const airlock = new THREE.Group();
  const inner = 1.4;
  const collarX = HABITAT_HATCH_OUT - 0.11;
  const sill = HABITAT_DECK_HEIGHT + 0.12;
  const hatchHeight = 2.0;
  airlock.add(
    part(roundedBox(collarX - inner, 2.3, 1.6, 0.3), materials.hull, [
      (inner + collarX) / 2,
      HABITAT_DECK_HEIGHT + 1.15,
      0,
    ]),
    part(roundedBox(0.14, 2.45, 1.8, 0.1), materials.darkMetal, [
      collarX,
      HABITAT_DECK_HEIGHT + 1.225,
      0,
    ]),
    // Stiffening ribs round the vestibule.
    ...[0.9, 1.8].map((back) =>
      part(roundedBox(0.1, 2.38, 1.68, 0.32), materials.aluminium, [
        collarX - back,
        HABITAT_DECK_HEIGHT + 1.19,
        0,
      ]),
    ),
    // The hatch, hinged on one side, with a handle on the other.
    part(roundedBox(0.08, hatchHeight, 0.92, 0.12), materials.hull, [
      HABITAT_HATCH_OUT - 0.04,
      sill + hatchHeight / 2,
      0,
    ]),
    ...[0.35, hatchHeight - 0.35].map((height) =>
      part(
        new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8),
        materials.darkMetal,
        [HABITAT_HATCH_OUT - 0.02, sill + height, 0.48],
      ),
    ),
    part(roundedBox(0.05, 0.34, 0.06, 0.02), materials.darkMetal, [
      HABITAT_HATCH_OUT + 0.04,
      sill + 0.85,
      -0.32,
    ]),
    // A step halfway up from the ground to the sill.
    part(roundedBox(0.42, sill / 2, 1.1, 0.03), materials.darkMetal, [
      HABITAT_HATCH_OUT + 0.2,
      sill / 4,
      0,
    ]),
    ...[-1, 1].flatMap((side) => {
      const z = side * 0.8;
      const out = HABITAT_HATCH_OUT + 0.08;
      return [
        rod(
          new THREE.Vector3(out, sill + 0.3, z),
          new THREE.Vector3(out, sill + 1.6, z),
          0.025,
          materials.aluminium,
        ),
        ...[0.4, 1.5].map((height) =>
          rod(
            new THREE.Vector3(collarX, sill + height, z),
            new THREE.Vector3(out, sill + height, z),
            0.02,
            materials.aluminium,
          ),
        ),
      ];
    }),
  );
  habitat.add(airlock);

  // The status light, on the collar beside the hatch, where it still
  // shows once Regolith shielding covers the deck.
  const statusLightMaterial = materials.statusOff.clone();
  airlock.add(
    part(new THREE.SphereGeometry(0.07, 8, 6), statusLightMaterial, [
      collarX + 0.08,
      sill + 0.7,
      -0.66,
    ]),
  );

  // Windows that glow while the Mission Director lives inside: portholes
  // round the envelope between the meridian straps, and one in the hatch
  // that still shows once Regolith shielding covers the rest, with a lamp
  // over it.
  const glass = windowGlass.clone();
  const portholeHeight = Math.sin(THREE.MathUtils.degToRad(25));
  for (const degrees of [56.25, 123.75, 236.25, 303.75]) {
    const angle = THREE.MathUtils.degToRad(degrees);
    const out = HABITAT_DOME_RADIUS * Math.sqrt(1 - portholeHeight ** 2) - 0.03;
    const at = new THREE.Vector3(
      Math.cos(angle) * out,
      HABITAT_DOME_RADIUS * portholeHeight * HABITAT_DOME_SQUASH,
      -Math.sin(angle) * out,
    );
    // Facing straight out from the squashed dome.
    const normal = new THREE.Vector3(
      at.x,
      at.y / HABITAT_DOME_SQUASH ** 2,
      at.z,
    ).normalize();
    const porthole = new THREE.Group();
    porthole.position.copy(at);
    porthole.lookAt(at.clone().add(normal));
    porthole.add(
      part(
        new THREE.TorusGeometry(0.3, 0.05, 6, 20),
        materials.darkMetal,
        [0, 0, 0],
      ),
      part(new THREE.CircleGeometry(0.29, 20), glass, [0, 0, 0.01]),
    );
    envelope.add(porthole);
  }
  const hatchWindow = part(new THREE.CircleGeometry(0.14, 20), glass, [
    HABITAT_HATCH_OUT + 0.005,
    sill + 1.45,
    0,
  ]);
  hatchWindow.rotation.y = Math.PI / 2;
  const hatchLamp = materials.statusOff.clone();
  airlock.add(
    hatchWindow,
    part(new THREE.BoxGeometry(0.08, 0.08, 0.36), hatchLamp, [
      collarX + 0.1,
      sill + hatchHeight + 0.15,
      0,
    ]),
  );

  // The mission flag, raised on top of the core when the Mission Director
  // moves in, high enough to fly above Regolith shielding. With no air to
  // fly in, it hangs from a rod along its top.
  const flag = new THREE.Group();
  const poleBottom = HABITAT_DECK_HEIGHT + coreHeight;
  const poleTop = 4.9;
  flag.add(
    part(
      new THREE.CylinderGeometry(0.03, 0.03, poleTop - poleBottom, 6),
      materials.aluminium,
      [0, (poleTop + poleBottom) / 2, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.02, 0.02, 1.05, 6).rotateZ(Math.PI / 2),
      materials.aluminium,
      [0.52, poleTop - 0.02, 0],
    ),
    part(new THREE.PlaneGeometry(1.0, 0.62), flagCloth, [
      0.53,
      poleTop - 0.34,
      0,
    ]),
    ...[-1, 1].map((side) => {
      const emblem = part(new THREE.CircleGeometry(0.17, 20), flagEmblem, [
        0.53,
        poleTop - 0.34,
        side * 0.004,
      ]);
      emblem.rotation.y = side < 0 ? Math.PI : 0;
      return emblem;
    }),
  );
  flag.visible = false;
  habitat.add(flag);

  return {
    group: habitat,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / CORE_SHARE, 1), 0.01);
      core.scale.y = coreHeight * raised;
      core.position.y = HABITAT_DECK_HEIGHT + (coreHeight * raised) / 2;
      hub.visible = raised >= 1;
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
    setOccupied(occupied) {
      lightWindow(glass, occupied);
      hatchLamp.color.set(occupied ? 0xfff4dc : 0x222222);
      hatchLamp.emissive.set(occupied ? 0xfff0d0 : 0x000000);
      flag.visible = occupied;
    },
  };
}

/** The mission flag's cloth, and the white disc of the Moon on it. */
const flagCloth = new THREE.MeshStandardMaterial({
  color: 0xe0661b,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
const flagEmblem = new THREE.MeshStandardMaterial({
  color: 0xf4f2ec,
  roughness: 0.9,
});

/** How high Regolith shielding rises over the Habitat's dome. */
const SHIELDING_HEIGHT = 3.4;
/** The radius of the shielding where it meets the ground, just inside its footprint. */
const SHIELDING_BASE_RADIUS = 3.95;

/** What sets one kind of Regolith shielding's model apart from another. */
interface ShieldingShape {
  readonly name: string;
  /** How many layers the regolith printer lays it down in. */
  readonly layers: number;
  /** How many flat faces round each layer. */
  readonly sides: number;
  readonly material: THREE.Material;
  /** Whether a glassy seam shows where each layer meets the next. */
  readonly seams: boolean;
}

const REGOLITH_SHIELDING: ShieldingShape = {
  name: "Regolith shielding",
  layers: 12,
  sides: 20,
  material: materials.regolith,
  seams: false,
};

/**
 * Sintered Regolith shielding: the same dome, in more and thinner courses
 * of darker, fused Regolith, each with a glassy seam along its top, and
 * fewer, flatter faces round it.
 */
const SINTERED_REGOLITH_SHIELDING: ShieldingShape = {
  name: "Sintered Regolith shielding",
  layers: 16,
  sides: 14,
  material: materials.sinteredRegolith,
  seams: true,
};

/**
 * The radius of Regolith shielding's outer surface at a height above the
 * ground: a rounded dome over the Habitat.
 */
function shieldingRadiusAt(height: number): number {
  const h = THREE.MathUtils.clamp(height / SHIELDING_HEIGHT, 0, 1);
  return SHIELDING_BASE_RADIUS * Math.sqrt(1 - h * h);
}

/**
 * Regolith shielding: a thick dome of printed Regolith over the Habitat,
 * with the airlock's hatch left showing. During Assembly it builds up layer
 * by layer from the ground, the layer being printed growing as it goes.
 */
function createRegolithShieldingModel(shape: ShieldingShape): StructureModel {
  const shielding = new THREE.Group();
  shielding.name = shape.name;
  const layerHeight = SHIELDING_HEIGHT / shape.layers;
  const layers = Array.from({ length: shape.layers }, (_, index) => {
    const bottom = index * layerHeight;
    const top = bottom + layerHeight;
    const geometry = new THREE.CylinderGeometry(
      shieldingRadiusAt(top),
      shieldingRadiusAt(bottom),
      layerHeight,
      shape.sides,
    );
    // Grows upwards from its base as it is printed.
    geometry.translate(0, layerHeight / 2, 0);
    const layer = part(geometry, shape.material, [0, bottom, 0]);
    layer.name = `Layer ${index + 1}`;
    if (shape.seams && shieldingRadiusAt(top) > 0.3) {
      const seam = part(
        new THREE.TorusGeometry(shieldingRadiusAt(top), 0.035, 3, shape.sides),
        materials.sinteredGlaze,
        [0, layerHeight, 0],
      );
      seam.rotation.x = Math.PI / 2;
      layer.add(seam);
    }
    shielding.add(layer);
    return layer;
  });

  return {
    group: shielding,
    setAssembled(fraction) {
      const printed = THREE.MathUtils.clamp(fraction, 0, 1) * shape.layers;
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

/** How many bladders a water wall is laid in, one for each it is built from. */
const WATER_WALL_BLADDERS = 4;
/** The height of the ring of bladders' middle, low on the shielding's flank. */
const WATER_WALL_HEIGHT = 1.1;
/** The bladders' thickness, from the shielding out, once full. */
const WATER_WALL_TUBE_RADIUS = 0.55;
/** The gap between two bladders, in radians. */
const WATER_WALL_GAP = 0.12;
/** The wider gap left for the Habitat's airlock, which comes out along +x, in radians. */
const WATER_WALL_AIRLOCK_GAP = 0.6;

/**
 * A water wall: a ring of fat bladders lying round the lower flank of the
 * Regolith shielding over a Habitat, each nearly a quarter of the way
 * round, leaving room for the airlock, held down by webbing straps that run
 * up over the dome. During Assembly the bladders go down one after another
 * and swell as they fill with water.
 */
function createWaterWallModel(): StructureModel {
  const wall = new THREE.Group();
  wall.name = "Water wall";
  const ring =
    shieldingRadiusAt(WATER_WALL_HEIGHT) + WATER_WALL_TUBE_RADIUS * 0.55;
  /** The gap a quarter of the way round from the airlock, a number of times. */
  const gapAt = (quarter: number) =>
    quarter % WATER_WALL_BLADDERS === 0
      ? WATER_WALL_AIRLOCK_GAP
      : WATER_WALL_GAP;
  const bladders = Array.from({ length: WATER_WALL_BLADDERS }, (_, index) => {
    const quarter = (Math.PI * 2) / WATER_WALL_BLADDERS;
    const start = index * quarter + gapAt(index) / 2;
    const end = (index + 1) * quarter - gapAt(index + 1) / 2;
    const bladder = part(
      new THREE.TorusGeometry(ring, WATER_WALL_TUBE_RADIUS, 6, 10, end - start),
      materials.waterBladder,
      [0, WATER_WALL_HEIGHT, 0],
    );
    bladder.name = `Bladder ${index + 1}`;
    bladder.rotation.x = Math.PI / 2;
    bladder.rotation.z = start;
    wall.add(bladder);
    return bladder;
  });
  // A strap over each gap, from the ground up the dome to its crown.
  const straps = Array.from({ length: WATER_WALL_BLADDERS }, (_, index) => {
    const strap = new THREE.Group();
    strap.name = `Strap ${index + 1}`;
    const steps = 6;
    for (let step = 0; step < steps; step++) {
      const bottom = (step / steps) * SHIELDING_HEIGHT;
      const top = ((step + 1) / steps) * SHIELDING_HEIGHT;
      const inner = shieldingRadiusAt(bottom) + 0.03;
      const outer = shieldingRadiusAt(top) + 0.03;
      const length = Math.hypot(top - bottom, inner - outer);
      const piece = part(
        new THREE.BoxGeometry(0.16, length, 0.04),
        materials.bladderStrap,
        [(inner + outer) / 2, (bottom + top) / 2, 0],
      );
      piece.rotation.z = Math.atan2(inner - outer, top - bottom);
      strap.add(piece);
    }
    strap.rotation.y = -(index * Math.PI * 2) / WATER_WALL_BLADDERS;
    wall.add(strap);
    return strap;
  });

  return {
    group: wall,
    setAssembled(fraction) {
      const laid = THREE.MathUtils.clamp(fraction, 0, 1) * WATER_WALL_BLADDERS;
      for (const [index, bladder] of bladders.entries()) {
        const filled = THREE.MathUtils.clamp(laid - index, 0, 1);
        bladder.visible = filled > 0;
        // Laid flat, then swelling as it fills.
        bladder.scale.z = Math.max(0.2 + 0.8 * filled, 0.01);
      }
      for (const strap of straps) strap.visible = laid >= WATER_WALL_BLADDERS;
    },
    setFacing: () => undefined,
    // Like the shielding under it, it has no status light of its own.
    setStatusLight: () => undefined,
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}

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

const BATTERY_BANK: BatteryBankShape = {
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
const WHIPPLE_SHIELDED_BATTERY_BANK: BatteryBankShape = {
  ...BATTERY_BANK,
  name: "Whipple-shielded battery bank",
  bumperGap: 0.15,
};

/**
 * A large battery bank: longer, taller and deeper, with a fourth module, a
 * longer row of charge lights and tall radiator panels at both ends to shed
 * the heat of its bigger heaters.
 */
const LARGE_BATTERY_BANK: BatteryBankShape = {
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
 * A battery bank: an insulated cabinet on a plinth. During Assembly its
 * modules are slid in one by one and then the cabinet closes over them; a row
 * of lights on the front shows how full it is.
 */
function createBatteryBankModel(shape: BatteryBankShape): StructureModel {
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

/** How many panels a landing pad is laid from, as the data catalogue has it. */
const PAD_PANELS = 8;
/** The share of Assembly spent laying the panels, before the beacon goes up. */
const PAD_PANELS_SHARE = 0.85;
/** How tall a pad light's post stands at a lit landing pad's edge. */
const PAD_LIGHT_HEIGHT = 2.6;

/** The parts of a landing pad's model. */
interface LandingPadShape {
  readonly name: string;
  /** How many pad lights stand round its edge, spaced evenly, clear of the beacon. */
  readonly padLights: number;
}

const LANDING_PAD: LandingPadShape = { name: "Landing pad", padLights: 0 };

/**
 * A lit landing pad: a landing pad with a pad light on a short post at
 * each quarter of its edge, its head tilted in over the pad.
 */
const LIT_LANDING_PAD: LandingPadShape = {
  name: "Lit landing pad",
  padLights: 4,
};

/**
 * A landing pad: a disc of interlocking panels laid flat on the graded
 * ground, with a painted ring for the Lander to aim at, a beacon at its
 * edge and any pad lights round it, which glow while they are on. During
 * Assembly the panels go down one by one, then the beacon and pad lights
 * go up. Its radius is the data catalogue's footprint.
 */
function createLandingPadModel(shape: LandingPadShape): StructureModel {
  const pad = new THREE.Group();
  pad.name = shape.name;
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

  const lightMaterial = materials.statusOff.clone();
  const padLights = new THREE.Group();
  for (let index = 0; index < shape.padLights; index++) {
    // Halfway between the beacon's place and the next quarter round.
    const angle = ((index + 0.5) / shape.padLights) * Math.PI * 2;
    const padLight = new THREE.Group();
    padLight.position.set(
      Math.cos(angle) * (radius - 0.35),
      thickness,
      -Math.sin(angle) * (radius - 0.35),
    );
    // Facing the pad's centre, its head tilted down over it.
    padLight.rotation.y = angle + Math.PI;
    const head = new THREE.Group();
    head.position.y = PAD_LIGHT_HEIGHT;
    head.rotation.z = -Math.PI / 6;
    head.add(
      part(
        new THREE.BoxGeometry(0.3, 0.36, 0.6),
        materials.darkMetal,
        [0, 0, 0],
      ),
      part(new THREE.BoxGeometry(0.04, 0.3, 0.52), lightMaterial, [0.16, 0, 0]),
    );
    padLight.add(
      part(
        new THREE.CylinderGeometry(0.06, 0.09, PAD_LIGHT_HEIGHT, 6),
        materials.aluminium,
        [0, PAD_LIGHT_HEIGHT / 2, 0],
      ),
      head,
    );
    padLights.add(padLight);
  }
  pad.add(padLights);

  return {
    group: pad,
    // The scene's one light for the pad lights hangs over the pad's
    // centre, high enough to shine past a Lander standing on it.
    ...(shape.padLights > 0 ? { lightHeight: 10 } : {}),
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const laid = Math.min(f / PAD_PANELS_SHARE, 1) * PAD_PANELS;
      for (const [index, panel] of panels.entries()) {
        panel.visible = laid - index > 0;
      }
      ring.visible = laid >= PAD_PANELS;
      beacon.visible = f > PAD_PANELS_SHARE;
      padLights.visible = f > PAD_PANELS_SHARE;
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

/** The radius of a sintered landing pad, just inside its footprint, and its thickness. */
const SINTERED_PAD_RADIUS = 6.9;
const SINTERED_PAD_THICKNESS = 0.18;
/** How many rings the regolith printer lays a sintered landing pad in, from the middle out. */
const SINTERED_PAD_RINGS = 9;
/** How far out the raised ring the Lander aims at runs. */
const SINTERED_PAD_AIM_RADIUS = 3.75;

/**
 * A sintered landing pad: a seamless disc of dark, fused Regolith, printed
 * in rings from the middle out, with a raised ring for the Lander to aim at
 * and a low lip round its edge, rather than painted panels and a beacon. A
 * small lamp set flush at its edge is its status light. During Assembly the
 * rings go down one by one.
 */
function createSinteredLandingPadModel(): StructureModel {
  const pad = new THREE.Group();
  pad.name = "Sintered landing pad";
  const width = SINTERED_PAD_RADIUS / SINTERED_PAD_RINGS;
  // Alternate rings a shade apart, so that the courses show.
  const shades = [materials.sinteredRegolith, materials.padPanel];
  const rings = Array.from({ length: SINTERED_PAD_RINGS }, (_, index) => {
    const inner = index * width;
    const outer = inner + width;
    // A rectangular cross-section, turned round the middle.
    const ring = part(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(inner, 0),
          new THREE.Vector2(outer, 0),
          new THREE.Vector2(outer, SINTERED_PAD_THICKNESS),
          new THREE.Vector2(inner, SINTERED_PAD_THICKNESS),
          new THREE.Vector2(inner, 0),
        ],
        36,
      ),
      shades[index % 2] ?? materials.sinteredRegolith,
      [0, 0, 0],
    );
    ring.name = `Ring ${index + 1}`;
    pad.add(ring);
    return ring;
  });

  const ridge = (radius: number, thickness: number) => {
    const torus = part(
      new THREE.TorusGeometry(radius, thickness, 4, 48),
      materials.sinteredGlaze,
      [0, SINTERED_PAD_THICKNESS, 0],
    );
    torus.rotation.x = Math.PI / 2;
    return torus;
  };
  const aim = ridge(SINTERED_PAD_AIM_RADIUS, 0.09);
  const lip = ridge(SINTERED_PAD_RADIUS - 0.12, 0.14);
  pad.add(aim, lip);

  const statusLightMaterial = materials.statusOff.clone();
  const statusLight = part(
    new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10),
    statusLightMaterial,
    [SINTERED_PAD_RADIUS - 0.5, SINTERED_PAD_THICKNESS + 0.03, 0],
  );
  pad.add(statusLight);

  return {
    group: pad,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const printed = f * SINTERED_PAD_RINGS;
      for (const [index, ring] of rings.entries()) {
        ring.visible = printed - index > 0;
      }
      aim.visible = printed * width > SINTERED_PAD_AIM_RADIUS;
      lip.visible = f >= 1;
      statusLight.visible = f >= 1;
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

/**
 * Where the regolith printer is laying Regolith on a Structure it prints,
 * as Assembly goes from 0 to 1: how high above the ground, and how far out
 * from the Structure's centre the ring it follows runs. A sintered landing
 * pad is laid flat from the middle out; shielding rises over the Habitat's
 * dome layer by layer.
 */
export function printingAt(
  structureTypeId: string,
  progress: number,
): { readonly height: number; readonly radius: number } {
  const f = THREE.MathUtils.clamp(progress, 0, 1);
  if (structureTypeId === "sintered-landing-pad") {
    return {
      height: SINTERED_PAD_THICKNESS,
      radius: Math.max(f, 0.05) * SINTERED_PAD_RADIUS,
    };
  }
  const height = f * SHIELDING_HEIGHT;
  return { height, radius: shieldingRadiusAt(height) };
}

/** How thick a crate's edge frame and braces are. */
const CRATE_FRAME = 0.035;
/** How far a crate's frame stands proud of its panels. */
const CRATE_PROUD = 0.006;

/** A box of the given size, with its centre at the given point. */
function boxAt(
  width: number,
  height: number,
  depth: number,
  [x, y, z]: readonly [number, number, number],
): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

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

/** The height of every Machine's deck, where a Robot sits to drive it. */
export const MACHINE_SEAT_HEIGHT = 1.15;

/** A Rover's model, facing along its local +z axis. */
export interface RoverModel {
  readonly group: THREE.Group;
}

/** How far each of a Rover's wheels stands from its middle, across and fore and aft. */
const ROVER_WHEEL_AT = 0.95;
const ROVER_WHEEL_RADIUS = 0.42;
/** How far each side of a Rover's frame stands out from its middle. */
const ROVER_FRAME_SIDE = 0.58;
/** The heights of the lower and upper rails down each side of a Rover's frame. */
const ROVER_LOWER_RAIL = 0.4;
const ROVER_UPPER_RAIL = 0.64;
/** The top of a Rover's deck plate, which everything aboard stands on. */
const ROVER_DECK = 0.68;
/** The front, back, sides and top rail of a Rover's cargo bed. */
const ROVER_BED = { front: -0.4, back: -1.22, side: 0.55, top: 1 } as const;
/** Where a Rover's radio mast stands, across and fore and aft. */
const ROVER_MAST_AT = [0.4, -1.12] as const;

/** One geometry of the given pieces, which are disposed of. */
function merged(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

/** A point in a model's frame, where a rod starts or ends. */
function point(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

type Segment = [THREE.Vector3, THREE.Vector3];

/** A Rover's wheels' materials, in the order of their geometry's groups. */
const roverWheelMaterials = [
  materials.wireMesh,
  materials.aluminium,
  materials.darkMetal,
];

/** The geometry of the wheels every Rover shares, made for the first. */
let roverWheelsGeometry: THREE.BufferGeometry | undefined;

/**
 * The Rover: an open tubular frame on four wire-mesh wheels, each on its own
 * suspension under a fender. The Robot sits at the same height as on a
 * Machine, at a small console behind the battery and its radiator; behind
 * it is a railed cargo bed, with a dish antenna to talk to the base from
 * beyond the horizon and a whip antenna for when it is near.
 */
export function createRoverModel(): RoverModel {
  const rover = new THREE.Group();
  rover.name = "Rover";
  roverWheelsGeometry ??= createRoverWheelsGeometry();
  const seat = part(
    new THREE.BoxGeometry(0.5, 0.1, 0.45),
    materials.robotJoint,
    [0, MACHINE_SEAT_HEIGHT - 0.05, 0.12],
  );
  seat.name = "Seat";
  rover.add(
    part(roverWheelsGeometry, roverWheelMaterials, [0, 0, 0]),
    createRoverFrame(),
    ...createRoverSuspension(),
    // The deck plate on top of the frame.
    part(new THREE.BoxGeometry(1.22, 0.03, 2.5), materials.hull, [
      0,
      ROVER_DECK - 0.015,
      -0.015,
    ]),
    part(createRoverFenders(), materials.accent, [0, 0, 0]),
    part(createRoverFittings(), materials.darkMetal, [0, 0, 0]),
    seat,
    // The seat's back, leaning back a little.
    part(
      new THREE.BoxGeometry(0.5, 0.55, 0.07).rotateX(-0.15),
      materials.robotJoint,
      [0, MACHINE_SEAT_HEIGHT + 0.3, -0.17],
    ),
    createRoverRails(),
    createRoverConsole(),
    createRoverBattery(),
    createRoverDish(),
  );
  return { group: rover };
}

/**
 * A Rover's chassis: a braced truss of aluminium tube down each side, an
 * upper and a lower rail, joined by cross tubes, with a bumper at either
 * end and stays up to the fenders, merged into one mesh.
 */
function createRoverFrame(): THREE.Mesh {
  const lower = ROVER_LOWER_RAIL;
  const upper = ROVER_UPPER_RAIL;
  const segments: Segment[] = [];
  for (const side of [-1, 1]) {
    const x = side * ROVER_FRAME_SIDE;
    segments.push(
      [point(x, lower, -1.2), point(x, lower, 1.15)],
      [point(x, upper, -1.28), point(x, upper, 1.25)],
      ...[-1.2, -0.45, 0.45, 1.15].map((z): Segment => [
        point(x, lower, z),
        point(x, upper, z),
      ]),
      [point(x, lower, -0.45), point(x, upper, 0)],
      [point(x, lower, 0.45), point(x, upper, 0)],
      // Out to the corners of the bumpers.
      [point(x, upper, 1.25), point(side * 0.45, 0.5, 1.32)],
      [point(x, upper, -1.28), point(side * 0.45, 0.5, -1.32)],
    );
    // A stay up to each fender, either side of its wheel.
    for (const end of [-1, 1]) {
      for (const along of [-1, 1]) {
        const z = end * ROVER_WHEEL_AT + along * 0.3;
        segments.push([
          point(x, upper, z),
          point(side * (ROVER_WHEEL_AT - 0.17), 0.8, z + along * 0.02),
        ]);
      }
    }
  }
  segments.push(
    ...[-1.2, 0, 1.15].map((z): Segment => [
      point(-ROVER_FRAME_SIDE, lower, z),
      point(ROVER_FRAME_SIDE, lower, z),
    ]),
    [point(-0.45, 0.5, 1.32), point(0.45, 0.5, 1.32)],
    [point(-0.45, 0.5, -1.32), point(0.45, 0.5, -1.32)],
  );
  return rods(segments, 0.03, materials.aluminium);
}

/**
 * Each of a Rover's wheels hangs on an upper and a lower wishbone out from
 * the frame to an upright that carries its axle, with a polished shock
 * absorber up from the lower wishbone to under the fender. Merged into one
 * mesh of arms and one of shock absorbers.
 */
function createRoverSuspension(): THREE.Mesh[] {
  const arms: Segment[] = [];
  const shocks: Segment[] = [];
  for (const side of [-1, 1]) {
    const frame = side * ROVER_FRAME_SIDE;
    const upright = side * 0.76;
    for (const end of [-1, 1]) {
      const z = end * ROVER_WHEEL_AT;
      for (const along of [-1, 1]) {
        arms.push(
          [
            point(frame, ROVER_UPPER_RAIL, z + along * 0.16),
            point(upright, 0.53, z),
          ],
          [
            point(frame, ROVER_LOWER_RAIL, z + along * 0.16),
            point(upright, 0.33, z),
          ],
        );
      }
      arms.push(
        [point(upright, 0.3, z), point(upright, 0.56, z)],
        [
          point(upright, ROVER_WHEEL_RADIUS, z),
          point(side * 0.82, ROVER_WHEEL_RADIUS, z),
        ],
      );
      shocks.push([
        point(side * 0.7, 0.34, z - end * 0.08),
        point(side * 0.74, 0.86, z - end * 0.08),
      ]);
    }
  }
  return [
    rods(arms, 0.022, materials.darkMetal),
    rods(shocks, 0.024, materials.chrome),
  ];
}

/**
 * A fender over each of a Rover's wheels, to keep the Dust they throw up
 * off the Robot and the cargo: an arc of flat panels, merged into one
 * geometry.
 */
function createRoverFenders(): THREE.BufferGeometry {
  const radius = ROVER_WHEEL_RADIUS + 0.08;
  const panels = 4;
  const reach = THREE.MathUtils.degToRad(54);
  const step = (2 * reach) / panels;
  const length = 2 * radius * Math.sin(step / 2) + 0.01;
  const pieces: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      for (let index = 0; index < panels; index++) {
        const angle = -reach + (index + 0.5) * step;
        pieces.push(
          new THREE.BoxGeometry(0.36, 0.025, length)
            .rotateX(angle)
            .translate(
              side * ROVER_WHEEL_AT,
              ROVER_WHEEL_RADIUS + radius * Math.cos(angle),
              end * ROVER_WHEEL_AT + radius * Math.sin(angle),
            ),
        );
      }
    }
  }
  return merged(pieces);
}

/**
 * The posts that hold up a Rover's console, one either side of the seated
 * Robot's legs: how far out from the middle, how far forward, and how high.
 */
const ROVER_CONSOLE_POSTS = { across: 0.26, forward: 0.82, top: 1.33 } as const;

/**
 * A Rover's dark metal fittings, merged into one geometry: the radio mast
 * with a clamp at its top, the whip antenna on its spring, the console's
 * posts and the headlights' housings.
 */
function createRoverFittings(): THREE.BufferGeometry {
  const [mastX, mastZ] = ROVER_MAST_AT;
  const mastTop = 1.74;
  const whipBase = ROVER_DECK + 0.12;
  const whipLength = 1.4;
  const posts = ROVER_CONSOLE_POSTS;
  return merged([
    ...[-1, 1].map((side) =>
      new THREE.CylinderGeometry(
        0.025,
        0.025,
        posts.top - ROVER_DECK,
        8,
      ).translate(
        side * posts.across,
        (posts.top + ROVER_DECK) / 2,
        posts.forward,
      ),
    ),
    new THREE.CylinderGeometry(0.03, 0.03, mastTop - ROVER_DECK, 8).translate(
      mastX,
      (mastTop + ROVER_DECK) / 2,
      mastZ,
    ),
    boxAt(0.1, 0.08, 0.1, [mastX, mastTop, mastZ]),
    new THREE.CylinderGeometry(0.008, 0.008, whipLength, 4).translate(
      -0.42,
      whipBase + whipLength / 2,
      -1.18,
    ),
    new THREE.CylinderGeometry(0.022, 0.03, 0.12, 8).translate(
      -0.42,
      ROVER_DECK + 0.06,
      -1.18,
    ),
    ...[-1, 1].map((side) =>
      new THREE.CylinderGeometry(0.075, 0.075, 0.08, 10)
        .rotateX(Math.PI / 2)
        .translate(side * 0.3, 0.85, 1.25),
    ),
  ]);
}

/**
 * The aluminium tube of a Rover's seat and cargo bed, merged into one mesh:
 * the legs under the seat and the posts up behind its back, and round the
 * bed a rail at the top and another halfway up, with two tie-down bars
 * across its floor.
 */
function createRoverRails(): THREE.Mesh {
  const seatBase = MACHINE_SEAT_HEIGHT - 0.1;
  const { front, back, side, top } = ROVER_BED;
  const halfway = (ROVER_DECK + top) / 2;
  const segments: Segment[] = [];
  for (const x of [-1, 1]) {
    segments.push(
      [point(x * 0.2, ROVER_DECK, -0.05), point(x * 0.2, seatBase, -0.05)],
      [point(x * 0.2, ROVER_DECK, 0.3), point(x * 0.2, seatBase, 0.3)],
      [point(x * 0.2, ROVER_DECK, -0.05), point(x * 0.2, seatBase, 0.3)],
      [point(x * 0.27, seatBase, -0.14), point(x * 0.27, 1.7, -0.23)],
      ...[front, (front + back) / 2, back].map((z): Segment => [
        point(x * side, ROVER_DECK, z),
        point(x * side, top, z),
      ]),
      [point(x * side, top, front), point(x * side, top, back)],
      [point(x * side, halfway, front), point(x * side, halfway, back)],
    );
  }
  segments.push(
    [point(-side, top, front), point(side, top, front)],
    [point(-side, top, back), point(side, top, back)],
    [point(-side, halfway, back), point(side, halfway, back)],
    ...[front - 0.25, back + 0.25].map((z): Segment => [
      point(-side, ROVER_DECK + 0.02, z),
      point(side, ROVER_DECK + 0.02, z),
    ]),
  );
  return rods(segments, 0.02, materials.aluminium);
}

/**
 * The console in front of a Rover's seat: a dark panel tilted towards the
 * Robot, with a lit display on it, held up on `ROVER_CONSOLE_POSTS`. It
 * stands over the Robot's feet and below its hands as it drives, so that
 * neither goes through it.
 */
function createRoverConsole(): THREE.Group {
  const tilt = -0.6;
  const panel = point(0, 1.38, 0.78);
  const display = panel
    .clone()
    .addScaledVector(point(0, Math.cos(tilt), Math.sin(tilt)), 0.022);
  const controls = new THREE.Group();
  controls.name = "Console";
  controls.add(
    part(
      new THREE.BoxGeometry(0.46, 0.04, 0.26).rotateX(tilt),
      materials.darkMetal,
      [panel.x, panel.y, panel.z],
    ),
    part(
      new THREE.BoxGeometry(0.24, 0.01, 0.13).rotateX(tilt),
      materials.sensorGlow,
      [display.x, display.y, display.z],
    ),
  );
  return controls;
}

/**
 * The battery a Rover runs on, at its front: a foil-wrapped box marked in
 * orange as high voltage, with a white finned radiator on top to shed its
 * heat, and the headlights' lamps in front. It starts just in front of
 * where the seated Robot's feet reach.
 */
function createRoverBattery(): THREE.Group {
  const width = 0.9;
  const height = 0.3;
  const depth = 0.28;
  const z = 1.07;
  const top = ROVER_DECK + height;
  const fins = 9;
  const battery = new THREE.Group();
  battery.name = "Battery";
  battery.add(
    part(new THREE.BoxGeometry(width, height, depth), materials.foil, [
      0,
      ROVER_DECK + height / 2,
      z,
    ]),
    part(
      merged([
        boxAt(width - 0.04, 0.02, depth - 0.04, [0, top + 0.01, z]),
        ...Array.from({ length: fins }, (_, index) =>
          boxAt(0.02, 0.1, depth - 0.06, [
            (index / (fins - 1) - 0.5) * (width - 0.1),
            top + 0.07,
            z,
          ]),
        ),
      ]),
      materials.radiator,
      [0, 0, 0],
    ),
    part(new THREE.BoxGeometry(0.4, 0.05, 0.01), materials.accent, [
      0,
      top - 0.06,
      z + depth / 2 + 0.005,
    ]),
    part(
      merged(
        [-1, 1].map((side) =>
          new THREE.CircleGeometry(0.06, 10).translate(side * 0.3, 0.85, 1.291),
        ),
      ),
      materials.lamp,
      [0, 0, 0],
    ),
  );
  return battery;
}

/**
 * A Rover's high-gain antenna on top of its mast: a white parabolic dish,
 * open side up and tilted back over the cargo bed, with its feed held out at
 * the focus. One mesh, with a group for the dish and one for the feed.
 */
function createRoverDish(): THREE.Mesh {
  const rim = 0.26;
  const deep = 0.07;
  const thick = 0.02;
  const curve = (radius: number): number => (deep * radius ** 2) / rim ** 2;
  const across = [0, 0.09, 0.17, rim];
  // Out along the back of the dish, round its rim and in along its face.
  const shell = lathe(
    [
      ...across.map((radius): [number, number] => [
        radius,
        curve(radius) - thick,
      ]),
      ...across
        .toReversed()
        .map((radius): [number, number] => [radius, curve(radius)]),
    ],
    14,
  );
  const focus = rim ** 2 / (4 * deep);
  const feed = merged([
    new THREE.CylinderGeometry(0.01, 0.01, focus, 4).translate(0, focus / 2, 0),
    new THREE.CylinderGeometry(0.03, 0.02, 0.05, 8).translate(0, focus, 0),
  ]);
  const geometry = mergeGeometries([shell, feed], true);
  shell.dispose();
  feed.dispose();
  const [mastX, mastZ] = ROVER_MAST_AT;
  const dish = part(
    geometry,
    [materials.hull, materials.darkMetal],
    [mastX, 1.8, mastZ],
  );
  dish.rotation.x = -0.6;
  return dish;
}

/**
 * A Rover's four wheels, each a tyre of woven wire with a tread of metal
 * chevrons round it, a dark disc either side, and on the outer one an
 * aluminium hub with spokes out to the rim. Merged into one geometry, so
 * that they cost a draw for each of `roverWheelMaterials`, with a group for
 * each.
 */
function createRoverWheelsGeometry(): THREE.BufferGeometry {
  // One wheel first, its axle along x and its hub on the +x side.
  const radius = ROVER_WHEEL_RADIUS - 0.02;
  const width = 0.28;
  const tyre = [
    new THREE.CylinderGeometry(radius, radius, width, 18, 1, true).rotateZ(
      Math.PI / 2,
    ),
  ];
  // Each chevron a V of two strips across the tread.
  const chevrons = 10;
  const spread = 0.12;
  const sweep = 0.07;
  const strip = Math.hypot(spread, sweep);
  const slant = Math.atan2(sweep, spread);
  const metal: THREE.BufferGeometry[] = Array.from(
    { length: chevrons },
    (_, index) =>
      [-1, 1].map((side) =>
        new THREE.BoxGeometry(strip, 0.03, 0.035)
          .rotateY(side * slant)
          .translate((side * spread) / 2, radius + 0.005, -sweep / 2)
          .rotateX((index / chevrons) * Math.PI * 2),
      ),
  ).flat();
  const spokes = 6;
  metal.push(
    new THREE.CylinderGeometry(0.1, 0.13, 0.05, 10)
      .rotateZ(-Math.PI / 2)
      .translate(width / 2 + 0.025, 0, 0),
    ...Array.from({ length: spokes }, (_, index) =>
      boxAt(0.012, radius - 0.13, 0.04, [
        width / 2,
        (radius + 0.13) / 2,
        0,
      ]).rotateX((index / spokes) * Math.PI * 2),
    ),
  );
  const discs = [-1, 1].map((side) =>
    new THREE.CircleGeometry(radius - 0.005, 18)
      .rotateY((side * Math.PI) / 2)
      .translate((side * (width - 0.01)) / 2, 0, 0),
  );
  const layers = [tyre, metal, discs].map((pieces) => {
    const wheel = merged(pieces);
    const wheels = merged(
      [-1, 1].flatMap((side) =>
        [-1, 1].map((end) => {
          const placed = wheel.clone();
          // Its hub outwards.
          if (side < 0) placed.rotateY(Math.PI);
          return placed.translate(
            side * ROVER_WHEEL_AT,
            ROVER_WHEEL_RADIUS,
            end * ROVER_WHEEL_AT,
          );
        }),
      ),
    );
    wheel.dispose();
    return wheels;
  });
  const geometry = mergeGeometries(layers, true);
  for (const layer of layers) layer.dispose();
  return geometry;
}

/** How fast a running Plant's cooling fan turns, in turns per real second. */
const PLANT_FAN_TURNS_PER_SECOND = 1.5;
/** The height of the top of a Plant's plinth, which its vessels stand on. */
const PLINTH_TOP = 0.25;

/**
 * A vessel standing on a Plant's plinth. A reactor is tall and narrow, a
 * tank squat and wide, a chamber a drum lying on its side, an oven a low
 * tunnel with a conveyor running through it, a stack a block of cell
 * plates, and a hopper a funnel on legs that Regolith is tipped into.
 */
interface PlantVessel {
  readonly kind: "reactor" | "tank" | "chamber" | "oven" | "stack" | "hopper";
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

/** The Plants, by Structure type. */
const PLANT_SHAPES: Readonly<Record<string, PlantShape>> = {
  "extraction-plant": EXTRACTION_PLANT,
  "large-extraction-plant": LARGE_EXTRACTION_PLANT,
  "water-processing-plant": WATER_PROCESSING_PLANT,
  "electrolysis-plant": ELECTROLYSIS_PLANT,
  "vacuum-fabrication-plant": VACUUM_FABRICATION_PLANT,
  "circuit-board-plant": CIRCUIT_BOARD_PLANT,
  "integrated-fabrication-plant": INTEGRATED_FABRICATION_PLANT,
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
function createPlantModel(shape: PlantShape): StructureModel {
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
