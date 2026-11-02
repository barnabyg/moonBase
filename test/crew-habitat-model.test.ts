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

const crewHabitat = catalogue.structureTypes.find(
  ({ id }) => id === "crew-habitat",
);
if (crewHabitat === undefined) {
  throw new Error("expected a Large-scale Crew Habitat");
}
const footprint = crewHabitat.footprintRadiusMetres;

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

describe("the Large-scale Crew Habitat's model", () => {
  it("is three long vaults joined by a spine, nearly twice as wide as a Habitat, standing within its footprint", () => {
    const model = models.createStructureModel(crewHabitat.id);
    expect(model.group.name).toBe("Large-scale Crew Habitat");
    model.setAssembled(1);

    for (const name of ["Vault 1", "Vault 2", "Vault 3", "Spine"]) {
      expect(model.group.getObjectByName(name)?.visible).toBe(true);
    }
    const box = boundsOf(model.group);
    const corners = [box.min, box.max].flatMap((x) =>
      [box.min, box.max].map((z) => Math.hypot(x.x, z.z)),
    );
    expect(Math.max(...corners)).toBeLessThanOrEqual(footprint);
    expect(box.min.y).toBeCloseTo(0, 1);

    const habitat = models.createStructureModel("habitat");
    habitat.setAssembled(1);
    const habitatBox = boundsOf(habitat.group);
    expect(box.max.x - box.min.x).toBeGreaterThan(
      1.8 * (habitatBox.max.x - habitatBox.min.x),
    );
  });

  it("goes up a vault at a time as it is assembled, with the spine and airlocks last", () => {
    const model = models.createStructureModel(crewHabitat.id);
    const shown = () =>
      ["Vault 1", "Vault 2", "Vault 3", "Spine", "Airlocks"].filter(
        (name) => model.group.getObjectByName(name)?.visible === true,
      );

    model.setAssembled(0.1);
    expect(shown()).toEqual(["Vault 1"]);
    model.setAssembled(0.5);
    expect(shown()).toEqual(["Vault 1", "Vault 2"]);
    model.setAssembled(0.99);
    expect(shown()).toEqual([
      "Vault 1",
      "Vault 2",
      "Vault 3",
      "Spine",
      "Airlocks",
    ]);
  });
});
