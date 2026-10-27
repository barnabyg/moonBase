import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { fixedRandom } from "./scenery";

// The materials every model is built from, physically based (ADR-0004), and
// the helpers that put parts together. Sizes are in metres.

/**
 * A normal map of crumpled foil: flat facets at random angles, as on the
 * multi-layer insulation wrapped round spacecraft. Undefined if the browser
 * can't draw on a canvas.
 */
function createCrinkleNormalMap(): THREE.CanvasTexture | undefined {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;
  // A height field of overlapping facets, the same on every load.
  const random = fixedRandom(42);
  context.fillStyle = "rgb(128 128 128)";
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < 900; index++) {
    const x = random() * size;
    const y = random() * size;
    const reach = 6 + random() * 22;
    const shade = Math.round(70 + random() * 115);
    context.fillStyle = `rgb(${shade} ${shade} ${shade} / 45%)`;
    const corners = Array.from({ length: 3 + Math.floor(random() * 3) }, () => {
      const angle = random() * Math.PI * 2;
      const distance = reach * (0.4 + random() * 0.6);
      return [Math.cos(angle) * distance, Math.sin(angle) * distance] as const;
    });
    // Drawn again across each edge of the tile, so that it repeats without a seam.
    for (const offsetX of [-size, 0, size]) {
      for (const offsetY of [-size, 0, size]) {
        context.beginPath();
        for (const [cornerX, cornerY] of corners) {
          context.lineTo(x + offsetX + cornerX, y + offsetY + cornerY);
        }
        context.closePath();
        context.fill();
      }
    }
  }
  const heights = context.getImageData(0, 0, size, size).data;
  const normals = context.createImageData(size, size);
  const height = (x: number, y: number) =>
    heights[(((y + size) % size) * size + ((x + size) % size)) * 4] ?? 128;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) / 255;
      const dy = (height(x, y + 1) - height(x, y - 1)) / 255;
      const normal = new THREE.Vector3(-dx * 3, -dy * 3, 1).normalize();
      const at = (y * size + x) * 4;
      normals.data[at] = (normal.x * 0.5 + 0.5) * 255;
      normals.data[at + 1] = (normal.y * 0.5 + 0.5) * 255;
      normals.data[at + 2] = (normal.z * 0.5 + 0.5) * 255;
      normals.data[at + 3] = 255;
    }
  }
  context.putImageData(normals, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

const crinkle = createCrinkleNormalMap();

export const materials = {
  foil: new THREE.MeshStandardMaterial({
    color: 0xc8a13a,
    metalness: 0.7,
    roughness: 0.35,
    ...(crinkle === undefined
      ? {}
      : { normalMap: crinkle, normalScale: new THREE.Vector2(0.6, 0.6) }),
  }),
  // Silvered insulation, beside the gold.
  silverFoil: new THREE.MeshStandardMaterial({
    color: 0xd4d7dc,
    metalness: 0.45,
    roughness: 0.35,
    ...(crinkle === undefined
      ? {}
      : { normalMap: crinkle, normalScale: new THREE.Vector2(0.5, 0.5) }),
  }),
  hull: new THREE.MeshStandardMaterial({
    color: 0xd9dbde,
    metalness: 0.2,
    roughness: 0.6,
  }),
  // Bare structural aluminium: frames, decks and rails.
  aluminium: new THREE.MeshStandardMaterial({
    color: 0xa7abb1,
    metalness: 0.75,
    roughness: 0.42,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: 0x3a3d42,
    metalness: 0.8,
    roughness: 0.4,
  }),
  // Polished piston rods and shock absorbers.
  chrome: new THREE.MeshStandardMaterial({
    color: 0xe4e7ea,
    metalness: 1,
    roughness: 0.15,
  }),
  // A rocket engine's bell: heat-tinted niobium.
  nozzle: new THREE.MeshStandardMaterial({
    color: 0x5a5560,
    metalness: 0.9,
    roughness: 0.35,
    side: THREE.DoubleSide,
  }),
  // White radiator panels that shed heat to space.
  radiator: new THREE.MeshStandardMaterial({
    color: 0xf2f2ee,
    metalness: 0.05,
    roughness: 0.35,
  }),
  // Safety orange, picked out on Robots and Machines so they read from afar.
  accent: new THREE.MeshStandardMaterial({
    color: 0xe0661b,
    metalness: 0.25,
    roughness: 0.5,
  }),
  robotShell: new THREE.MeshStandardMaterial({
    color: 0xeef0f2,
    metalness: 0.1,
    roughness: 0.45,
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
  // A gold-coated sun visor, as on a spacesuit's helmet.
  goldVisor: new THREE.MeshStandardMaterial({
    color: 0xd9a441,
    metalness: 1,
    roughness: 0.12,
  }),
  // The Robot's sensor strip and lamps, always lit.
  sensorGlow: new THREE.MeshStandardMaterial({
    color: 0x7fe3ff,
    emissive: 0x3cc8ff,
    emissiveIntensity: 1.4,
  }),
  lamp: new THREE.MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xfff0d0,
    emissiveIntensity: 1.2,
  }),
  solarCell: new THREE.MeshStandardMaterial({
    color: 0x1d2b4f,
    metalness: 0.6,
    roughness: 0.25,
    side: THREE.DoubleSide,
  }),
  machinePaint: new THREE.MeshStandardMaterial({
    color: 0xd9a520,
    metalness: 0.3,
    roughness: 0.55,
  }),
  track: new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    metalness: 0.4,
    roughness: 0.9,
  }),
  // The steel grousers on a track's shoes, worn bright by the Regolith.
  grouser: new THREE.MeshStandardMaterial({
    color: 0x5b5d60,
    metalness: 0.85,
    roughness: 0.5,
  }),
  // The Habitat's inflatable envelope: a woven, coated fabric.
  envelope: new THREE.MeshStandardMaterial({
    color: 0xe8e4da,
    metalness: 0,
    roughness: 0.85,
    flatShading: true,
  }),
  // Printed Regolith: grey-brown, rough and matte.
  regolith: new THREE.MeshStandardMaterial({
    color: 0x8a857c,
    metalness: 0,
    roughness: 1,
    flatShading: true,
  }),
  // Sintered Regolith panels, darker and smoother than the ground round them.
  padPanel: new THREE.MeshStandardMaterial({
    color: 0x5d5a55,
    metalness: 0.05,
    roughness: 0.75,
  }),
  padMarking: new THREE.MeshStandardMaterial({
    color: 0xe8c33a,
    metalness: 0,
    roughness: 0.6,
  }),
  crate: new THREE.MeshStandardMaterial({
    color: 0xb9b2a2,
    metalness: 0.1,
    roughness: 0.8,
  }),
  statusOff: new THREE.MeshStandardMaterial({ color: 0x222222 }),
  statusTesting: new THREE.MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xffa000,
  }),
  statusOn: new THREE.MeshStandardMaterial({
    color: 0x40ff70,
    emissive: 0x20d050,
  }),
};

/** A window, dark from outside, that glows warm while someone is inside. Each model clones its own. */
export const windowGlass = new THREE.MeshStandardMaterial({
  color: 0x1a2430,
  metalness: 0.9,
  roughness: 0.1,
});

/** Lights a window as if someone were inside, or leaves it dark. */
export function lightWindow(
  material: THREE.MeshStandardMaterial,
  lit: boolean,
): void {
  material.color.set(lit ? 0xffd9a0 : 0x1a2430);
  material.emissive.set(lit ? 0xffb04a : 0x000000);
  material.emissiveIntensity = lit ? 1.6 : 0;
  material.metalness = lit ? 0 : 0.9;
}

export function part(
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

/** A box with rounded edges and corners. */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, radius);
}

const up = new THREE.Vector3(0, 1, 0);

/**
 * A round rod from one point to another, such as a strut, a rail or a
 * hydraulic cylinder.
 */
export function rod(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  sides = 8,
): THREE.Mesh {
  const mesh = part(
    new THREE.CylinderGeometry(radius, radius, 1, sides),
    material,
    [0, 0, 0],
  );
  placeRod(mesh, from, to);
  return mesh;
}

/** Stretches a rod of length 1, made by `rod`, from one point to another. */
export function placeRod(
  mesh: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
): void {
  const direction = to.clone().sub(from);
  const length = direction.length();
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.scale.set(1, Math.max(length, 1e-4), 1);
  if (length > 1e-6) {
    mesh.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
  }
}

/**
 * A round shape turned from a profile of [radius, height] points, such as an
 * engine bell or a helmet.
 */
export function lathe(
  profile: readonly (readonly [number, number])[],
  segments = 24,
): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([radius, height]) => new THREE.Vector2(radius, height)),
    segments,
  );
}

/** Sets a status light's colour: off, amber while Commissioning or flashing, or green. */
export function setStatusLight(
  material: THREE.MeshStandardMaterial,
  state: "off" | "testing" | "on",
): void {
  const source = {
    off: materials.statusOff,
    testing: materials.statusTesting,
    on: materials.statusOn,
  }[state];
  material.color.copy(source.color);
  material.emissive.copy(source.emissive);
}
