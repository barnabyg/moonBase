import * as THREE from "three";
import {
  lathe,
  lightWindow,
  materials,
  part,
  rod,
  windowGlass,
} from "./materials";

/** The way the Lander's hatch and ladder face, as for Object3D.rotation.y: towards the starting view. */
export const LANDER_HATCH_ANGLE = Math.PI / 4;

/** Where the foot of the Lander's ladder meets the ground, on the hatch side, from its centre. */
export function landerLadderFoot(footprintRadius: number): THREE.Vector3 {
  return outward(LANDER_HATCH_ANGLE, footprintRadius - 0.2, 0);
}

export interface LanderModel {
  readonly group: THREE.Group;
  /** Lights the crew cabin's windows while the Mission Director lives aboard. */
  setCrewAboard(aboard: boolean): void;
}

/** The octagonal descent stage's corner radius, and the heights of its lower and upper decks. */
const STAGE_RADIUS = 2.2;
const STAGE_BOTTOM = 1.5;
const STAGE_TOP = 3.3;
/** The crew cabin's radius, and the height of its floor. */
const CABIN_RADIUS = 1.3;
const CABIN_FLOOR = STAGE_TOP + 0.05;

/** A point out from the Lander's centre in the given direction (as for Object3D.rotation.y), at a height. */
function outward(angle: number, distance: number, height: number) {
  return new THREE.Vector3(
    Math.sin(angle) * distance,
    height,
    Math.cos(angle) * distance,
  );
}

/** A flat part on the outside of something round, turned to face out in the given direction. */
function facing(mesh: THREE.Mesh, angle: number): THREE.Mesh {
  mesh.rotation.y = angle;
  return mesh;
}

/**
 * The reusable Lander: an octagonal descent stage wrapped in gold and silver
 * insulation, with propellant tanks set into its top deck and an engine
 * bell beneath, carrying a crew cabin with windows, a hatch and a porch over
 * the ladder. Four sprung legs reach out to its footprint radius.
 */
export function createLanderModel(footprintRadius: number): LanderModel {
  const lander = new THREE.Group();
  lander.name = "Lander";
  lander.add(createDescentStage(), ...createLegs(footprintRadius));
  const windows = createCabin(lander);
  return {
    group: lander,
    setCrewAboard(aboard) {
      lightWindow(windows, aboard);
    },
  };
}

function createDescentStage(): THREE.Group {
  const stage = new THREE.Group();
  const height = STAGE_TOP - STAGE_BOTTOM;
  const middle = (STAGE_BOTTOM + STAGE_TOP) / 2;
  // Turned so that a face, not a corner, looks each way the legs and hatch do.
  const octagon = (radius: number, depth: number) =>
    new THREE.CylinderGeometry(radius, radius, depth, 8, 1, false, Math.PI / 8);
  const apothem = STAGE_RADIUS * Math.cos(Math.PI / 8);
  const side = 2 * STAGE_RADIUS * Math.sin(Math.PI / 8);

  stage.add(
    part(octagon(STAGE_RADIUS - 0.12, height), materials.darkMetal, [
      0,
      middle,
      0,
    ]),
    part(octagon(STAGE_RADIUS + 0.05, 0.1), materials.aluminium, [
      0,
      STAGE_BOTTOM,
      0,
    ]),
    part(octagon(STAGE_RADIUS + 0.05, 0.1), materials.aluminium, [
      0,
      STAGE_TOP,
      0,
    ]),
  );
  // The bays: gold where the tanks sit, silver behind the legs.
  for (let face = 0; face < 8; face++) {
    const angle = (face * Math.PI) / 4;
    const panel = facing(
      part(
        new THREE.BoxGeometry(side - 0.16, height - 0.14, 0.06),
        face % 2 === 0 ? materials.foil : materials.silverFoil,
        outward(angle, apothem - 0.08, middle).toArray(),
      ),
      angle,
    );
    stage.add(panel);
    const corner = angle + Math.PI / 8;
    stage.add(
      facing(
        part(
          new THREE.BoxGeometry(0.1, height, 0.1),
          materials.aluminium,
          outward(corner, STAGE_RADIUS - 0.02, middle).toArray(),
        ),
        corner,
      ),
    );
  }
  // Pipework across the gold bays.
  for (let face = 0; face < 8; face += 2) {
    const angle = (face * Math.PI) / 4;
    const across = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    const centre = outward(angle, apothem - 0.02, STAGE_BOTTOM + 0.45);
    stage.add(
      rod(
        centre.clone().addScaledVector(across, -0.65),
        centre.clone().addScaledVector(across, 0.65),
        0.03,
        materials.aluminium,
        6,
      ),
      rod(
        centre.clone().addScaledVector(across, 0.45),
        centre
          .clone()
          .addScaledVector(across, 0.45)
          .setY(STAGE_TOP - 0.2),
        0.03,
        materials.aluminium,
        6,
      ),
    );
  }

  // The domes of the propellant tanks, set into the top deck.
  for (let tank = 0; tank < 4; tank++) {
    const angle = (tank * Math.PI) / 2;
    const dome = part(
      new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.silverFoil,
      outward(angle, 1.68, STAGE_TOP + 0.04).toArray(),
    );
    dome.scale.y = 0.7;
    stage.add(dome);
  }

  // Underneath: the heat shield, the thrust structure and the engine.
  stage.add(
    part(new THREE.CylinderGeometry(1.7, 2.0, 0.12, 16), materials.darkMetal, [
      0,
      STAGE_BOTTOM - 0.1,
      0,
    ]),
    part(new THREE.CylinderGeometry(0.45, 0.65, 0.3, 12), materials.aluminium, [
      0,
      STAGE_BOTTOM - 0.3,
      0,
    ]),
    part(new THREE.CylinderGeometry(0.24, 0.3, 0.25, 12), materials.nozzle, [
      0,
      STAGE_BOTTOM - 0.55,
      0,
    ]),
    // The bell's mouth is 0.55 m above the feet, where the plume's exhaust starts.
    part(
      lathe(
        [
          [0.75, 0],
          [0.62, 0.08],
          [0.47, 0.18],
          [0.34, 0.29],
          [0.25, 0.4],
          [0.22, 0.45],
        ],
        28,
      ),
      materials.nozzle,
      [0, 0.55, 0],
    ),
  );
  // Landing radar and sensors under the deck.
  for (const angle of [Math.PI / 2, (3 * Math.PI) / 2]) {
    stage.add(
      part(
        new THREE.BoxGeometry(0.35, 0.15, 0.35),
        materials.darkMetal,
        outward(angle, 1.3, STAGE_BOTTOM - 0.22).toArray(),
      ),
    );
  }
  return stage;
}

/**
 * The crew cabin on the top deck, with its windows, hatch, porch, thrusters,
 * radiators and antennas. Returns the windows' material, to light them.
 */
function createCabin(lander: THREE.Group): THREE.MeshStandardMaterial {
  const cabin = new THREE.Group();
  const hatch = LANDER_HATCH_ANGLE;
  cabin.add(
    part(
      lathe(
        [
          [0.01, 0],
          [CABIN_RADIUS - 0.05, 0],
          [CABIN_RADIUS, 0.08],
          [CABIN_RADIUS, 1.4],
          [CABIN_RADIUS - 0.1, 1.6],
          [0.75, 2.15],
          [0.6, 2.2],
          [0.01, 2.2],
        ],
        32,
      ),
      materials.hull,
      [0, CABIN_FLOOR, 0],
    ),
    // A structural ring round the cabin, and the docking ring on top.
    part(
      new THREE.CylinderGeometry(
        CABIN_RADIUS + 0.02,
        CABIN_RADIUS + 0.02,
        0.08,
        32,
      ),
      materials.darkMetal,
      [0, CABIN_FLOOR + 1.4, 0],
    ),
    part(new THREE.CylinderGeometry(0.5, 0.55, 0.22, 24), materials.aluminium, [
      0,
      CABIN_FLOOR + 2.3,
      0,
    ]),
    part(
      new THREE.TorusGeometry(0.5, 0.05, 6, 24).rotateX(Math.PI / 2),
      materials.darkMetal,
      [0, CABIN_FLOOR + 2.42, 0],
    ),
  );

  // The hatch, in its frame, above the ladder.
  cabin.add(
    facing(
      part(
        new THREE.BoxGeometry(0.9, 1.1, 0.06),
        materials.darkMetal,
        outward(hatch, CABIN_RADIUS - 0.01, CABIN_FLOOR + 0.62).toArray(),
      ),
      hatch,
    ),
    facing(
      part(
        new THREE.BoxGeometry(0.76, 0.96, 0.08),
        materials.aluminium,
        outward(hatch, CABIN_RADIUS + 0.01, CABIN_FLOOR + 0.62).toArray(),
      ),
      hatch,
    ),
    facing(
      part(
        new THREE.BoxGeometry(0.06, 0.25, 0.06),
        materials.darkMetal,
        outward(hatch, CABIN_RADIUS + 0.06, CABIN_FLOOR + 0.62)
          .add(
            new THREE.Vector3(
              Math.cos(hatch),
              0,
              -Math.sin(hatch),
            ).multiplyScalar(0.26),
          )
          .toArray(),
      ),
      hatch,
    ),
  );

  // Two windows either side of the hatch, looking out over the ladder.
  const glass = windowGlass.clone();
  for (const side of [-1, 1]) {
    const angle = hatch + side * 0.42;
    const at = outward(angle, CABIN_RADIUS, CABIN_FLOOR + 1.12);
    cabin.add(
      facing(
        part(
          new THREE.BoxGeometry(0.5, 0.52, 0.05),
          materials.darkMetal,
          at.toArray(),
        ),
        angle,
      ),
      facing(
        part(
          new THREE.BoxGeometry(0.4, 0.42, 0.06),
          glass,
          outward(angle, CABIN_RADIUS + 0.01, CABIN_FLOOR + 1.12).toArray(),
        ),
        angle,
      ),
    );
  }

  // The porch at the top of the ladder, with a handrail either side.
  const across = new THREE.Vector3(Math.cos(hatch), 0, -Math.sin(hatch));
  cabin.add(
    facing(
      part(
        new THREE.BoxGeometry(1.0, 0.06, 0.9),
        materials.aluminium,
        outward(hatch, STAGE_RADIUS + 0.2, STAGE_TOP + 0.02).toArray(),
      ),
      hatch,
    ),
  );
  for (const side of [-1, 1]) {
    const inner = outward(
      hatch,
      STAGE_RADIUS - 0.2,
      STAGE_TOP + 0.05,
    ).addScaledVector(across, side * 0.48);
    const outer = outward(
      hatch,
      STAGE_RADIUS + 0.6,
      STAGE_TOP + 0.05,
    ).addScaledVector(across, side * 0.48);
    cabin.add(
      rod(
        inner,
        inner.clone().setY(STAGE_TOP + 0.9),
        0.025,
        materials.aluminium,
        6,
      ),
      rod(
        outer,
        outer.clone().setY(STAGE_TOP + 0.9),
        0.025,
        materials.aluminium,
        6,
      ),
      rod(
        inner.clone().setY(STAGE_TOP + 0.9),
        outer.clone().setY(STAGE_TOP + 0.9),
        0.025,
        materials.aluminium,
        6,
      ),
    );
  }

  // Thruster quads round the cabin, clear of the hatch.
  for (let quad = 0; quad < 4; quad++) {
    const angle = (quad * Math.PI) / 2;
    const block = new THREE.Group();
    block.position.copy(outward(angle, CABIN_RADIUS + 0.22, CABIN_FLOOR + 1.0));
    block.rotation.y = angle;
    block.add(
      part(
        new THREE.BoxGeometry(0.24, 0.24, 0.24),
        materials.darkMetal,
        [0, 0, 0],
      ),
      part(
        new THREE.BoxGeometry(0.1, 0.1, 0.22),
        materials.aluminium,
        [0, 0, -0.18],
      ),
    );
    for (const [x, y, turn] of [
      [0, 0.17, 0],
      [0, -0.17, Math.PI],
      [0.17, 0, -Math.PI / 2],
      [-0.17, 0, Math.PI / 2],
    ] as const) {
      const nozzle = part(
        new THREE.ConeGeometry(0.06, 0.12, 8, 1, true),
        materials.nozzle,
        [x, y, 0],
      );
      nozzle.rotation.z = turn + Math.PI;
      block.add(nozzle);
    }
    cabin.add(block);
  }

  // Radiators standing off the sides of the cabin.
  for (const angle of [hatch + (2 * Math.PI) / 3, hatch - (2 * Math.PI) / 3]) {
    cabin.add(
      facing(
        part(
          new THREE.BoxGeometry(1.0, 0.9, 0.05),
          materials.radiator,
          outward(angle, CABIN_RADIUS + 0.12, CABIN_FLOOR + 0.6).toArray(),
        ),
        angle,
      ),
    );
  }

  // The high-gain dish on its boom, pointing up towards Earth, and two whips.
  const back = hatch + Math.PI;
  const boomFoot = outward(back, 0.7, CABIN_FLOOR + 1.85);
  const boomTop = outward(back, 1.25, CABIN_FLOOR + 2.85);
  const dish = part(
    lathe(
      [
        [0.01, 0],
        [0.2, 0.02],
        [0.36, 0.08],
        [0.48, 0.17],
      ],
      24,
    ),
    materials.hull,
    boomTop.toArray(),
  );
  dish.rotation.set(-0.5, back, 0, "YXZ");
  cabin.add(
    rod(boomFoot, boomTop, 0.035, materials.aluminium, 6),
    dish,
    rod(
      boomTop,
      boomTop.clone().add(new THREE.Vector3(0, 0.35, 0)),
      0.015,
      materials.darkMetal,
      4,
    ),
  );
  for (const angle of [back + 0.9, back - 0.9]) {
    const foot = outward(angle, 0.9, CABIN_FLOOR + 1.75);
    cabin.add(
      rod(
        foot,
        foot.clone().add(new THREE.Vector3(0, 0.9, 0)),
        0.012,
        materials.darkMetal,
        4,
      ),
    );
  }

  // Navigation lights on the deck: red to port, green to starboard.
  for (const [angle, colour] of [
    [hatch + Math.PI / 2, 0xff3020],
    [hatch - Math.PI / 2, 0x30ff60],
  ] as const) {
    cabin.add(
      part(
        new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 2,
        }),
        outward(angle, STAGE_RADIUS - 0.1, STAGE_TOP + 0.12).toArray(),
      ),
    );
  }
  lander.add(cabin);
  return glass;
}

/**
 * The four legs, each a sprung main strut from the side of the descent stage
 * to a footpad, braced back to the lower deck by two struts. The leg on the
 * hatch side carries the ladder.
 */
function createLegs(footprintRadius: number): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  for (let leg = 0; leg < 4; leg++) {
    const angle = LANDER_HATCH_ANGLE + (leg * Math.PI) / 2;
    const top = outward(angle, STAGE_RADIUS - 0.2, STAGE_TOP - 0.45);
    const foot = outward(angle, footprintRadius - 0.35, 0.34);
    const knee = top.clone().lerp(foot, 0.58);
    parts.push(
      // The shock absorber: a wrapped outer tube, a collar where it ends, and
      // the piston sliding out of it.
      rod(top, knee, 0.12, materials.foil, 10),
      rod(
        knee.clone().lerp(top, 0.03),
        knee.clone().lerp(foot, 0.03),
        0.14,
        materials.darkMetal,
        10,
      ),
      rod(knee.clone().lerp(top, 0.08), foot, 0.075, materials.chrome, 10),
      part(
        new THREE.SphereGeometry(0.11, 10, 8),
        materials.darkMetal,
        foot.toArray(),
      ),
      part(
        lathe(
          [
            [0.01, 0],
            [0.42, 0],
            [0.47, 0.06],
            [0.42, 0.13],
            [0.16, 0.22],
            [0.01, 0.22],
          ],
          20,
        ),
        materials.silverFoil,
        foot.clone().setY(0).toArray(),
      ),
    );
    for (const side of [-1, 1]) {
      const brace = outward(
        angle + side * 0.42,
        STAGE_RADIUS - 0.25,
        STAGE_BOTTOM + 0.05,
      );
      parts.push(
        rod(brace, foot.clone().setY(0.4), 0.05, materials.aluminium, 6),
      );
    }
    // A downlock strut from the lower deck to the main strut.
    parts.push(
      rod(
        outward(angle, STAGE_RADIUS - 0.3, STAGE_BOTTOM),
        top.clone().lerp(foot, 0.35),
        0.04,
        materials.darkMetal,
        6,
      ),
    );
    if (leg === 0) parts.push(createLadder(angle, footprintRadius));
  }
  return parts;
}

/** The ladder down the hatch-side leg, from the porch to just above the footpad. */
function createLadder(angle: number, footprintRadius: number): THREE.Group {
  const ladder = new THREE.Group();
  const across = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  const top = outward(angle, STAGE_RADIUS + 0.45, STAGE_TOP);
  const bottom = outward(angle, footprintRadius - 0.55, 0.45);
  for (const side of [-1, 1]) {
    ladder.add(
      rod(
        top.clone().addScaledVector(across, side * 0.24),
        bottom.clone().addScaledVector(across, side * 0.24),
        0.025,
        materials.aluminium,
        6,
      ),
    );
  }
  const rungs = Math.floor(top.distanceTo(bottom) / 0.32);
  for (let rung = 1; rung < rungs; rung++) {
    const at = top.clone().lerp(bottom, rung / rungs);
    ladder.add(
      rod(
        at.clone().addScaledVector(across, -0.24),
        at.clone().addScaledVector(across, 0.24),
        0.02,
        materials.aluminium,
        6,
      ),
    );
  }
  return ladder;
}
