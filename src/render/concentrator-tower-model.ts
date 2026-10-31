import * as THREE from "three";
import { materials, part } from "./materials";
import type { StructureModel } from "./models";

// The concentrator tower.

/** How many mirrors stand round a concentrator tower, and how far out. */
const TOWER_MIRRORS = 8;
const TOWER_MIRROR_RING_METRES = 3;
const TOWER_HEIGHT_METRES = 7;

/**
 * A concentrator tower: a ring of mirrors on short posts, each turned towards
 * the sun as a solar array's panel is, and a lattice mast in the middle with a
 * receiver at the top that shines once it is commissioned. During Assembly the
 * mast and the mirrors rise from the ground.
 */
export function createConcentratorTowerModel(): StructureModel {
  const tower = new THREE.Group();
  tower.name = "Concentrator tower";
  const statusLightMaterial = materials.statusOff.clone();
  const receiverGlow = materials.statusOff.clone();
  tower.add(
    part(
      new THREE.CylinderGeometry(1.1, 1.3, 0.3, 12),
      materials.darkMetal,
      [0, 0.15, 0],
    ),
    part(
      new THREE.SphereGeometry(0.08, 8, 6),
      statusLightMaterial,
      [1, 0.38, 0],
    ),
  );
  const upper = new THREE.Group();
  upper.add(
    part(
      new THREE.CylinderGeometry(0.22, 0.42, TOWER_HEIGHT_METRES, 8),
      materials.aluminium,
      [0, 0.3 + TOWER_HEIGHT_METRES / 2, 0],
    ),
    part(new THREE.CylinderGeometry(0.6, 0.6, 0.9, 12), materials.darkMetal, [
      0,
      0.3 + TOWER_HEIGHT_METRES + 0.2,
      0,
    ]),
    part(new THREE.CylinderGeometry(0.64, 0.64, 0.35, 12), receiverGlow, [
      0,
      0.3 + TOWER_HEIGHT_METRES + 0.2,
      0,
    ]),
  );
  const mirrors = Array.from({ length: TOWER_MIRRORS }, (_, index) => {
    const angle = (index / TOWER_MIRRORS) * Math.PI * 2;
    const x = Math.cos(angle) * TOWER_MIRROR_RING_METRES;
    const z = Math.sin(angle) * TOWER_MIRROR_RING_METRES;
    upper.add(
      part(
        new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6),
        materials.darkMetal,
        [x, 0.45, z],
      ),
    );
    const mirror = new THREE.Group();
    mirror.position.set(x, 1, z);
    const face = part(
      new THREE.BoxGeometry(1.5, 1.1, 0.05),
      materials.aluminium,
      [0, 0, 0],
    );
    face.rotation.x = -0.5;
    mirror.add(face);
    upper.add(mirror);
    return mirror;
  });
  tower.add(upper);
  return {
    group: tower,
    setAssembled(fraction) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      upper.visible = f > 0;
      upper.scale.y = Math.max(f, 0.01);
    },
    setFacing(angle) {
      for (const mirror of mirrors) mirror.rotation.y = angle;
    },
    setStatusLight(state) {
      const source = {
        off: materials.statusOff,
        testing: materials.statusTesting,
        on: materials.statusOn,
      }[state];
      statusLightMaterial.color.copy(source.color);
      statusLightMaterial.emissive.copy(source.emissive);
      const receiver =
        state === "on" ? materials.statusTesting : materials.statusOff;
      receiverGlow.color.copy(receiver.color);
      receiverGlow.emissive.copy(receiver.emissive);
    },
    setCharge: () => undefined,
    setLit: () => undefined,
  };
}
