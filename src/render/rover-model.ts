import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { boxAt, lathe, materials, merged, part, rods } from "./materials";

// The Rover.

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
