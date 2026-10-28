import * as THREE from "three";
import type { MapSnapshot } from "../simulation";
import {
  createRegolithTextures,
  layeredNoise,
  REGOLITH_TILE_METRES,
  tileableNoise,
  type RegolithTextures,
} from "./regolith-texture";

// The look of the south pole: grey Regolith pitted with craters and strewn
// with rocks, low hills on the horizon, a black sky and Earth low above them.
// The sun and its long shadows are in lighting.ts. The base map itself stays
// flat, as the simulation treats it; only the craters' rims and the rocks
// stand up from it.

/** A small, fixed pseudo-random sequence, so the scenery looks the same on every load. */
export function fixedRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const REGOLITH_COLOUR = 0x7d7b78;
/** The land beyond the base map, darker so that the map's edge shows. */
const SURROUNDINGS_SHADE = 0.72;
const SURROUNDINGS_RADIUS = 6000;
/** Where the land beyond the map begins to rise into hills, and where they reach their full height. */
const HILLS_START_METRES = 760;
const HILLS_FULL_METRES = 2600;
/**
 * How high the hills rise for their distance: kept below about a degree above
 * the horizon, so they never hide the low sun and only the foot of Earth.
 */
const HILL_RISE = 0.02;
/** Clear of the landing site, where the base begins. */
const CLEAR_RADIUS_METRES = 14;
/** The scale of the broad light and dark patches across the land. */
const PATCH_PERIOD_METRES = 12000;

/** One of the craters whose rims stand up from the base map. */
interface Crater {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly rimHeight: number;
  /** A young crater, ringed by bright ejecta and strewn with boulders. */
  readonly fresh: boolean;
}

/**
 * A crater rim's cross-section, from inside to out, as [fraction of the
 * crater's radius, fraction of the rim's height]: a steep inner wall and a
 * long, gentle outer slope, both ends sunk just below the ground.
 */
const RIM_PROFILE: readonly (readonly [number, number])[] = [
  [0.76, -0.08],
  [0.88, 0.5],
  [0.96, 0.92],
  [1, 1],
  [1.1, 0.68],
  [1.3, 0.3],
  [1.55, 0.08],
  [1.8, -0.08],
];
const RIM_REACH = 1.8;

function placeCraters(random: () => number, map: MapSnapshot): Crater[] {
  const edge = Math.min(map.widthMetres, map.depthMetres) / 2 - 20;
  const craters: Crater[] = [];
  const place = (radius: number, rimHeight: number, fresh: boolean) => {
    const reach = radius * RIM_REACH;
    const nearest = 40 + reach;
    const farthest = Math.max(nearest, edge - reach);
    const distance = nearest + random() * (farthest - nearest);
    const angle = random() * Math.PI * 2;
    craters.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      radius,
      rimHeight,
      fresh,
    });
  };
  // A few broad, old craters, worn almost flat.
  for (let index = 0; index < 3; index++) {
    const radius = 50 + random() * 60;
    place(radius, radius * 0.02, false);
  }
  for (let index = 0; index < 24; index++) {
    const radius = 3 + random() ** 2 * 22;
    const fresh = random() < 0.4;
    place(radius, radius * (fresh ? 0.07 : 0.035), fresh);
  }
  return craters;
}

/**
 * How bright the ground is at a point, about 1: broad patches of lighter
 * and darker soil, and bright ejecta round the fresh craters.
 */
function groundShade(
  craters: readonly Crater[],
  patches: (u: number, v: number) => number,
): (x: number, z: number) => number {
  return (x, z) => {
    let shade =
      1 + patches(x / PATCH_PERIOD_METRES, z / PATCH_PERIOD_METRES) * 0.12;
    for (const crater of craters) {
      if (!crater.fresh) continue;
      const across = Math.hypot(x - crater.x, z - crater.z) / crater.radius;
      shade += (1 - THREE.MathUtils.smoothstep(across, 0.8, 3.2)) * 0.12;
    }
    return shade;
  };
}

/**
 * Gives a flat-lying geometry texture coordinates by where it is on the
 * ground, so that the Regolith's texture runs on unbroken from one piece of
 * ground to the next, and colours its vertices by `shade`.
 */
function layOnGround(
  geometry: THREE.BufferGeometry,
  shade: (x: number, z: number) => number,
): void {
  const position = geometry.getAttribute("position");
  const uvs = new Float32Array(position.count * 2);
  const colours = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    uvs[index * 2] = x / REGOLITH_TILE_METRES;
    uvs[index * 2 + 1] = -z / REGOLITH_TILE_METRES;
    const value = shade(x, z);
    colours.set([value, value, value], index * 3);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
}

/** The land beyond the map, rising into low hills towards the horizon. */
function createSurroundings(
  material: THREE.Material,
  shade: (x: number, z: number) => number,
): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0, SURROUNDINGS_RADIUS, 160, 60);
  geometry.rotateX(-Math.PI / 2);
  const hills = layeredNoise(fixedRandom(11), 12, 4);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const distance = Math.hypot(x, z);
    const rise = THREE.MathUtils.smoothstep(
      distance,
      HILLS_START_METRES,
      HILLS_FULL_METRES,
    );
    const hill =
      0.55 + 0.45 * hills(x / PATCH_PERIOD_METRES, z / PATCH_PERIOD_METRES);
    // Just below the base map, so that the two never flicker through each other.
    position.setY(index, -0.02 + rise * distance * HILL_RISE * hill);
  }
  geometry.computeVertexNormals();
  layOnGround(geometry, (x, z) => shade(x, z) * SURROUNDINGS_SHADE);
  const surroundings = new THREE.Mesh(geometry, material);
  surroundings.name = "Surroundings";
  return surroundings;
}

/** The raised rims of the craters, as one mesh. */
function createCraterRims(
  craters: readonly Crater[],
  material: THREE.Material,
  shade: (x: number, z: number) => number,
): THREE.Mesh {
  const random = fixedRandom(1971);
  const positions: number[] = [];
  const indices: number[] = [];
  for (const crater of craters) {
    const segments = THREE.MathUtils.clamp(
      Math.round(crater.radius * 3),
      24,
      120,
    );
    // The crest rises and falls round the rim, and the rim wanders in and
    // out, so that no crater is a perfect ring.
    const crest = tileableNoise(random, 7);
    const wander = tileableNoise(random, 5);
    const first = positions.length / 3;
    for (let segment = 0; segment < segments; segment++) {
      const around = segment / segments;
      const angle = around * Math.PI * 2;
      const height = crater.rimHeight * (0.5 + crest(around, 0.5));
      const radius = crater.radius * (0.94 + wander(around, 0.5) * 0.12);
      for (const [outwards, up] of RIM_PROFILE) {
        positions.push(
          crater.x + Math.cos(angle) * radius * outwards,
          up < 0 ? up * crater.rimHeight : up * height,
          crater.z + Math.sin(angle) * radius * outwards,
        );
      }
    }
    // The last segment joins back to the first, so the ring closes smoothly.
    const rings = RIM_PROFILE.length;
    for (let segment = 0; segment < segments; segment++) {
      for (let ring = 0; ring < rings - 1; ring++) {
        const here = first + segment * rings + ring;
        const next = first + ((segment + 1) % segments) * rings + ring;
        indices.push(here, next, here + 1, here + 1, next, next + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  layOnGround(geometry, shade);
  const rims = new THREE.Mesh(geometry, material);
  rims.name = "Crater rims";
  rims.castShadow = true;
  rims.receiveShadow = true;
  return rims;
}

/**
 * A rock's shape: a lumpy ball broken along several flat fracture faces,
 * with every face shaded flat.
 */
function createRockShape(random: () => number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const fractures = Array.from(
    { length: 6 + Math.floor(random() * 5) },
    () => ({
      normal: new THREE.Vector3(
        random() - 0.5,
        random() - 0.5,
        random() - 0.5,
      ).normalize(),
      offset: 0.3 + random() * 0.45,
    }),
  );
  // Broad lumps, so that no two rocks are the same shape, and finer knobs.
  const bumps = [3, 3, 12, 12].map((frequency) => ({
    frequency: new THREE.Vector3(
      random() - 0.5,
      random() - 0.5,
      random() - 0.5,
    ).multiplyScalar(frequency),
    phase: random() * Math.PI * 2,
    height: frequency < 5 ? 0.1 : 0.025,
  }));
  const position = geometry.getAttribute("position");
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    // The same point always moves the same way, so the faces that share a
    // corner stay joined.
    const roughness = bumps.reduce(
      (sum, bump) =>
        sum + Math.sin(bump.frequency.dot(point) + bump.phase) * bump.height,
      0,
    );
    point.multiplyScalar(1 + roughness);
    for (const { normal, offset } of fractures) {
      const beyond = point.dot(normal) - offset;
      if (beyond > 0) point.addScaledVector(normal, -beyond);
    }
    position.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

interface RockPlacement {
  readonly x: number;
  readonly z: number;
  readonly size: number;
}

/**
 * Where the rocks lie: boulders scattered across the land and heaped round
 * the fresh craters, with rubble round the bigger ones.
 */
function placeRocks(
  random: () => number,
  craters: readonly Crater[],
  map: MapSnapshot,
): { boulders: RockPlacement[]; rubble: RockPlacement[] } {
  const edge = Math.min(map.widthMetres, map.depthMetres) / 2;
  const boulders: RockPlacement[] = [];
  const rubble: RockPlacement[] = [];
  const clear = (x: number, z: number) =>
    Math.hypot(x, z) >= CLEAR_RADIUS_METRES;
  const around = (
    x: number,
    z: number,
    nearest: number,
    farthest: number,
  ): [number, number] => {
    const angle = random() * Math.PI * 2;
    // Thicker towards the inner edge, as ejecta falls nearest its crater.
    const distance = nearest + random() ** 2 * (farthest - nearest);
    return [x + Math.cos(angle) * distance, z + Math.sin(angle) * distance];
  };

  for (let index = 0; index < 260; index++) {
    const distance =
      CLEAR_RADIUS_METRES + random() * (edge - CLEAR_RADIUS_METRES);
    const angle = random() * Math.PI * 2;
    const size = 0.12 + random() ** 3 * 1.5;
    boulders.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      size,
    });
  }
  for (const crater of craters) {
    if (!crater.fresh) continue;
    const count = 6 + Math.round(crater.radius * 1.5);
    for (let index = 0; index < count; index++) {
      const [x, z] = around(
        crater.x,
        crater.z,
        crater.radius * 0.85,
        crater.radius * 2.6,
      );
      const size = 0.1 + random() ** 3 * (0.4 + crater.radius * 0.06);
      if (clear(x, z)) boulders.push({ x, z, size });
    }
    for (let index = 0; index < crater.radius * 30; index++) {
      const [x, z] = around(
        crater.x,
        crater.z,
        crater.radius * 0.8,
        crater.radius * 3,
      );
      if (clear(x, z)) rubble.push({ x, z, size: 0.03 + random() ** 2 * 0.1 });
    }
  }
  for (const boulder of [...boulders]) {
    if (boulder.size < 0.5) continue;
    for (let index = 0; index < boulder.size * 14; index++) {
      const [x, z] = around(
        boulder.x,
        boulder.z,
        boulder.size * 0.9,
        boulder.size * 4,
      );
      if (clear(x, z)) rubble.push({ x, z, size: 0.03 + random() ** 2 * 0.12 });
    }
  }
  return { boulders, rubble };
}

/** Rock tones: mostly grey, some lighter highland rock and some darker. */
const ROCK_COLOURS = [0x6e6b67, 0x7a7671, 0x625f5b, 0x8c8882, 0x55524e];

/**
 * The rocks, as one instanced mesh per shape so that they cost few draws.
 * They wear the Regolith's texture, smaller, for a pitted surface.
 */
function createRocks(
  craters: readonly Crater[],
  map: MapSnapshot,
  textures: RegolithTextures,
): THREE.Group {
  const random = fixedRandom(1969);
  const shapes = Array.from({ length: 6 }, () => createRockShape(random));
  const colourMap = textures.colour.clone();
  const normalMap = textures.normal.clone();
  for (const texture of [colourMap, normalMap]) texture.repeat.set(1.5, 0.75);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1).multiplyScalar(1 / textures.mean),
    map: colourMap,
    normalMap,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const { boulders, rubble } = placeRocks(random, craters, map);
  const rocks = new THREE.Group();
  rocks.name = "Rocks";

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const tilt = new THREE.Euler();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();
  for (const [placements, castShadow] of [
    [boulders, true],
    [rubble, false],
  ] as const) {
    const byShape = shapes.map((): RockPlacement[] => []);
    for (const placement of placements) {
      byShape[Math.floor(random() * shapes.length)]?.push(placement);
    }
    for (const [shape, placed] of byShape.entries()) {
      const geometry = shapes[shape];
      if (geometry === undefined || placed.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, placed.length);
      for (const [index, { x, z, size }] of placed.entries()) {
        scale.set(
          size * (0.8 + random() * 0.6),
          size * (0.45 + random() * 0.35),
          size * (0.8 + random() * 0.6),
        );
        // Sunk part way into the Regolith, and tipped a little.
        position.set(x, scale.y * (0.05 + random() * 0.35), z);
        tilt.set(
          (random() - 0.5) * 0.5,
          random() * Math.PI * 2,
          (random() - 0.5) * 0.5,
        );
        rotation.setFromEuler(tilt);
        mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
        const tone =
          ROCK_COLOURS[Math.floor(random() * ROCK_COLOURS.length)] ??
          REGOLITH_COLOUR;
        mesh.setColorAt(
          index,
          colour.set(tone).multiplyScalar(0.65 + random() * 0.2),
        );
      }
      mesh.computeBoundingSphere();
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      rocks.add(mesh);
    }
  }
  return rocks;
}

/** How much larger the ground's texture is laid the second time, and how far it is turned. */
const BROAD_SCALE = 7.3;
const BROAD_TURN = 0.9;

/**
 * Lays the ground's colour and normal maps over themselves a second time,
 * larger and turned, so that the tile's small craters and pebbles also appear
 * as larger craters and stones, as a real crater field looks much the same at
 * every scale, and so that the tile's repeats don't show from afar.
 * `textureMean` is the colour map's average, which the second layer is
 * divided by to keep the ground's overall tone.
 */
function layerAtBroaderScale(
  material: THREE.MeshStandardMaterial,
  textureMean: number,
): void {
  const cos = Math.cos(BROAD_TURN).toFixed(5);
  const sin = Math.sin(BROAD_TURN).toFixed(5);
  const shrink = (1 / BROAD_SCALE).toFixed(5);
  // Matrices are written column by column: `turn` turns the texture
  // coordinates, and `unturn` turns the broad layer's normals back to match.
  const turn = `mat2(${cos}, ${sin}, -${sin}, ${cos})`;
  const unturn = `mat2(${cos}, -${sin}, ${sin}, ${cos})`;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `${THREE.ShaderChunk.map_fragment}
        diffuseColor.rgb *= texture2D( map, ${turn} * vMapUv * ${shrink} ).rgb
          / ${textureMean.toFixed(5)};`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replace(
          "mapN.xy *= normalScale;",
          `vec3 broadN = texture2D( normalMap, ${turn} * vNormalMapUv * ${shrink} ).xyz * 2.0 - 1.0;
          mapN = normalize( vec3( mapN.xy + ${unturn} * broadN.xy * 0.7, mapN.z * broadN.z ) );
          mapN.xy *= normalScale;`,
        ),
      );
  };
}

/**
 * The ground: the base map, the land round it, the craters and the rocks.
 * `anisotropy` sharpens the ground's texture where it is seen at a low angle.
 */
export function createGround(map: MapSnapshot, anisotropy = 1): THREE.Group {
  const ground = new THREE.Group();
  ground.name = "Regolith";

  const textures = createRegolithTextures(fixedRandom(7), anisotropy);
  // Brightened to make up for the colour map, keeping the ground's overall tone.
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(REGOLITH_COLOUR).multiplyScalar(1 / textures.mean),
    map: textures.colour,
    normalMap: textures.normal,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  layerAtBroaderScale(material, textures.mean);

  const craters = placeCraters(fixedRandom(1970), map);
  const shade = groundShade(craters, layeredNoise(fixedRandom(12), 24, 4));

  const baseMapGeometry = new THREE.PlaneGeometry(
    map.widthMetres,
    map.depthMetres,
    Math.round(map.widthMetres / 5),
    Math.round(map.depthMetres / 5),
  );
  baseMapGeometry.rotateX(-Math.PI / 2);
  layOnGround(baseMapGeometry, shade);
  const baseMap = new THREE.Mesh(baseMapGeometry, material);
  baseMap.name = "Base map";
  baseMap.receiveShadow = true;

  ground.add(
    baseMap,
    createSurroundings(material, shade),
    createCraterRims(craters, material, shade),
    createRocks(craters, map, textures),
  );
  return ground;
}

/** Earth, low on the horizon in the given direction. */
export function createEarth(direction: THREE.Vector3): THREE.Mesh {
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3f6fc9,
      emissive: 0x0d2350,
      roughness: 0.8,
      metalness: 0,
    }),
  );
  earth.name = "Earth";
  const horizontal = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  earth.position.copy(horizontal.multiplyScalar(5200)).setY(190);
  return earth;
}
