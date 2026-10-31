import * as THREE from "three";
import { materials, part, rods, roundedBox, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The telescope.

/** The share of Assembly by which the telescope's pier stands, before its mount goes on. */
const TELESCOPE_PIER_SHARE = 0.35;
/** The share of Assembly by which the mount is on, before the tube is fitted. */
const TELESCOPE_MOUNT_SHARE = 0.65;
const TELESCOPE_FOOTING_HEIGHT = 0.2;
const TELESCOPE_PIER_HEIGHT = 1.2;
/** The altitude axis's height above the turntable on top of the pier. */
const TELESCOPE_AXIS_HEIGHT = 0.65;
/** The radius of the tube's rings, round its mirror. */
const TELESCOPE_TUBE_RADIUS = 0.36;
/** From the altitude axis up the tube to its top ring. */
const TELESCOPE_TUBE_LENGTH = 1.25;
/** How high over the horizon the tube points while it observes, in radians. */
const TELESCOPE_OBSERVING_ELEVATION = THREE.MathUtils.degToRad(40);
/** How fast it turns across the sky while it observes, in radians a real second. */
const TELESCOPE_TRACKING_SPEED = 0.05;

/**
 * A telescope: an open-truss tube round a half-metre mirror, on a fork
 * mount that turns on a pier, with its electronics cabinet and radiator on
 * the footing beside it. In Daylight it stands stowed, pointing straight up,
 * away from the sun low on the horizon; while it observes at Night it leans
 * over and slowly turns across the sky. During Assembly the pier goes up,
 * then the mount, then the tube.
 */
export function createTelescopeModel(): StructureModel {
  const telescope = new THREE.Group();
  telescope.name = "Telescope";

  const statusLightMaterial = materials.statusOff.clone();
  telescope.add(
    part(
      new THREE.CylinderGeometry(1.15, 1.3, TELESCOPE_FOOTING_HEIGHT, 8),
      materials.darkMetal,
      [0, TELESCOPE_FOOTING_HEIGHT / 2, 0],
    ),
    part(new THREE.SphereGeometry(0.07, 8, 6), statusLightMaterial, [
      0.75,
      TELESCOPE_FOOTING_HEIGHT + 0.05,
      0.6,
    ]),
    // The electronics cabinet, with a radiator panel shedding the heat of
    // the camera's cooler.
    part(roundedBox(0.55, 0.5, 0.45, 0.04), materials.foil, [
      -0.62,
      TELESCOPE_FOOTING_HEIGHT + 0.25,
      0.42,
    ]),
    part(new THREE.BoxGeometry(0.04, 0.6, 0.42), materials.radiator, [
      -0.94,
      TELESCOPE_FOOTING_HEIGHT + 0.3,
      0.42,
    ]),
  );

  const pier = part(
    new THREE.CylinderGeometry(0.26, 0.34, 1, 10),
    materials.hull,
    [0, 0, 0],
  );
  telescope.add(pier);

  // The fork mount turns about the pier; the tube tilts between the
  // fork's arms.
  const mountHeight = TELESCOPE_FOOTING_HEIGHT + TELESCOPE_PIER_HEIGHT;
  const mount = new THREE.Group();
  mount.position.y = mountHeight;
  const armX = TELESCOPE_TUBE_RADIUS + 0.14;
  const armHeight = TELESCOPE_AXIS_HEIGHT + 0.1;
  mount.add(
    part(
      new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16),
      materials.darkMetal,
      [0, 0.06, 0],
    ),
    part(
      new THREE.BoxGeometry(armX * 2 + 0.12, 0.1, 0.28),
      materials.machinePaint,
      [0, 0.17, 0],
    ),
    ...[-1, 1].map((side) =>
      part(
        new THREE.BoxGeometry(0.1, armHeight, 0.26),
        materials.machinePaint,
        [side * armX, 0.12 + armHeight / 2, 0],
      ),
    ),
    ...[-1, 1].map((side) => {
      const bearing = part(
        new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12),
        materials.darkMetal,
        [side * armX, TELESCOPE_AXIS_HEIGHT, 0],
      );
      bearing.rotation.z = Math.PI / 2;
      return bearing;
    }),
  );
  telescope.add(mount);

  // The tube runs up its own y axis from the altitude axis, its mirror in
  // the cell below and the secondary held on vanes in the top ring.
  const tube = new THREE.Group();
  tube.position.y = TELESCOPE_AXIS_HEIGHT;
  const ring = (y: number, radius: number) => {
    const mesh = part(
      new THREE.TorusGeometry(radius, 0.035, 6, 24),
      materials.darkMetal,
      [0, y, 0],
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const trussFrom = 0.05;
  const truss = Array.from({ length: 8 }, (_, index) => {
    // Each pair of struts crosses, as in a Serrurier truss.
    const angle = (Math.floor(index / 2) * Math.PI) / 2 + Math.PI / 4;
    const twist = (index % 2 === 0 ? 1 : -1) * 0.35;
    const at = (a: number, radius: number, y: number) =>
      new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    return [
      at(angle - twist, TELESCOPE_TUBE_RADIUS, trussFrom),
      at(angle + twist, TELESCOPE_TUBE_RADIUS - 0.02, TELESCOPE_TUBE_LENGTH),
    ] as const;
  });
  tube.add(
    part(
      new THREE.CylinderGeometry(
        TELESCOPE_TUBE_RADIUS + 0.04,
        TELESCOPE_TUBE_RADIUS + 0.04,
        0.24,
        16,
      ),
      materials.darkMetal,
      [0, -0.36, 0],
    ),
    part(
      new THREE.CylinderGeometry(
        TELESCOPE_TUBE_RADIUS - 0.03,
        TELESCOPE_TUBE_RADIUS - 0.03,
        0.03,
        24,
      ),
      materials.chrome,
      [0, -0.23, 0],
    ),
    ring(0, TELESCOPE_TUBE_RADIUS + 0.02),
    ring(TELESCOPE_TUBE_LENGTH, TELESCOPE_TUBE_RADIUS - 0.02),
    rods(truss, 0.018, materials.aluminium),
    // The trunnions it tilts on, into the fork's bearings.
    ...[-1, 1].map((side) => {
      const trunnion = part(
        new THREE.CylinderGeometry(0.05, 0.05, armX - TELESCOPE_TUBE_RADIUS, 8),
        materials.aluminium,
        [(side * (armX + TELESCOPE_TUBE_RADIUS)) / 2, 0, 0],
      );
      trunnion.rotation.z = Math.PI / 2;
      return trunnion;
    }),
    ...[0, Math.PI / 2].map((turn) => {
      const vane = part(
        new THREE.BoxGeometry((TELESCOPE_TUBE_RADIUS - 0.02) * 2, 0.015, 0.015),
        materials.aluminium,
        [0, TELESCOPE_TUBE_LENGTH - 0.03, 0],
      );
      vane.rotation.y = turn;
      return vane;
    }),
    part(
      new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12),
      materials.darkMetal,
      [0, TELESCOPE_TUBE_LENGTH - 0.05, 0],
    ),
  );
  mount.add(tube);

  return {
    group: telescope,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const raised = Math.max(Math.min(f / TELESCOPE_PIER_SHARE, 1), 0.01);
      pier.scale.y = TELESCOPE_PIER_HEIGHT * raised;
      pier.position.y =
        TELESCOPE_FOOTING_HEIGHT + (TELESCOPE_PIER_HEIGHT * raised) / 2;
      mount.visible = f > TELESCOPE_PIER_SHARE;
      tube.visible = f > TELESCOPE_MOUNT_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
    setRunning(observing, realSeconds) {
      // Tilting the tube's top towards the mount's +z side.
      tube.rotation.x = observing
        ? Math.PI / 2 - TELESCOPE_OBSERVING_ELEVATION
        : 0;
      mount.rotation.y = observing ? realSeconds * TELESCOPE_TRACKING_SPEED : 0;
    },
  };
}
