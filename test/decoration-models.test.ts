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

const decorations = catalogue.structureTypes.filter(
  ({ listGroup }) => listGroup === "decoration",
);

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

/**
 * How far from the model's centre, across the ground, any part that shows
 * reaches: measured at the vertices, as a round model's box reaches further.
 */
function reachOf(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  let reach = 0;
  const vertex = new THREE.Vector3();
  object.traverseVisible((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const positions = (child.geometry as THREE.BufferGeometry).getAttribute(
      "position",
    );
    for (let index = 0; index < positions.count; index++) {
      vertex
        .fromBufferAttribute(positions, index)
        .applyMatrix4(child.matrixWorld);
      reach = Math.max(reach, Math.hypot(vertex.x, vertex.z));
    }
  });
  return reach;
}

describe("the Decorations' models", () => {
  it("has four Decorations to draw", () => {
    expect(decorations).toHaveLength(4);
  });

  it.each(decorations.map((type) => [type.label, type] as const))(
    "draws a %s as its own model, standing on the ground within its footprint",
    (label, type) => {
      const model = models.createStructureModel(type.id);
      expect(model.group.name).toBe(label);
      model.setAssembled(1);

      const box = boundsOf(model.group);
      expect(box.isEmpty()).toBe(false);
      expect(box.min.y).toBeCloseTo(0, 1);
      expect(reachOf(model.group)).toBeLessThanOrEqual(
        type.footprintRadiusMetres,
      );
    },
  );

  it.each(decorations.map((type) => [type.label, type] as const))(
    "shows more of a %s as it is assembled",
    (_label, type) => {
      const model = models.createStructureModel(type.id);
      const sizes = [0.1, 0.5, 1].map((fraction) => {
        model.setAssembled(fraction);
        const size = boundsOf(model.group).getSize(new THREE.Vector3());
        return size.x * size.y * size.z;
      });
      expect(sizes[1]).toBeGreaterThan(sizes[0] ?? 0);
      expect(sizes[2]).toBeGreaterThan(sizes[1] ?? 0);
    },
  );

  it("raises the flag high above everything else on the base's ground", () => {
    const flag = models.createStructureModel("flag-pole");
    flag.setAssembled(1);
    expect(boundsOf(flag.group).max.y).toBeGreaterThan(2.5);
  });
});
