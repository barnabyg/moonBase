import * as THREE from "three";

// Low-poly models built in code, with physically based materials (ADR-0004).
// Sizes are in metres, and each model stands on the ground at its origin.

const materials = {
  foil: new THREE.MeshStandardMaterial({
    color: 0xc8a13a,
    metalness: 0.7,
    roughness: 0.35,
  }),
  hull: new THREE.MeshStandardMaterial({
    color: 0xd9dbde,
    metalness: 0.2,
    roughness: 0.6,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x3a3d42,
    metalness: 0.8,
    roughness: 0.4,
  }),
  robotShell: new THREE.MeshStandardMaterial({
    color: 0xeef0f2,
    metalness: 0.1,
    roughness: 0.5,
  }),
  robotJoint: new THREE.MeshStandardMaterial({
    color: 0x2b2e33,
    metalness: 0.5,
    roughness: 0.6,
  }),
  visor: new THREE.MeshStandardMaterial({
    color: 0x1b2a3a,
    metalness: 0.9,
    roughness: 0.15,
  }),
};

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The Lander, with its four legs reaching out to its footprint radius. */
export function createLanderModel(footprintRadius: number): THREE.Group {
  const lander = new THREE.Group();
  lander.name = "Lander";

  const descentStageHeight = 1.8;
  const descentStageBase = 1.6;
  lander.add(
    part(
      new THREE.CylinderGeometry(2.2, 2.2, descentStageHeight, 8),
      materials.foil,
      [0, descentStageBase + descentStageHeight / 2, 0],
    ),
    part(new THREE.CylinderGeometry(1.5, 1.9, 2.4, 6), materials.hull, [
      0,
      descentStageBase + descentStageHeight + 1.2,
      0,
    ]),
    part(new THREE.ConeGeometry(0.9, 1.3, 12, 1, true), materials.darkMetal, [
      0,
      descentStageBase - 0.4,
      0,
    ]),
    part(
      new THREE.BoxGeometry(0.8, 0.5, 0.6),
      materials.darkMetal,
      [0, 5.4, 1.45],
    ),
  );

  const legTop = new THREE.Vector3(1.9, descentStageBase + 0.6, 0);
  const foot = new THREE.Vector3(footprintRadius - 0.35, 0.12, 0);
  const legLength = legTop.distanceTo(foot);
  for (let index = 0; index < 4; index++) {
    const leg = new THREE.Group();
    leg.rotation.y = (index * Math.PI) / 2 + Math.PI / 4;
    const strut = part(
      new THREE.CylinderGeometry(0.09, 0.09, legLength, 6),
      materials.darkMetal,
      [(legTop.x + foot.x) / 2, (legTop.y + foot.y) / 2, 0],
    );
    strut.rotation.z = Math.atan2(legTop.x - foot.x, legTop.y - foot.y);
    leg.add(
      strut,
      part(
        new THREE.CylinderGeometry(0.35, 0.4, 0.12, 8),
        materials.darkMetal,
        [foot.x, 0.06, 0],
      ),
    );
    lander.add(leg);
  }
  return lander;
}

/** A humanoid Robot about 1.8 m tall, facing along its local +z axis. */
export function createRobotModel(): THREE.Group {
  const robot = new THREE.Group();
  robot.name = "Robot";

  const limb = (width: number, length: number) =>
    new THREE.BoxGeometry(width, length, width);
  robot.add(
    // Legs
    part(limb(0.16, 0.85), materials.robotShell, [-0.12, 0.43, 0]),
    part(limb(0.16, 0.85), materials.robotShell, [0.12, 0.43, 0]),
    // Hips and torso
    part(
      new THREE.BoxGeometry(0.4, 0.14, 0.22),
      materials.robotJoint,
      [0, 0.9, 0],
    ),
    part(
      new THREE.BoxGeometry(0.46, 0.55, 0.26),
      materials.robotShell,
      [0, 1.25, 0],
    ),
    // Arms
    part(limb(0.12, 0.65), materials.robotShell, [-0.31, 1.18, 0]),
    part(limb(0.12, 0.65), materials.robotShell, [0.31, 1.18, 0]),
    // Neck, head and visor
    part(
      new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6),
      materials.robotJoint,
      [0, 1.56, 0],
    ),
    part(
      new THREE.BoxGeometry(0.24, 0.22, 0.24),
      materials.robotShell,
      [0, 1.7, 0],
    ),
    part(
      new THREE.BoxGeometry(0.2, 0.08, 0.02),
      materials.visor,
      [0, 1.72, 0.125],
    ),
  );
  return robot;
}
