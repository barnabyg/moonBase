import * as THREE from "three";
import { materials, part, rods, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The Greenhouse.

/** The share of Assembly by which the footing and ribs stand, before the racks go in. */
const GREENHOUSE_RIBS_SHARE = 0.4;
/** The share of Assembly by which the racks are in, before the panes go on. */
const GREENHOUSE_RACKS_SHARE = 0.7;
const GREENHOUSE_FOOTING_HEIGHT = 0.3;
/** The dome's radius, and so its height above the footing. */
const GREENHOUSE_DOME_RADIUS = 4.3;
const GREENHOUSE_RIBS = 8;
const GREENHOUSE_RIB_POINTS = 7;
/** How high inside the dome the lamps hang. */
const GREENHOUSE_LAMP_HEIGHT = 3.2;

/** The green of the crop on its racks, which only the lamps show at Night. */
const CROP_COLOUR = 0x3f7a35;
/** The warm light of the lamps through the panes. */
const LAMP_LIGHT_COLOUR = 0xfff0c4;

/**
 * A Greenhouse: a dome of glass panes on ribs over a round footing, with
 * rows of green racks inside and a line of lamps over them. At Night, while its
 * lamps are on, the whole dome glows, so that it can be seen from across the base.
 * During Assembly the footing and ribs go up, then the racks, then the panes.
 */
export function createGreenhouseModel(): StructureModel {
  const greenhouse = new THREE.Group();
  greenhouse.name = "Greenhouse";

  const statusLightMaterial = materials.statusOff.clone();
  const footing = part(
    new THREE.CylinderGeometry(
      GREENHOUSE_DOME_RADIUS + 0.3,
      GREENHOUSE_DOME_RADIUS + 0.5,
      GREENHOUSE_FOOTING_HEIGHT,
      24,
    ),
    materials.darkMetal,
    [0, GREENHOUSE_FOOTING_HEIGHT / 2, 0],
  );
  const statusLight = part(
    new THREE.SphereGeometry(0.1, 8, 6),
    statusLightMaterial,
    [GREENHOUSE_DOME_RADIUS + 0.15, GREENHOUSE_FOOTING_HEIGHT + 0.08, 0],
  );

  // Each rib goes up from the footing and over to the top of the dome.
  const ribs = new THREE.Group();
  ribs.name = "Ribs";
  const ribLines: [THREE.Vector3, THREE.Vector3][] = [];
  for (let rib = 0; rib < GREENHOUSE_RIBS; rib++) {
    const around = (rib / GREENHOUSE_RIBS) * Math.PI * 2;
    const at = (point: number) => {
      const up = (point / GREENHOUSE_RIB_POINTS) * (Math.PI / 2);
      return new THREE.Vector3(
        GREENHOUSE_DOME_RADIUS * Math.cos(up) * Math.cos(around),
        GREENHOUSE_FOOTING_HEIGHT + GREENHOUSE_DOME_RADIUS * Math.sin(up),
        GREENHOUSE_DOME_RADIUS * Math.cos(up) * Math.sin(around),
      );
    };
    for (let point = 0; point < GREENHOUSE_RIB_POINTS; point++) {
      ribLines.push([at(point), at(point + 1)]);
    }
  }
  ribs.add(rods(ribLines, 0.05, materials.aluminium));

  const racks = new THREE.Group();
  racks.name = "Racks";
  const cropMaterial = new THREE.MeshStandardMaterial({
    color: CROP_COLOUR,
    roughness: 0.9,
  });
  for (const x of [-2, 0, 2]) {
    const length = x === 0 ? 6 : 5;
    for (const y of [0.6, 1.3]) {
      racks.add(
        part(new THREE.BoxGeometry(0.9, 0.08, length), materials.aluminium, [
          x,
          GREENHOUSE_FOOTING_HEIGHT + y,
          0,
        ]),
        part(new THREE.BoxGeometry(0.75, 0.22, length - 0.2), cropMaterial, [
          x,
          GREENHOUSE_FOOTING_HEIGHT + y + 0.15,
          0,
        ]),
      );
    }
  }
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  for (const z of [-1.8, 0, 1.8]) {
    racks.add(
      part(new THREE.BoxGeometry(4.6, 0.08, 0.2), lampMaterial, [
        0,
        GREENHOUSE_LAMP_HEIGHT,
        z,
      ]),
    );
  }

  const paneMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8d8d0,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panes = part(
    new THREE.SphereGeometry(
      GREENHOUSE_DOME_RADIUS,
      24,
      10,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    ),
    paneMaterial,
    [0, GREENHOUSE_FOOTING_HEIGHT, 0],
  );
  panes.name = "Panes";

  greenhouse.add(footing, statusLight, ribs, racks, panes);

  return {
    group: greenhouse,
    lightHeight: GREENHOUSE_LAMP_HEIGHT,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      ribs.visible = f > 0;
      ribs.scale.y = Math.max(Math.min(f / GREENHOUSE_RIBS_SHARE, 1), 0.01);
      racks.visible = f >= GREENHOUSE_RIBS_SHARE;
      panes.visible = f >= GREENHOUSE_RACKS_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit(on) {
      lampMaterial.color.set(on ? 0xfff4dc : 0x222222);
      lampMaterial.emissive.set(on ? LAMP_LIGHT_COLOUR : 0x000000);
      paneMaterial.emissive.set(on ? LAMP_LIGHT_COLOUR : 0x000000);
      paneMaterial.emissiveIntensity = on ? 0.9 : 0;
      paneMaterial.opacity = on ? 0.55 : 0.32;
      cropMaterial.emissive.set(on ? CROP_COLOUR : 0x000000);
      cropMaterial.emissiveIntensity = on ? 0.8 : 0;
    },
  };
}
