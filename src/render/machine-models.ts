import * as THREE from "three";
import {
  lathe,
  materials,
  part,
  placeRod,
  rod,
  rods,
  roundedBox,
  setStatusLight,
  windowGlass,
} from "./materials";
import { MACHINE_SEAT_HEIGHT } from "./models";

// The Machines: a small tracked excavator and a regolith printer, both
// battery-electric, on the same tracked undercarriage, each with a seat for
// the Robot on its deck. Each faces along its local +z axis.

/**
 * A pair of crawler tracks: for each, a belt of steel-shod shoes running
 * round a drive sprocket at the back and an idler at the front, over road
 * wheels and a carrier roller on a track frame, with the car body between
 * them carrying the slewing ring.
 */
function createUndercarriage(length: number, gauge: number): THREE.Group {
  const undercarriage = new THREE.Group();
  const width = 0.46;
  const radius = 0.27;
  const halfStraight = length / 2 - radius;
  const beltThickness = 0.07;

  const stadium = <T extends THREE.Path>(path: T, inset: number): T => {
    const r = radius - inset;
    path.moveTo(-halfStraight, -r);
    path.lineTo(halfStraight, -r);
    path.absarc(halfStraight, 0, r, -Math.PI / 2, Math.PI / 2, false);
    path.lineTo(-halfStraight, r);
    path.absarc(-halfStraight, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
    return path;
  };
  const beltShape = stadium(new THREE.Shape(), 0);
  beltShape.holes.push(stadium(new THREE.Path(), beltThickness));
  // Drawn in the side view, then turned so that it runs front to back.
  const beltGeometry = new THREE.ExtrudeGeometry(beltShape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 10,
  })
    .translate(0, 0, -width / 2)
    .rotateY(-Math.PI / 2);

  // One grouser across each shoe, all the way round the belt.
  const perimeter = 4 * halfStraight + 2 * Math.PI * radius;
  const shoes = Math.round(perimeter / 0.15);
  const grouserGeometry = new THREE.BoxGeometry(width + 0.02, 0.04, 0.05);
  const placeAlong = (distance: number) => {
    // Along the bottom, round the front, along the top and round the back.
    const bottom = 2 * halfStraight;
    const arc = Math.PI * radius;
    if (distance < bottom) {
      return { z: -halfStraight + distance, y: -radius, angle: Math.PI };
    }
    if (distance < bottom + arc) {
      const turn = -Math.PI / 2 + (distance - bottom) / radius;
      return {
        z: halfStraight + Math.cos(turn) * radius,
        y: Math.sin(turn) * radius,
        angle: Math.atan2(Math.cos(turn), Math.sin(turn)),
      };
    }
    if (distance < 2 * bottom + arc) {
      return {
        z: halfStraight - (distance - bottom - arc),
        y: radius,
        angle: 0,
      };
    }
    const turn = Math.PI / 2 + (distance - 2 * bottom - arc) / radius;
    return {
      z: -halfStraight + Math.cos(turn) * radius,
      y: Math.sin(turn) * radius,
      angle: Math.atan2(Math.cos(turn), Math.sin(turn)),
    };
  };

  const centreHeight = radius + 0.03;
  for (const side of [-1, 1]) {
    const track = new THREE.Group();
    track.position.set((side * gauge) / 2, centreHeight, 0);
    track.add(part(beltGeometry, materials.track, [0, 0, 0]));
    const grousers = new THREE.InstancedMesh(
      grouserGeometry,
      materials.grouser,
      shoes,
    );
    grousers.castShadow = true;
    grousers.receiveShadow = true;
    const placed = new THREE.Object3D();
    for (let shoe = 0; shoe < shoes; shoe++) {
      const { z, y, angle } = placeAlong((shoe / shoes) * perimeter);
      placed.position.set(
        0,
        y + Math.cos(angle) * 0.015,
        z + Math.sin(angle) * 0.015,
      );
      placed.rotation.set(angle, 0, 0);
      placed.updateMatrix();
      grousers.setMatrixAt(shoe, placed.matrix);
    }
    track.add(grousers);

    // Inside the belt: the track frame, its wheels and rollers.
    const wheel = (
      r: number,
      z: number,
      y: number,
      material: THREE.Material,
    ) => {
      const mesh = part(
        new THREE.CylinderGeometry(r, r, width - 0.08, 14).rotateZ(Math.PI / 2),
        material,
        [0, y, z],
      );
      return mesh;
    };
    const inner = radius - beltThickness;
    track.add(
      part(
        new THREE.BoxGeometry(width - 0.16, inner * 1.1, length - 2 * radius),
        materials.darkMetal,
        [0, 0, 0],
      ),
      wheel(inner - 0.01, -halfStraight, 0, materials.darkMetal),
      wheel(inner - 0.02, halfStraight, 0, materials.aluminium),
      wheel(0.07, 0, inner - 0.07, materials.aluminium),
    );
    // The sprocket's teeth, meshing with the belt.
    const sprocket = part(
      new THREE.CylinderGeometry(
        inner + 0.01,
        inner + 0.01,
        width - 0.02,
        10,
      ).rotateZ(Math.PI / 2),
      materials.grouser,
      [0, 0, -halfStraight],
    );
    sprocket.scale.set(0.3, 1, 1);
    track.add(sprocket);
    const wheels = 4;
    for (let index = 0; index < wheels; index++) {
      track.add(
        wheel(
          0.085,
          -halfStraight +
            0.35 +
            (index * (2 * halfStraight - 0.7)) / (wheels - 1),
          -inner + 0.085,
          materials.aluminium,
        ),
      );
    }
    undercarriage.add(track);
  }
  // The car body joining the tracks, and the slewing ring on top of it.
  undercarriage.add(
    part(roundedBox(gauge - 0.3, 0.32, 1.4, 0.06), materials.darkMetal, [
      0,
      centreHeight + 0.05,
      0,
    ]),
    part(
      new THREE.CylinderGeometry(0.82, 0.88, 0.14, 24),
      materials.darkMetal,
      [0, 0.66, 0],
    ),
    part(
      new THREE.TorusGeometry(0.85, 0.025, 4, 32).rotateX(Math.PI / 2),
      materials.aluminium,
      [0, 0.68, 0],
    ),
  );
  return undercarriage;
}

/**
 * The Robot's seat on a Machine's deck, at MACHINE_SEAT_HEIGHT, with a
 * control console either side. `deck` is the deck's height in the frame
 * it is added to.
 */
function createSeat(deck: number): THREE.Group {
  const seat = new THREE.Group();
  seat.add(
    part(roundedBox(0.52, 0.1, 0.48, 0.04), materials.robotJoint, [
      0,
      deck + 0.05,
      0.02,
    ]),
    part(roundedBox(0.52, 0.6, 0.1, 0.04), materials.robotJoint, [
      0,
      deck + 0.38,
      -0.24,
    ]),
  );
  for (const side of [-1, 1]) {
    seat.add(
      part(roundedBox(0.16, 0.3, 0.36, 0.03), materials.darkMetal, [
        side * 0.42,
        deck + 0.15,
        0.12,
      ]),
      rod(
        new THREE.Vector3(side * 0.42, deck + 0.3, 0.2),
        new THREE.Vector3(side * 0.42, deck + 0.45, 0.24),
        0.02,
        materials.robotJoint,
        6,
      ),
      part(new THREE.SphereGeometry(0.04, 8, 6), materials.accent, [
        side * 0.42,
        deck + 0.46,
        0.245,
      ]),
    );
  }
  return seat;
}

/** A hydraulic cylinder: a barrel and the polished rod sliding out of it. */
interface HydraulicCylinder {
  readonly parts: readonly THREE.Object3D[];
  /** Stretches it between two points in its parent's frame. */
  reach(from: THREE.Vector3, to: THREE.Vector3): void;
}

function createHydraulicCylinder(
  barrelLength: number,
  radius: number,
): HydraulicCylinder {
  const barrel = rod(
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    radius,
    materials.machinePaint,
    10,
  );
  const piston = rod(
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    radius * 0.55,
    materials.chrome,
    8,
  );
  const direction = new THREE.Vector3();
  const end = new THREE.Vector3();
  return {
    parts: [barrel, piston],
    reach(from, to) {
      direction.copy(to).sub(from);
      const length = direction.length();
      direction.divideScalar(length);
      end
        .copy(from)
        .addScaledVector(direction, Math.min(barrelLength, length * 0.85));
      placeRod(barrel, from, end);
      placeRod(
        piston,
        end.copy(from).addScaledVector(direction, barrelLength * 0.5),
        to,
      );
    },
  };
}

/**
 * A long arm drawn in side view and given thickness, such as an excavator's
 * boom: its outline as [along, up] points round it, in the frame where it
 * runs along +z.
 */
function sideProfile(
  outline: readonly (readonly [number, number])[],
  thickness: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(
    outline.map(([along, up]) => new THREE.Vector2(along, up)),
  );
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 1,
  })
    .translate(0, 0, -thickness / 2)
    .rotateY(-Math.PI / 2);
}

/** A beacon on a short stalk, flashing amber while its Machine works by itself. */
function createBeacon(): {
  mesh: THREE.Group;
  material: THREE.MeshStandardMaterial;
} {
  const material = materials.statusOff.clone();
  const mesh = new THREE.Group();
  mesh.add(
    part(
      new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10),
      materials.darkMetal,
      [0, 0.03, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10),
      material,
      [0, 0.12, 0],
    ),
  );
  return { mesh, material };
}

/**
 * A small tracked excavator, facing along its local +z axis. Its upper body
 * turns on the tracks, and its boom, stick and bucket reach forward to grade
 * the ground.
 */
export interface ExcavatorModel {
  readonly group: THREE.Group;
  /** Turns the upper body relative to the tracks (radians, as for Object3D.rotation.y). */
  setSlew(angle: number): void;
  /** From 0, the arm tucked in, to 1, reaching out with the bucket on the ground. */
  setReach(fraction: number): void;
  /** The beacon that flashes while the Machine works by itself. */
  setBeacon(on: boolean): void;
}

/** How high the excavator's turntable is above the ground. */
const EXCAVATOR_TURNTABLE_HEIGHT = 0.75;
const BOOM_LENGTH = 2.2;
const STICK_LENGTH = 1.5;

export function createExcavatorModel(): ExcavatorModel {
  const excavator = new THREE.Group();
  excavator.name = "Excavator";
  excavator.add(createUndercarriage(2.8, 1.9));

  // Everything above the turntable turns as one.
  const upper = new THREE.Group();
  upper.position.y = EXCAVATOR_TURNTABLE_HEIGHT;
  excavator.add(upper);
  const deck = MACHINE_SEAT_HEIGHT - EXCAVATOR_TURNTABLE_HEIGHT;
  upper.add(
    // The revolving frame, level with the seat.
    part(roundedBox(1.8, deck, 2.1, 0.08), materials.machinePaint, [
      0,
      deck / 2,
      -0.1,
    ]),
    // The battery and drive housing behind the seat, with a grille on top.
    part(roundedBox(1.7, 0.55, 0.7, 0.1), materials.machinePaint, [
      0,
      deck + 0.27,
      -0.8,
    ]),
    // The counterweight across the back.
    part(roundedBox(1.78, 0.62, 0.34, 0.14), materials.darkMetal, [
      0,
      deck + 0.05,
      -1.18,
    ]),
    // A radiator standing up behind, shedding the motors' heat to space.
    part(new THREE.BoxGeometry(1.3, 0.62, 0.04), materials.radiator, [
      0,
      deck + 0.86,
      -1.05,
    ]),
    rods(
      [-0.55, 0.55].map((x) => [
        new THREE.Vector3(x, deck + 0.5, -0.95),
        new THREE.Vector3(x, deck + 0.6, -1.05),
      ]),
      0.025,
      materials.darkMetal,
    ),
    createSeat(deck),
  );
  for (let slat = 0; slat < 6; slat++) {
    upper.add(
      part(new THREE.BoxGeometry(1.3, 0.03, 0.05), materials.darkMetal, [
        0,
        deck + 0.56,
        -1.0 + slat * 0.085,
      ]),
    );
  }
  for (const x of [-0.85, 0.85]) {
    upper.add(
      part(new THREE.BoxGeometry(0.03, 0.08, 1.9), materials.darkMetal, [
        x,
        deck - 0.06,
        -0.1,
      ]),
    );
  }

  // The canopy over the seat, with work lights and the beacon on its roof.
  const canopyTop = deck + 1.18;
  upper.add(
    rods(
      [
        [-0.62, -0.42],
        [0.32, -0.42],
        [-0.62, 0.5],
        [0.32, 0.5],
      ].map(([x = 0, z = 0]) => [
        new THREE.Vector3(x, deck, z),
        new THREE.Vector3(x, canopyTop, z),
      ]),
      0.04,
      materials.darkMetal,
    ),
    part(roundedBox(1.08, 0.07, 1.08, 0.03), materials.machinePaint, [
      -0.15,
      canopyTop + 0.03,
      0.04,
    ]),
  );
  const glass = windowGlass.clone();
  for (const x of [-0.5, 0.2]) {
    upper.add(
      part(new THREE.BoxGeometry(0.16, 0.1, 0.08), materials.darkMetal, [
        x,
        canopyTop + 0.1,
        0.55,
      ]),
      part(new THREE.BoxGeometry(0.12, 0.07, 0.02), glass, [
        x,
        canopyTop + 0.1,
        0.6,
      ]),
    );
  }
  const beacon = createBeacon();
  beacon.mesh.position.set(-0.55, canopyTop + 0.06, -0.35);
  upper.add(beacon.mesh);

  // The boom rises from the front of the deck, the stick hangs from its end,
  // and the bucket from the stick's.
  const boom = new THREE.Group();
  boom.position.set(0.55, 0.45, 0.8);
  upper.add(boom);
  boom.add(
    part(
      sideProfile(
        [
          [-0.12, -0.14],
          [1.05, 0.18],
          [BOOM_LENGTH + 0.1, -0.08],
          [BOOM_LENGTH + 0.1, 0.1],
          [1.1, 0.52],
          [-0.12, 0.14],
        ],
        0.24,
      ),
      materials.machinePaint,
      [0, 0, 0],
    ),
  );
  const stick = new THREE.Group();
  stick.position.z = BOOM_LENGTH;
  boom.add(stick);
  stick.add(
    part(
      sideProfile(
        [
          [-0.1, 0.38],
          [0.1, 0.38],
          [0.09, -STICK_LENGTH],
          [-0.07, -STICK_LENGTH],
        ],
        0.17,
      ),
      materials.machinePaint,
      [0, 0, 0],
    ),
  );

  // The bucket: a curled scoop with side plates and teeth along its lip.
  const scoop: (readonly [number, number])[] = [
    [0.02, 0.06],
    [-0.13, -0.12],
    [-0.08, -0.34],
    [0.12, -0.46],
    [0.46, -0.4],
  ];
  const bucket = new THREE.Group();
  bucket.position.set(0, -STICK_LENGTH, 0);
  bucket.add(
    part(
      sideProfile(
        [
          ...scoop,
          [0.42, -0.35],
          [0.13, -0.4],
          [-0.03, -0.31],
          [-0.07, -0.13],
          [0.06, 0.03],
        ],
        0.62,
      ),
      materials.darkMetal,
      [0, 0, 0],
    ),
  );
  for (const x of [-0.33, 0.33]) {
    const plate = part(sideProfile(scoop, 0.03), materials.darkMetal, [
      x,
      0,
      0,
    ]);
    bucket.add(plate);
  }
  for (let tooth = 0; tooth < 5; tooth++) {
    const mesh = part(
      new THREE.ConeGeometry(0.035, 0.14, 4).rotateX(Math.PI / 2),
      materials.grouser,
      [-0.24 + tooth * 0.12, -0.4, 0.52],
    );
    mesh.rotation.x = 0.35;
    bucket.add(mesh);
  }
  stick.add(bucket);

  // The cylinders that move the boom, the stick and the bucket.
  const boomCylinder = createHydraulicCylinder(0.8, 0.075);
  const stickCylinder = createHydraulicCylinder(0.9, 0.06);
  const bucketCylinder = createHydraulicCylinder(0.7, 0.05);
  upper.add(...boomCylinder.parts);
  boom.add(...stickCylinder.parts);
  stick.add(...bucketCylinder.parts);
  bucketCylinder.reach(
    new THREE.Vector3(0, 0.25, 0.14),
    new THREE.Vector3(0, -STICK_LENGTH + 0.1, 0.14),
  );
  const boomFoot = new THREE.Vector3(0.55, 0.2, 0.25);
  const boomAnchor = new THREE.Vector3(0, -0.02, 0.95);
  const stickFoot = new THREE.Vector3(0, 0.42, 1.0);
  const stickAnchor = new THREE.Vector3(0, 0.38, 0);
  const anchored = new THREE.Vector3();

  return {
    group: excavator,
    setSlew(angle) {
      upper.rotation.y = angle;
    },
    setReach(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      // Tucked: boom raised high and stick folded in. Reaching: boom lowered
      // towards the ground and the stick swung out.
      boom.rotation.x = THREE.MathUtils.lerp(-0.9, -0.15, f);
      stick.rotation.x = THREE.MathUtils.lerp(0.9, -0.35, f);
      boomCylinder.reach(
        boomFoot,
        anchored.copy(boomAnchor).applyEuler(boom.rotation).add(boom.position),
      );
      stickCylinder.reach(
        stickFoot,
        anchored
          .copy(stickAnchor)
          .applyEuler(stick.rotation)
          .add(stick.position),
      );
    },
    setBeacon(on) {
      setStatusLight(beacon.material, on ? "testing" : "off");
    },
  };
}

/**
 * A regolith printer on tracks, facing along its local +z axis. Its upper
 * body turns on the tracks; a carriage runs up and down a lattice mast at the
 * front, carrying a boom that reaches out with the print head hanging from
 * its end, fed by a hose from a hopper of Regolith scooped from the ground.
 */
export interface RegolithPrinterModel {
  readonly group: THREE.Group;
  /** Turns the upper body relative to the tracks (radians, as for Object3D.rotation.y). */
  setSlew(angle: number): void;
  /** How far out the print head is from the turntable's centre, in metres. */
  setReach(metres: number): void;
  /** How high the print head's nozzle is above the ground, in metres. */
  setNozzleHeight(metres: number): void;
  /** The beacon that flashes while the Machine works by itself. */
  setBeacon(on: boolean): void;
}

/** How far from the turntable's centre the printer's mast stands. */
const PRINTER_MAST_REACH = 0.7;
/** How far below the boom the print head's nozzle hangs. */
const PRINT_HEAD_DROP = 0.55;
/** How high the turntable's top is above the ground. */
const PRINTER_TURNTABLE_HEIGHT = 0.75;
const PRINTER_MAST_HEIGHT = 4.2;
/** Half the width of the printer's square lattice mast. */
const MAST_HALF_WIDTH = 0.15;

/**
 * A square lattice of four rails braced by zigzags on every face, rising
 * from the origin to the given height.
 */
function latticeRods(
  height: number,
  halfWidth: number,
  bay: number,
): [THREE.Vector3, THREE.Vector3][] {
  const corners = [
    [-halfWidth, -halfWidth],
    [halfWidth, -halfWidth],
    [halfWidth, halfWidth],
    [-halfWidth, halfWidth],
  ] as const;
  const segments: [THREE.Vector3, THREE.Vector3][] = corners.map(([x, z]) => [
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x, height, z),
  ]);
  const bays = Math.round(height / bay);
  for (let face = 0; face < 4; face++) {
    const [x1, z1] = corners[face] ?? [0, 0];
    const [x2, z2] = corners[(face + 1) % 4] ?? [0, 0];
    for (let index = 0; index < bays; index++) {
      const low = (index * height) / bays;
      const high = ((index + 1) * height) / bays;
      const flip = index % 2 === 0;
      segments.push([
        new THREE.Vector3(flip ? x1 : x2, low, flip ? z1 : z2),
        new THREE.Vector3(flip ? x2 : x1, high, flip ? z2 : z1),
      ]);
    }
  }
  return segments;
}

export function createRegolithPrinterModel(): RegolithPrinterModel {
  const printer = new THREE.Group();
  printer.name = "Regolith printer";
  printer.add(createUndercarriage(3, 2.1));

  // Everything above the turntable turns as one.
  const upper = new THREE.Group();
  upper.position.y = PRINTER_TURNTABLE_HEIGHT;
  printer.add(upper);
  const deckHeight = MACHINE_SEAT_HEIGHT - PRINTER_TURNTABLE_HEIGHT;
  upper.add(
    // The deck, level with every Machine's seat.
    part(roundedBox(1.9, deckHeight, 2.2, 0.07), materials.hull, [
      0,
      deckHeight / 2,
      0,
    ]),
    part(new THREE.BoxGeometry(1.92, 0.06, 2.22), materials.accent, [
      0,
      deckHeight - 0.12,
      0,
    ]),
    createSeat(deckHeight),
  );

  // The hopper of Regolith behind the seat, wider at the top, on four legs.
  const hopperBottom = deckHeight + 0.3;
  const hopper = part(
    new THREE.CylinderGeometry(0.62, 0.32, 0.75, 4, 1, true).rotateY(
      Math.PI / 4,
    ),
    materials.machinePaint,
    [0, hopperBottom + 0.375, -0.68],
  );
  hopper.material = materials.machinePaint.clone();
  hopper.material.side = THREE.DoubleSide;
  upper.add(
    hopper,
    part(new THREE.BoxGeometry(0.86, 0.02, 0.86), materials.regolith, [
      0,
      hopperBottom + 0.62,
      -0.68,
    ]),
    rods(
      [
        [-0.42, -0.26],
        [0.42, -0.26],
        [-0.42, -1.1],
        [0.42, -1.1],
      ].map(([x = 0, z = 0]) => [
        new THREE.Vector3(x * 0.55, deckHeight, z * 0.55 - 0.68 * 0.45),
        new THREE.Vector3(x, hopperBottom + 0.75, z),
      ]),
      0.03,
      materials.darkMetal,
    ),
    part(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), materials.darkMetal, [
      0,
      hopperBottom - 0.1,
      -0.68,
    ]),
  );

  // The control cabinet, with a screen facing the seat, and a radiator.
  upper.add(
    part(roundedBox(0.4, 0.6, 0.5, 0.04), materials.hull, [
      0.7,
      deckHeight + 0.3,
      -0.55,
    ]),
    part(new THREE.PlaneGeometry(0.22, 0.14), materials.sensorGlow, [
      0.69,
      deckHeight + 0.45,
      -0.299,
    ]),
    part(new THREE.BoxGeometry(0.04, 0.7, 1.0), materials.radiator, [
      -0.92,
      deckHeight + 0.5,
      -0.5,
    ]),
  );

  // The lattice mast at the front, with a pulley head and the beacon on top.
  const mast = rods(
    latticeRods(PRINTER_MAST_HEIGHT, MAST_HALF_WIDTH, 0.42),
    0.022,
    materials.darkMetal,
  );
  mast.position.set(0, deckHeight, PRINTER_MAST_REACH);
  const mastTop = deckHeight + PRINTER_MAST_HEIGHT;
  upper.add(
    mast,
    part(new THREE.BoxGeometry(0.42, 0.08, 0.42), materials.machinePaint, [
      0,
      mastTop,
      PRINTER_MAST_REACH,
    ]),
    part(
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16).rotateZ(Math.PI / 2),
      materials.aluminium,
      [0, mastTop + 0.12, PRINTER_MAST_REACH],
    ),
  );
  const beacon = createBeacon();
  beacon.mesh.position.set(0.14, mastTop + 0.04, PRINTER_MAST_REACH - 0.14);
  upper.add(beacon.mesh);

  // The carriage on the mast, and the boom it carries out to the print head.
  const carriage = new THREE.Group();
  carriage.position.z = PRINTER_MAST_REACH;
  upper.add(carriage);
  carriage.add(
    part(roundedBox(0.46, 0.42, 0.46, 0.04), materials.machinePaint, [0, 0, 0]),
    part(
      new THREE.BoxGeometry(0.48, 0.06, 0.48),
      materials.darkMetal,
      [0, 0.12, 0],
    ),
  );
  // The boom is a lattice of unit length, stretched out to the head.
  const boom = rods(
    [
      [-0.08, 0.08],
      [0.08, 0.08],
      [-0.08, -0.08],
      [0.08, -0.08],
    ]
      .map(
        ([x = 0, y = 0]) =>
          [new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, 1)] as [
            THREE.Vector3,
            THREE.Vector3,
          ],
      )
      .concat(
        Array.from({ length: 4 }, (_, index) => [
          new THREE.Vector3(-0.08, index % 2 === 0 ? 0.08 : -0.08, index / 4),
          new THREE.Vector3(
            -0.08,
            index % 2 === 0 ? -0.08 : 0.08,
            (index + 1) / 4,
          ),
        ]),
        Array.from({ length: 4 }, (_, index) => [
          new THREE.Vector3(0.08, index % 2 === 0 ? 0.08 : -0.08, index / 4),
          new THREE.Vector3(
            0.08,
            index % 2 === 0 ? -0.08 : 0.08,
            (index + 1) / 4,
          ),
        ]),
      ),
    0.022,
    materials.machinePaint,
  );
  carriage.add(boom);
  const head = new THREE.Group();
  carriage.add(head);
  head.add(
    part(
      roundedBox(0.3, 0.2, 0.3, 0.04),
      materials.machinePaint,
      [0, -0.02, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.13, 0.13, 0.22, 16),
      materials.darkMetal,
      [0, -0.22, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16),
      materials.accent,
      [0, -0.24, 0],
    ),
    part(
      lathe(
        [
          [0.11, 0],
          [0.05, -0.17],
          [0.025, -0.22],
          [0.01, -0.22],
        ],
        12,
      ),
      materials.chrome,
      [0, -PRINT_HEAD_DROP + 0.22, 0],
    ),
  );
  // The hose that feeds Regolith from the hopper to the carriage.
  const hose = rod(
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    0.05,
    materials.track,
    8,
  );
  upper.add(hose);
  // Down the left of the seat, clear of the Robot sitting in it.
  const hoseFoot = new THREE.Vector3(-0.5, hopperBottom + 0.2, -0.45);
  const hoseTop = new THREE.Vector3();

  // The carriage runs between the deck and the top of the mast.
  const lowest = MACHINE_SEAT_HEIGHT + 0.2 - PRINT_HEAD_DROP;
  const highest =
    PRINTER_TURNTABLE_HEIGHT + PRINTER_MAST_HEIGHT - 0.2 - PRINT_HEAD_DROP;

  const model: RegolithPrinterModel = {
    group: printer,
    setSlew(angle) {
      upper.rotation.y = angle;
    },
    setReach(metres) {
      const out = Math.max(metres - PRINTER_MAST_REACH, 0.3);
      boom.scale.z = out;
      head.position.z = out;
    },
    setNozzleHeight(metres) {
      const height = THREE.MathUtils.clamp(metres, lowest, highest);
      carriage.position.y = height + PRINT_HEAD_DROP - PRINTER_TURNTABLE_HEIGHT;
      placeRod(
        hose,
        hoseFoot,
        hoseTop.set(-0.25, carriage.position.y - 0.1, PRINTER_MAST_REACH - 0.1),
      );
    },
    setBeacon(on) {
      setStatusLight(beacon.material, on ? "testing" : "off");
    },
  };
  // Parked with the boom drawn in and the head held low.
  model.setReach(PRINTER_MAST_REACH + 1);
  model.setNozzleHeight(lowest);
  return model;
}
