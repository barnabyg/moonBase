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

const workshop = catalogue.structureTypes.find(({ id }) => id === "workshop");
if (workshop === undefined) throw new Error("expected a Workshop");
const footprint = workshop.footprintRadiusMetres;

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

/** How many of a model's parts there are, by the shape of their geometry. */
function geometryKinds(object: THREE.Object3D): string[] {
  const kinds: string[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geometry = child.geometry as THREE.BoxGeometry;
      kinds.push(`${geometry.type}:${JSON.stringify(geometry.parameters)}`);
    }
  });
  return kinds.sort();
}

describe("the Workshop's model", () => {
  it("is its own model, unlike any other Plant's, standing on the ground within its footprint", () => {
    const model = models.createStructureModel(workshop.id);
    expect(model.group.name).toBe("Workshop");
    model.setAssembled(1);

    const box = boundsOf(model.group);
    expect(box.min.y).toBeCloseTo(0, 1);
    const reach = Math.hypot(
      Math.max(-box.min.x, box.max.x),
      Math.max(-box.min.z, box.max.z),
    );
    expect(reach).toBeLessThanOrEqual(footprint);

    const own = geometryKinds(model.group);
    for (const type of catalogue.structureTypes) {
      if (type.recipes === undefined || type.id === workshop.id) continue;
      expect(
        geometryKinds(models.createStructureModel(type.id).group),
      ).not.toEqual(own);
    }
  });

  it("rises as it is assembled, and turns its fan and lights its spindle while it runs", () => {
    const model = models.createStructureModel(workshop.id);
    const heights = [0.2, 0.6, 1].map((fraction) => {
      model.setAssembled(fraction);
      return boundsOf(model.group).max.y;
    });
    for (const [index, height] of heights.entries()) {
      if (index > 0) expect(height).toBeGreaterThan(heights[index - 1] ?? 0);
    }

    const emissive = () => {
      const colours = new Set<string>();
      model.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial;
          colours.add(material.emissive.getHexString());
        }
      });
      return [...colours].sort().join();
    };
    model.setRunning?.(false, 0);
    const idle = emissive();
    model.setRunning?.(true, 0.1);
    expect(emissive()).not.toBe(idle);
  });
});
