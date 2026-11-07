import * as THREE from "three";
import { materials, part, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The automated experiments lab.

/** The share of Assembly by which the footing and the two modules stand, before the racks and radiators go on. */
const LAB_MODULES_SHARE = 0.6;
const LAB_FOOTING_HEIGHT = 0.3;
/** A module's radius, and its length along the ground. */
const LAB_MODULE_RADIUS = 1.4;
const LAB_MODULE_LENGTH = 7;
/** How far either module lies from the lab's centre. */
const LAB_MODULE_OFFSET = 1.7;
const LAB_MODULE_HEIGHT = LAB_FOOTING_HEIGHT + LAB_MODULE_RADIUS + 0.2;

/** The blue-white of the racks' displays through the module's ports while it runs. */
const PORT_LIGHT_COLOUR = 0xbfe4ff;

/**
 * An automated experiments lab: two long pressure modules side by side on a
 * footing, joined by a node, with a row of lit ports along each where the
 * experiment racks are, and a radiator over them for the heat the racks give
 * off. The ports glow while it is speeding up a Research Task. During Assembly
 * the footing and modules go down, then the radiator and the ports.
 */
export function createExperimentsLabModel(): StructureModel {
  const lab = new THREE.Group();
  lab.name = "Automated experiments lab";

  const statusLightMaterial = materials.statusOff.clone();
  const footing = part(
    new THREE.BoxGeometry(
      LAB_MODULE_LENGTH + 0.8,
      LAB_FOOTING_HEIGHT,
      2 * (LAB_MODULE_OFFSET + LAB_MODULE_RADIUS) + 0.4,
    ),
    materials.darkMetal,
    [0, LAB_FOOTING_HEIGHT / 2, 0],
  );
  const statusLight = part(
    new THREE.SphereGeometry(0.1, 8, 6),
    statusLightMaterial,
    [LAB_MODULE_LENGTH / 2 + 0.3, LAB_FOOTING_HEIGHT + 0.08, 0],
  );

  const modules = new THREE.Group();
  modules.name = "Modules";
  for (const z of [-LAB_MODULE_OFFSET, LAB_MODULE_OFFSET]) {
    const hull = part(
      new THREE.CylinderGeometry(
        LAB_MODULE_RADIUS,
        LAB_MODULE_RADIUS,
        LAB_MODULE_LENGTH,
        16,
      ),
      materials.hull,
      [0, LAB_MODULE_HEIGHT, z],
    );
    hull.rotation.z = Math.PI / 2;
    modules.add(hull);
  }
  modules.add(
    part(
      new THREE.BoxGeometry(1.6, 1.6, 2 * LAB_MODULE_OFFSET),
      materials.hull,
      [0, LAB_MODULE_HEIGHT, 0],
    ),
  );

  const fittings = new THREE.Group();
  fittings.name = "Racks";
  const portMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2630 });
  for (const z of [-1, 1]) {
    for (let port = 0; port < 4; port++) {
      fittings.add(
        part(new THREE.BoxGeometry(0.9, 0.5, 0.1), portMaterial, [
          -2.4 + port * 1.6,
          LAB_MODULE_HEIGHT + 0.3,
          z * (LAB_MODULE_OFFSET + LAB_MODULE_RADIUS - 0.05),
        ]),
      );
    }
  }
  fittings.add(
    part(
      new THREE.BoxGeometry(LAB_MODULE_LENGTH - 1, 0.06, 2.4),
      materials.radiator,
      [0, LAB_MODULE_HEIGHT + LAB_MODULE_RADIUS + 0.5, 0],
    ),
  );

  lab.add(footing, statusLight, modules, fittings);

  return {
    group: lab,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      modules.visible = f > 0;
      modules.scale.y = Math.max(Math.min(f / LAB_MODULES_SHARE, 1), 0.01);
      fittings.visible = f >= LAB_MODULES_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
    setRunning(running) {
      portMaterial.emissive.set(running ? PORT_LIGHT_COLOUR : 0x000000);
      portMaterial.emissiveIntensity = running ? 0.9 : 0;
    },
  };
}
