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

const telescope = catalogue.structureTypes.find(
  (type) => type.id === "telescope",
);
if (telescope === undefined) throw new Error("expected a telescope");
const footprint = telescope.footprintRadiusMetres;

/** The box round everything in a model that shows, in the model's own frame. */
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

/** How far the model reaches from its centre across the ground. */
function reach(box: THREE.Box3): number {
  return Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
}

describe("the telescope's model", () => {
  it("is its own model, standing on the ground within its footprint, stowed pointing up and tilted down to observe", () => {
    const model = models.createStructureModel(telescope.id);
    expect(model.group.name).toBe("Telescope");
    model.setAssembled(1);

    model.setRunning?.(false, 0);
    const stowed = boundsOf(model.group);
    model.setRunning?.(true, 30);
    const observing = boundsOf(model.group);

    for (const box of [stowed, observing]) {
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(reach(box)).toBeLessThanOrEqual(footprint);
    }
    // Pointing at the sky above, it stands taller than when it leans over
    // to observe.
    expect(stowed.max.y).toBeGreaterThan(observing.max.y + 0.1);
  });

  it("goes up a part at a time during Assembly: the pier, then the mount, then the tube", () => {
    const model = models.createStructureModel(telescope.id);
    const heights = [0, 0.3, 0.6, 1].map((fraction) => {
      model.setAssembled(fraction);
      return boundsOf(model.group).max.y;
    });

    for (const [index, height] of heights.entries()) {
      if (index > 0) expect(height).toBeGreaterThan(heights[index - 1] ?? 0);
    }
  });
});
