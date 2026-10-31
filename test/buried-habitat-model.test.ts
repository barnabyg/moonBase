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

const buried = catalogue.structureTypes.find(
  ({ id }) => id === "buried-habitat",
);
if (buried === undefined) throw new Error("expected a Buried Habitat");
const footprint = buried.footprintRadiusMetres;

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

describe("the Buried Habitat's model", () => {
  it("is a low mound, far lower than the dome of a Habitat and wider, reaching its footprint only at the airlock's hatch", () => {
    const model = models.createStructureModel(buried.id);
    expect(model.group.name).toBe("Buried Habitat");
    model.setAssembled(1);
    const mound = model.group.getObjectByName("Mound");
    if (mound === undefined) throw new Error("expected a mound");

    const moundBox = boundsOf(mound);
    expect(moundBox.min.y).toBeCloseTo(0, 1);
    expect(moundBox.max.y).toBeLessThan(2);
    expect(moundBox.max.x).toBeLessThanOrEqual(footprint);

    const habitat = models.createStructureModel("habitat");
    habitat.setAssembled(1);
    expect(boundsOf(habitat.group).max.y).toBeGreaterThan(1.5 * moundBox.max.y);

    const box = boundsOf(model.group);
    expect(box.max.x).toBeCloseTo(models.BURIED_HABITAT_HATCH_OUT, 1);
    expect(-box.min.x).toBeLessThanOrEqual(footprint);
  });

  it("heaps up as it is assembled, and has its airlock and vents fitted last", () => {
    const model = models.createStructureModel(buried.id);
    const mound = model.group.getObjectByName("Mound");
    const airlock = model.group.getObjectByName("Airlock");

    model.setAssembled(0.2);
    const low = mound === undefined ? 0 : boundsOf(mound).max.y;
    expect(airlock?.visible).toBe(false);

    model.setAssembled(1);
    const high = mound === undefined ? 0 : boundsOf(mound).max.y;
    expect(high).toBeGreaterThan(low);
    expect(airlock?.visible).toBe(true);
  });

  it("shows that the Mission Director lives in it by a lit hatch, like any other Habitat", () => {
    const model = models.createStructureModel(buried.id);
    model.setAssembled(1);
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

    model.setOccupied?.(false);
    const empty = emissive();
    model.setOccupied?.(true);

    expect(emissive()).not.toBe(empty);
  });
});
