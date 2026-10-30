import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { createRegolithHeapGeometry } from "../src/render/regolith-heap-view";
import { REGOLITH_TILE_METRES } from "../src/render/regolith-texture";
import { regolithHeapGround } from "../src/simulation";

describe("the Regolith heap's model", () => {
  const geometry = createRegolithHeapGeometry();
  const position = geometry.getAttribute("position");
  const points = Array.from({ length: position.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(position, index),
  );

  it("is a low mound of radius 1, no higher than 1, sunk just into the ground at its foot", () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();

    expect(box.max.y).toBeLessThanOrEqual(1);
    expect(box.max.y).toBeGreaterThan(0.85);
    expect(box.min.y).toBeLessThan(0);
    expect(box.min.y).toBeGreaterThan(-0.05);
    for (const point of points) {
      // Within its radius, so that it never reaches what stands clear of it.
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("has an uneven outline, not a perfect circle", () => {
    const foot = points
      .filter((point) => point.y < 0)
      .map((point) => Math.hypot(point.x, point.z));

    expect(Math.max(...foot) - Math.min(...foot)).toBeGreaterThan(0.1);
  });

  it("lays its grains as large as the ground's on a full heap", () => {
    const { radiusMetres } = regolithHeapGround(
      catalogue.landingSite.stockpilePosition,
    );
    const uv = geometry.getAttribute("uv");
    for (const [index, point] of points.entries()) {
      // How far from the top, in metres on a full heap and on the texture.
      expect((uv.getX(index) - uv.getX(0)) * REGOLITH_TILE_METRES).toBeCloseTo(
        point.x * radiusMetres,
        5,
      );
      expect((uv.getY(index) - uv.getY(0)) * REGOLITH_TILE_METRES).toBeCloseTo(
        point.z * radiusMetres,
        5,
      );
    }
  });

  it("faces up and out everywhere, to be lit from above", () => {
    const normal = geometry.getAttribute("normal");
    for (let index = 0; index < normal.count; index++) {
      expect(normal.getY(index)).toBeGreaterThan(0);
    }
  });
});
