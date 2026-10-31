import * as THREE from "three";
import {
  lightWindow,
  materials,
  part,
  rod,
  roundedBox,
  windowGlass,
} from "./materials";
import type { StructureModel } from "./models";
import {
  createPrintedCourseGeometry,
  SHIELDING_HEIGHT,
  shieldingRadiusAt,
} from "./regolith-shielding-surface";

// The Habitats, and what shields them: Regolith shielding and the water wall.

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

export const HABITAT: HabitatShape = {
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
export const HARDENED_HABITAT: HabitatShape = {
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
export function createHabitatModel(shape: HabitatShape): StructureModel {
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
  /**
   * Whether it is rough printed Regolith, in the ground's own material where
   * there is ground to match, rather than flat, even courses in its material.
   */
  readonly printed: boolean;
}

export const REGOLITH_SHIELDING: ShieldingShape = {
  name: "Regolith shielding",
  layers: 12,
  sides: 20,
  material: materials.regolith,
  seams: false,
  printed: true,
};

/**
 * Sintered Regolith shielding: the same dome, in more and thinner courses
 * of darker, fused Regolith, each with a glassy seam along its top, and
 * fewer, flatter faces round it.
 */
export const SINTERED_REGOLITH_SHIELDING: ShieldingShape = {
  name: "Sintered Regolith shielding",
  layers: 16,
  sides: 14,
  material: materials.sinteredRegolith,
  seams: true,
  printed: false,
};

/** How far a Buried Habitat's airlock hatch stands out from its centre, along +x. */
export const BURIED_HABITAT_HATCH_OUT = 6.44;
/** The radius of a Buried Habitat's mound where it meets the ground, just inside its footprint. */
const BURIED_MOUND_RADIUS = 5.9;
/** How high a Buried Habitat's mound rises at its crown: low, as most of it lies below the ground. */
const BURIED_MOUND_HEIGHT = 1.5;

/**
 * A Buried Habitat: a low mound of the ground's own Regolith, with no dome
 * or Structure showing but a squat concrete-grey airlock block let into its
 * +x side, and a pair of vent stacks through its crown. During Assembly the
 * ground rises into the mound over the vault, and the airlock and vents are
 * fitted last.
 */
export function createBuriedHabitatModel(
  groundMaterial: THREE.Material | undefined,
): StructureModel {
  const habitat = new THREE.Group();
  habitat.name = "Buried Habitat";

  // The mound, a smooth cap with a slight skirt where it meets the ground.
  const profile = Array.from({ length: 13 }, (_, index) => {
    const share = index / 12;
    return new THREE.Vector2(
      BURIED_MOUND_RADIUS * share,
      BURIED_MOUND_HEIGHT * (1 - share * share) ** 1.3,
    );
  });
  const mound = part(
    new THREE.LatheGeometry(profile, 48),
    groundMaterial ?? materials.sinteredGlaze,
    [0, 0, 0],
  );
  mound.name = "Mound";
  habitat.add(mound);

  const airlock = new THREE.Group();
  airlock.name = "Airlock";
  const collarX = BURIED_HABITAT_HATCH_OUT - 0.11;
  const inner = 3.8;
  const sill = 0.12;
  const hatchHeight = 1.9;
  airlock.add(
    // The block the hatch is set in, running back into the mound.
    part(roundedBox(collarX - inner, 2.3, 2.1, 0.12), materials.darkMetal, [
      (inner + collarX) / 2,
      1.15,
      0,
    ]),
    part(roundedBox(0.14, 2.45, 2.3, 0.08), materials.hull, [
      collarX,
      1.225,
      0,
    ]),
    part(roundedBox(0.08, hatchHeight, 0.92, 0.12), materials.hull, [
      BURIED_HABITAT_HATCH_OUT - 0.04,
      sill + hatchHeight / 2,
      0,
    ]),
    part(roundedBox(0.05, 0.34, 0.06, 0.02), materials.darkMetal, [
      BURIED_HABITAT_HATCH_OUT + 0.0,
      sill + 0.85,
      -0.32,
    ]),
    // Two vent stacks through the mound's crown, for its air plant.
    ...[-1, 1].map((side) =>
      part(
        new THREE.CylinderGeometry(0.14, 0.18, 0.9, 12),
        materials.aluminium,
        [-1.4, BURIED_MOUND_HEIGHT + 0.25, side * 1.1],
      ),
    ),
  );
  habitat.add(airlock);

  const statusLightMaterial = materials.statusOff.clone();
  airlock.add(
    part(new THREE.SphereGeometry(0.07, 8, 6), statusLightMaterial, [
      collarX + 0.08,
      sill + 0.7,
      -0.8,
    ]),
  );

  // The window in the hatch, the only one it has, with a lamp over it, and
  // the mission flag on the airlock's roof while the Mission Director lives
  // inside.
  const glass = windowGlass.clone();
  const hatchWindow = part(new THREE.CircleGeometry(0.14, 20), glass, [
    BURIED_HABITAT_HATCH_OUT + 0.005,
    sill + 1.4,
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
  const flag = new THREE.Group();
  const poleTop = 3.6;
  flag.add(
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), materials.aluminium, [
      4.2,
      poleTop - 0.65,
      0,
    ]),
    part(new THREE.PlaneGeometry(1.0, 0.62), flagCloth, [
      4.73,
      poleTop - 0.34,
      0,
    ]),
  );
  flag.visible = false;
  habitat.add(flag);

  return {
    group: habitat,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      // The mound builds up over the vault for most of Assembly.
      const heaped = Math.max(Math.min(f / INFLATED_SHARE, 1), 0.02);
      mound.scale.set(0.85 + heaped * 0.15, heaped, 0.85 + heaped * 0.15);
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

/**
 * Regolith shielding: a thick dome of printed Regolith over the Habitat,
 * with the airlock's hatch left showing. During Assembly it builds up layer
 * by layer from the ground, the layer being printed growing as it goes.
 */
export function createRegolithShieldingModel(
  shape: ShieldingShape,
  groundMaterial: THREE.Material | undefined,
): StructureModel {
  const shielding = new THREE.Group();
  shielding.name = shape.name;
  const layerHeight = SHIELDING_HEIGHT / shape.layers;
  const layers = Array.from({ length: shape.layers }, (_, index) => {
    const bottom = index * layerHeight;
    const top = bottom + layerHeight;
    const geometry = shape.printed
      ? createPrintedCourseGeometry(index, shape.layers)
      : new THREE.CylinderGeometry(
          shieldingRadiusAt(top),
          shieldingRadiusAt(bottom),
          layerHeight,
          shape.sides,
        ).translate(0, layerHeight / 2, 0); // Grows upwards from its base as it is printed.
    const layer = part(
      geometry,
      shape.printed ? (groundMaterial ?? shape.material) : shape.material,
      [0, bottom, 0],
    );
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
export function createWaterWallModel(): StructureModel {
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
