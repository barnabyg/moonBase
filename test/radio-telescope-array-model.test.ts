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

const array = catalogue.structureTypes.find(
  (type) => type.id === "radio-telescope-array",
);
if (array === undefined) throw new Error("expected a radio telescope array");

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

function meshesOf(object: THREE.Object3D): number {
  let count = 0;
  object.traverseVisible((child) => {
    if (child instanceof THREE.Mesh) count++;
  });
  return count;
}

describe("the radio telescope array's model", () => {
  it("is its own model, a low field standing on the ground within its footprint", () => {
    const model = models.createStructureModel(array.id);
    expect(model.group.name).toBe("Radio telescope array");
    model.setAssembled(1);

    const box = boundsOf(model.group);

    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeLessThan(2);
    expect(
      Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z),
    ).toBeLessThanOrEqual(array.footprintRadiusMetres);
  });

  it("lays out its tiles a few at a time during Assembly", () => {
    const model = models.createStructureModel(array.id);
    const shown = [0, 0.3, 0.6, 1].map((fraction) => {
      model.setAssembled(fraction);
      return meshesOf(model.group);
    });

    for (const [index, count] of shown.entries()) {
      if (index > 0) expect(count).toBeGreaterThan(shown[index - 1] ?? 0);
    }
  });
});
