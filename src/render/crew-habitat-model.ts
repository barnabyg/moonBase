import * as THREE from "three";
import { materials, part, roundedBox, setStatusLight } from "./materials";
import type { StructureModel } from "./models";

// The Large-scale Crew Habitat.

/** How many long vaults it has, side by side, each going up in turn. */
const VAULTS = 3;
/** The share of Assembly by which every vault is up, before the spine and airlocks go on. */
const VAULTS_SHARE = 0.9;
const VAULT_LENGTH = 10;
const VAULT_RADIUS = 2.2;
const VAULT_SPACING = 5;
const SPINE_LENGTH = 14;
const SPINE_RADIUS = 1.6;
const FOOTING_HEIGHT = 0.3;

/** A pressure vault lying on its side, its rounded top above a flat floor, along z. */
function halfCylinder(radius: number, length: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(
    radius,
    radius,
    length,
    24,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  ).rotateX(-Math.PI / 2);
}

/**
 * A Large-scale Crew Habitat: three long hull-white vaults side by side on dark
 * footings, joined across their middles by a lower spine with an airlock at
 * each end, and radiators on the middle vault. Nobody lives in it, so it shows
 * no lit window. During Assembly the vaults go up one after another, each
 * lengthening from its middle, and the spine, airlocks and radiators go on last.
 */
export function createCrewHabitatModel(): StructureModel {
  const habitat = new THREE.Group();
  habitat.name = "Large-scale Crew Habitat";

  const vaults = Array.from({ length: VAULTS }, (_, index) => {
    const x = (index - (VAULTS - 1) / 2) * VAULT_SPACING;
    const vault = new THREE.Group();
    vault.name = `Vault ${index + 1}`;
    vault.add(
      part(
        new THREE.BoxGeometry(
          VAULT_RADIUS * 2 + 0.4,
          FOOTING_HEIGHT,
          VAULT_LENGTH + 0.4,
        ),
        materials.darkMetal,
        [x, FOOTING_HEIGHT / 2, 0],
      ),
      part(halfCylinder(VAULT_RADIUS, VAULT_LENGTH), materials.hull, [
        x,
        FOOTING_HEIGHT,
        0,
      ]),
      // Ribs where its sections join.
      ...[-2.5, 0, 2.5].map((z) =>
        part(
          new THREE.TorusGeometry(VAULT_RADIUS + 0.03, 0.05, 4, 24, Math.PI),
          materials.aluminium,
          [x, FOOTING_HEIGHT, z],
        ),
      ),
    );
    habitat.add(vault);
    return vault;
  });

  const spine = part(
    halfCylinder(SPINE_RADIUS, SPINE_LENGTH).rotateY(Math.PI / 2),
    materials.hull,
    [0, FOOTING_HEIGHT, 0],
  );
  spine.name = "Spine";
  habitat.add(spine);

  const statusLightMaterial = materials.statusOff.clone();
  const airlocks = new THREE.Group();
  airlocks.name = "Airlocks";
  for (const side of [-1, 1]) {
    const x = side * (SPINE_LENGTH / 2 + 0.5);
    airlocks.add(
      part(roundedBox(1.2, 2.3, 2.1, 0.12), materials.darkMetal, [x, 1.15, 0]),
      part(roundedBox(0.08, 1.9, 0.92, 0.12), materials.hull, [
        x + side * 0.62,
        1.07,
        0,
      ]),
    );
  }
  airlocks.add(
    part(new THREE.SphereGeometry(0.08, 8, 6), statusLightMaterial, [
      SPINE_LENGTH / 2 + 1.12,
      0.8,
      -0.8,
    ]),
  );
  // Radiator fins standing on the middle vault's crown.
  const radiators = new THREE.Group();
  radiators.name = "Radiators";
  for (const z of [-3.5, 3.5]) {
    radiators.add(
      part(new THREE.BoxGeometry(0.06, 1.2, 2.4), materials.radiator, [
        0,
        FOOTING_HEIGHT + VAULT_RADIUS + 0.6,
        z,
      ]),
    );
  }
  habitat.add(airlocks, radiators);

  return {
    group: habitat,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      const perVault = VAULTS_SHARE / VAULTS;
      for (const [index, vault] of vaults.entries()) {
        const done = (f - index * perVault) / perVault;
        vault.visible = done > 0 || (index === 0 && f > 0);
        vault.scale.z = THREE.MathUtils.clamp(done, 0.05, 1);
      }
      spine.visible = f >= VAULTS_SHARE;
      airlocks.visible = f >= VAULTS_SHARE;
      radiators.visible = f >= VAULTS_SHARE;
    },
    setFacing: () => undefined,
    setStatusLight(state) {
      setStatusLight(statusLightMaterial, state);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}
