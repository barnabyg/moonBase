import * as THREE from "three";
import { materials, part, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The growing hall.

/** The share of Assembly by which the footing and racks stand, before the vault goes over. */
const HALL_RACKS_SHARE = 0.4;
/** The share of Assembly by which the vault is on, before the light pipes go up. */
const HALL_VAULT_SHARE = 0.8;
const HALL_LENGTH = 14;
const HALL_RADIUS = 3.4;
const HALL_FOOTING_HEIGHT = 0.3;
const HALL_LIGHT_PIPES = 6;

/** The green of the crop on its racks, which only the lamps show at Night. */
const CROP_COLOUR = 0x3f7a35;
/** The warm light of the lamps through the vault's glazing. */
const LAMP_LIGHT_COLOUR = 0xfff0c4;

/**
 * A growing hall: a long glazed barrel vault on a footing, with rows of green
 * racks inside and a line of light pipes standing along its ridge. At Night, while
 * its lamps are on, the whole vault glows. During Assembly the footing and racks
 * go down, then the vault goes over them, then the light pipes go up.
 */
export function createGrowingHallModel(): StructureModel {
  const hall = new THREE.Group();
  hall.name = "Growing hall";

  const statusLightMaterial = materials.statusOff.clone();
  const footing = part(
    new THREE.BoxGeometry(
      HALL_RADIUS * 2 + 0.8,
      HALL_FOOTING_HEIGHT,
      HALL_LENGTH,
    ),
    materials.darkMetal,
    [0, HALL_FOOTING_HEIGHT / 2, 0],
  );
  const statusLight = part(
    new THREE.SphereGeometry(0.1, 8, 6),
    statusLightMaterial,
    [HALL_RADIUS + 0.2, HALL_FOOTING_HEIGHT + 0.08, 0],
  );

  const racks = new THREE.Group();
  racks.name = "Racks";
  const cropMaterial = new THREE.MeshStandardMaterial({
    color: CROP_COLOUR,
    roughness: 0.9,
  });
  for (const x of [-1.8, 0, 1.8]) {
    for (const y of [0.6, 1.4]) {
      racks.add(
        part(
          new THREE.BoxGeometry(0.9, 0.08, HALL_LENGTH - 2),
          materials.aluminium,
          [x, HALL_FOOTING_HEIGHT + y, 0],
        ),
        part(
          new THREE.BoxGeometry(0.75, 0.22, HALL_LENGTH - 2.2),
          cropMaterial,
          [x, HALL_FOOTING_HEIGHT + y + 0.15, 0],
        ),
      );
    }
  }

  const vaultMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8d8d0,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const vault = part(
    new THREE.CylinderGeometry(
      HALL_RADIUS,
      HALL_RADIUS,
      HALL_LENGTH,
      20,
      1,
      true,
      -Math.PI / 2,
      Math.PI,
    ),
    vaultMaterial,
    [0, HALL_FOOTING_HEIGHT, 0],
  );
  vault.name = "Vault";
  vault.rotation.x = Math.PI / 2;

  const pipes = new THREE.Group();
  pipes.name = "Light pipes";
  for (let pipe = 0; pipe < HALL_LIGHT_PIPES; pipe++) {
    const z = ((pipe + 0.5) / HALL_LIGHT_PIPES - 0.5) * (HALL_LENGTH - 2);
    pipes.add(
      part(
        new THREE.CylinderGeometry(0.22, 0.22, 1.2, 10),
        materials.aluminium,
        [0, HALL_FOOTING_HEIGHT + HALL_RADIUS + 0.5, z],
      ),
      part(new THREE.CylinderGeometry(0.42, 0.22, 0.3, 10), materials.foil, [
        0,
        HALL_FOOTING_HEIGHT + HALL_RADIUS + 1.2,
        z,
      ]),
    );
  }

  hall.add(footing, statusLight, racks, vault, pipes);

  return {
    group: hall,
    lightHeight: HALL_RADIUS,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      racks.visible = f > 0;
      racks.scale.y = Math.max(Math.min(f / HALL_RACKS_SHARE, 1), 0.01);
      vault.visible = f >= HALL_RACKS_SHARE;
      pipes.visible = f >= HALL_VAULT_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit(on) {
      vaultMaterial.emissive.set(on ? LAMP_LIGHT_COLOUR : 0x000000);
      vaultMaterial.emissiveIntensity = on ? 0.9 : 0;
      vaultMaterial.opacity = on ? 0.55 : 0.32;
      cropMaterial.emissive.set(on ? CROP_COLOUR : 0x000000);
      cropMaterial.emissiveIntensity = on ? 0.8 : 0;
    },
  };
}
