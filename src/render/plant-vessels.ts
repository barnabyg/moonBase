import * as THREE from "three";
import {
  boxAt,
  detailParts,
  materials,
  part,
  placed,
  rodGeometry,
  type DetailParts,
} from "./materials";

// The vessels and fixtures standing on a Plant's plinth, each kind drawn by
// functions of its own.

/** The height of the top of a Plant's plinth, which its vessels stand on. */
export const PLINTH_TOP = 0.25;

/** A reactor's radius and height, standing on the plinth. */
const REACTOR = { radius: 0.9, height: 3.2 } as const;
/** A tank's radius and height, standing on the plinth. */
const TANK = { radius: 1.3, height: 1.6 } as const;
/** A chamber's radius and length, and the height of its axis, held off the plinth by its cradles. */
const CHAMBER = { radius: 0.75, length: 2.6, axis: 1.2 } as const;

/**
 * A vessel standing on a Plant's plinth. A reactor is tall and narrow, a
 * tank squat and wide, a chamber a drum lying on its side, an oven a low
 * tunnel with a conveyor running through it, a stack a block of cell
 * plates, a hopper a funnel on legs that Regolith is tipped into, a mill a
 * machine tool, with a spindle hanging from a gantry over its bed, and a
 * conveyor a long sloping belt. The rest are fixtures beside them: bottles a
 * rack of gas bottles, a radiator a panel shedding heat to space, panels a
 * pallet of finished solar panels, and cassettes a rack of wafer cassettes.
 */
export interface PlantVessel {
  readonly kind:
    | "reactor"
    | "tank"
    | "chamber"
    | "oven"
    | "stack"
    | "hopper"
    | "mill"
    | "conveyor"
    | "bottles"
    | "radiator"
    | "panels"
    | "cassettes";
  /** Where its centre stands on the plinth, across and front to back. */
  readonly at: readonly [number, number];
  /** How much bigger it is than the plain vessel of its kind; 1 if not given. */
  readonly scale?: number;
  /** What a conveyor carries along its belt, if anything. */
  readonly carries?: "panels" | "boards" | "optics" | "ice";
}

/** How one kind of vessel is drawn, centred across and front to back on the origin. */
interface VesselDrawing {
  /**
   * Its parts, standing on the plinth, with any band that glows while the
   * Plant works made of the glow material.
   */
  readonly parts: (glow: THREE.Material) => THREE.Object3D[];
  /**
   * Its finer parts, as its parts are placed: flanges and bands, domed ends,
   * nozzles, ladders and gauges, so that each kind reads as what it is. A
   * fixture is made only of these.
   */
  readonly detail: (detail: DetailParts, vessel: PlantVessel) => void;
}

/** A fixture's parts: none, as it is made only of detail. */
function noParts(): THREE.Object3D[] {
  return [];
}

/** An upright drum of a reactor's or a tank's size, standing on the plinth. */
function uprightParts(
  { radius, height }: { readonly radius: number; readonly height: number },
  material: THREE.Material,
  glow: THREE.Material,
): THREE.Object3D[] {
  return [
    part(new THREE.CylinderGeometry(radius, radius, height, 16), material, [
      0,
      0.25 + height / 2,
      0,
    ]),
    // A band round the vessel that glows while it works.
    part(
      new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
      glow,
      [0, 0.25 + height * 0.6, 0],
    ),
  ];
}

/** A ladder up the outside of a vessel, standing off it at the given depth. */
function ladder(
  z: number,
  bottom: number,
  top: number,
): THREE.BufferGeometry[] {
  const rungs = Math.floor((top - bottom) / 0.3);
  return [
    ...[-0.18, 0.18].map((x) =>
      rodGeometry(
        new THREE.Vector3(x, bottom, z),
        new THREE.Vector3(x, top, z),
        0.02,
      ),
    ),
    ...Array.from({ length: rungs }, (_, index) => {
      const y = bottom + 0.2 + index * 0.3;
      return rodGeometry(
        new THREE.Vector3(-0.18, y, z),
        new THREE.Vector3(0.18, y, z),
        0.015,
      );
    }),
  ];
}

/** A reactor's flanges, ladder, domed top and nozzle. */
function reactorDetail(detail: DetailParts): void {
  const top = PLINTH_TOP + REACTOR.height;
  detail.add(
    materials.darkMetal,
    placed(new THREE.CylinderGeometry(0.96, 1, 0.3, 16), [0, 0.4, 0]),
    ...[1.25, 3.1].map((y) =>
      placed(new THREE.CylinderGeometry(0.94, 0.94, 0.07, 16), [0, y, 0]),
    ),
    ...ladder(1, 0.3, top + 0.1),
  );
  detail.add(
    materials.aluminium,
    placed(
      new THREE.SphereGeometry(0.9, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      [0, top, 0],
      [0, 0, 0],
      [1, 0.35, 1],
    ),
    placed(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), [
      0.3,
      top + 0.35,
      0,
    ]),
    placed(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), [0.3, top + 0.6, 0]),
  );
}

/** A tank's domed top, flanges, manway, nozzle and sight glass. */
function tankDetail(detail: DetailParts): void {
  const top = PLINTH_TOP + TANK.height;
  detail.add(
    materials.hull,
    placed(
      new THREE.SphereGeometry(1.3, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      [0, top, 0],
      [0, 0, 0],
      [1, 0.25, 1],
    ),
  );
  detail.add(
    materials.darkMetal,
    placed(new THREE.CylinderGeometry(1.34, 1.37, 0.18, 16), [0, 0.34, 0]),
    placed(new THREE.CylinderGeometry(1.33, 1.33, 0.06, 16), [
      0,
      top - 0.02,
      0,
    ]),
    // A manway on the front, and a nozzle on top.
    placed(
      new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12),
      [0, 0.95, 1.33],
      [Math.PI / 2, 0, 0],
    ),
    placed(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), [0.45, top + 0.4, 0]),
    // The brackets of a sight glass showing how full it is.
    ...[0.5, 1.55].map((y) =>
      rodGeometry(
        new THREE.Vector3(-0.9, y, 0.9),
        new THREE.Vector3(-0.98, y, 0.98),
        0.025,
      ),
    ),
  );
  detail.add(
    materials.visor,
    rodGeometry(
      new THREE.Vector3(-0.98, 0.45, 0.98),
      new THREE.Vector3(-0.98, 1.6, 0.98),
      0.035,
    ),
  );
  detail.add(
    materials.accent,
    placed(
      new THREE.TorusGeometry(0.15, 0.025, 6, 12),
      [0.45, top + 0.62, 0],
      [Math.PI / 2, 0, 0],
    ),
  );
}

/** A chamber's drum, lying from front to back, held off the plinth by two cradles. */
function chamberParts(glow: THREE.Material): THREE.Object3D[] {
  const { radius, length, axis } = CHAMBER;
  const lying = (mesh: THREE.Mesh) => {
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  return [
    lying(
      part(
        new THREE.CylinderGeometry(radius, radius, length, 16),
        materials.foil,
        [0, axis, 0],
      ),
    ),
    // A band round the vessel that glows while it works.
    lying(
      part(
        new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.2, 16),
        glow,
        [0, axis, 0.5],
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

/** A chamber's dished ends, bands, window and vacuum pump. */
function chamberDetail(detail: DetailParts): void {
  const { radius, length, axis: y } = CHAMBER;
  const end = length / 2;
  const dish = (z: number, turn: number) =>
    placed(
      new THREE.SphereGeometry(radius, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      [0, y, z],
      [turn, 0, 0],
      [1, 0.25, 1],
    );
  // A dished door on the front and a dished end behind.
  detail.add(materials.hull, dish(end, Math.PI / 2));
  detail.add(
    materials.darkMetal,
    dish(-end, -Math.PI / 2),
    placed(new THREE.TorusGeometry(radius - 0.03, 0.05, 6, 24), [0, y, end]),
    ...[-1, -0.4, 1.05].map((z) =>
      placed(
        new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.08, 16),
        [0, y, z],
        [Math.PI / 2, 0, 0],
      ),
    ),
    boxAt(0.5, 0.04, 0.6, [0, y + radius, -0.6]),
  );
  detail.add(
    materials.visor,
    placed(
      new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12),
      [0.3, y + 0.15, end + 0.16],
      [Math.PI / 2, 0, 0],
    ),
  );
  // The vacuum pump on top.
  detail.add(
    materials.machinePaint,
    boxAt(0.45, 0.35, 0.55, [0, y + radius + 0.19, -0.6]),
  );
}

/**
 * An oven's tunnel from front to back on two legs, with the conveyor that
 * carries the boards through it sticking out at both ends.
 */
function ovenParts(glow: THREE.Material): THREE.Object3D[] {
  return [
    part(new THREE.BoxGeometry(1.3, 0.9, 2.4), materials.hull, [0, 1.05, 0]),
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
}

/** An oven's exhaust stacks, fins and control panel, and the boards it carries. */
function ovenDetail(detail: DetailParts): void {
  detail.add(
    materials.darkMetal,
    // Exhaust stacks, with caps.
    ...[-0.3, 0.3].flatMap((x) => [
      placed(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), [x, 1.75, -0.8]),
      placed(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8), [x, 2.02, -0.8]),
    ]),
    // Cooling fins down one side, and a control panel on the other.
    ...[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((z) =>
      boxAt(0.06, 0.7, 0.04, [0.68, 1.05, z]),
    ),
    boxAt(0.08, 0.45, 0.5, [-0.69, 1.1, 0.6]),
  );
  detail.add(materials.visor, boxAt(0.02, 0.25, 0.35, [-0.74, 1.15, 0.6]));
  // Boards going in at one end and coming out at the other.
  detail.add(
    materials.circuitBoard,
    ...[-1.38, 1.38].map((z) => boxAt(0.5, 0.025, 0.32, [0, 0.695, z])),
  );
  detail.add(
    materials.seal,
    ...[-1.38, 1.38].flatMap((z) =>
      [-0.1, 0.1].map((x) => boxAt(0.12, 0.02, 0.1, [x, 0.715, z])),
    ),
  );
}

/**
 * A stack's cell plates, side by side between two end plates, with the gaps
 * between them glowing while it works.
 */
function stackParts(glow: THREE.Material): THREE.Object3D[] {
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

/**
 * A stack's tie rods holding the plates together, and the manifolds that
 * carry the gases off.
 */
function stackDetail(detail: DetailParts): void {
  detail.add(
    materials.chrome,
    ...[0.4, 1.3].flatMap((y) =>
      [-0.5, 0.5].map((z) =>
        rodGeometry(
          new THREE.Vector3(-0.8, y, z),
          new THREE.Vector3(0.8, y, z),
          0.03,
        ),
      ),
    ),
  );
  detail.add(
    materials.aluminium,
    ...[-0.3, 0.3].flatMap((z) => [
      rodGeometry(
        new THREE.Vector3(-0.8, 1.55, z),
        new THREE.Vector3(0.8, 1.55, z),
        0.06,
        8,
      ),
      ...[-0.66, 0.66].map((x) =>
        rodGeometry(
          new THREE.Vector3(x, 1.38, z),
          new THREE.Vector3(x, 1.55, z),
          0.04,
        ),
      ),
    ]),
  );
}

/** A hopper's funnel on four legs, wide end up. */
function hopperParts(): THREE.Object3D[] {
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
}

/** A hopper's rim, spout and braces, and the Regolith heaped inside. */
function hopperDetail(detail: DetailParts): void {
  const legs = [
    [-0.45, -0.45],
    [0.45, -0.45],
    [0.45, 0.45],
    [-0.45, 0.45],
  ] as const;
  detail.add(
    materials.darkMetal,
    placed(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 8), [0, 2.2, 0]),
    placed(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 8), [0, 1.08, 0]),
    // Braces across each side between the legs.
    ...legs.map(([x, z], index) => {
      const [nextX, nextZ] = legs[(index + 1) % legs.length] ?? legs[0];
      return rodGeometry(
        new THREE.Vector3(x, 0.35, z),
        new THREE.Vector3(nextX, 1.2, nextZ),
        0.02,
      );
    }),
  );
  // The Regolith heaped inside.
  detail.add(
    materials.regolith,
    placed(new THREE.CylinderGeometry(0.5, 0.7, 0.14, 8), [0, 2.12, 0]),
  );
}

/**
 * A mill's bed from side to side, two posts carrying a beam over it, and a
 * spindle hanging from the beam, whose tip glows while it cuts.
 */
function millParts(glow: THREE.Material): THREE.Object3D[] {
  return [
    part(
      new THREE.BoxGeometry(2.3, 0.35, 1.3),
      materials.machinePaint,
      [0, 0.42, 0],
    ),
    part(new THREE.BoxGeometry(1, 0.1, 0.9), materials.hull, [0, 0.65, 0]),
    ...[-1, 1].map((x) =>
      part(new THREE.BoxGeometry(0.22, 1.9, 0.3), materials.darkMetal, [
        x,
        1.3,
        0,
      ]),
    ),
    part(
      new THREE.BoxGeometry(2.3, 0.28, 0.34),
      materials.machinePaint,
      [0, 2.3, 0],
    ),
    part(
      new THREE.BoxGeometry(0.36, 0.55, 0.42),
      materials.hull,
      [0.2, 1.95, 0],
    ),
    part(
      new THREE.CylinderGeometry(0.07, 0.07, 0.65, 8),
      materials.darkMetal,
      [0.2, 1.35, 0],
    ),
    part(new THREE.CylinderGeometry(0.11, 0.03, 0.2, 8), glow, [0.2, 0.95, 0]),
  ];
}

/** A mill's spindle motor, and the control cabinet in front of it. */
function millDetail(detail: DetailParts): void {
  detail.add(
    materials.darkMetal,
    placed(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 10), [0.2, 2.62, 0]),
  );
  // A control cabinet in front, with its screen and stop button.
  detail.add(materials.hull, boxAt(0.5, 1, 0.3, [0.8, 0.75, 0.85]));
  detail.add(materials.visor, boxAt(0.3, 0.2, 0.02, [0.8, 1.05, 1.01]));
  detail.add(
    materials.accent,
    placed(
      new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10),
      [0.8, 0.8, 1.01],
      [Math.PI / 2, 0, 0],
    ),
  );
}

/**
 * A conveyor's long belt on two legs, sloping up from side to side, with a
 * light along it that glows while it runs.
 */
function conveyorParts(glow: THREE.Material): THREE.Object3D[] {
  const belt = part(
    new THREE.BoxGeometry(3, 0.12, 0.9),
    materials.darkMetal,
    [0, 1.05, 0],
  );
  belt.rotation.z = 0.25;
  const light = part(new THREE.BoxGeometry(2.6, 0.05, 0.2), glow, [0, 1.14, 0]);
  light.rotation.z = 0.25;
  return [
    belt,
    light,
    part(
      new THREE.BoxGeometry(0.2, 0.6, 0.7),
      materials.machinePaint,
      [-1, 0.55, 0],
    ),
    part(
      new THREE.BoxGeometry(0.2, 1.2, 0.7),
      materials.machinePaint,
      [1, 0.85, 0],
    ),
  ];
}

/** Where a conveyor's belt runs, sloping up from side to side. */
const CONVEYOR_BELT = new THREE.Matrix4().compose(
  new THREE.Vector3(0, 1.05, 0),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.25),
  new THREE.Vector3(1, 1, 1),
);

/** A geometry placed on a conveyor's belt, along it, above it and across it. */
function onBelt(
  geometry: THREE.BufferGeometry,
  at: readonly [number, number, number],
  rotation?: readonly [number, number, number],
  scale?: readonly [number, number, number],
): THREE.BufferGeometry {
  return placed(geometry, at, rotation, scale).applyMatrix4(CONVEYOR_BELT);
}

/** How far along a conveyor's belt each thing it carries lies. */
const CONVEYOR_LOADS = [-1, 0, 1];
/** The height above the middle of a conveyor's belt that what it carries sits at. */
const CONVEYOR_LOAD_HEIGHT = 0.13;

/** What a conveyor carries along its belt. */
function conveyorLoad(
  carries: NonNullable<PlantVessel["carries"]>,
  detail: DetailParts,
): void {
  const y = CONVEYOR_LOAD_HEIGHT;
  switch (carries) {
    case "panels":
      detail.add(
        materials.solarCell,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.BoxGeometry(0.7, 0.03, 0.62), [x, y, 0]),
        ),
      );
      return;
    case "boards":
      detail.add(
        materials.circuitBoard,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.BoxGeometry(0.45, 0.025, 0.32), [x, y, 0]),
        ),
      );
      return;
    case "optics":
      detail.add(
        materials.darkMetal,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), [x, y, 0]),
        ),
      );
      detail.add(
        materials.precisionOptic,
        ...CONVEYOR_LOADS.map((x) =>
          onBelt(
            new THREE.SphereGeometry(0.17, 12, 6),
            [x, y + 0.03, 0],
            [0, 0, 0],
            [1, 0.3, 1],
          ),
        ),
      );
      return;
    case "ice":
      detail.add(
        materials.ice,
        ...CONVEYOR_LOADS.flatMap((x, index) =>
          [-0.18, 0.18].map((z) =>
            onBelt(
              new THREE.IcosahedronGeometry(0.15, 0),
              [x + z * 0.5, y + 0.05, z],
              [index, z * 4, 0],
            ),
          ),
        ),
      );
      return;
  }
}

/** A conveyor's belt edges, rollers and motor, and what it carries. */
function conveyorDetail(detail: DetailParts, vessel: PlantVessel): void {
  detail.add(
    materials.aluminium,
    ...[-0.47, 0.47].map((z) =>
      onBelt(new THREE.BoxGeometry(3, 0.14, 0.05), [0, 0.05, z]),
    ),
  );
  detail.add(
    materials.darkMetal,
    ...[-1.5, 1.5].map((x) =>
      onBelt(
        new THREE.CylinderGeometry(0.1, 0.1, 0.96, 10),
        [x, 0, 0],
        [Math.PI / 2, 0, 0],
      ),
    ),
  );
  // The motor driving the belt.
  detail.add(
    materials.machinePaint,
    onBelt(new THREE.BoxGeometry(0.3, 0.3, 0.25), [-1.35, -0.15, 0.6]),
  );
  if (vessel.carries !== undefined) conveyorLoad(vessel.carries, detail);
}

/** A rack of four gas bottles, held in by bars in front and behind. */
function bottlesDetail(detail: DetailParts): void {
  const xs = [-0.48, -0.16, 0.16, 0.48];
  detail.add(
    materials.hull,
    ...xs.flatMap((x) => [
      placed(new THREE.CylinderGeometry(0.13, 0.13, 1, 10), [x, 0.8, 0]),
      placed(
        new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        [x, 1.3, 0],
      ),
    ]),
  );
  detail.add(
    materials.accent,
    ...xs.map((x) =>
      placed(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 10), [x, 1.15, 0]),
    ),
  );
  detail.add(
    materials.darkMetal,
    ...xs.map((x) =>
      placed(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), [x, 1.48, 0]),
    ),
    boxAt(1.4, 0.06, 0.42, [0, 0.28, 0]),
    ...[-0.68, 0.68].map((x) =>
      rodGeometry(
        new THREE.Vector3(x, 0.25, -0.18),
        new THREE.Vector3(x, 1.1, -0.18),
        0.03,
      ),
    ),
    // Bars in front of and behind the bottles, holding them in the rack.
    ...[-0.18, 0.17].map((z) =>
      rodGeometry(
        new THREE.Vector3(-0.68, 1, z),
        new THREE.Vector3(0.68, 1, z),
        0.02,
      ),
    ),
  );
}

/** A radiator's panel, with its ribs, headers and the posts it stands on. */
function radiatorDetail(detail: DetailParts): void {
  detail.add(materials.radiator, boxAt(1.6, 1.2, 0.04, [0, 1.2, 0]));
  detail.add(
    materials.aluminium,
    ...[-0.65, -0.39, -0.13, 0.13, 0.39, 0.65].map((x) =>
      boxAt(0.03, 1.2, 0.07, [x, 1.2, 0]),
    ),
    ...[0.58, 1.82].map((y) =>
      rodGeometry(
        new THREE.Vector3(-0.8, y, 0),
        new THREE.Vector3(0.8, y, 0),
        0.05,
      ),
    ),
  );
  detail.add(
    materials.darkMetal,
    ...[-0.82, 0.82].flatMap((x) => [
      rodGeometry(
        new THREE.Vector3(x, 0.25, 0),
        new THREE.Vector3(x, 1.85, 0),
        0.04,
      ),
      boxAt(0.1, 0.04, 0.4, [x, 0.27, 0]),
    ]),
  );
}

/** A pallet stacked with finished solar panels. */
function panelsDetail(detail: DetailParts): void {
  const layers = 6;
  detail.add(materials.crateFrame, boxAt(1.2, 0.1, 0.85, [0, 0.3, 0]));
  detail.add(
    materials.aluminium,
    ...Array.from({ length: layers }, (_, index) =>
      boxAt(1.1, 0.035, 0.75, [0, 0.37 + index * 0.06, 0]),
    ),
  );
  detail.add(
    materials.solarCell,
    ...Array.from({ length: layers }, (_, index) =>
      boxAt(1.04, 0.008, 0.69, [0, 0.39 + index * 0.06, 0]),
    ),
  );
  detail.add(
    materials.darkMetal,
    ...[-0.58, 0.58].flatMap((x) =>
      [-0.4, 0.4].map((z) =>
        rodGeometry(
          new THREE.Vector3(x, 0.35, z),
          new THREE.Vector3(x, 0.8, z),
          0.025,
        ),
      ),
    ),
  );
}

/** A rack of two shelves of wafer cassettes. */
function cassettesDetail(detail: DetailParts): void {
  const shelves = [0.65, 1.05];
  const xs = [-0.29, 0, 0.29];
  detail.add(
    materials.aluminium,
    ...shelves.map((y) => boxAt(0.9, 0.03, 0.4, [0, y, 0])),
    ...[-0.44, 0.44].flatMap((x) =>
      [-0.18, 0.18].map((z) =>
        rodGeometry(
          new THREE.Vector3(x, 0.25, z),
          new THREE.Vector3(x, 1.1, z),
          0.02,
        ),
      ),
    ),
  );
  detail.add(
    materials.seal,
    ...shelves.flatMap((y) =>
      xs.map((x) => boxAt(0.24, 0.26, 0.3, [x, y + 0.145, 0])),
    ),
  );
  // A wafer lying on top of each cassette.
  detail.add(
    materials.chrome,
    ...shelves.flatMap((y) =>
      xs.map((x) =>
        placed(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16), [
          x,
          y + 0.285,
          0,
        ]),
      ),
    ),
  );
}

/** How each kind of vessel is drawn. */
const VESSEL_DRAWINGS: Readonly<Record<PlantVessel["kind"], VesselDrawing>> = {
  reactor: {
    parts: (glow) => uprightParts(REACTOR, materials.foil, glow),
    detail: reactorDetail,
  },
  tank: {
    parts: (glow) => uprightParts(TANK, materials.hull, glow),
    detail: tankDetail,
  },
  chamber: { parts: chamberParts, detail: chamberDetail },
  oven: { parts: ovenParts, detail: ovenDetail },
  stack: { parts: stackParts, detail: stackDetail },
  hopper: { parts: hopperParts, detail: hopperDetail },
  mill: { parts: millParts, detail: millDetail },
  conveyor: { parts: conveyorParts, detail: conveyorDetail },
  bottles: { parts: noParts, detail: bottlesDetail },
  radiator: { parts: noParts, detail: radiatorDetail },
  panels: { parts: noParts, detail: panelsDetail },
  cassettes: { parts: noParts, detail: cassettesDetail },
};

/**
 * One vessel's parts and their detail, centred across and front to back on
 * the origin and standing on the plinth, with any band that glows while the
 * Plant works made of the glow material.
 */
export function plantVesselMeshes(
  vessel: PlantVessel,
  glow: THREE.Material,
): THREE.Object3D[] {
  const drawing = VESSEL_DRAWINGS[vessel.kind];
  const detail = detailParts();
  drawing.detail(detail, vessel);
  return [...drawing.parts(glow), ...detail.meshes()];
}
