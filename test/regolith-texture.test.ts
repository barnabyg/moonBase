import { describe, expect, it } from "vitest";
import {
  createRegolithTile,
  tileableNoise,
} from "../src/render/regolith-texture";
import { fixedRandom } from "../src/render/scenery";

const size = 256;

/**
 * The average difference between neighbouring texels in a field, either
 * across the tile's edge, where it wraps round to the other side, or between
 * every pair of neighbours inside it.
 */
function averageStep(field: Float32Array, where: "seam" | "inside"): number {
  const at = (row: number, column: number) =>
    field[(row % size) * size + (column % size)] ?? 0;
  let total = 0;
  let count = 0;
  for (let along = 0; along < size; along++) {
    const across = where === "seam" ? [size - 1] : [...Array(size - 1).keys()];
    for (const step of across) {
      total += Math.abs(at(along, step) - at(along, step + 1));
      total += Math.abs(at(step, along) - at(step + 1, along));
      count += 2;
    }
  }
  return total / count;
}

describe("the Regolith's texture", () => {
  it("is made from noise that repeats every whole unit", () => {
    const noise = tileableNoise(fixedRandom(3), 6);
    for (const [u, v] of [
      [0.1, 0.2],
      [0.55, 0.9],
      [0.99, 0.01],
    ] as const) {
      expect(noise(u + 1, v)).toBeCloseTo(noise(u, v), 6);
      expect(noise(u, v + 1)).toBeCloseTo(noise(u, v), 6);
      expect(noise(u, v)).toBeGreaterThanOrEqual(0);
      expect(noise(u, v)).toBeLessThanOrEqual(1);
    }
  });

  it("repeats across the ground without a visible seam", () => {
    const tile = createRegolithTile(size, fixedRandom(7));
    for (const field of [tile.height, tile.brightness]) {
      expect(averageStep(field, "seam")).toBeLessThan(
        averageStep(field, "inside") * 1.5,
      );
    }
  });

  it("is the same on every load", () => {
    const first = createRegolithTile(size, fixedRandom(7));
    const second = createRegolithTile(size, fixedRandom(7));
    expect(second.height).toEqual(first.height);
    expect(second.brightness).toEqual(first.brightness);
  });
});
