import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";
import { createTelescopeModel } from "./telescope-model";

// The infrared telescope.

/** How much larger than the optical telescope it is drawn. */
const INFRARED_SCALE = 2.1;

/**
 * An infrared telescope: the optical telescope's open truss and fork mount,
 * drawn 2.1 times as large, round a 2 m mirror, with the silver dewar of
 * propellant that cools its camera and a vent stack beside it. It stows and
 * observes as the optical telescope does, and goes up a part at a time the same
 * way during Assembly.
 */
export function createInfraredTelescopeModel(): StructureModel {
  const optical = createTelescopeModel();
  optical.group.scale.setScalar(INFRARED_SCALE);
  const group = new THREE.Group();
  group.name = "Infrared telescope";
  const dewar = new THREE.Group();
  dewar.position.set(1.9, 0, -1.9);
  dewar.add(
    part(
      new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16),
      materials.silverFoil,
      [0, 0.65, 0],
    ),
    part(
      new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.silverFoil,
      [0, 1.3, 0],
    ),
    // Where the boiled-off propellant vents.
    part(
      new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8),
      materials.aluminium,
      [0.7, 0.55, 0],
    ),
  );
  group.add(optical.group, dewar);
  return {
    ...optical,
    group,
    setAssembled(fraction) {
      optical.setAssembled(fraction);
      dewar.visible = fraction > 0.5;
    },
  };
}
