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

// Every Plant built on a plinth, and the concentrator tower, which is drawn
// in as much detail. The Greenhouse's dome and the Growing hall, dug into the
// ground, have models of their own.
const detailed = catalogue.structureTypes.filter(
  (type) =>
    (type.recipes !== undefined &&
      type.id !== "greenhouse" &&
      type.id !== "growing-hall") ||
    type.id === "concentrator-tower",
);

describe.each(detailed.map((type) => [type.id, type] as const))(
  "the %s's model",
  (_, type) => {
    it("stands on the ground within its footprint", () => {
      const model = models.createStructureModel(type.id);
      model.setAssembled(1);
      model.setFacing(0.7);

      const box = boundsOf(model.group);
      expect(box.min.y).toBeCloseTo(0, 1);
      const reach = Math.hypot(
        Math.max(-box.min.x, box.max.x),
        Math.max(-box.min.z, box.max.z),
      );
      expect(reach).toBeLessThanOrEqual(type.footprintRadiusMetres);
    });

    it("rises as it is assembled, with nothing standing at full height early", () => {
      const model = models.createStructureModel(type.id);
      model.setAssembled(1);
      const full = boundsOf(model.group).max.y;
      model.setAssembled(0.2);
      expect(boundsOf(model.group).max.y).toBeLessThan(full * 0.5);
    });
  },
);
