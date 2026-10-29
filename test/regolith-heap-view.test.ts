import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createRegolithHeapGeometry } from "../src/render/regolith-heap-view";

describe("the Regolith heap's model", () => {
  const geometry = createRegolithHeapGeometry();
  const position = geometry.getAttribute("position");
  const points = Array.from({ length: position.count }, (_, index) =>
    new THREE.Vector3().fromBufferAttribute(position, index),
  );

  it("is a low mound about 1 across its radius and no higher than 1, sunk just into the ground at its foot", () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();

    expect(box.max.y).toBeLessThanOrEqual(1);
    expect(box.max.y).toBeGreaterThan(0.85);
    expect(box.min.y).toBeLessThan(0);
    expect(box.min.y).toBeGreaterThan(-0.05);
    for (const point of points) {
      expect(Math.hypot(point.x, point.z)).toBeLessThan(1.2);
    }
  });

  it("has an uneven outline, not a perfect circle", () => {
    const foot = points
      .filter((point) => point.y < 0)
      .map((point) => Math.hypot(point.x, point.z));

    expect(Math.max(...foot) - Math.min(...foot)).toBeGreaterThan(0.1);
  });

  it("faces up and out everywhere, to be lit from above", () => {
    const normal = geometry.getAttribute("normal");
    for (let index = 0; index < normal.count; index++) {
      expect(normal.getY(index)).toBeGreaterThan(0);
    }
  });
});
