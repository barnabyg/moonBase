import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogue } from "../src/catalogue";

// The materials draw their textures on a canvas when they load; under Node
// there is none, so they fall back to plain colours, as in a browser that
// can't draw on one.
vi.stubGlobal("document", {
  createElement: () => ({ getContext: () => null }),
});

let models: typeof import("../src/render/models");

beforeAll(async () => {
  models = await import("../src/render/models");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const infrared = catalogue.structureTypes.find(
  (type) => type.id === "infrared-telescope",
);
if (infrared === undefined) throw new Error("expected an infrared telescope");

function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverseVisible((child) => {
    if (child instanceof THREE.Mesh) {
      box.union(new THREE.Box3().setFromObject(child, true));
    }
  });
  return box;
}

function reach(box: THREE.Box3): number {
  return Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
}

describe("the infrared telescope's model", () => {
  it("is its own model, standing on the ground within its footprint, larger than the optical telescope's, stowed and observing", () => {
    const model = models.createStructureModel(infrared.id);
    expect(model.group.name).toBe("Infrared telescope");
    model.setAssembled(1);
    const optical = models.createStructureModel("telescope");
    optical.setAssembled(1);

    model.setRunning?.(false, 0);
    const stowed = boundsOf(model.group);
    model.setRunning?.(true, 30);
    const observing = boundsOf(model.group);

    for (const box of [stowed, observing]) {
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(reach(box)).toBeLessThanOrEqual(infrared.footprintRadiusMetres);
    }
    expect(stowed.max.y).toBeGreaterThan(2 * boundsOf(optical.group).max.y);
  });

  it("goes up a part at a time during Assembly", () => {
    const model = models.createStructureModel(infrared.id);
    const heights = [0, 0.3, 0.6, 1].map((fraction) => {
      model.setAssembled(fraction);
      return boundsOf(model.group).max.y;
    });

    for (const [index, height] of heights.entries()) {
      if (index > 0) expect(height).toBeGreaterThan(heights[index - 1] ?? 0);
    }
  });
});
