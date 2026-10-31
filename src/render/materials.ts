import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

/** The width and height of one fold of a solar array's panel, as drawn on its texture. */
const CELL_TEXTURE_SIZE = [512, 128] as const;

/**
 * Draws a texture for the face of one fold of a solar array's panel, or
 * returns undefined if the browser can't draw on a canvas.
 */
function createCellTexture(
  draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void,
): THREE.CanvasTexture | undefined {
  const [width, height] = CELL_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Crystalline cells in an aluminium frame: rows of deep blue cells, each a
 * slightly different shade, on a pale backsheet that shows between them,
 * with two silver busbars down each.
 */
const crystallineCells = createCellTexture((context, width, height) => {
  const random = fixedRandom(7);
  const frame = 6;
  const columns = 14;
  const rows = 4;
  const gap = 2;
  context.fillStyle = "#b9bcc0";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#d6d8d4";
  context.fillRect(frame, frame, width - 2 * frame, height - 2 * frame);
  const cellWidth = (width - 2 * frame - gap) / columns;
  const cellHeight = (height - 2 * frame - gap) / rows;
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const x = frame + gap + column * cellWidth;
      const y = frame + gap + row * cellHeight;
      const shade = random() * 10;
      context.fillStyle = `rgb(${24 + shade} ${38 + shade} ${84 + shade})`;
      context.fillRect(x, y, cellWidth - gap, cellHeight - gap);
      context.fillStyle = "rgb(200 205 215 / 55%)";
      for (const share of [1 / 3, 2 / 3]) {
        context.fillRect(x + (cellWidth - gap) * share, y, 1, cellHeight - gap);
      }
    }
  }
});

/**
 * Thin-film cells: long narrow strips of film scribed across the fold, with
 * a copper ribbon along the top and bottom that collects their current, and
 * no frame.
 */
const thinFilmCells = createCellTexture((context, width, height) => {
  const random = fixedRandom(11);
  const ribbon = 4;
  context.fillStyle = "#2b2228";
  context.fillRect(0, 0, width, height);
  const strip = 6;
  for (let x = 2; x < width - 2; x += strip) {
    const shade = random() * 8;
    context.fillStyle = `rgb(${76 + shade} ${52 + shade} ${66 + shade})`;
    context.fillRect(x, ribbon + 2, strip - 1, height - 2 * (ribbon + 2));
  }
  context.fillStyle = "#a8683c";
  context.fillRect(0, 1, width, ribbon);
  context.fillRect(0, height - ribbon - 1, width, ribbon);
});

/**
 * The woven steel-wire mesh of a Rover's tyre: a diamond lattice of bright
 * wire over the dark inside of the wheel, tiled round the tread. Undefined
 * if the browser can't draw on a canvas.
 */
function createWireMeshTexture(): THREE.CanvasTexture | undefined {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  context.fillStyle = "#26282b";
  context.fillRect(0, 0, size, size);
  context.strokeStyle = "#a3a6a9";
  context.lineWidth = 5;
  // Corner to corner both ways, and again across each edge, so that it
  // repeats without a seam.
  for (const offset of [-size, 0, size]) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + size, size);
    context.moveTo(offset + size, 0);
    context.lineTo(offset, size);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 3);
  return texture;
}

const wireMesh = createWireMeshTexture();

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
  // The face of one fold of a solar array: framed crystalline cells under glass.
  solarCell: new THREE.MeshStandardMaterial({
    ...(crystallineCells === undefined
      ? { color: 0x1d2b4f }
      : { color: 0xffffff, map: crystallineCells }),
    metalness: 0.45,
    roughness: 0.25,
  }),
  // The pale polymer backsheet on the back of a solar array's panel.
  backsheet: new THREE.MeshStandardMaterial({
    color: 0xc9cbc6,
    metalness: 0.05,
    roughness: 0.7,
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
  // A Rover's tyre of woven steel wire, which flexes over rocks where
  // rubber would go brittle in the cold.
  wireMesh: new THREE.MeshStandardMaterial({
    ...(wireMesh === undefined
      ? { color: 0x55585b }
      : { color: 0xffffff, map: wireMesh }),
    metalness: 0.8,
    roughness: 0.5,
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
  // A hardened Habitat's envelope: layers of ceramic and aramid fabric,
  // duller and darker than an inflatable Habitat's.
  armouredEnvelope: new THREE.MeshStandardMaterial({
    color: 0x9a9284,
    metalness: 0.05,
    roughness: 0.95,
    flatShading: true,
  }),
  // Black rubber boots and covers that seal a joint against Dust.
  seal: new THREE.MeshStandardMaterial({
    color: 0x18191b,
    metalness: 0,
    roughness: 0.9,
  }),
  // The copper electrodes of a dust screen, laid over solar cells.
  electrode: new THREE.MeshStandardMaterial({
    color: 0xb8733f,
    metalness: 0.9,
    roughness: 0.3,
  }),
  // Thin-film solar cells on a flexible backing: a dull bronze-violet,
  // less glassy than the crystalline cells of a solar array.
  thinFilmCell: new THREE.MeshStandardMaterial({
    ...(thinFilmCells === undefined
      ? { color: 0x4a3340 }
      : { color: 0xffffff, map: thinFilmCells }),
    metalness: 0.35,
    roughness: 0.45,
  }),
  // The flexible backing behind thin-film cells: a dark grey polymer.
  filmBacking: new THREE.MeshStandardMaterial({
    color: 0x45474b,
    metalness: 0.1,
    roughness: 0.8,
  }),
  // Regolith fused by heat as the regolith printer lays it: darker than
  // printed Regolith, with a faint glassy sheen.
  sinteredRegolith: new THREE.MeshStandardMaterial({
    color: 0x5a544c,
    metalness: 0.1,
    roughness: 0.6,
    flatShading: true,
  }),
  // The glassy skin where one sintered course of Regolith meets the next.
  sinteredGlaze: new THREE.MeshStandardMaterial({
    color: 0x3a3632,
    metalness: 0.2,
    roughness: 0.45,
    flatShading: true,
  }),
  // A water-wall bladder: a coated fabric tube, pale blue-grey, with the
  // faint sheen of the water filling it.
  waterBladder: new THREE.MeshStandardMaterial({
    color: 0x9fb4c4,
    metalness: 0.05,
    roughness: 0.55,
    flatShading: true,
  }),
  // The webbing straps that hold the bladders down over the shielding.
  bladderStrap: new THREE.MeshStandardMaterial({
    color: 0x55504a,
    metalness: 0,
    roughness: 0.9,
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
  // Packing crates: composite panels in a darker frame.
  crate: new THREE.MeshStandardMaterial({
    color: 0xb3a68a,
    metalness: 0.05,
    roughness: 0.85,
  }),
  crateFrame: new THREE.MeshStandardMaterial({
    color: 0x6e6250,
    metalness: 0.1,
    roughness: 0.75,
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
  material: THREE.Material | THREE.Material[],
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

/**
 * Many thin rods from point to point, such as a lattice mast or a ladder,
 * merged into one mesh so that they cost one draw.
 */
export function rods(
  segments: readonly (readonly [THREE.Vector3, THREE.Vector3])[],
  radius: number,
  material: THREE.Material,
  sides = 6,
): THREE.Mesh {
  const pieces = segments.map(([from, to]) => {
    const placed = new THREE.Object3D();
    placeRod(placed, from, to);
    placed.updateMatrix();
    return new THREE.CylinderGeometry(radius, radius, 1, sides, 1, true)
      .toNonIndexed()
      .applyMatrix4(placed.matrix);
  });
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return part(merged, material, [0, 0, 0]);
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

/** A box of the given size, with its centre at the given point. */
export function boxAt(
  width: number,
  height: number,
  depth: number,
  [x, y, z]: readonly [number, number, number],
): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

/** One geometry of the given pieces, which are disposed of. */
export function merged(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}
