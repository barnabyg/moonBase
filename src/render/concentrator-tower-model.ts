import * as THREE from "three";
import {
  boxAt,
  detailParts,
  materials,
  merged,
  part,
  placed,
  rodGeometry,
  rods,
} from "./materials";
import type { StructureModel } from "./models";

// The concentrator tower.

const TOWER_HEIGHT_METRES = 7;
/** The height of the top of the footing, which the mast stands on. */
const TOWER_FOOTING_TOP = 0.3;
/** Half the width across the mast's legs, at its foot and at its top. */
const TOWER_MAST_HALF_WIDTH = [0.55, 0.26] as const;
/** How many bays of bracing there are up the mast. */
const TOWER_MAST_BAYS = 7;
const TOWER_RECEIVER_RADIUS = 0.55;
const TOWER_RECEIVER_HEIGHT = 1;
/**
 * The rings of mirrors round the tower: how many in each, how far out, and
 * how far round the first one stands. None stands square on an axis, so
 * that the field fits within the tower's footprint.
 */
const TOWER_MIRROR_RINGS = [
  { mirrors: 8, radius: 2.3, offset: Math.PI / 8 },
  { mirrors: 12, radius: 3.25, offset: Math.PI / 12 },
] as const;
const TOWER_MIRROR_SIZE = [1.1, 0.85] as const;
/** The height of the axis each mirror tilts on, on top of its post. */
const TOWER_MIRROR_AXIS_HEIGHT = 0.95;
/** How far each mirror tips back, in radians, to throw the low sun up at the receiver. */
const TOWER_MIRROR_TILT = 0.5;

/** A point on one of the mast's four legs, a share of the way up. */
function mastLeg(corner: number, share: number): THREE.Vector3 {
  const [foot, top] = TOWER_MAST_HALF_WIDTH;
  const half = THREE.MathUtils.lerp(foot, top, share);
  const angle = Math.PI / 4 + (corner * Math.PI) / 2;
  return new THREE.Vector3(
    Math.cos(angle) * half * Math.SQRT2,
    TOWER_FOOTING_TOP + share * TOWER_HEIGHT_METRES,
    Math.sin(angle) * half * Math.SQRT2,
  );
}

/**
 * The lattice mast: four legs tapering up from the footing, tied by a ring
 * of bars at the top of each bay and a diagonal across each face.
 */
function createMast(): THREE.Object3D[] {
  const legs = [0, 1, 2, 3].map(
    (corner) => [mastLeg(corner, 0), mastLeg(corner, 1)] as const,
  );
  const bracing: (readonly [THREE.Vector3, THREE.Vector3])[] = [];
  for (let bay = 0; bay < TOWER_MAST_BAYS; bay++) {
    const low = bay / TOWER_MAST_BAYS;
    const high = (bay + 1) / TOWER_MAST_BAYS;
    for (let corner = 0; corner < 4; corner++) {
      const next = (corner + 1) % 4;
      bracing.push([mastLeg(corner, high), mastLeg(next, high)]);
      // Zigzagging from one bay to the next.
      bracing.push(
        bay % 2 === 0
          ? [mastLeg(corner, low), mastLeg(next, high)]
          : [mastLeg(next, low), mastLeg(corner, high)],
      );
    }
  }
  return [
    rods(legs, 0.06, materials.aluminium),
    rods(bracing, 0.025, materials.aluminium),
  ];
}

/**
 * The receiver on top of the mast: a drum walled with the tubes the sunlight
 * heats, which glow once it is commissioned, between heat shields, with a
 * service platform round its foot and a beacon on top.
 */
function createReceiver(glow: THREE.Material): THREE.Object3D[] {
  const foot = TOWER_FOOTING_TOP + TOWER_HEIGHT_METRES;
  const middle = foot + 0.1 + TOWER_RECEIVER_HEIGHT / 2;
  const top = foot + 0.1 + TOWER_RECEIVER_HEIGHT;
  const detail = detailParts();
  const tubePanels = 16;
  detail.add(
    glow,
    ...Array.from({ length: tubePanels }, (_, index) => {
      const angle = (index / tubePanels) * Math.PI * 2;
      return placed(
        new THREE.BoxGeometry(0.18, TOWER_RECEIVER_HEIGHT * 0.86, 0.06),
        [
          Math.cos(angle) * TOWER_RECEIVER_RADIUS,
          middle,
          Math.sin(angle) * TOWER_RECEIVER_RADIUS,
        ],
        [0, Math.PI / 2 - angle, 0],
      );
    }),
  );
  detail.add(
    materials.darkMetal,
    placed(
      new THREE.CylinderGeometry(
        TOWER_RECEIVER_RADIUS - 0.03,
        TOWER_RECEIVER_RADIUS - 0.03,
        TOWER_RECEIVER_HEIGHT,
        16,
      ),
      [0, middle, 0],
    ),
    // The service platform's deck, and the cone over the top heat shield.
    placed(new THREE.CylinderGeometry(1, 1, 0.06, 16), [0, foot, 0]),
    placed(new THREE.CylinderGeometry(0.15, 0.5, 0.35, 12), [0, top + 0.25, 0]),
  );
  // Heat shields above and below the tubes, so that sunlight that misses
  // them doesn't scorch the platform or the top.
  detail.add(
    materials.radiator,
    ...[foot + 0.1, top].map((y) =>
      placed(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 16), [0, y, 0]),
    ),
  );
  detail.add(
    materials.accent,
    placed(new THREE.SphereGeometry(0.09, 8, 6), [0, top + 0.48, 0]),
  );
  // The platform's railing.
  const posts = 12;
  const railing = Array.from({ length: posts }, (_, index) => {
    const angle = (index / posts) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95);
  });
  detail.add(
    materials.darkMetal,
    ...railing.flatMap((point, index) => {
      const next = railing[(index + 1) % posts] ?? point;
      return [
        rodGeometry(
          point.clone().setY(foot),
          point.clone().setY(foot + 0.6),
          0.02,
        ),
        rodGeometry(
          point.clone().setY(foot + 0.6),
          next.clone().setY(foot + 0.6),
          0.02,
        ),
      ];
    }),
  );
  return detail.meshes();
}

/**
 * The power block on the footing, where the heat is turned into
 * electricity: a turbine hall, a heat exchanger lying beside it, and lagged
 * pipes carrying the working fluid up the mast to the receiver and back.
 */
function createPowerBlock(): THREE.Object3D[] {
  const detail = detailParts();
  const foot = TOWER_FOOTING_TOP;
  detail.add(materials.hull, boxAt(0.5, 0.65, 0.9, [-1.05, foot + 0.33, 0]));
  detail.add(
    materials.darkMetal,
    boxAt(0.56, 0.06, 0.96, [-1.05, foot + 0.68, 0]),
    // Louvres along the hall's side.
    ...[0.2, 0.35, 0.5].map((y) =>
      boxAt(0.02, 0.05, 0.6, [-1.31, foot + y, 0]),
    ),
  );
  detail.add(
    materials.radiator,
    // A radiator fin standing on the hall's roof, shedding its waste heat.
    boxAt(0.04, 0.5, 0.8, [-1.05, foot + 0.96, 0]),
  );
  detail.add(
    materials.foil,
    placed(
      new THREE.CylinderGeometry(0.2, 0.2, 0.8, 12),
      [0.05, foot + 0.24, -0.98],
      [0, 0, Math.PI / 2],
    ),
  );
  // Hot and cold pipes from the hall into the mast and up it.
  const riserTop = foot + TOWER_HEIGHT_METRES + 0.05;
  detail.add(
    materials.silverFoil,
    ...[-0.1, 0.1].flatMap((z) => [
      rodGeometry(
        new THREE.Vector3(-0.8, foot + 0.45, z),
        new THREE.Vector3(-0.12, foot + 0.45, z),
        0.06,
        8,
      ),
      rodGeometry(
        new THREE.Vector3(-0.12, foot + 0.39, z),
        new THREE.Vector3(-0.12, riserTop, z),
        0.06,
        8,
      ),
    ]),
  );
  return detail.meshes();
}

/**
 * One mirror's parts, upright and centred on its axis: the silvered face, and its
 * frame, the bars and torque tube behind it, and the drive that turns it.
 * Made once, and shared by every mirror.
 */
function createMirrorGeometries(): {
  readonly face: THREE.BufferGeometry;
  readonly frame: THREE.BufferGeometry;
} {
  const [width, height] = TOWER_MIRROR_SIZE;
  return {
    face: new THREE.BoxGeometry(width - 0.04, height - 0.04, 0.03),
    frame: merged([
      boxAt(width, 0.04, 0.05, [0, height / 2, -0.01]),
      boxAt(width, 0.04, 0.05, [0, -height / 2, -0.01]),
      boxAt(0.04, height, 0.05, [width / 2, 0, -0.01]),
      boxAt(0.04, height, 0.05, [-width / 2, 0, -0.01]),
      ...[-0.22, 0.22].map((y) =>
        boxAt(width - 0.1, 0.03, 0.03, [0, y, -0.05]),
      ),
      placed(
        new THREE.CylinderGeometry(0.04, 0.04, width * 0.8, 8),
        [0, 0, -0.09],
        [0, 0, Math.PI / 2],
      ),
      boxAt(0.2, 0.18, 0.14, [0, 0, -0.17]),
    ]),
  };
}

/**
 * A concentrator tower: two rings of mirrors on posts, each turned towards
 * the sun as a solar array's panel is, round a lattice mast with a receiver
 * at the top that shines once it is commissioned, and the power block at its
 * foot. During Assembly the mast and the mirrors rise from the ground.
 */
export function createConcentratorTowerModel(): StructureModel {
  const tower = new THREE.Group();
  tower.name = "Concentrator tower";
  const statusLightMaterial = materials.statusOff.clone();
  const receiverGlow = materials.statusOff.clone();
  tower.add(
    part(
      new THREE.CylinderGeometry(1.4, 1.5, TOWER_FOOTING_TOP, 12),
      materials.darkMetal,
      [0, TOWER_FOOTING_TOP / 2, 0],
    ),
    part(new THREE.SphereGeometry(0.08, 8, 6), statusLightMaterial, [
      1,
      TOWER_FOOTING_TOP + 0.08,
      0.7,
    ]),
  );
  const upper = new THREE.Group();
  upper.add(
    ...createMast(),
    ...createReceiver(receiverGlow),
    ...createPowerBlock(),
  );

  const { face, frame } = createMirrorGeometries();
  const posts: THREE.BufferGeometry[] = [];
  const mirrors = TOWER_MIRROR_RINGS.flatMap(({ mirrors, radius, offset }) =>
    Array.from({ length: mirrors }, (_, index) => {
      const angle = offset + (index / mirrors) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      posts.push(
        placed(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 6), [x, 0.4, z]),
        placed(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 8), [x, 0.03, z]),
      );
      const mirror = new THREE.Group();
      mirror.position.set(x, TOWER_MIRROR_AXIS_HEIGHT, z);
      const tilted = new THREE.Group();
      tilted.name = "Mirror face";
      tilted.rotation.x = -TOWER_MIRROR_TILT;
      tilted.add(
        part(face, materials.mirror, [0, 0, 0]),
        part(frame, materials.darkMetal, [0, 0, 0]),
      );
      mirror.add(tilted);
      upper.add(mirror);
      return mirror;
    }),
  );
  upper.add(part(merged(posts), materials.darkMetal, [0, 0, 0]));
  tower.add(upper);
  return {
    group: tower,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      upper.visible = f > 0;
      upper.scale.y = Math.max(f, 0.01);
    },
    setFacing(angle) {
      for (const mirror of mirrors) mirror.rotation.y = angle;
    },
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
      const receiver =
        state === "on" ? materials.statusTesting : materials.statusOff;
      receiverGlow.color.copy(receiver.color);
      receiverGlow.emissive.copy(receiver.emissive);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}
