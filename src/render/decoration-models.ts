import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";

// The Decorations: a flag pole, a founding memorial, a rock garden and the
// Mission Director's viewing area. None has a light or a status light, as
// none has power; each shows more of itself as it is assembled.

/** The flag's cloth: white, with an orange band to match the Machines. */
const flagCloth = new THREE.MeshStandardMaterial({
  color: 0xf4f4f0,
  metalness: 0,
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const flagBand = new THREE.MeshStandardMaterial({
  color: 0xe0661b,
  metalness: 0,
  roughness: 0.85,
  side: THREE.DoubleSide,
});
/** The memorial's cast plaque. */
const bronze = new THREE.MeshStandardMaterial({
  color: 0x8c6a3c,
  metalness: 0.85,
  roughness: 0.45,
});
/** The rock garden's rocks: darker and blockier than the Regolith round them. */
const rock = new THREE.MeshStandardMaterial({
  color: 0x4f4b47,
  metalness: 0,
  roughness: 0.95,
  flatShading: true,
});

/** A model with nothing to show but how much of it is assembled. */
function standing(
  group: THREE.Group,
  setAssembled: (fraction: number) => void,
): StructureModel {
  return {
    group,
    setAssembled: (fraction) => {
      setAssembled(THREE.MathUtils.clamp(fraction, 0, 1));
    },
    setFacing: () => undefined,
    setStatusLight: () => undefined,
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}

/**
 * How far along a part is that takes the first `share` of Assembly: from just
 * above none to all of it. Never quite none, so that it still has a size.
 */
function progress(fraction: number, share: number): number {
  return Math.max(Math.min(fraction / share, 1), 0.01);
}

const FLAG_POLE_HEIGHT = 3.2;
/** As wide as its footprint allows: the flag hangs out to one side of the pole. */
const FLAG_WIDTH = 0.75;
const FLAG_HEIGHT = 0.5;
/** The share of Assembly spent raising the pole, before the flag goes up. */
const FLAG_POLE_SHARE = 0.7;

/**
 * A flag pole: a slim pole on a weighted foot, with a flag held out from its
 * top by a rod along its upper edge, as there is no wind to fly it.
 */
export function createFlagPoleModel(): StructureModel {
  const model = new THREE.Group();
  model.name = "Flag pole";
  const footHeight = 0.12;
  model.add(
    part(
      new THREE.CylinderGeometry(0.3, 0.38, footHeight, 10),
      materials.darkMetal,
      [0, footHeight / 2, 0],
    ),
  );
  const poleLength = FLAG_POLE_HEIGHT - footHeight;
  const pole = part(
    new THREE.CylinderGeometry(0.025, 0.035, 1, 8),
    materials.aluminium,
    [0, 0, 0],
  );
  model.add(pole);

  // Hung from the top on the -x side of the pole, within its footprint.
  const flag = new THREE.Group();
  flag.position.set(0, FLAG_POLE_HEIGHT - 0.05, 0);
  const rod = part(
    new THREE.CylinderGeometry(0.012, 0.012, FLAG_WIDTH, 6),
    materials.aluminium,
    [-FLAG_WIDTH / 2, 0, 0],
  );
  rod.rotation.z = Math.PI / 2;
  flag.add(
    rod,
    part(
      new THREE.BoxGeometry(FLAG_WIDTH, FLAG_HEIGHT * 0.7, 0.01),
      flagCloth,
      [-FLAG_WIDTH / 2, -FLAG_HEIGHT * 0.35, 0],
    ),
    part(new THREE.BoxGeometry(FLAG_WIDTH, FLAG_HEIGHT * 0.3, 0.01), flagBand, [
      -FLAG_WIDTH / 2,
      -FLAG_HEIGHT * 0.85,
      0,
    ]),
  );
  model.add(flag);

  return standing(model, (fraction) => {
    const raised = progress(fraction, FLAG_POLE_SHARE);
    pole.scale.y = poleLength * raised;
    pole.position.y = footHeight + (poleLength * raised) / 2;
    flag.visible = fraction > FLAG_POLE_SHARE;
  });
}

/** The share of Assembly spent raising the plinth, before the plaque goes on. */
const PLINTH_SHARE = 0.8;

/**
 * A founding memorial: a low plinth on a square slab, with a bronze plaque
 * set at an angle on its top. The plinth rises during Assembly, and the
 * plaque goes on last.
 */
export function createFoundingMemorialModel(): StructureModel {
  const model = new THREE.Group();
  model.name = "Founding memorial";
  const slabSide = 1;
  const slabHeight = 0.08;
  const plinthHeight = 0.9;
  model.add(
    part(
      new THREE.BoxGeometry(slabSide, slabHeight, slabSide),
      materials.darkMetal,
      [0, slabHeight / 2, 0],
    ),
  );
  const plinth = part(
    new THREE.BoxGeometry(0.5, 1, 0.4),
    materials.hull,
    [0, 0, 0],
  );
  model.add(plinth);
  const plaque = part(new THREE.BoxGeometry(0.46, 0.04, 0.34), bronze, [
    0,
    slabHeight + plinthHeight + 0.04,
    0,
  ]);
  plaque.rotation.x = -0.35;
  model.add(plaque);

  return standing(model, (fraction) => {
    const risen = progress(fraction, PLINTH_SHARE);
    plinth.scale.y = plinthHeight * risen;
    plinth.position.y = slabHeight + (plinthHeight * risen) / 2;
    plaque.visible = fraction > PLINTH_SHARE;
  });
}

/** Where the rock garden's rocks stand, by angle and distance from its centre, and how big each is. */
const GARDEN_ROCKS: readonly {
  readonly angle: number;
  readonly distance: number;
  readonly size: number;
}[] = [
  ...Array.from({ length: 10 }, (_, index) => ({
    angle: (index / 10) * Math.PI * 2,
    distance: 2.05,
    size: 0.22 + 0.06 * ((index * 7) % 3),
  })),
  { angle: 0.6, distance: 0.7, size: 0.45 },
  { angle: 2.9, distance: 0.9, size: 0.32 },
  { angle: 4.4, distance: 0.5, size: 0.38 },
];
const GARDEN_RADIUS = 2.4;
/** How much flatter than they are wide the rocks are. */
const ROCK_SQUASH = 0.7;
/** The share of Assembly spent raking the bed, before the rocks are set. */
const GARDEN_BED_SHARE = 0.5;

/**
 * A rock garden: a raked bed of Regolith ringed with local rocks, with a few
 * larger ones set in it. The bed spreads out during the first half of
 * Assembly, and the rocks are set one by one in the second.
 */
export function createRockGardenModel(
  groundMaterial?: THREE.Material,
): StructureModel {
  const model = new THREE.Group();
  model.name = "Rock garden";
  const bedHeight = 0.05;
  const bed = part(
    new THREE.CylinderGeometry(GARDEN_RADIUS, GARDEN_RADIUS, bedHeight, 24),
    groundMaterial ?? materials.regolith,
    [0, bedHeight / 2, 0],
  );
  model.add(bed);
  const rocks = GARDEN_ROCKS.map(({ angle, distance, size }, index) => {
    const stone = part(new THREE.DodecahedronGeometry(size, 0), rock, [
      Math.cos(angle) * distance,
      size * ROCK_SQUASH,
      Math.sin(angle) * distance,
    ]);
    // Turned only about the upright, so that every rock sits on the ground.
    stone.rotation.y = index * 1.3;
    stone.scale.y = ROCK_SQUASH;
    model.add(stone);
    return stone;
  });

  return standing(model, (fraction) => {
    const spread = progress(fraction, GARDEN_BED_SHARE);
    bed.scale.set(spread, 1, spread);
    const set =
      fraction <= GARDEN_BED_SHARE
        ? 0
        : Math.ceil(
            ((fraction - GARDEN_BED_SHARE) / (1 - GARDEN_BED_SHARE)) *
              rocks.length,
          );
    for (const [index, stone] of rocks.entries()) stone.visible = index < set;
  });
}

/** The share of Assembly spent putting up the windbreak, before the chair goes in. */
const WINDBREAK_SHARE = 0.5;
/** How far through Assembly the screen goes up, after the chair. */
const SCREEN_AFTER = 0.8;

/**
 * The Mission Director's viewing area: a chair on a small deck, behind a
 * curved windbreak, with a screen on a post beside it, all looking out
 * along +x. The windbreak rises first, then the chair and the screen go in.
 */
export function createViewingAreaModel(): StructureModel {
  const model = new THREE.Group();
  model.name = "Mission Director's viewing area";
  const deckHeight = 0.06;
  model.add(
    part(new THREE.BoxGeometry(1.6, deckHeight, 1.6), materials.aluminium, [
      0,
      deckHeight / 2,
      0,
    ]),
  );

  // Three panels in an arc behind the chair, on its -x side.
  const windbreak = new THREE.Group();
  for (const angle of [-0.6, 0, 0.6]) {
    const panel = part(
      new THREE.BoxGeometry(0.06, 1, 0.75),
      materials.radiator,
      [-Math.cos(angle) * 1.05, 0.5, Math.sin(angle) * 1.05],
    );
    panel.rotation.y = -angle;
    windbreak.add(panel);
  }
  windbreak.position.y = deckHeight;
  model.add(windbreak);

  const chair = new THREE.Group();
  chair.position.y = deckHeight;
  chair.add(
    part(
      new THREE.BoxGeometry(0.5, 0.06, 0.5),
      materials.darkMetal,
      [0, 0.45, 0],
    ),
    part(
      new THREE.BoxGeometry(0.06, 0.6, 0.5),
      materials.darkMetal,
      [-0.25, 0.75, 0],
    ),
    ...[-0.2, 0.2].flatMap((x) =>
      [-0.2, 0.2].map((z) =>
        part(
          new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6),
          materials.chrome,
          [x, 0.225, z],
        ),
      ),
    ),
  );
  model.add(chair);

  const screen = new THREE.Group();
  screen.position.set(0.35, deckHeight, 0.55);
  const display = part(
    new THREE.BoxGeometry(0.03, 0.3, 0.45),
    materials.darkMetal,
    [0, 0.85, 0],
  );
  display.rotation.y = -0.5;
  screen.add(
    part(
      new THREE.CylinderGeometry(0.02, 0.03, 0.7, 6),
      materials.aluminium,
      [0, 0.35, 0],
    ),
    display,
  );
  model.add(screen);

  return standing(model, (fraction) => {
    const risen = progress(fraction, WINDBREAK_SHARE);
    windbreak.scale.y = risen;
    chair.visible = fraction > WINDBREAK_SHARE;
    screen.visible = fraction > SCREEN_AFTER;
  });
}
