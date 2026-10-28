import * as THREE from "three";

// The Regolith close up: a tile of ground, pitted with small craters and
// strewn with pebbles, that repeats across the map. It is computed rather than
// drawn from an image, so it needs no file and looks the same on every load.

/** How far the tile of ground reaches before it repeats. */
export const REGOLITH_TILE_METRES = 20;
/** The colour map's texel value for ground of average brightness, out of 255. */
const MEAN_TEXEL = 200;

/**
 * A smooth random field that repeats every whole unit of u and v, with
 * `cells` random values across each unit: value noise on a wrapped lattice.
 * It returns values from 0 to 1.
 */
export function tileableNoise(
  random: () => number,
  cells: number,
): (u: number, v: number) => number {
  const lattice = Float32Array.from({ length: cells * cells }, () => random());
  const wrap = (cell: number) => ((cell % cells) + cells) % cells;
  const at = (x: number, y: number) => lattice[wrap(y) * cells + wrap(x)] ?? 0;
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const left = Math.floor(x);
    const top = Math.floor(y);
    const across = ease(x - left);
    const down = ease(y - top);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(left, top), at(left + 1, top), across),
      THREE.MathUtils.lerp(at(left, top + 1), at(left + 1, top + 1), across),
      down,
    );
  };
}

/**
 * Tileable noise layered at finer and finer scales, each half as strong as
 * the one before, as natural ground is. It returns values from -1 to 1.
 */
export function layeredNoise(
  random: () => number,
  coarsestCells: number,
  layers: number,
): (u: number, v: number) => number {
  const noises = Array.from({ length: layers }, (_, layer) =>
    tileableNoise(random, coarsestCells * 2 ** layer),
  );
  const total = noises.reduce((sum, _, layer) => sum + 0.5 ** layer, 0);
  return (u, v) =>
    noises.reduce(
      (sum, noise, layer) => sum + (noise(u, v) * 2 - 1) * 0.5 ** layer,
      0,
    ) / total;
}

/**
 * Adds layered noise, from -amplitude to amplitude, to every texel of a
 * square field that repeats without a seam. It is layeredNoise sampled at
 * each texel, but quick enough for a large texture, as each layer's weights
 * are worked out once per row and once per column.
 */
function addLayeredNoise(
  field: Float32Array,
  size: number,
  random: () => number,
  coarsestCells: number,
  layers: number,
  amplitude: number,
): void {
  const total = Array.from(
    { length: layers },
    (_, layer) => 0.5 ** layer,
  ).reduce((sum, strength) => sum + strength, 0);
  const first = new Int32Array(size);
  const next = new Int32Array(size);
  const weight = new Float32Array(size);
  for (let layer = 0; layer < layers; layer++) {
    const cells = coarsestCells * 2 ** layer;
    const strength = (amplitude * 0.5 ** layer) / total;
    const lattice = Float32Array.from(
      { length: cells * cells },
      () => random() * 2 - 1,
    );
    for (let texel = 0; texel < size; texel++) {
      const position = (texel / size) * cells;
      const cell = Math.floor(position);
      const fraction = position - cell;
      first[texel] = cell % cells;
      next[texel] = (cell + 1) % cells;
      weight[texel] = fraction * fraction * (3 - 2 * fraction);
    }
    for (let row = 0; row < size; row++) {
      const top = (first[row] ?? 0) * cells;
      const bottom = (next[row] ?? 0) * cells;
      const down = weight[row] ?? 0;
      for (let column = 0; column < size; column++) {
        const left = first[column] ?? 0;
        const right = next[column] ?? 0;
        const across = weight[column] ?? 0;
        const topLeft = lattice[top + left] ?? 0;
        const bottomLeft = lattice[bottom + left] ?? 0;
        const upper =
          topLeft + ((lattice[top + right] ?? 0) - topLeft) * across;
        const lower =
          bottomLeft + ((lattice[bottom + right] ?? 0) - bottomLeft) * across;
        const at = row * size + column;
        field[at] =
          (field[at] ?? 0) + strength * (upper + (lower - upper) * down);
      }
    }
  }
}

export interface RegolithTile {
  /** Texels along each side. */
  readonly size: number;
  /** The ground's height in metres at each texel, row by row. */
  readonly height: Float32Array;
  /** How bright the ground is at each texel, about 1 on average. */
  readonly brightness: Float32Array;
}

/** Computes a tile of ground, `size` texels across, that repeats without a seam. */
export function createRegolithTile(
  size: number,
  random: () => number,
): RegolithTile {
  const texel = REGOLITH_TILE_METRES / size;
  const height = new Float32Array(size * size);
  const brightness = Float32Array.from(
    { length: size * size },
    () => 1 + (random() - 0.5) * 0.04,
  );

  // Gentle undulation at every scale, patches of darker and lighter soil,
  // and a fine grain.
  addLayeredNoise(height, size, random, 4, 4, 0.05);
  addLayeredNoise(brightness, size, random, 3, 3, 0.1);
  addLayeredNoise(brightness, size, random, 128, 1, 0.05);

  /**
   * Calls `apply` for every texel within `reach` of a point, with the
   * distance in metres, wrapping round the tile's edges.
   */
  function stamp(
    x: number,
    y: number,
    reach: number,
    apply: (at: number, distance: number) => void,
  ): void {
    const span = Math.ceil(reach / texel);
    const centreColumn = Math.round(x / texel);
    const centreRow = Math.round(y / texel);
    for (let row = centreRow - span; row <= centreRow + span; row++) {
      for (
        let column = centreColumn - span;
        column <= centreColumn + span;
        column++
      ) {
        const distance = Math.hypot(column * texel - x, row * texel - y);
        if (distance > reach) continue;
        const wrappedRow = ((row % size) + size) % size;
        const wrappedColumn = ((column % size) + size) % size;
        apply(wrappedRow * size + wrappedColumn, distance);
      }
    }
  }

  // Small craters: a bowl with a low raised rim. The youngest are brighter,
  // their fresh soil not yet darkened by the solar wind.
  for (let index = 0; index < 45; index++) {
    const x = random() * REGOLITH_TILE_METRES;
    const y = random() * REGOLITH_TILE_METRES;
    const radius = 0.03 + random() ** 4 * 1.1;
    const depth = radius * (0.06 + random() * 0.14);
    const rim = depth * 0.3;
    const fresh = random() < 0.3;
    stamp(x, y, radius * 2.5, (at, distance) => {
      const across = distance / radius;
      const shape =
        across < 1
          ? rim - (rim + depth) * (1 - across * across)
          : rim * Math.max(0, 1 - (across - 1) / 0.7) ** 2;
      height[at] = (height[at] ?? 0) + shape;
      if (fresh) {
        const halo = 1 - THREE.MathUtils.smoothstep(across, 0.6, 2.5);
        brightness[at] = (brightness[at] ?? 1) + halo * 0.1;
      }
    });
  }

  // Pebbles, most of them tiny, some lighter and some darker than the soil.
  for (let index = 0; index < 4000; index++) {
    const x = random() * REGOLITH_TILE_METRES;
    const y = random() * REGOLITH_TILE_METRES;
    const radius = 0.008 + random() ** 4 * 0.07;
    const shade = (random() - 0.35) * 0.4;
    stamp(x, y, radius, (at, distance) => {
      const across = distance / radius;
      height[at] =
        (height[at] ?? 0) + radius * 0.7 * Math.sqrt(1 - across ** 2);
      brightness[at] = (brightness[at] ?? 1) + shade * (1 - across ** 4);
    });
  }

  return { size, height, brightness };
}

function dataTexture(
  data: Uint8Array,
  size: number,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface RegolithTextures {
  /** Grey, to be tinted by the material's colour. */
  readonly colour: THREE.DataTexture;
  readonly normal: THREE.DataTexture;
  /**
   * The colour map's average, in linear light, which a material's colour is
   * divided by to keep its overall tone.
   */
  readonly mean: number;
}

/** The Regolith's colour and normal maps, one tile of REGOLITH_TILE_METRES each. */
export function createRegolithTextures(
  random: () => number,
  anisotropy: number,
  size = 1024,
): RegolithTextures {
  const { height, brightness } = createRegolithTile(size, random);
  const texel = REGOLITH_TILE_METRES / size;
  const colour = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const heightAt = (row: number, column: number) =>
    height[((row + size) % size) * size + ((column + size) % size)] ?? 0;
  const surface = new THREE.Vector3();
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const at = row * size + column;
      const shade = THREE.MathUtils.clamp(
        Math.round((brightness[at] ?? 1) * MEAN_TEXEL),
        0,
        255,
      );
      // Rows run up the texture (v) and columns across it (u), as a
      // DataTexture isn't flipped.
      surface
        .set(
          -(heightAt(row, column + 1) - heightAt(row, column - 1)) /
            (2 * texel),
          -(heightAt(row + 1, column) - heightAt(row - 1, column)) /
            (2 * texel),
          1,
        )
        .normalize();
      const rgba = at * 4;
      colour[rgba] = shade;
      colour[rgba + 1] = shade;
      colour[rgba + 2] = shade;
      colour[rgba + 3] = 255;
      normal[rgba] = Math.round((surface.x * 0.5 + 0.5) * 255);
      normal[rgba + 1] = Math.round((surface.y * 0.5 + 0.5) * 255);
      normal[rgba + 2] = Math.round((surface.z * 0.5 + 0.5) * 255);
      normal[rgba + 3] = 255;
    }
  }
  return {
    colour: dataTexture(colour, size, THREE.SRGBColorSpace, anisotropy),
    normal: dataTexture(normal, size, THREE.NoColorSpace, anisotropy),
    mean: new THREE.Color().setRGB(
      MEAN_TEXEL / 255,
      MEAN_TEXEL / 255,
      MEAN_TEXEL / 255,
      THREE.SRGBColorSpace,
    ).r,
  };
}
